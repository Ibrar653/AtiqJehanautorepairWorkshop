import OpenAI from "openai";
import { GoogleGenAI, Type } from "@google/genai";
import type {
  AIModelOption,
  AIProvider,
  ProviderConnectionStatus,
} from "./types";
import type { AIToolSpec } from "./tool-registry";
import { sanitizeErrorForClient } from "./security";

// ─── Curated Tool-Compatible Model Catalog (Verified against live API when configured) ─
export const OPENAI_TOOL_MODELS: AIModelOption[] = [
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    provider: "openai",
    description: "Flagship reasoning & precise workshop tool execution",
    supportsTools: true,
    supportsStreaming: true,
    recommended: true,
  },
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    provider: "openai",
    description: "Fast, cost-efficient tool calling & multilingual support",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    description: "Balanced general assistant & structured function calling",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "openai",
    description: "Ultra-fast responses for quick lookups & daily Q&A",
    supportsTools: true,
    supportsStreaming: true,
  },
];

export const GEMINI_TOOL_MODELS: AIModelOption[] = [
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    description: "Fast multimodal intelligence with accurate function calling",
    supportsTools: true,
    supportsStreaming: true,
    recommended: true,
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    description: "Advanced reasoning for complex multi-step ERP workflows",
    supportsTools: true,
    supportsStreaming: true,
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash",
    provider: "gemini",
    description: "Low-latency assistant for quick lookups & chat",
    supportsTools: true,
    supportsStreaming: true,
  },
];

// ─── Provider Connection & Live Model Verification Cache (5 min TTL) ─────────
let cachedStatuses: { data: ProviderConnectionStatus[]; expiresAt: number } | null = null;

export async function getProviderConnectionStatuses(
  forceRefresh = false
): Promise<ProviderConnectionStatus[]> {
  if (!forceRefresh && cachedStatuses && Date.now() < cachedStatuses.expiresAt) {
    return cachedStatuses.data;
  }

  const openaiKey = (process.env.OPENAI_API_KEY || "").trim();
  const geminiKey = (process.env.GEMINI_API_KEY || "").trim();

  // 1. OpenAI Live Verification
  let openaiStatus: ProviderConnectionStatus = {
    provider: "openai",
    label: "OpenAI",
    configured: Boolean(openaiKey),
    operational: false,
    statusMessage: openaiKey
      ? "Checking OpenAI connection..."
      : "Not configured — set OPENAI_API_KEY in .env.local or Vercel Environment Variables",
    models: OPENAI_TOOL_MODELS,
  };

  if (openaiKey) {
    try {
      const client = new OpenAI({ apiKey: openaiKey, timeout: 8000 });
      const list = await client.models.list();
      const availableIds = new Set<string>();
      for await (const m of list) {
        if (m.id) availableIds.add(m.id);
      }
      const verified = OPENAI_TOOL_MODELS.filter((m) => availableIds.has(m.id));
      openaiStatus = {
        provider: "openai",
        label: "OpenAI",
        configured: true,
        operational: true,
        statusMessage: `Connected (${verified.length || OPENAI_TOOL_MODELS.length} models verified)`,
        models: verified.length > 0 ? verified : OPENAI_TOOL_MODELS,
      };
    } catch (err) {
      openaiStatus = {
        provider: "openai",
        label: "OpenAI",
        configured: true,
        operational: false,
        statusMessage: `Connection check failed: ${sanitizeErrorForClient(err)}`,
        models: OPENAI_TOOL_MODELS,
      };
    }
  }

  // 2. Google Gemini Live Verification
  let geminiStatus: ProviderConnectionStatus = {
    provider: "gemini",
    label: "Google Gemini",
    configured: Boolean(geminiKey),
    operational: false,
    statusMessage: geminiKey
      ? "Checking Gemini connection..."
      : "Not configured — set GEMINI_API_KEY in .env.local or Vercel Environment Variables",
    models: GEMINI_TOOL_MODELS,
  };

  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const listPromise = (async () => {
        const pager = await ai.models.list({ config: { pageSize: 100 } });
        const availableIds = new Set<string>();
        for await (const m of pager) {
          if (m.name) {
            availableIds.add(m.name.replace(/^models\//, ""));
          }
        }
        return availableIds;
      })();
      const availableIds = await Promise.race([
        listPromise,
        new Promise<Set<string>>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini model verification timed out")), 8000)
        ),
      ]);
      const verified = GEMINI_TOOL_MODELS.filter((m) => availableIds.has(m.id));
      geminiStatus = {
        provider: "gemini",
        label: "Google Gemini",
        configured: true,
        operational: true,
        statusMessage: `Connected (${verified.length || GEMINI_TOOL_MODELS.length} models verified)`,
        models: verified.length > 0 ? verified : GEMINI_TOOL_MODELS,
      };
    } catch (err) {
      geminiStatus = {
        provider: "gemini",
        label: "Google Gemini",
        configured: true,
        operational: false,
        statusMessage: `Connection check failed: ${sanitizeErrorForClient(err)}`,
        models: GEMINI_TOOL_MODELS,
      };
    }
  }

  const results = [openaiStatus, geminiStatus];
  cachedStatuses = { data: results, expiresAt: Date.now() + 5 * 60 * 1000 };
  return results;
}

// ─── Schema Conversion Helpers ───────────────────────────────────────────────
export function toOpenAIResponsesTools(specs: AIToolSpec[]): any[] {
  return specs.map((s) => ({
    type: "function",
    name: s.name,
    description: s.description,
    parameters: {
      ...s.parameters,
      additionalProperties: false,
    },
  }));
}

function mapJsonTypeToGemini(t?: string): Type {
  switch (t) {
    case "number":
    case "integer":
      return Type.NUMBER;
    case "boolean":
      return Type.BOOLEAN;
    case "array":
      return Type.ARRAY;
    case "object":
      return Type.OBJECT;
    default:
      return Type.STRING;
  }
}

function convertSchemaForGemini(schema: any): any {
  if (!schema || typeof schema !== "object") return { type: Type.STRING };
  const out: any = {
    type: mapJsonTypeToGemini(schema.type),
  };
  if (schema.description) out.description = schema.description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.required) out.required = schema.required;
  if (schema.properties) {
    out.properties = {};
    for (const [k, v] of Object.entries(schema.properties)) {
      out.properties[k] = convertSchemaForGemini(v);
    }
  }
  if (schema.items) {
    out.items = convertSchemaForGemini(schema.items);
  }
  return out;
}

export function toGeminiFunctionDeclarations(specs: AIToolSpec[]): any[] {
  return specs.map((s) => ({
    name: s.name,
    description: s.description,
    parameters: convertSchemaForGemini(s.parameters),
  }));
}

export function getAIRequestTimeoutMs(): number {
  return Math.max(10000, Math.min(120000, Number(process.env.AI_REQUEST_TIMEOUT_MS) || 45000));
}

export function getOpenAIClient(): OpenAI {
  const apiKey = (process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not configured on the server. Add OPENAI_API_KEY to .env.local (or Vercel Environment Variables) and restart."
    );
  }
  const timeout = getAIRequestTimeoutMs();
  return new OpenAI({ apiKey, timeout });
}

export function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY to .env.local (or Vercel Environment Variables) and restart."
    );
  }
  return new GoogleGenAI({ apiKey });
}

export function isSupportedModel(provider: AIProvider, model: string): boolean {
  const list = provider === "openai" ? OPENAI_TOOL_MODELS : GEMINI_TOOL_MODELS;
  return list.some((m) => m.id === model);
}
