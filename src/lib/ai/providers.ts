import OpenAI from "openai";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type {
  AIMode,
  AIModelOption,
  AIProvider,
  ClassifiedAIError,
  ProviderConnectionStatus,
} from "./types";
import type { AIToolSpec } from "./tool-registry";
import { sanitizeErrorForClient } from "./security";

// ─── Curated Tool-Compatible Model Catalog ───────────────────────────────────
export const OPENAI_TOOL_MODELS: AIModelOption[] = [
  {
    id: "gpt-4.1-mini",
    label: "GPT-4.1 Mini",
    provider: "openai",
    description: "Fast, cost-efficient tool calling & multilingual support",
    supportsTools: true,
    supportsStreaming: true,
    recommended: true,
    tier: "standard",
  },
  {
    id: "gpt-4.1",
    label: "GPT-4.1",
    provider: "openai",
    description: "Flagship reasoning & precise workshop tool execution",
    supportsTools: true,
    supportsStreaming: true,
    tier: "paid_recommended",
  },
  {
    id: "gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "openai",
    description: "Ultra-fast responses for quick lookups & daily Q&A",
    supportsTools: true,
    supportsStreaming: true,
    tier: "standard",
  },
  {
    id: "gpt-4o",
    label: "GPT-4o",
    provider: "openai",
    description: "Balanced general assistant & structured function calling",
    supportsTools: true,
    supportsStreaming: true,
    tier: "paid_recommended",
  },
];

export const GEMINI_TOOL_MODELS: AIModelOption[] = [
  {
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    provider: "gemini",
    description: "Ultra-fast, low-token model with full function calling & free-tier eligibility",
    supportsTools: true,
    supportsStreaming: true,
    recommended: true,
    tier: "free_eligible",
  },
  {
    id: "gemini-3.1-flash-lite-preview",
    label: "Gemini 3.1 Flash-Lite (Preview)",
    provider: "gemini",
    description: "Preview build of Gemini 3.1 Flash-Lite with function calling & low latency",
    supportsTools: true,
    supportsStreaming: true,
    tier: "free_eligible",
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    provider: "gemini",
    description: "Lightweight free-tier-friendly model optimized for high RPM/RPD & tools",
    supportsTools: true,
    supportsStreaming: true,
    tier: "free_eligible",
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    description: "Balanced speed & reasoning with function calling (free-tier eligible)",
    supportsTools: true,
    supportsStreaming: true,
    tier: "free_eligible",
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    description: "Advanced reasoning (may require paid billing tier or have limited free quota)",
    supportsTools: true,
    supportsStreaming: true,
    tier: "paid_recommended",
  },
  {
    id: "gemini-2.0-flash",
    label: "Gemini 2.0 Flash (Legacy)",
    provider: "gemini",
    description: "Legacy Flash model (often has 0 free-tier quota on newer AI Studio projects)",
    supportsTools: true,
    supportsStreaming: true,
    tier: "standard",
  },
];

// ─── Structured Error Classification (Zero Secret Leakage) ───────────────────
function extractRawErrorInfo(err: unknown): { status?: number; message: string } {
  const anyErr = err as any;
  const status =
    typeof anyErr?.status === "number"
      ? anyErr.status
      : typeof anyErr?.statusCode === "number"
      ? anyErr.statusCode
      : typeof anyErr?.response?.status === "number"
      ? anyErr.response.status
      : undefined;

  const rawText =
    anyErr?.error?.message ||
    anyErr?.message ||
    (typeof err === "string" ? err : String(err || "Unknown AI provider error"));

  return { status, message: sanitizeErrorForClient(rawText) };
}

function extractRetrySeconds(msg: string): number | undefined {
  const match = msg.match(/retry\s*(?:in|after)?\s*([\d.]+)\s*s/i);
  if (!match) return undefined;
  const secs = Math.ceil(Number(match[1]));
  return Number.isFinite(secs) && secs > 0 ? secs : undefined;
}

