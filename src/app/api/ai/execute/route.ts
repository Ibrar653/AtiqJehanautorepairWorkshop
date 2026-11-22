import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authenticateAIRequest,
  checkUserRateLimit,
  sanitizeErrorForClient,
} from "@/lib/ai/security";
import { executeConfirmedWorkflow } from "@/lib/ai/tool-registry";
import type { ActionConfirmationPayload } from "@/lib/ai/types";

const ExecuteRequestSchema = z.object({
  workspaceId: z.string().uuid().optional().nullable(),
  confirmation: z.object({
    idempotency_key: z.string().min(8).max(120),
    workflow_type: z.enum([
      "customer_vehicle_jobcard_invoice",
      "create_customer",
      "register_vehicle",
      "create_job_card",
      "update_job_card",
      "convert_job_card_to_invoice",
      "create_direct_invoice",
    ]),
    summary_title: z.string().min(1),
    customer: z.object({
      existing_id: z.string().uuid().nullable().optional(),
      name: z.string().min(1).max(120),
      mobile: z.string().max(40).nullable().optional(),
      company_name: z.string().max(120).nullable().optional(),
      trn_number: z.string().max(50).nullable().optional(),
      will_create: z.boolean(),
    }),
    vehicle: z
      .object({
        existing_id: z.string().uuid().nullable().optional(),
        make: z.string().min(1).max(60),
        model: z.string().min(1).max(60),
        year: z.number().int().nullable().optional(),
        registration_number: z.string().max(40).nullable().optional(),
        chassis_vin: z.string().max(50).nullable().optional(),
        will_create: z.boolean(),
      })
      .nullable()
      .optional(),
    job_card: z
      .object({
        existing_id: z.string().uuid().nullable().optional(),
        existing_number: z.string().nullable().optional(),
        status: z.enum(["new", "in_progress", "waiting", "completed", "cancelled"]).nullable().optional(),
        customer_complaint: z.string().max(500).nullable().optional(),
        work_details: z.string().max(1000).nullable().optional(),
        assigned_mechanic: z.string().max(80).nullable().optional(),
        notes: z.string().max(500).nullable().optional(),
        will_create: z.boolean(),
        will_update: z.boolean().optional(),
      })
      .nullable()
      .optional(),
    invoice: z
      .object({
        will_create: z.boolean(),
        open_print_preview: z.boolean().optional(),
        payment_status: z.enum(["paid", "partially_paid", "credit"]).optional(),
        notes: z.string().max(500).nullable().optional(),
      })
      .nullable()
      .optional(),
    items: z.array(
      z.object({
        item_type: z.enum(["service", "part"]),
        description: z.string().min(1).max(200),
        quantity: z.number().positive(),
        unit_price: z.number().min(0),
        labour_charge: z.number().min(0).optional(),
        total_price: z.number().min(0),
        service_id: z.string().uuid().nullable().optional(),
        part_id: z.string().uuid().nullable().optional(),
      })
    ),
    financials: z.object({
      subtotal: z.number().min(0),
      discount: z.number().min(0),
      discount_type: z.literal("fixed"),
      taxable_amount: z.number().min(0),
      vat_rate: z.number().min(0).max(100),
      vat_amount: z.number().min(0),
      grand_total: z.number().min(0),
    }),
    proposed_actions: z.array(z.string()),
  }),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof ExecuteRequestSchema>;
  try {
    const raw = await request.json();
    body = ExecuteRequestSchema.parse(raw);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: `Invalid confirmation payload: ${sanitizeErrorForClient(err)}` },
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
        error: `Rate limit reached. Please wait ${rate.retryAfterSeconds}s.`,
      },
      { status: 429 }
    );
  }

  try {
    const result = await executeConfirmedWorkflow(
      ctx,
      body.confirmation as ActionConfirmationPayload
    );
    return NextResponse.json(result, { status: result.success ? 200 : 422 });
  } catch (err: any) {
    const msg = sanitizeErrorForClient(err);
    const status = msg.startsWith("Forbidden") ? 403 : 500;
    return NextResponse.json({ success: false, error: msg }, { status });
  }
}
