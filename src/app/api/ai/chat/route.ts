import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateAIRequest,
  checkUserRateLimit,
  sanitizeErrorForClient,
} from "@/lib/ai/security";
import { buildWorkshopSystemPrompt } from "@/lib/ai/system-prompt";
import {
  executeAITool,
  getAllowedToolsForMode,
} from "@/lib/ai/tool-registry";
import {
  getAIRequestTimeoutMs,
  getGeminiClient,
  getOpenAIClient,
  isSupportedModel,
  toGeminiFunctionDeclarations,
  toOpenAIResponsesTools,
} from "@/lib/ai/providers";
import type { ActionConfirmationPayload, DocumentActionRef } from "@/lib/ai/types";

const MAX_AGENT_ITERATIONS = 5;

const ChatRequestSchema = z.object({
  provider: z.enum(["openai", "gemini"]),
  model: z.string().min(1).max(80),
  mode: z.enum(["ask", "agent"]).default("ask"),
  workspaceId: z.string().uuid().optional().nullable(),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      })
    )
    .min(1)
    .max(30),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof ChatRequestSchema>;
  try {
    const raw = await request.json();
    body = ChatRequestSchema.parse(raw);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Invalid request payload: ${sanitizeErrorForClient(err)}` },
      { status: 400 }
    );
  }

  let ctx;
  try {
    ctx = await authenticateAIRequest(request, body.workspaceId);
  } catch (err: any) {
    const msg = sanitizeErrorForClient(err);
    const status = msg.startsWith("UNAUTHORIZED") ? 401 : 403;
    return NextResponse.json({ success: false, error: msg }, { status });
  }

  const rate = checkUserRateLimit(ctx.userId);
  if (!rate.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: `Rate limit reached. Please wait ${rate.retryAfterSeconds}s before sending another AI request.`,
      },
      { status: 429 }
    );
  }

  if (!isSupportedModel(body.provider, body.model)) {
    return NextResponse.json(
      {
        success: false,
        error: `Model "${body.model}" is not supported for provider "${body.provider}". Please choose an available model from the selector.`,
      },
      { status: 400 }
    );
  }

  const systemInstruction = buildWorkshopSystemPrompt({
    mode: body.mode,
    workspaceName: ctx.workspaceName,
    userRole: ctx.role,
    userName: ctx.userName,
  });

  const allowedTools = getAllowedToolsForMode(body.mode);
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, any>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // Stream closed by client
        }
      };

      const collectedDocs: DocumentActionRef[] = [];
      let pendingConfirmation: ActionConfirmationPayload | null = null;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;

      const requestTimeoutMs = getAIRequestTimeoutMs();
      const timeoutSignal = AbortSignal.timeout(requestTimeoutMs);

      try {
        if (body.provider === "openai") {
          const client = getOpenAIClient();
          const tools = toOpenAIResponsesTools(allowedTools);
          const inputItems: any[] = body.messages.map((m) => ({
            role: m.role,
            content: m.content,
          }));

          for (let step = 0; step < MAX_AGENT_ITERATIONS; step++) {
            const responseStream = await client.responses.create(
              {
                model: body.model,
                instructions: systemInstruction,
                input: inputItems,
                tools,
                max_output_tokens: 2048,
                stream: true,
              },
              { signal: timeoutSignal }
            );

            const pendingCalls: Array<{
              call_id: string;
              name: string;
              arguments: string;
            }> = [];

            for await (const event of responseStream as AsyncIterable<any>) {
              if (event.type === "response.output_text.delta" && event.delta) {
                send({ type: "delta", text: event.delta });
              } else if (
                event.type === "response.output_item.done" &&
                event.item?.type === "function_call"
              ) {
                pendingCalls.push({
                  call_id: event.item.call_id,
                  name: event.item.name,
                  arguments: event.item.arguments || "{}",
                });
                inputItems.push(event.item);
              } else if (event.type === "response.completed" && event.response?.usage) {
                totalInputTokens += Number(event.response.usage.input_tokens || 0);
                totalOutputTokens += Number(event.response.usage.output_tokens || 0);
              }
            }

            if (pendingCalls.length === 0) break;

            for (const call of pendingCalls) {
              send({
                type: "tool",
                log: { name: call.name, status: "running" },
              });

              let parsedArgs: Record<string, any> = {};
              try {
                parsedArgs = JSON.parse(call.arguments || "{}");
              } catch {
                parsedArgs = {};
              }

              const toolOut = await executeAITool(call.name, parsedArgs, ctx, body.mode);
              if (toolOut.confirmation) {
                pendingConfirmation = toolOut.confirmation;
                send({ type: "confirmation", payload: toolOut.confirmation });
              }
              if (toolOut.documentAction) {
                collectedDocs.push(toolOut.documentAction);
                send({ type: "documents", documents: collectedDocs });
              }

              send({
                type: "tool",
                log: {
                  name: call.name,
                  status: toolOut.result?.error ? "error" : "completed",
                  summary: toolOut.result?.error || toolOut.result?.message || "Done",
                },
              });

              inputItems.push({
                type: "function_call_output",
                call_id: call.call_id,
                output: JSON.stringify(toolOut.result),
              });
            }
          }
        } else {
          // ─── Google Gemini Official @google/genai SDK ───
          const ai = getGeminiClient();
          const functionDeclarations = toGeminiFunctionDeclarations(allowedTools);

          const contents: any[] = body.messages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          }));

          for (let step = 0; step < MAX_AGENT_ITERATIONS; step++) {
            const responseStream = await ai.models.generateContentStream({
              model: body.model,
              contents,
              config: {
                systemInstruction,
                tools: [{ functionDeclarations }],
                maxOutputTokens: 2048,
                abortSignal: timeoutSignal,
              },
            });

            const pendingCalls: Array<{ name: string; args: Record<string, any> }> = [];
            let streamedText = "";

            for await (const chunk of responseStream) {
              if (chunk.text) {
                streamedText += chunk.text;
                send({ type: "delta", text: chunk.text });
              }
              if (chunk.functionCalls && chunk.functionCalls.length > 0) {
                for (const fc of chunk.functionCalls) {
                  if (fc.name) {
                    pendingCalls.push({
                      name: fc.name,
                      args: (fc.args as Record<string, any>) || {},
                    });
                  }
                }
              }
              if (chunk.usageMetadata) {
                totalInputTokens = Number(chunk.usageMetadata.promptTokenCount || totalInputTokens);
                totalOutputTokens = Number(
                  chunk.usageMetadata.candidatesTokenCount || totalOutputTokens
                );
              }
            }

            if (pendingCalls.length === 0) break;

            // Append model turn with function calls
            const modelParts: any[] = [];
            if (streamedText) modelParts.push({ text: streamedText });
            for (const fc of pendingCalls) {
              modelParts.push({ functionCall: { name: fc.name, args: fc.args } });
            }
            contents.push({ role: "model", parts: modelParts });

            // Execute tools & append user functionResponse turn
            const responseParts: any[] = [];
            for (const call of pendingCalls) {
              send({
                type: "tool",
                log: { name: call.name, status: "running" },
              });

              const toolOut = await executeAITool(call.name, call.args, ctx, body.mode);
              if (toolOut.confirmation) {
                pendingConfirmation = toolOut.confirmation;
                send({ type: "confirmation", payload: toolOut.confirmation });
              }
              if (toolOut.documentAction) {
                collectedDocs.push(toolOut.documentAction);
                send({ type: "documents", documents: collectedDocs });
              }

              send({
                type: "tool",
                log: {
                  name: call.name,
                  status: toolOut.result?.error ? "error" : "completed",
                  summary: toolOut.result?.error || toolOut.result?.message || "Done",
                },
              });

              responseParts.push({
                functionResponse: {
                  name: call.name,
                  response: toolOut.result,
                },
              });
            }
            contents.push({ role: "user", parts: responseParts });
          }
        }

        send({
          type: "usage",
          usage: {
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            total_tokens: totalInputTokens + totalOutputTokens,
          },
        });
        send({ type: "done", hasConfirmation: Boolean(pendingConfirmation) });
      } catch (err: any) {
        const cleanMsg = sanitizeErrorForClient(err);
        let friendly = cleanMsg;
        const lower = cleanMsg.toLowerCase();
        if (lower.includes("401") || lower.includes("invalid api key") || lower.includes("api_key_invalid")) {
          friendly = `Authentication failed for ${body.provider.toUpperCase()}. Please verify the server API key in .env.local or Vercel Environment Variables.`;
        } else if (lower.includes("429") || lower.includes("quota") || lower.includes("rate")) {
          friendly = `${body.provider.toUpperCase()} rate limit or quota exceeded. Please check your provider billing/credits or wait a moment.`;
        } else if (lower.includes("timeout") || lower.includes("aborted")) {
          friendly = `${body.provider.toUpperCase()} request timed out. Please try again.`;
        }
        send({ type: "error", message: friendly });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