export function classifyProviderError(
  provider: AIProvider,
  err: unknown,
  modelId?: string
): ClassifiedAIError {
  const { status, message } = extractRawErrorInfo(err);
  const lower = message.toLowerCase();
  const providerName = provider === "gemini" ? "Google Gemini" : "OpenAI";

  // 1. Missing Server Key
  if (lower.includes("not configured on the server")) {
    return {
      category: "api_key_missing",
      title: `${providerName} API Key Missing`,
      userMessage: `${providerName} is not configured yet. Add ${
        provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"
      } in .env.local or Vercel Environment Variables and redeploy.`,
      detail: message,
    };
  }

  // 2. Invalid API Key / Authentication Error
  if (
    status === 401 ||
    lower.includes("api_key_invalid") ||
    lower.includes("invalid api key") ||
    lower.includes("api key not valid") ||
    lower.includes("incorrect api key") ||
    lower.includes("invalid_api_key") ||
    (status === 403 &&
      (lower.includes("permission_denied") ||
        lower.includes("api key") ||
        lower.includes("unregistered callers")))
  ) {
    return {
      category: "invalid_api_key",
      title: `${providerName} API Key Rejected`,
      userMessage: `${providerName} rejected the configured API key. Verify ${
        provider === "gemini" ? "GEMINI_API_KEY" : "OPENAI_API_KEY"
      } in Google AI Studio / OpenAI dashboard and update Vercel Environment Variables.`,
      detail: message,
    };
  }

  // 3. Model Not Found / Unsupported for this Project or API Version
  if (
    status === 404 ||
    lower.includes("not found for api version") ||
    lower.includes("models/") && lower.includes("not found") ||
    lower.includes("model_not_found") ||
    lower.includes("is not supported for generatecontent")
  ) {
    const suggestedFreeModelId =
      provider === "gemini" && modelId !== "gemini-2.5-flash-lite"
        ? "gemini-2.5-flash-lite"
        : undefined;
    return {
      category: "model_unavailable",
      title: `Model "${modelId || "selected"}" Unavailable`,
      userMessage: `The model "${modelId || "selected"}" is not enabled for your ${providerName} project.${
        suggestedFreeModelId
          ? ` Please select an available free-tier model such as ${suggestedFreeModelId} or gemini-2.5-flash.`
          : " Please choose another verified model from the Model selector."
      }`,
      detail: message,
      suggestedFreeModelId,
    };
  }

  // 4. Billing Required / Zero Free-Tier Quota (limit: 0)
  const hasZeroLimit =
    /limit:\s*0\b/i.test(message) ||
    lower.includes("free_tier") && lower.includes("limit: 0") ||
    lower.includes("billing_not_active") ||
    lower.includes("billing account") ||
    lower.includes("insufficient_quota") ||
    lower.includes("exceeded your current quota") && provider === "openai" ||
    lower.includes("free tier is not available in your country");

  if (hasZeroLimit) {
    const isGeminiZeroModel =
      provider === "gemini" &&
      /limit:\s*0\b/i.test(message) &&
      !lower.includes("country");
    const suggestedFreeModelId =
      provider === "gemini"
        ? modelId === "gemini-2.5-flash-lite"
          ? "gemini-2.5-flash"
          : "gemini-2.5-flash-lite"
        : undefined;

    return {
      category: "billing_required",
      title: isGeminiZeroModel
        ? `Zero Free-Tier Quota for "${modelId || "This Model"}"`
        : `${providerName} Billing / Free-Tier Restriction`,
      userMessage: isGeminiZeroModel
        ? `Your Google AI Studio project currently has 0 free-tier quota for "${modelId}". Select a free-tier-eligible model such as ${suggestedFreeModelId} (or check AI Studio Rate Limits). Paid billing will NOT be enabled automatically.`
        : provider === "gemini"
        ? `Google Gemini reports that free-tier quota is unavailable or billing is required for this project/region. Check Google AI Studio → Rate Limits or switch to an eligible free-tier model manually.`
        : `OpenAI reports insufficient credits or billing quota on this API key. Check your OpenAI billing balance or switch provider manually.`,
      detail: message,
      suggestedFreeModelId,
    };
  }

  // 5. Daily Quota Exhausted vs Short-Term RPM/TPM Rate Limit
  if (
    status === 429 ||
    lower.includes("resource_exhausted") ||
    lower.includes("rate limit") ||
    lower.includes("quota")
  ) {
    const retryAfterSeconds = extractRetrySeconds(message);
    const isDailyQuota =
      lower.includes("perday") ||
      lower.includes("per day") ||
      lower.includes("daily") ||
      lower.includes("rpd");

    if (isDailyQuota) {
      const suggestedFreeModelId =
        provider === "gemini" && modelId !== "gemini-2.5-flash-lite"
          ? "gemini-2.5-flash-lite"
          : undefined;
      return {
        category: "quota_exceeded",
        title: `${providerName} Daily Free-Tier Quota Reached`,
        userMessage: `Your ${providerName} project has reached its daily request limit for "${
          modelId || "this model"
        }".${
          suggestedFreeModelId
            ? ` Try switching to ${suggestedFreeModelId} (separate free-tier quota) or wait for the daily quota reset.`
            : " Wait for the daily quota reset or review usage in Google AI Studio."
        }`,
        detail: message,
        suggestedFreeModelId,
      };
    }

    return {
      category: "rate_limited",
      title: `${providerName} Temporary Rate Limit`,
      userMessage: `${providerName} per-minute rate limit (RPM/TPM) was reached.${
        retryAfterSeconds
          ? ` Please wait ~${retryAfterSeconds}s and retry.`
          : " Please wait 15–30 seconds and retry."
      } This is a temporary throttle — not a billing failure.`,
      detail: message,
      retryAfterSeconds,
    };
  }

  // 6. Timeout
  if (
    lower.includes("timeout") ||
    lower.includes("timed out") ||
    lower.includes("aborted") ||
    lower.includes("etimedout")
  ) {
    return {
      category: "timeout",
      title: `${providerName} Request Timed Out`,
      userMessage: `${providerName} took too long to respond. Please retry or choose a faster Flash-Lite model.`,
      detail: message,
    };
  }

  // 7. Network Error
  if (
    lower.includes("fetch failed") ||
    lower.includes("enotfound") ||
    lower.includes("econnrefused") ||
    lower.includes("econnreset") ||
    lower.includes("network")
  ) {
    return {
      category: "network_error",
      title: `${providerName} Network Error`,
      userMessage: `Could not reach ${providerName} API servers. Please check network connectivity and retry.`,
      detail: message,
    };
  }

  return {
    category: "unknown",
    title: `${providerName} Error`,
    userMessage: `${providerName} returned an error: ${message}`,
    detail: message,
  };
}

