import { NextRequest, NextResponse } from "next/server";
import { authenticateAIRequest, sanitizeErrorForClient } from "@/lib/ai/security";
import { getProviderConnectionStatuses } from "@/lib/ai/providers";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    const refresh = request.nextUrl.searchParams.get("refresh") === "true";

    const ctx = await authenticateAIRequest(request, workspaceId);
    const providers = await getProviderConnectionStatuses(refresh);

    return NextResponse.json({
      success: true,
      workspace: {
        id: ctx.workspaceId,
        name: ctx.workspaceName,
      },
      user: {
        role: ctx.role,
        canExecuteActions: ctx.isOwner || ["owner", "admin", "manager", "receptionist"].includes(ctx.role.toLowerCase()),
      },
      providers,
    });
  } catch (err: any) {
    const msg = sanitizeErrorForClient(err);
    const status = msg.startsWith("UNAUTHORIZED")
      ? 401
      : msg.startsWith("FORBIDDEN")
      ? 403
      : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
