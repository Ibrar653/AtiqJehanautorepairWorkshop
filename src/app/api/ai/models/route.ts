import { NextRequest, NextResponse } from "next/server";
import {
  authenticateAIRequest,
  checkUserRateLimit,
  sanitizeErrorForClient,
} from "@/lib/ai/security";
import { getProviderConnectionStatuses } from "@/lib/ai/providers";
import type { AIProvider } from "@/lib/ai/types";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    const forceRefresh = request.nextUrl.searchParams.get("refresh") === "1";
    const probe = request.nextUrl.searchParams.get("probe") === "1";
    const probeProvider = request.nextUrl.searchParams.get("provider") as AIProvider | null;
    const probeModel = request.nextUrl.searchParams.get("model") || undefined;

    const ctx = await authenticateAIRequest(request, workspaceId);

    // Rate-limit live generation probes so free-tier quota is never spammed
    if (probe) {
      const rate = checkUserRateLimit(ctx.userId);
      if (!rate.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `Rate limit reached. Wait ${rate.retryAfterSeconds}s before probing again.`,
          },
          { status: 429 }
        );
      }
    }

    const providers = await getProviderConnectionStatuses(
      forceRefresh || probe,
      probe && (probeProvider === "gemini" || probeProvider === "openai")
        ? { provider: probeProvider, model: probeModel }
        : undefined
    );

    return NextResponse.json({
      success: true,
      workspace: {
        id: ctx.workspaceId,
        name: ctx.workspaceName,
        role: ctx.role,
      },
      providers,
    });
  } catch (err: any) {
    const msg = sanitizeErrorForClient(err);
    const status = msg.startsWith("UNAUTHORIZED") ? 401 : msg.startsWith("FORBIDDEN") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