// ─── Token-Optimized Thinking Config for Gemini 2.5 / 3.1 Models ────────────
export function getGeminiThinkingConfig(
  modelId: string,
  mode: AIMode
): Record<string, any> | undefined {
  if (modelId.startsWith("gemini-3.1-flash-lite")) {
    return {
      thinkingLevel: mode === "ask" ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW,
    };
  }
  if (modelId === "gemini-2.5-flash-lite" || modelId === "gemini-2.5-flash") {
    return {
      thinkingBudget: mode === "ask" ? 0 : 512,
    };
  }
  return undefined;
}

// ─── Helper: Filter Gemini Catalog Cleanly Without Duplicate Preview Entries ─
export function resolveAvailableGeminiModels(availableIds: Set<string>): AIModelOption[] {
  if (availableIds.size === 0) {
    // Fallback when API key isn't configured yet: show clean default list without duplicate preview
    return GEMINI_TOOL_MODELS.filter((m) => m.id !== "gemini-3.1-flash-lite-preview");
  }

  const matched = GEMINI_TOOL_MODELS.filter((m) => availableIds.has(m.id));
  if (matched.length === 0) {
    return GEMINI_TOOL_MODELS.filter((m) => m.id !== "gemini-3.1-flash-lite-preview");
  }

  // Avoid showing both stable & preview for 3.1 Flash-Lite simultaneously; prefer stable if both exist
  const hasStable31 = matched.some((m) => m.id === "gemini-3.1-flash-lite");
  const deduped = hasStable31
    ? matched.filter((m) => m.id !== "gemini-3.1-flash-lite-preview")
    : matched;

  // Ensure the top free-eligible available model is marked recommended
  const hasRec = deduped.some((m) => m.recommended);
  if (!hasRec && deduped.length > 0) {
    const firstFree = deduped.find((m) => m.tier === "free_eligible") || deduped[0];
    return deduped.map((m) =>
      m.id === firstFree.id ? { ...m, recommended: true } : m
    );
  }
  return deduped;
}

// ─── Lightweight Live Generation Probe (Only When Explicitly Requested) ──────
export async function probeGeminiLiveGeneration(modelId: string): Promise<{
  ok: boolean;
  classifiedError?: ClassifiedAIError;
}> {
  try {
    const ai = getGeminiClient();
    const thinkingConfig = getGeminiThinkingConfig(modelId, "ask");
    const response = await ai.models.generateContent({
      model: modelId,
      contents: [{ role: "user", parts: [{ text: "Reply OK" }] }],
      config: {
        maxOutputTokens: 8,
        ...(thinkingConfig ? { thinkingConfig } : {}),
        abortSignal: AbortSignal.timeout(10000),
      },
    });
    const text = (response.text || "").trim();
    return { ok: text.length > 0 || Boolean(response.candidates?.length) };
  } catch (err) {
    return {
      ok: false,
      classifiedError: classifyProviderError("gemini", err, modelId),
    };
  }
}

