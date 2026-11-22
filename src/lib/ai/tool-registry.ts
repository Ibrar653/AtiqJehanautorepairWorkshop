import crypto from "crypto";
import { z } from "zod";
import type { AuthenticatedAIContext } from "./security";
import {
  canUserPerformWorkshopWrites,
  getCachedExecutionResult,
  setCachedExecutionResult,
} from "./security";
import type {
  AIMode,
  ActionConfirmationPayload,
  ActionExecutionResult,
  DocumentActionRef,
  ExecutionStepStatus,
  PlannedLineItem,
} from "./types";
import { calculateTotal } from "@/lib/utils";
import {
  buildSeparatorTolerantPattern,
  stripSeparators,
} from "@/lib/services/smart-search-engine";

// ─── Tool Schema Metadata (Compatible with OpenAI Responses API & Gemini) ────
export interface AIToolSpec {
  name: string;
  description: string;
  readOnly: boolean;
  parameters: Record<string, any>;
}

export const AI_TOOL_SPECS: AIToolSpec[] = [
  {
    name: "search_customers",
    description:
      "Search existing customers in the active workshop workspace by name, mobile number, company name, or TRN.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search term (customer name, mobile, or company)." },
        limit: { type: "number", description: "Max results to return (1-20, default 10)." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_customer_details",
    description:
      "Get full profile, vehicles, recent job cards, and unpaid balance for a specific customer ID.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        customer_id: { type: "string", description: "UUID of the customer." },
      },
      required: ["customer_id"],
    },
  },
  {
    name: "search_vehicles",
    description:
      "Search existing vehicles by make, model, plate/registration number (hyphen-insensitive, e.g. GSS23456 matches GSS-23456), or Chassis/VIN.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Make, model, plate number, or VIN." },
        limit: { type: "number", description: "Max results (1-20, default 10)." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_vehicle_history",
    description:
      "Retrieve complete service and job card repair history for a vehicle ID or registration plate.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        vehicle_id: { type: "string", description: "Vehicle UUID (if known)." },
        registration_number: { type: "string", description: "Vehicle plate number (if UUID not known)." },
      },
    },
  },
  {
    name: "search_job_cards",
    description:
      "Search existing Job Cards by job card number, invoice number, customer name, vehicle plate, mechanic, or status.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional search text (JC #, plate, customer, mechanic)." },
        status: {
          type: "string",
          enum: ["all", "new", "in_progress", "waiting", "completed", "cancelled"],
          description: "Optional status filter.",
        },
        limit: { type: "number", description: "Max results (1-20, default 10)." },
      },
    },
  },
  {
    name: "get_job_card_details",
    description: "Get full details and line items for a specific Job Card by ID or Job Card number.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        job_card_id: { type: "string", description: "Job Card UUID." },
        job_card_number: { type: "string", description: "Job Card number (e.g. JC-1103 or 1103)." },
      },
    },
  },
  {
    name: "search_invoices",
    description:
      "Search existing Invoices by invoice number, customer name, vehicle plate, or payment status.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Optional search text (invoice #, customer, plate)." },
        payment_status: {
          type: "string",
          enum: ["all", "paid", "partially_paid", "credit", "void"],
          description: "Optional payment status filter.",
        },
        limit: { type: "number", description: "Max results (1-20, default 10)." },
      },
    },
  },
  {
    name: "get_invoice_details",
    description: "Get full details, items, VAT, discount, and payment balance for a specific Invoice.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        invoice_id: { type: "string", description: "Invoice UUID." },
        invoice_number: { type: "string", description: "Invoice number (e.g. 1088)." },
      },
    },
  },
  {
    name: "search_services_catalog",
    description: "Search the workshop's existing service catalog to match service names and standard prices.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Service keyword (e.g. oil change, AC service, brake)." },
      },
      required: ["query"],
    },
  },
  {
    name: "search_spare_parts_catalog",
    description: "Search the workshop's spare parts inventory catalog by name, part number, or brand to find selling prices and available stock.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Part name, OEM part number, or brand (e.g. oil filter, brake pad)." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_customer_outstanding_balance",
    description:
      "Calculate the exact outstanding unpaid balance across all non-void invoices for a customer or across all customers with unpaid balances.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        customer_query: {
          type: "string",
          description: "Optional customer name or phone. Omit to list top customers with outstanding balances.",
        },
      },
    },
  },
  {
    name: "get_sales_summary",
    description:
      "Get live workshop sales, VAT, collections, and outstanding totals for a period (today, this_week, this_month, all_time).",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["today", "this_week", "this_month", "all_time"],
          description: "Reporting period (default this_month).",
        },
      },
    },
  },
  {
    name: "get_workshop_summary",
    description:
      "Get live snapshot of open, in-progress, waiting, and completed Job Cards plus total customers and vehicles.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "open_document_action",
    description:
      "Provide direct UI buttons in the chat to open, print preview, or download PDF for an existing Job Card or Invoice.",
    readOnly: true,
    parameters: {
      type: "object",
      properties: {
        document_type: { type: "string", enum: ["job_card", "invoice"] },
        document_id: { type: "string", description: "UUID of the existing Job Card or Invoice." },
        document_number: { type: "string", description: "Display number of the document." },
        auto_print_preview: {
          type: "boolean",
          description: "Set true if the user asked to print or open print preview.",
        },
      },
      required: ["document_type", "document_id", "document_number"],
    },
  },
  {
    name: "prepare_workshop_workflow",
    description:
      "AGENT MODE ONLY. Prepares a validated Confirmation Preview card for creating/reusing a Customer, registering a Vehicle, creating or updating a Job Card, converting an existing Job Card into an Invoice, or creating a Direct Invoice. Does NOT write to database until the user clicks Confirm & Execute.",
    readOnly: false,
    parameters: {
      type: "object",
      properties: {
        workflow_type: {
          type: "string",
          enum: [
            "customer_vehicle_jobcard_invoice",
            "create_customer",
            "register_vehicle",
            "create_job_card",
            "update_job_card",
            "convert_job_card_to_invoice",
            "create_direct_invoice",
          ],
          description: "Target workflow to prepare.",
        },
        customer_id: { type: "string", description: "Existing customer UUID if verified." },
        customer_name: { type: "string", description: "Customer full name." },
        customer_mobile: { type: "string", description: "Customer phone/mobile number." },
        customer_company: { type: "string", description: "Optional company name." },
        customer_trn: { type: "string", description: "Optional TRN." },
        vehicle_id: { type: "string", description: "Existing vehicle UUID if verified." },
        vehicle_make: { type: "string", description: "Vehicle make (e.g. Toyota)." },
        vehicle_model: { type: "string", description: "Vehicle model (e.g. Corolla)." },
        vehicle_year: { type: "number", description: "Optional model year." },
        vehicle_registration: { type: "string", description: "Plate / registration number (e.g. GSS-23456)." },
        vehicle_vin: { type: "string", description: "Optional Chassis / VIN." },
        existing_job_card_id: {
          type: "string",
          description: "Existing Job Card UUID (required for update_job_card or convert_job_card_to_invoice).",
        },
        job_card_status: {
          type: "string",
          enum: ["new", "in_progress", "waiting", "completed", "cancelled"],
          description: "Optional Job Card status (especially for update_job_card).",
        },
        customer_complaint: { type: "string", description: "Customer complaint / service summary." },
        work_details: { type: "string", description: "Repair / technical work details." },
        assigned_mechanic: { type: "string", description: "Optional mechanic name." },
        notes: { type: "string", description: "Optional notes." },
        items: {
          type: "array",
          description: "Services and/or spare parts line items.",
          items: {
            type: "object",
            properties: {
              item_type: { type: "string", enum: ["service", "part"] },
              description: { type: "string" },
              quantity: { type: "number" },
              unit_price: { type: "number" },
              labour_charge: { type: "number" },
            },
            required: ["description", "unit_price"],
          },
        },
        discount: { type: "number", description: "Fixed discount amount in AED (default 0)." },
        vat_rate: { type: "number", description: "VAT rate percentage (e.g. 0 or 5; default 5 unless user specified 0)." },
        generate_invoice: { type: "boolean", description: "Whether to convert/generate an invoice." },
        open_print_preview: { type: "boolean", description: "Whether the user asked to print the invoice." },
      },
      required: ["workflow_type", "customer_name"],
    },
  },
];