// ─── Provider Connection & Live Model Verification Cache (10 min TTL) ────────
let cachedStatuses: { data: ProviderConnectionStatus[]; expiresAt: number } | null = null;

export async function getProviderConnectionStatuses(
  forceRefresh = false,
  probeOptions?: { provider?: AIProvider; model?: string }
): Promise<ProviderConnectionStatus[]> {
  if (
    !forceRefresh &&
    !probeOptions?.provider &&
    cachedStatuses &&
    Date.now() < cachedStatuses.expiresAt
  ) {
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
    errorCategory: openaiKey ? undefined : "api_key_missing",
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
        statusMessage: `Connected (${verified.length || OPENAI_TOOL_MODELS.length} models available)`,
        models: verified.length > 0 ? verified : OPENAI_TOOL_MODELS,
      };
    } catch (err) {
      const classified = classifyProviderError("openai", err);
      openaiStatus = {
        provider: "openai",
        label: "OpenAI",
        configured: true,
        operational: false,
        errorCategory: classified.category,
        statusMessage: `${classified.title}: ${classified.userMessage}`,
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
    errorCategory: geminiKey ? undefined : "api_key_missing",
    statusMessage: geminiKey
      ? "Checking Gemini connection..."
      : "Not configured — set GEMINI_API_KEY in .env.local or Vercel Environment Variables",
    models: resolveAvailableGeminiModels(new Set()),
  };

  if (geminiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey: geminiKey });
      const listPromise = (async () => {
        const pager = await ai.models.list({ config: { pageSize: 100 } });
        const availableIds = new Set<string>();
        for await (const m of pager) {
          if (!m.name) continue;
          const actions = (m as any).supportedActions as string[] | undefined;
          if (Array.isArray(actions) && actions.length > 0 && !actions.includes("generateContent")) {
            continue;
          }
          availableIds.add(m.name.replace(/^models\//, ""));
        }
        return availableIds;
      })();

      const availableIds = await Promise.race([
        listPromise,
        new Promise<Set<string>>((_, reject) =>
          setTimeout(() => reject(new Error("Gemini model verification timed out")), 8000)
        ),
      ]);

      const resolvedModels = resolveAvailableGeminiModels(availableIds);
      let operational = true;
      let verifiedGeneration = false;
      let errorCategory: ProviderConnectionStatus["errorCategory"] = undefined;
      let statusMessage = `Connected (${resolvedModels.length} models listed — select Free-Tier models to avoid billing)`;

      // Optional 1-token live generation verification when user explicitly probes
      if (probeOptions?.provider === "gemini") {
        const targetModel =
          (probeOptions.model && resolvedModels.some((m) => m.id === probeOptions.model)
            ? probeOptions.model
            : resolvedModels.find((m) => m.recommended)?.id || resolvedModels[0]?.id) ||
          "gemini-2.5-flash-lite";

        const probe = await probeGeminiLiveGeneration(targetModel);
        if (probe.ok) {
          verifiedGeneration = true;
          statusMessage = `Verified live generation on ${targetModel}`;
        } else if (probe.classifiedError) {
          operational = probe.classifiedError.category === "rate_limited";
          errorCategory = probe.classifiedError.category;
          statusMessage = `${probe.classifiedError.title}: ${probe.classifiedError.userMessage}`;
        }
      }

      geminiStatus = {
        provider: "gemini",
        label: "Google Gemini",
        configured: true,
        operational,
        verifiedGeneration,
        errorCategory,
        statusMessage,
        models: resolvedModels,
      };
    } catch (err) {
      const classified = classifyProviderError("gemini", err);
      geminiStatus = {
        provider: "gemini",
        label: "Google Gemini",
        configured: true,
        operational: false,
        errorCategory: classified.category,
        statusMessage: `${classified.title}: ${classified.userMessage}`,
        models: resolveAvailableGeminiModels(new Set()),
      };
    }
  }

  const results = [openaiStatus, geminiStatus];
  // Cache for 10 minutes to minimize unnecessary metadata requests against free-tier limits
  cachedStatuses = { data: results, expiresAt: Date.now() + 10 * 60 * 1000 };
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