export function getAllowedToolsForMode(mode: AIMode): AIToolSpec[] {
  if (mode === "ask") {
    return AI_TOOL_SPECS.filter((t) => t.readOnly);
  }
  return AI_TOOL_SPECS;
}

// ─── Helper: Extract numeric sequence from JC / Invoice numbers ──────────────
function extractSeq(val: string | number | null | undefined): number | null {
  if (val === null || val === undefined) return null;
  const digits = String(val).replace(/\D/g, "");
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return isNaN(n) ? null : n;
}

// ─── Tool Execution Dispatcher (Strictly Validated & Workspace-Scoped) ───────
export async function executeAITool(
  toolName: string,
  rawArgs: Record<string, any>,
  ctx: AuthenticatedAIContext,
  mode: AIMode
): Promise<{
  result: Record<string, any>;
  confirmation?: ActionConfirmationPayload;
  documentAction?: DocumentActionRef;
}> {
  const allowed = getAllowedToolsForMode(mode);
  if (!allowed.some((t) => t.name === toolName)) {
    return {
      result: {
        error: `Tool "${toolName}" is not permitted in ${mode === "ask" ? "Ask AI (read-only)" : "current"} mode.`,
      },
    };
  }

  const { supabase, workspaceId } = ctx;

  switch (toolName) {
    case "search_customers": {
      const schema = z.object({
        query: z.string().min(1).max(120),
        limit: z.number().min(1).max(20).optional().default(10),
      });
      const parsed = schema.parse(rawArgs);
      const pat = buildSeparatorTolerantPattern(parsed.query);
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, mobile, company_name, trn_number, created_at")
        .eq("workspace_id", workspaceId)
        .eq("is_deleted", false)
        .or(`name.ilike.${pat},mobile.ilike.${pat},company_name.ilike.${pat},trn_number.ilike.${pat}`)
        .order("created_at", { ascending: false })
        .limit(parsed.limit);

      if (error) return { result: { error: error.message } };
      return {
        result: {
          count: (data || []).length,
          customers: (data || []).map((c: any) => ({
            id: c.id,
            name: c.name,
            mobile: c.mobile || null,
            company_name: c.company_name || null,
            trn_number: c.trn_number || null,
          })),
        },
      };
    }

    case "get_customer_details": {
      const { customer_id } = z.object({ customer_id: z.string().uuid() }).parse(rawArgs);
      const [custRes, vehRes, jcRes, invRes] = await Promise.all([
        supabase
          .from("customers")
          .select("id, name, mobile, email, company_name, trn_number, address, notes")
          .eq("id", customer_id)
          .eq("workspace_id", workspaceId)
          .maybeSingle(),
        supabase
          .from("vehicles")
          .select("id, make, model, year, registration_number, chassis_vin")
          .eq("customer_id", customer_id)
          .eq("workspace_id", workspaceId)
          .eq("is_deleted", false),
        supabase
          .from("job_cards")
          .select("id, job_card_number, date, status, total, balance")
          .eq("customer_id", customer_id)
          .eq("workspace_id", workspaceId)
          .eq("is_deleted", false)
          .order("date", { ascending: false })
          .limit(10),
        supabase
          .from("invoices")
          .select("id, invoice_number, total, paid, balance, payment_status, created_at")
          .eq("customer_id", customer_id)
          .eq("workspace_id", workspaceId)
          .neq("payment_status", "void")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

      if (!custRes.data) return { result: { error: "Customer not found in active workspace." } };
      const outstanding = (invRes.data || []).reduce(
        (sum: number, inv: any) => sum + Math.max(0, Number(inv.balance) || 0),
        0
      );
      return {
        result: {
          customer: custRes.data,
          vehicles: vehRes.data || [],
          recent_job_cards: jcRes.data || [],
          recent_invoices: invRes.data || [],
          total_outstanding_aed: Math.round(outstanding * 100) / 100,
        },
      };
    }

    case "search_vehicles": {
      const schema = z.object({
        query: z.string().min(1).max(120),
        limit: z.number().min(1).max(20).optional().default(10),
      });
      const parsed = schema.parse(rawArgs);
      const tokens = parsed.query.replace(/[,()]/g, " ").trim().split(/\s+/).filter(Boolean);
      let q = supabase
        .from("vehicles")
        .select("id, make, model, year, registration_number, chassis_vin, customer:customers(id, name, mobile)")
        .eq("workspace_id", workspaceId)
        .eq("is_deleted", false);

      for (const tok of tokens) {
        const pat = buildSeparatorTolerantPattern(tok);
        q = q.or(`make.ilike.${pat},model.ilike.${pat},registration_number.ilike.${pat},chassis_vin.ilike.${pat}`);
      }

      const { data, error } = await q.limit(parsed.limit);
      if (error) return { result: { error: error.message } };
      return { result: { count: (data || []).length, vehicles: data || [] } };
    }

    case "get_vehicle_history": {
      const parsed = z
        .object({
          vehicle_id: z.string().uuid().optional(),
          registration_number: z.string().optional(),
        })
        .parse(rawArgs);

      let vehicle: any = null;
      if (parsed.vehicle_id) {
        const { data } = await supabase
          .from("vehicles")
          .select("id, make, model, year, registration_number, chassis_vin, customer:customers(id, name, mobile)")
          .eq("id", parsed.vehicle_id)
          .eq("workspace_id", workspaceId)
          .maybeSingle();
        vehicle = data;
      } else if (parsed.registration_number) {
        const pat = buildSeparatorTolerantPattern(parsed.registration_number);
        const { data } = await supabase
          .from("vehicles")
          .select("id, make, model, year, registration_number, chassis_vin, customer:customers(id, name, mobile)")
          .eq("workspace_id", workspaceId)
          .eq("is_deleted", false)
          .ilike("registration_number", pat)
          .limit(1)
          .maybeSingle();
        vehicle = data;
      }

      if (!vehicle) return { result: { error: "Vehicle not found in active workspace." } };

      const { data: jobCards } = await supabase
        .from("job_cards")
        .select("id, job_card_number, invoice_number, date, status, subtotal, discount, vat_rate, vat_amount, total, customer_complaint, work_details")
        .eq("vehicle_id", vehicle.id)
        .eq("workspace_id", workspaceId)
        .eq("is_deleted", false)
        .order("date", { ascending: false })
        .limit(15);

      return {
        result: {
          vehicle,
          job_card_count: (jobCards || []).length,
          job_cards: jobCards || [],
        },
      };
    }

    case "search_job_cards": {
      const parsed = z
        .object({
          query: z.string().optional(),
          status: z.enum(["all", "new", "in_progress", "waiting", "completed", "cancelled"]).optional(),
          limit: z.number().min(1).max(20).optional().default(10),
        })
        .parse(rawArgs);

      let q = supabase
        .from("job_cards")
        .select(
          "id, job_card_number, invoice_number, date, status, subtotal, discount, vat_rate, vat_amount, total, paid, balance, customer_complaint, customer:customers(id, name, mobile), vehicle:vehicles(id, make, model, registration_number)"
        )
        .eq("workspace_id", workspaceId)
        .eq("is_deleted", false);

      if (parsed.status && parsed.status !== "all") {
        q = q.eq("status", parsed.status);
      }

      if (parsed.query && parsed.query.trim()) {
        const clean = parsed.query.trim();
        const pat = buildSeparatorTolerantPattern(clean);
        const [cMatch, vMatch] = await Promise.all([
          supabase
            .from("customers")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("is_deleted", false)
            .or(`name.ilike.${pat},mobile.ilike.${pat}`)
            .limit(40),
          supabase
            .from("vehicles")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("is_deleted", false)
            .or(`make.ilike.${pat},model.ilike.${pat},registration_number.ilike.${pat}`)
            .limit(40),
        ]);

        const orParts = [
          `job_card_number.ilike.${pat}`,
          `assigned_mechanic.ilike.${pat}`,
          `customer_complaint.ilike.${pat}`,
        ];
        if (!isNaN(Number(clean))) orParts.push(`invoice_number.eq.${Number(clean)}`);
        const cIds = (cMatch.data || []).map((r: any) => r.id);
        const vIds = (vMatch.data || []).map((r: any) => r.id);
        if (cIds.length > 0) orParts.push(`customer_id.in.(${cIds.join(",")})`);
        if (vIds.length > 0) orParts.push(`vehicle_id.in.(${vIds.join(",")})`);
        q = q.or(orParts.join(","));
      }

      const { data, error } = await q.order("date", { ascending: false }).limit(parsed.limit);
      if (error) return { result: { error: error.message } };
      return { result: { count: (data || []).length, job_cards: data || [] } };
    }

    case "get_job_card_details": {
      const parsed = z
        .object({
          job_card_id: z.string().uuid().optional(),
          job_card_number: z.string().optional(),
        })
        .parse(rawArgs);

      let q = supabase
        .from("job_cards")
        .select(
          "*, customer:customers(id, name, mobile, company_name), vehicle:vehicles(id, make, model, registration_number, chassis_vin), items:job_card_items(*)"
        )
        .eq("workspace_id", workspaceId)
        .eq("is_deleted", false);

      if (parsed.job_card_id) {
        q = q.eq("id", parsed.job_card_id);
      } else if (parsed.job_card_number) {
        q = q.ilike("job_card_number", buildSeparatorTolerantPattern(parsed.job_card_number));
      } else {
        return { result: { error: "Provide job_card_id or job_card_number." } };
      }

      const { data, error } = await q.limit(1).maybeSingle();
      if (error || !data) return { result: { error: error?.message || "Job Card not found." } };
      return {
        result: { job_card: data },
        documentAction: {
          type: "job_card",
          id: data.id,
          number: String(data.job_card_number || data.id.slice(0, 8)),
          label: `Job Card #${data.job_card_number}`,
        },
      };
    }

    case "search_invoices": {
      const parsed = z
        .object({
          query: z.string().optional(),
          payment_status: z.enum(["all", "paid", "partially_paid", "credit", "void"]).optional(),
          limit: z.number().min(1).max(20).optional().default(10),
        })
        .parse(rawArgs);

      let q = supabase
        .from("invoices")
        .select(
          "id, invoice_number, created_at, payment_status, subtotal, discount, vat_rate, vat_amount, total, paid, balance, customer:customers(id, name, mobile), vehicle:vehicles(id, make, model, registration_number), job_card:job_cards(id, job_card_number)"
        )
        .eq("workspace_id", workspaceId);

      if (parsed.payment_status && parsed.payment_status !== "all") {
        q = q.eq("payment_status", parsed.payment_status);
      }

      if (parsed.query && parsed.query.trim()) {
        const clean = parsed.query.trim();
        const pat = buildSeparatorTolerantPattern(clean);
        const [cMatch, vMatch] = await Promise.all([
          supabase
            .from("customers")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("is_deleted", false)
            .or(`name.ilike.${pat},mobile.ilike.${pat}`)
            .limit(40),
          supabase
            .from("vehicles")
            .select("id")
            .eq("workspace_id", workspaceId)
            .eq("is_deleted", false)
            .or(`make.ilike.${pat},model.ilike.${pat},registration_number.ilike.${pat}`)
            .limit(40),
        ]);

        const orParts = [`invoice_number.ilike.${pat}`, `notes.ilike.${pat}`];
        const cIds = (cMatch.data || []).map((r: any) => r.id);
        const vIds = (vMatch.data || []).map((r: any) => r.id);
        if (cIds.length > 0) orParts.push(`customer_id.in.(${cIds.join(",")})`);
        if (vIds.length > 0) orParts.push(`vehicle_id.in.(${vIds.join(",")})`);
        q = q.or(orParts.join(","));
      }

      const { data, error } = await q.order("created_at", { ascending: false }).limit(parsed.limit);
      if (error) return { result: { error: error.message } };
      return { result: { count: (data || []).length, invoices: data || [] } };
    }

    case "get_invoice_details": {
      const parsed = z
        .object({
          invoice_id: z.string().uuid().optional(),
          invoice_number: z.string().optional(),
        })
        .parse(rawArgs);

      let q = supabase
        .from("invoices")
        .select(
          "*, customer:customers(id, name, mobile, company_name), vehicle:vehicles(id, make, model, registration_number), items:invoice_items(*), payments(id, amount, payment_method, payment_date)"
        )
        .eq("workspace_id", workspaceId);

      if (parsed.invoice_id) {
        q = q.eq("id", parsed.invoice_id);
      } else if (parsed.invoice_number) {
        q = q.ilike("invoice_number", buildSeparatorTolerantPattern(parsed.invoice_number));
      } else {
        return { result: { error: "Provide invoice_id or invoice_number." } };
      }

      const { data, error } = await q.limit(1).maybeSingle();
      if (error || !data) return { result: { error: error?.message || "Invoice not found." } };
      return {
        result: { invoice: data },
        documentAction: {
          type: "invoice",
          id: data.id,
          number: String(data.invoice_number),
          label: `Invoice #${data.invoice_number}`,
        },
      };
    }

    case "search_services_catalog": {
      const { query } = z.object({ query: z.string().min(1).max(100) }).parse(rawArgs);
      const pat = buildSeparatorTolerantPattern(query);
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_code, category, default_price, description")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .or(`name.ilike.${pat},category.ilike.${pat},service_code.ilike.${pat}`)
        .limit(10);

      if (error) return { result: { error: error.message } };
      return { result: { count: (data || []).length, services: data || [] } };
    }

    case "search_spare_parts_catalog": {
      const { query } = z.object({ query: z.string().min(1).max(100) }).parse(rawArgs);
      const pat = buildSeparatorTolerantPattern(query);
      const { data, error } = await supabase
        .from("parts")
        .select("id, name, part_number, brand, unit, selling_price, current_stock, minimum_stock")
        .eq("workspace_id", workspaceId)
        .eq("is_active", true)
        .eq("is_deleted", false)
        .or(`name.ilike.${pat},part_number.ilike.${pat},brand.ilike.${pat},description.ilike.${pat}`)
        .limit(10);

      if (error) return { result: { error: error.message } };
      return { result: { count: (data || []).length, spare_parts: data || [] } };
    }

    case "get_customer_outstanding_balance": {
      const { customer_query } = z
        .object({ customer_query: z.string().optional() })
        .parse(rawArgs);

      let invQuery = supabase
        .from("invoices")
        .select("id, invoice_number, total, paid, balance, payment_status, customer:customers(id, name, mobile)")
        .eq("workspace_id", workspaceId)
        .neq("payment_status", "void")
        .gt("balance", 0)
        .order("balance", { ascending: false })
        .limit(50);

      if (customer_query && customer_query.trim()) {
        const pat = buildSeparatorTolerantPattern(customer_query.trim());
        const { data: custs } = await supabase
          .from("customers")
          .select("id")
          .eq("workspace_id", workspaceId)
          .eq("is_deleted", false)
          .or(`name.ilike.${pat},mobile.ilike.${pat}`)
          .limit(20);
        const ids = (custs || []).map((c: any) => c.id);
        if (ids.length === 0) {
          return { result: { total_outstanding_aed: 0, invoices: [], message: "No matching customer found." } };
        }
        invQuery = invQuery.in("customer_id", ids);
      }

      const { data, error } = await invQuery;
      if (error) return { result: { error: error.message } };
      const totalOutstanding = (data || []).reduce((s: number, i: any) => s + (Number(i.balance) || 0), 0);
      return {
        result: {
          unpaid_invoice_count: (data || []).length,
          total_outstanding_aed: Math.round(totalOutstanding * 100) / 100,
          unpaid_invoices: (data || []).slice(0, 15).map((i: any) => ({
            invoice_number: i.invoice_number,
            customer_name: i.customer?.name || "Customer",
            total: Number(i.total) || 0,
            paid: Number(i.paid) || 0,
            balance: Number(i.balance) || 0,
          })),
        },
      };
    }

    case "get_sales_summary": {
      const { period } = z
        .object({ period: z.enum(["today", "this_week", "this_month", "all_time"]).optional().default("this_month") })
        .parse(rawArgs);

      const now = new Date();
      let startIso: string | null = null;
      if (period === "today") {
        startIso = `${now.toISOString().slice(0, 10)}T00:00:00Z`;
      } else if (period === "this_week") {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        startIso = `${d.toISOString().slice(0, 10)}T00:00:00Z`;
      } else if (period === "this_month") {
        const d = new Date(now.getFullYear(), now.getMonth(), 1);
        startIso = `${d.toISOString().slice(0, 10)}T00:00:00Z`;
      }

      let q = supabase
        .from("invoices")
        .select("subtotal, discount, vat_amount, total, paid, balance, payment_status")
        .eq("workspace_id", workspaceId)
        .neq("payment_status", "void");

      if (startIso) q = q.gte("created_at", startIso);

      const { data, error } = await q;
      if (error) return { result: { error: error.message } };

      const rows = data || [];
      const sum = (k: string) =>
        Math.round(rows.reduce((acc: number, r: any) => acc + (Number(r[k]) || 0), 0) * 100) / 100;

      return {
        result: {
          period,
          invoice_count: rows.length,
          gross_sales_aed: sum("total"),
          total_collected_aed: sum("paid"),
          total_outstanding_aed: sum("balance"),
          total_vat_aed: sum("vat_amount"),
          total_discount_aed: sum("discount"),
        },
      };
    }

    case "get_workshop_summary": {
      const [jcRes, custRes, vehRes] = await Promise.all([
        supabase
          .from("job_cards")
          .select("status")
          .eq("workspace_id", workspaceId)
          .eq("is_deleted", false),
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("is_deleted", false),
        supabase
          .from("vehicles")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId)
          .eq("is_deleted", false),
      ]);

      const counts: Record<string, number> = {
        new: 0,
        in_progress: 0,
        waiting: 0,
        completed: 0,
        cancelled: 0,
      };
      for (const row of jcRes.data || []) {
        const s = (row as any).status || "new";
        if (s in counts) counts[s]++;
      }
      return {
        result: {
          total_customers: custRes.count || 0,
          total_vehicles: vehRes.count || 0,
          job_cards_by_status: counts,
          open_job_cards: counts.new + counts.in_progress + counts.waiting,
        },
      };
    }

    case "open_document_action": {
      const parsed = z
        .object({
          document_type: z.enum(["job_card", "invoice"]),
          document_id: z.string().uuid(),
          document_number: z.string().min(1),
          auto_print_preview: z.boolean().optional().default(false),
        })
        .parse(rawArgs);

      const docRef: DocumentActionRef = {
        type: parsed.document_type,
        id: parsed.document_id,
        number: parsed.document_number,
        label:
          parsed.document_type === "invoice"
            ? `Invoice #${parsed.document_number}`
            : `Job Card #${parsed.document_number}`,
        autoPrintPreview: parsed.auto_print_preview,
      };

      return {
        result: {
          ready: true,
          message: `Action buttons attached for ${docRef.label}.`,
        },
        documentAction: docRef,
      };
    }

    case "prepare_workshop_workflow": {
      if (!canUserPerformWorkshopWrites(ctx)) {
        return {
          result: {
            error: `Your role (${ctx.role}) is not authorized to create workshop records.`,
          },
        };
      }

      const schema = z.object({
        workflow_type: z.enum([
          "customer_vehicle_jobcard_invoice",
          "create_customer",
          "register_vehicle",
          "create_job_card",
          "update_job_card",
          "convert_job_card_to_invoice",
          "create_direct_invoice",
        ]),
        customer_id: z.string().uuid().optional(),
        customer_name: z.string().min(1).max(120),
        customer_mobile: z.string().max(40).optional().nullable(),
        customer_company: z.string().max(120).optional().nullable(),
        customer_trn: z.string().max(50).optional().nullable(),
        vehicle_id: z.string().uuid().optional(),
        vehicle_make: z.string().max(60).optional().nullable(),
        vehicle_model: z.string().max(60).optional().nullable(),
        vehicle_year: z.number().int().min(1950).max(2035).optional().nullable(),
        vehicle_registration: z.string().max(40).optional().nullable(),
        vehicle_vin: z.string().max(50).optional().nullable(),
        existing_job_card_id: z.string().uuid().optional(),
        job_card_status: z
          .enum(["new", "in_progress", "waiting", "completed", "cancelled"])
          .optional()
          .nullable(),
        customer_complaint: z.string().max(500).optional().nullable(),
        work_details: z.string().max(1000).optional().nullable(),
        assigned_mechanic: z.string().max(80).optional().nullable(),
        notes: z.string().max(500).optional().nullable(),
        items: z
          .array(
            z.object({
              item_type: z.enum(["service", "part"]).optional().default("service"),
              description: z.string().min(1).max(200),
              quantity: z.number().positive().optional().default(1),
              unit_price: z.number().min(0),
              labour_charge: z.number().min(0).optional().default(0),
            })
          )
          .optional()
          .default([]),
        discount: z.number().min(0).optional(),
        vat_rate: z.number().min(0).max(100).optional(),
        generate_invoice: z.boolean().optional(),
        open_print_preview: z.boolean().optional().default(false),
      });

      const input = schema.parse(rawArgs);
      const warnings: string[] = [];

      // 0. If updating or converting an existing Job Card, load it from DB first (workspace-scoped)
      let existingJobCard: any = null;
      if (
        (input.workflow_type === "update_job_card" ||
          input.workflow_type === "convert_job_card_to_invoice") &&
        input.existing_job_card_id
      ) {
        const { data: jcData } = await supabase
          .from("job_cards")
          .select(
            "*, customer:customers(id, name, mobile, company_name, trn_number), vehicle:vehicles(id, make, model, year, registration_number, chassis_vin), items:job_card_items(*)"
          )
          .eq("id", input.existing_job_card_id)
          .eq("workspace_id", workspaceId)
          .eq("is_deleted", false)
          .maybeSingle();

        if (!jcData) {
          return {
            result: {
              error: `Job Card ID ${input.existing_job_card_id} was not found in the active workspace.`,
            },
          };
        }
        existingJobCard = jcData;

        if (input.workflow_type === "convert_job_card_to_invoice") {
          const { data: existingInv } = await supabase
            .from("invoices")
            .select("id, invoice_number")
            .eq("workspace_id", workspaceId)
            .eq("job_card_id", jcData.id)
            .neq("payment_status", "void")
            .limit(1)
            .maybeSingle();

          if (existingInv) {
            return {
              result: {
                error: `Job Card #${jcData.job_card_number} has already been converted to Invoice #${existingInv.invoice_number}. Duplicate invoice creation is blocked.`,
                existing_invoice_id: existingInv.id,
                existing_invoice_number: existingInv.invoice_number,
              },
              documentAction: {
                type: "invoice",
                id: existingInv.id,
                number: String(existingInv.invoice_number),
                label: `Invoice #${existingInv.invoice_number}`,
                autoPrintPreview: Boolean(input.open_print_preview),
              },
            };
          }
        }
      } else if (
        input.workflow_type === "update_job_card" ||
        input.workflow_type === "convert_job_card_to_invoice"
      ) {
        return {
          result: {
            error: `existing_job_card_id is required for workflow "${input.workflow_type}". Use search_job_cards first to get the Job Card UUID.`,
          },
        };
      }

      // 1. Duplicate-Safe Customer Check (Exact mobile match reuses customer; name-only match warns without auto-merging!)
      let resolvedCustomerId: string | null =
        input.customer_id || existingJobCard?.customer?.id || null;
      const effectiveCustomerName =
        existingJobCard?.customer?.name || input.customer_name;
      const effectiveCustomerMobile =
        input.customer_mobile ?? existingJobCard?.customer?.mobile ?? null;
      let possibleDuplicates: Array<{ id: string; name: string; mobile?: string | null }> = [];

      if (!resolvedCustomerId) {
        if (effectiveCustomerMobile && effectiveCustomerMobile.trim()) {
          const mobPat = buildSeparatorTolerantPattern(effectiveCustomerMobile.trim());
          const { data: byMobile } = await supabase
            .from("customers")
            .select("id, name, mobile")
            .eq("workspace_id", workspaceId)
            .eq("is_deleted", false)
            .ilike("mobile", mobPat)
            .limit(3);

          const exactMob = (byMobile || []).find(
            (c: any) =>
              stripSeparators(c.mobile) === stripSeparators(effectiveCustomerMobile || "")
          );
          if (exactMob) {
            resolvedCustomerId = exactMob.id;
            warnings.push(
              `Matched existing customer "${exactMob.name}" (${exactMob.mobile}) by phone number — will reuse to avoid duplicates.`
            );
          }
        }

        if (!resolvedCustomerId) {
          const namePat = buildSeparatorTolerantPattern(effectiveCustomerName);
          const { data: byName } = await supabase
            .from("customers")
            .select("id, name, mobile")
            .eq("workspace_id", workspaceId)
            .eq("is_deleted", false)
            .ilike("name", namePat)
            .limit(5);

          if (byName && byName.length > 0) {
            possibleDuplicates = byName.map((c: any) => ({
              id: c.id,
              name: c.name,
              mobile: c.mobile,
            }));
            warnings.push(
              `Found ${byName.length} existing customer(s) with a similar name ("${byName[0].name}"). Will NOT auto-merge without matching phone number.`
            );
          }
        }
      }

      // 2. Duplicate-Safe Vehicle Check (Normalized plate / VIN match)
      let resolvedVehicleId: string | null =
        input.vehicle_id || existingJobCard?.vehicle?.id || null;
      const effectivePlate =
        input.vehicle_registration ?? existingJobCard?.vehicle?.registration_number ?? null;
      if (!resolvedVehicleId && effectivePlate && effectivePlate.trim()) {
        const platePat = buildSeparatorTolerantPattern(effectivePlate.trim());
        const { data: byPlate } = await supabase
          .from("vehicles")
          .select("id, make, model, registration_number, customer_id")
          .eq("workspace_id", workspaceId)
          .eq("is_deleted", false)
          .ilike("registration_number", platePat)
          .limit(3);

        const exactPlate = (byPlate || []).find(
          (v: any) =>
            stripSeparators(v.registration_number) ===
            stripSeparators(effectivePlate || "")
        );
        if (exactPlate) {
          resolvedVehicleId = exactPlate.id;
          warnings.push(
            `Found existing vehicle ${exactPlate.make} ${exactPlate.model} (${exactPlate.registration_number}) — will link existing vehicle to prevent duplicates.`
          );
        }
      }

      // 3. Match Services & Spare Parts against Workshop Catalogs
      const [{ data: catalogServices }, { data: catalogParts }] = await Promise.all([
        supabase
          .from("services")
          .select("id, name, default_price")
          .eq("workspace_id", workspaceId)
          .eq("is_active", true)
          .limit(100),
        supabase
          .from("parts")
          .select("id, name, part_number, selling_price")
          .eq("workspace_id", workspaceId)
          .eq("is_active", true)
          .eq("is_deleted", false)
          .limit(100),
      ]);

      const sourceItems =
        input.items && input.items.length > 0
          ? input.items
          : (existingJobCard?.items || []).map((it: any) => ({
              item_type: it.item_type === "part" ? "part" : "service",
              description: it.description || "Service",
              quantity: Number(it.quantity) || 1,
              unit_price: Number(it.unit_price) || 0,
              labour_charge: Number(it.labour_charge) || 0,
            }));

      const plannedItems: PlannedLineItem[] = sourceItems.map((it: any) => {
        const qty = Number(it.quantity) || 1;
        const unit = Number(it.unit_price) || 0;
        const labour = Number(it.labour_charge) || 0;
        const total = Math.round((qty * unit + labour) * 100) / 100;
        const normDesc = String(it.description || "").toLowerCase();

        let matchedService: any = null;
        let matchedPart: any = null;
        if (it.item_type === "service" && catalogServices) {
          matchedService = catalogServices.find(
            (s: any) =>
              s.name.toLowerCase() === normDesc ||
              s.name.toLowerCase().includes(normDesc) ||
              normDesc.includes(s.name.toLowerCase())
          );
        } else if (it.item_type === "part" && catalogParts) {
          matchedPart = catalogParts.find(
            (p: any) =>
              p.name.toLowerCase() === normDesc ||
              p.name.toLowerCase().includes(normDesc) ||
              normDesc.includes(p.name.toLowerCase()) ||
              (p.part_number && normDesc.includes(String(p.part_number).toLowerCase()))
          );
        }

        return {
          item_type: it.item_type === "part" ? "part" : "service",
          description: it.description,
          quantity: qty,
          unit_price: unit,
          labour_charge: labour,
          total_price: total,
          service_id: matchedService?.id || null,
          part_id: matchedPart?.id || null,
          matched_catalog_name: matchedService?.name || matchedPart?.name || null,
        };
      });

      // 4. Authoritative Financial Calculation using existing calculateTotal()
      const subtotal =
        Math.round(plannedItems.reduce((sum, it) => sum + it.total_price, 0) * 100) / 100;
      const rawDiscount =
        input.discount !== undefined
          ? Number(input.discount)
          : existingJobCard
          ? Number(existingJobCard.discount) || 0
          : 0;
      const discount = Math.min(subtotal, Math.max(0, rawDiscount));
      const rawVatRate =
        input.vat_rate !== undefined
          ? Number(input.vat_rate)
          : existingJobCard && existingJobCard.vat_rate !== null && existingJobCard.vat_rate !== undefined
          ? Number(existingJobCard.vat_rate)
          : 5;
      const vatRate = Math.max(0, Math.min(100, rawVatRate));
      const calc = calculateTotal(subtotal, discount, vatRate);

      const willCreateJobCard =
        input.workflow_type === "customer_vehicle_jobcard_invoice" ||
        input.workflow_type === "create_job_card";
      const willUpdateJobCard = input.workflow_type === "update_job_card";
      const willCreateInvoice =
        input.generate_invoice ??
        (input.workflow_type === "customer_vehicle_jobcard_invoice" ||
          input.workflow_type === "convert_job_card_to_invoice" ||
          input.workflow_type === "create_direct_invoice");

      const proposedActions: string[] = [];
      if (!resolvedCustomerId) {
        proposedActions.push(`Create new Customer: ${effectiveCustomerName}`);
      } else {
        proposedActions.push(`Link existing Customer: ${effectiveCustomerName}`);
      }

      const hasVehicleInfo = Boolean(
        resolvedVehicleId || input.vehicle_make || input.vehicle_model || effectivePlate
      );
      if (hasVehicleInfo) {
        const vehLabel = `${input.vehicle_make || existingJobCard?.vehicle?.make || ""} ${input.vehicle_model || existingJobCard?.vehicle?.model || ""} (${effectivePlate || "No Plate"})`.trim();
        if (!resolvedVehicleId) {
          proposedActions.push(`Register Vehicle: ${vehLabel}`);
        } else {
          proposedActions.push(`Link existing Vehicle: ${vehLabel}`);
        }
      }

      if (willCreateJobCard) {
        proposedActions.push(
          `Create Job Card with ${plannedItems.length} item(s) — Total AED ${calc.total.toFixed(2)}`
        );
      } else if (willUpdateJobCard && existingJobCard) {
        proposedActions.push(
          `Update Job Card #${existingJobCard.job_card_number} (${plannedItems.length} item(s)${
            input.job_card_status ? `, status → ${input.job_card_status}` : ""
          }) — Total AED ${calc.total.toFixed(2)}`
        );
      }

      if (willCreateInvoice) {
        proposedActions.push(
          `${
            existingJobCard && input.workflow_type === "convert_job_card_to_invoice"
              ? `Convert Job Card #${existingJobCard.job_card_number} into VAT Invoice`
              : "Generate VAT Invoice"
          } (${vatRate}% VAT) — Total AED ${calc.total.toFixed(2)}${
            input.open_print_preview ? " & open Print Preview" : ""
          }`
        );
      }

      const confirmation: ActionConfirmationPayload = {
        idempotency_key: crypto.randomUUID(),
        workflow_type: input.workflow_type,
        summary_title:
          willUpdateJobCard && existingJobCard
            ? `Update Job Card #${existingJobCard.job_card_number}`
            : willCreateJobCard && willCreateInvoice
            ? "Customer → Vehicle → Job Card → Invoice Workflow"
            : willCreateJobCard
            ? "Create Workshop Job Card"
            : willCreateInvoice && existingJobCard
            ? `Convert Job Card #${existingJobCard.job_card_number} to Invoice`
            : willCreateInvoice
            ? "Generate Direct Workshop Invoice"
            : hasVehicleInfo
            ? "Register Customer & Vehicle"
            : "Register New Customer",
        customer: {
          existing_id: resolvedCustomerId,
          name: effectiveCustomerName,
          mobile: effectiveCustomerMobile,
          company_name: input.customer_company ?? existingJobCard?.customer?.company_name ?? null,
          trn_number: input.customer_trn ?? existingJobCard?.customer?.trn_number ?? null,
          will_create: !resolvedCustomerId,
          possible_duplicates: possibleDuplicates.length > 0 ? possibleDuplicates : undefined,
        },
        vehicle: hasVehicleInfo
          ? {
              existing_id: resolvedVehicleId,
              make: input.vehicle_make || existingJobCard?.vehicle?.make || "Unknown",
              model: input.vehicle_model || existingJobCard?.vehicle?.model || "Vehicle",
              year: input.vehicle_year ?? existingJobCard?.vehicle?.year ?? null,
              registration_number: effectivePlate,
              chassis_vin: input.vehicle_vin ?? existingJobCard?.vehicle?.chassis_vin ?? null,
              will_create: !resolvedVehicleId,
            }
          : null,
        job_card: willCreateJobCard
          ? {
              existing_id: null,
              status: input.job_card_status || "new",
              customer_complaint:
                input.customer_complaint ||
                plannedItems.map((i) => i.description).join(", ") ||
                "Workshop Service",
              work_details: input.work_details || null,
              assigned_mechanic: input.assigned_mechanic || null,
              notes: input.notes || null,
              will_create: true,
              will_update: false,
            }
          : willUpdateJobCard && existingJobCard
          ? {
              existing_id: existingJobCard.id,
              existing_number: String(existingJobCard.job_card_number),
              status: input.job_card_status || existingJobCard.status || "new",
              customer_complaint:
                input.customer_complaint ?? existingJobCard.customer_complaint ?? null,
              work_details: input.work_details ?? existingJobCard.work_details ?? null,
              assigned_mechanic:
                input.assigned_mechanic ?? existingJobCard.assigned_mechanic ?? null,
              notes: input.notes ?? existingJobCard.notes ?? null,
              will_create: false,
              will_update: true,
            }
          : existingJobCard
          ? {
              existing_id: existingJobCard.id,
              existing_number: String(existingJobCard.job_card_number),
              will_create: false,
              will_update: false,
            }
          : null,
        invoice: willCreateInvoice
          ? {
              will_create: true,
              open_print_preview: Boolean(input.open_print_preview),
              payment_status: "credit",
              notes: input.notes || null,
            }
          : null,
        items: plannedItems,
        financials: {
          subtotal,
          discount,
          discount_type: "fixed",
          taxable_amount: calc.discountedSubtotal,
          vat_rate: vatRate,
          vat_amount: calc.vatAmount,
          grand_total: calc.total,
        },
        proposed_actions: proposedActions,
        warnings: warnings.length > 0 ? warnings : undefined,
      };

      return {
        result: {
          status: "AWAITING_USER_CONFIRMATION",
          message:
            "Confirmation Preview prepared with server-verified totals. Waiting for user to review and click Confirm & Execute.",
          financials: confirmation.financials,
          warnings,
        },
        confirmation,
      };
    }

    default:
      return { result: { error: `Unknown tool: ${toolName}` } };
  }
}

// ─── Confirmed Action Executor (Runs ONLY via /api/ai/execute after Approval) ─
export async function executeConfirmedWorkflow(
  ctx: AuthenticatedAIContext,
  payload: ActionConfirmationPayload
): Promise<ActionExecutionResult> {
  if (!canUserPerformWorkshopWrites(ctx)) {
    throw new Error(`Forbidden: Role "${ctx.role}" is not permitted to create business records.`);
  }

  // 1. Server-Side Idempotency Guard
  const cached = getCachedExecutionResult(ctx.workspaceId, payload.idempotency_key);
  if (cached) {
    return { ...cached, duplicate_prevented: true };
  }

  const { supabase, workspaceId, userId } = ctx;

  // Also check Supabase audit table if migration 037 was applied
  try {
    const { data: existingAudit } = await supabase
      .from("ai_action_audit_logs")
      .select("status, created_records")
      .eq("workspace_id", workspaceId)
      .eq("idempotency_key", payload.idempotency_key)
      .maybeSingle();

    if (existingAudit && existingAudit.status === "completed") {
      const cr = (existingAudit.created_records || {}) as any;
      const docs: DocumentActionRef[] = [];
      if (cr.job_card_id) {
        docs.push({
          type: "job_card",
          id: cr.job_card_id,
          number: cr.job_card_number || "",
          label: `Job Card #${cr.job_card_number || ""}`,
        });
      }
      if (cr.invoice_id) {
        docs.push({
          type: "invoice",
          id: cr.invoice_id,
          number: cr.invoice_number || "",
          label: `Invoice #${cr.invoice_number || ""}`,
          autoPrintPreview: payload.invoice?.open_print_preview,
        });
      }
      return {
        success: true,
        idempotency_key: payload.idempotency_key,
        duplicate_prevented: true,
        steps: [
          {
            id: "idempotent",
            label: "Duplicate execution prevented — returning previously saved records",
            status: "completed",
          },
        ],
        created: cr,
        documents: docs,
      };
    }
  } catch {
    // Table may not exist yet before migration 037 is applied; in-memory guard still protects
  }

  // Re-calculate authoritative financial figures on the server (NEVER trust client/AI totals)
  const items = payload.items || [];
  const subtotal = Math.round(
    items.reduce(
      (sum, it) =>
        sum + Math.round(((Number(it.quantity) || 1) * (Number(it.unit_price) || 0) + (Number(it.labour_charge) || 0)) * 100) / 100,
      0
    ) * 100
  ) / 100;
  const discount = Math.min(subtotal, Math.max(0, Number(payload.financials.discount) || 0));
  const vatRate = Math.max(0, Math.min(100, Number(payload.financials.vat_rate) || 0));
  const calc = calculateTotal(subtotal, discount, vatRate);

  const steps: ExecutionStepStatus[] = [];
  const created: ActionExecutionResult["created"] = {};
  const documents: DocumentActionRef[] = [];
  const now = new Date().toISOString();
  const todayYmd = now.slice(0, 10);

  try {
    // ── STEP 1: Customer ──
    let customerId = payload.customer.existing_id || null;
    if (!customerId) {
      const step: ExecutionStepStatus = {
        id: "customer",
        label: `Saving Customer (${payload.customer.name})`,
        status: "running",
      };
      steps.push(step);

      const newCustId = crypto.randomUUID();
      const { data: custRow, error: custErr } = await supabase
        .from("customers")
        .insert({
          id: newCustId,
          workspace_id: workspaceId,
          name: payload.customer.name.trim(),
          mobile: payload.customer.mobile?.trim() || null,
          company_name: payload.customer.company_name?.trim() || null,
          trn_number: payload.customer.trn_number?.trim() || null,
          is_deleted: false,
          created_at: now,
          updated_at: now,
        })
        .select("id, name")
        .single();

      if (custErr || !custRow) {
        step.status = "failed";
        step.detail = custErr?.message || "Failed to save customer";
        throw new Error(`Customer creation failed: ${step.detail}`);
      }
      customerId = custRow.id;
      created.customer_id = custRow.id;
      created.customer_name = custRow.name;
      step.status = "completed";
      step.detail = `Created customer "${custRow.name}"`;
    } else {
      created.customer_id = customerId;
      created.customer_name = payload.customer.name;
      steps.push({
        id: "customer",
        label: `Linked Existing Customer (${payload.customer.name})`,
        status: "completed",
      });
    }

    // ── STEP 2: Vehicle ──
    let vehicleId = payload.vehicle?.existing_id || null;
    if (payload.vehicle) {
      if (!vehicleId && customerId) {
        const step: ExecutionStepStatus = {
          id: "vehicle",
          label: `Registering Vehicle (${payload.vehicle.make} ${payload.vehicle.model})`,
          status: "running",
        };
        steps.push(step);

        const newVehId = crypto.randomUUID();
        const { data: vehRow, error: vehErr } = await supabase
          .from("vehicles")
          .insert({
            id: newVehId,
            workspace_id: workspaceId,
            customer_id: customerId,
            make: payload.vehicle.make.trim(),
            model: payload.vehicle.model.trim(),
            year: payload.vehicle.year || null,
            registration_number: payload.vehicle.registration_number?.trim() || null,
            chassis_vin: payload.vehicle.chassis_vin?.trim() || null,
            is_deleted: false,
            created_at: now,
            updated_at: now,
          })
          .select("id, make, model, registration_number")
          .single();

        if (vehErr || !vehRow) {
          step.status = "failed";
          step.detail = vehErr?.message || "Failed to register vehicle";
          throw new Error(`Vehicle registration failed: ${step.detail}`);
        }
        vehicleId = vehRow.id;
        created.vehicle_id = vehRow.id;
        created.vehicle_label = `${vehRow.make} ${vehRow.model}${vehRow.registration_number ? ` (${vehRow.registration_number})` : ""}`;
        step.status = "completed";
        step.detail = `Registered ${created.vehicle_label}`;
      } else if (vehicleId) {
        created.vehicle_id = vehicleId;
        created.vehicle_label = `${payload.vehicle.make} ${payload.vehicle.model}`;
        steps.push({
          id: "vehicle",
          label: `Linked Existing Vehicle (${created.vehicle_label})`,
          status: "completed",
        });
      }
    }

    // ── Helper: Next Sequential Number (Starts at 1066) ──
    const getNextNumber = async (): Promise<number> => {
      const [jcNums, invNums] = await Promise.all([
        supabase
          .from("job_cards")
          .select("job_card_number, invoice_number")
          .eq("workspace_id", workspaceId),
        supabase
          .from("invoices")
          .select("invoice_number")
          .eq("workspace_id", workspaceId),
      ]);
      const used = new Set<number>();
      for (const r of jcNums.data || []) {
        const n1 = extractSeq((r as any).job_card_number);
        const n2 = extractSeq((r as any).invoice_number);
        if (n1 !== null) used.add(n1);
        if (n2 !== null) used.add(n2);
      }
      for (const r of invNums.data || []) {
        const n = extractSeq((r as any).invoice_number);
        if (n !== null) used.add(n);
      }
      const seqs = Array.from(used).filter((n) => n >= 1066);
      let candidate = seqs.length > 0 ? Math.max(...seqs) + 1 : 1066;
      while (used.has(candidate)) candidate++;
      return candidate;
    };

    // ── STEP 3: Job Card ──
    let jobCardId = payload.job_card?.existing_id || null;
    let allocatedInvNum: number | null = null;

    if (payload.job_card?.will_create && customerId) {
      const step: ExecutionStepStatus = {
        id: "job_card",
        label: "Creating Workshop Job Card",
        status: "running",
      };
      steps.push(step);

      const nextSeq = await getNextNumber();
      allocatedInvNum = nextSeq;
      const jcNumber = String(nextSeq);
      const newJcId = crypto.randomUUID();

      const { data: jcRow, error: jcErr } = await supabase
        .from("job_cards")
        .insert({
          id: newJcId,
          workspace_id: workspaceId,
          job_card_number: jcNumber,
          invoice_number: nextSeq,
          customer_id: customerId,
          vehicle_id: vehicleId,
          date: todayYmd,
          status: "new",
          payment_status: "No Payment",
          customer_complaint: payload.job_card.customer_complaint || null,
          work_details: payload.job_card.work_details || null,
          assigned_mechanic: payload.job_card.assigned_mechanic || null,
          notes: payload.job_card.notes || null,
          subtotal,
          discount,
          vat_rate: vatRate,
          vat_amount: calc.vatAmount,
          total: calc.total,
          paid: 0,
          balance: calc.total,
          is_deleted: false,
          created_by: userId,
          created_at: now,
          updated_at: now,
        })
        .select("id, job_card_number, invoice_number")
        .single();

      if (jcErr || !jcRow) {
        step.status = "failed";
        step.detail = jcErr?.message || "Failed to insert job card";
        throw new Error(`Job Card creation failed: ${step.detail}`);
      }

      if (items.length > 0) {
        const jcItemsPayload = items.map((it) => {
          const q = Number(it.quantity) || 1;
          const p = Number(it.unit_price) || 0;
          const l = Number(it.labour_charge) || 0;
          return {
            id: crypto.randomUUID(),
            job_card_id: jcRow.id,
            item_type: it.item_type === "part" ? "part" : "service",
            service_id: it.service_id || null,
            part_id: it.part_id || null,
            description: it.description,
            quantity: q,
            unit_price: p,
            labour_charge: l,
            total_price: Math.round((q * p + l) * 100) / 100,
            created_at: now,
          };
        });
        const { error: itemsErr } = await supabase
          .from("job_card_items")
          .insert(jcItemsPayload);
        if (itemsErr) {
          console.warn("Job card items insert notice:", itemsErr.message);
        }
      }

      jobCardId = jcRow.id;
      created.job_card_id = jcRow.id;
      created.job_card_number = String(jcRow.job_card_number);
      documents.push({
        type: "job_card",
        id: jcRow.id,
        number: String(jcRow.job_card_number),
        label: `Job Card #${jcRow.job_card_number}`,
      });
      step.status = "completed";
      step.detail = `Created Job Card #${jcRow.job_card_number}`;
    } else if (payload.job_card?.will_update && jobCardId) {
      const step: ExecutionStepStatus = {
        id: "job_card_update",
        label: `Updating Job Card #${payload.job_card.existing_number || ""}`.trim(),
        status: "running",
      };
      steps.push(step);

      const { data: currentJc, error: fetchJcErr } = await supabase
        .from("job_cards")
        .select("id, job_card_number, paid")
        .eq("id", jobCardId)
        .eq("workspace_id", workspaceId)
        .eq("is_deleted", false)
        .single();

      if (fetchJcErr || !currentJc) {
        step.status = "failed";
        step.detail = fetchJcErr?.message || "Job Card not found in active workspace";
        throw new Error(`Job Card update failed: ${step.detail}`);
      }

      const existingPaid = Number(currentJc.paid) || 0;
      const newBalance = Math.max(0, Math.round((calc.total - existingPaid) * 100) / 100);

      const { error: updErr } = await supabase
        .from("job_cards")
        .update({
          status: payload.job_card.status || undefined,
          customer_complaint: payload.job_card.customer_complaint ?? undefined,
          work_details: payload.job_card.work_details ?? undefined,
          assigned_mechanic: payload.job_card.assigned_mechanic ?? undefined,
          notes: payload.job_card.notes ?? undefined,
          subtotal,
          discount,
          vat_rate: vatRate,
          vat_amount: calc.vatAmount,
          total: calc.total,
          balance: newBalance,
          updated_at: now,
        })
        .eq("id", jobCardId)
        .eq("workspace_id", workspaceId);

      if (updErr) {
        step.status = "failed";
        step.detail = updErr.message;
        throw new Error(`Job Card update failed: ${updErr.message}`);
      }

      if (items.length > 0) {
        await supabase.from("job_card_items").delete().eq("job_card_id", jobCardId);
        const jcItemsPayload = items.map((it) => {
          const q = Number(it.quantity) || 1;
          const p = Number(it.unit_price) || 0;
          const l = Number(it.labour_charge) || 0;
          return {
            id: crypto.randomUUID(),
            job_card_id: jobCardId,
            item_type: it.item_type === "part" ? "part" : "service",
            service_id: it.service_id || null,
            part_id: it.part_id || null,
            description: it.description,
            quantity: q,
            unit_price: p,
            labour_charge: l,
            total_price: Math.round((q * p + l) * 100) / 100,
            created_at: now,
          };
        });
        await supabase.from("job_card_items").insert(jcItemsPayload);
      }

      created.job_card_id = currentJc.id;
      created.job_card_number = String(currentJc.job_card_number);
      documents.push({
        type: "job_card",
        id: currentJc.id,
        number: String(currentJc.job_card_number),
        label: `Job Card #${currentJc.job_card_number}`,
      });
      step.status = "completed";
      step.detail = `Updated Job Card #${currentJc.job_card_number}`;
    }

    // ── STEP 4: Invoice ──
    if (payload.invoice?.will_create && customerId) {
      const step: ExecutionStepStatus = {
        id: "invoice",
        label: "Generating Workshop VAT Invoice",
        status: "running",
      };
      steps.push(step);

      // Prevent duplicate non-void invoices for the same Job Card
      if (jobCardId) {
        const { data: dupInv } = await supabase
          .from("invoices")
          .select("id, invoice_number")
          .eq("workspace_id", workspaceId)
          .eq("job_card_id", jobCardId)
          .neq("payment_status", "void")
          .limit(1)
          .maybeSingle();

        if (dupInv) {
          step.status = "failed";
          step.detail = `Invoice #${dupInv.invoice_number} already exists for this Job Card`;
          throw new Error(
            `Duplicate prevented: Invoice #${dupInv.invoice_number} already exists for this Job Card.`
          );
        }
      }

      const invNum = allocatedInvNum ?? (await getNextNumber());
      const newInvId = crypto.randomUUID();
      const hasServices = items.some((it) => it.item_type !== "part");
      const hasParts = items.some((it) => it.item_type === "part");
      const resolvedInvoiceType = jobCardId
        ? "job_card"
        : hasServices && hasParts
        ? "direct_mixed"
        : hasParts
        ? "direct_parts"
        : "direct_service";

      const { data: invRow, error: invErr } = await supabase
        .from("invoices")
        .insert({
          id: newInvId,
          workspace_id: workspaceId,
          invoice_number: String(invNum),
          job_card_id: jobCardId,
          customer_id: customerId,
          vehicle_id: vehicleId,
          subtotal,
          discount,
          vat_rate: vatRate,
          vat_amount: calc.vatAmount,
          total: calc.total,
          paid: 0,
          balance: calc.total,
          payment_status: "credit",
          invoice_type: resolvedInvoiceType,
          notes: payload.invoice.notes || null,
          created_by: userId,
          created_at: now,
          updated_at: now,
        })
        .select("id, invoice_number")
        .single();

      if (invErr || !invRow) {
        step.status = "failed";
        step.detail = invErr?.message || "Failed to insert invoice";
        throw new Error(`Invoice generation failed: ${step.detail}`);
      }

      if (items.length > 0) {
        const invItemsPayload = items.map((it) => {
          const q = Number(it.quantity) || 1;
          const p = Number(it.unit_price) || 0;
          const l = Number(it.labour_charge) || 0;
          return {
            id: crypto.randomUUID(),
            invoice_id: invRow.id,
            item_type: it.item_type === "part" ? "part" : "service",
            description: it.description,
            quantity: q,
            unit_price: p,
            total_price: Math.round((q * p + l) * 100) / 100,
            created_at: now,
          };
        });
        const { error: invItemsErr } = await supabase
          .from("invoice_items")
          .insert(invItemsPayload);
        if (invItemsErr) {
          console.warn("Invoice items insert notice:", invItemsErr.message);
        }
      }

      created.invoice_id = invRow.id;
      created.invoice_number = String(invRow.invoice_number);
      documents.push({
        type: "invoice",
        id: invRow.id,
        number: String(invRow.invoice_number),
        label: `Invoice #${invRow.invoice_number}`,
        autoPrintPreview: Boolean(payload.invoice.open_print_preview),
      });
      step.status = "completed";
      step.detail = `Generated Invoice #${invRow.invoice_number}`;
    }

    const result: ActionExecutionResult = {
      success: true,
      idempotency_key: payload.idempotency_key,
      steps,
      created,
      documents,
    };

    setCachedExecutionResult(workspaceId, payload.idempotency_key, result);

    // Best-effort audit insert (if migration 037 has been applied)
    try {
      await supabase.from("ai_action_audit_logs").insert({
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        user_id: userId,
        idempotency_key: payload.idempotency_key,
        action_type: payload.workflow_type,
        status: "completed",
        input_summary: {
          customer_name: payload.customer.name,
          total_aed: calc.total,
          vat_rate: vatRate,
          discount,
        },
        created_records: created,
        created_at: now,
      });
    } catch {
      // Non-fatal if audit table hasn't been migrated yet
    }

    return result;
  } catch (err: any) {
    return {
      success: false,
      idempotency_key: payload.idempotency_key,
      steps,
      created,
      documents,
      error: err?.message || "Workflow execution failed.",
    };
  }
}
