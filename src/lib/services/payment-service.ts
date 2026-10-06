import { createClient } from "@/lib/supabase/client";
import { generateUUID } from "@/lib/utils";
import { getActiveWorkspaceId } from "./workspace-service";
import type { Payment, PaymentInsert } from "@/types/database";

const LOCAL_PAYMENTS_KEY = "atiq_local_payments";

let inMemoryPayments: any[] = [];

export function getLocalPayments(): any[] {
  if (typeof window === "undefined") return inMemoryPayments;
  try {
    const raw = localStorage.getItem(LOCAL_PAYMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
    return inMemoryPayments;
  } catch {
    return inMemoryPayments;
  }
}

export function saveLocalPayments(payments: any[]) {
  inMemoryPayments = payments;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_PAYMENTS_KEY, JSON.stringify(payments));
  } catch (e) {
    console.error("Failed to save local payments", e);
  }
}

export async function getPayments(page = 1, limit = 25, workspaceId?: string): Promise<{ payments: any[]; total: number }> {
  const targetWsId = workspaceId || await getActiveWorkspaceId();
  const supabase = createClient();
  const offset = (page - 1) * limit;

  const { data, count, error } = await supabase
    .from("payments")
    .select(
      "id, invoice_id, job_card_id, customer_id, amount, payment_method, reference_number, notes, payment_date, created_at, customer:customers(name, mobile), invoice:invoices(invoice_number), job_card:job_cards(job_card_number, invoice_number)",
      { count: "exact" }
    )
    .eq("workspace_id", targetWsId)
    .order("payment_date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Failed to fetch payments from Supabase:", error);
    throw new Error(`Failed to fetch payments: ${error.message}`);
  }

  return { payments: data || [], total: count || 0 };
}

export interface PaymentDbRow {
  id: string;
  workspace_id: string;
  invoice_id: string | null;
  job_card_id: string | null;
  customer_id: string;
  amount: number;
  payment_method: string;
  reference_number: string | null;
  notes: string | null;
  payment_date: string;
  created_by: string | null;
  is_deleted: boolean;
  deleted_at: string | null;
  deleted_by: string | null;
  created_at: string;
}

export function buildPaymentDbInsertPayload(
  payload: any,
  meta: { id: string; workspaceId: string }
): PaymentDbRow {
  const now = new Date().toISOString();
  return {
    id: meta.id,
    workspace_id: meta.workspaceId,
    invoice_id: payload.invoice_id && payload.invoice_id.length === 36 ? payload.invoice_id : null,
    job_card_id: payload.job_card_id && payload.job_card_id.length === 36 ? payload.job_card_id : null,
    customer_id: payload.customer_id,
    amount: Number(payload.amount) || 0,
    payment_method: payload.payment_method || "cash",
    reference_number: payload.reference_number != null ? String(payload.reference_number).trim() || null : null,
    notes: payload.notes != null ? String(payload.notes).trim() || null : null,
    payment_date: payload.payment_date || payload.date || now.slice(0, 10),
    created_by: payload.created_by || "Owner",
    is_deleted: false,
    deleted_at: null,
    deleted_by: null,
    created_at: payload.created_at || now,
  };
}

export async function recordPayment(payload: PaymentInsert) {
  const supabase = createClient();
  const targetWsId = payload.workspace_id || await getActiveWorkspaceId();

  if (Number(payload.amount) <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }
  const payloadId = (payload as any).id;
  const paymentId = payloadId && payloadId.length === 36 ? payloadId : generateUUID();

  const paymentInsertData = buildPaymentDbInsertPayload(payload, {
    id: paymentId,
    workspaceId: targetWsId,
  });

  const { data: created, error } = await supabase
    .from("payments")
    .insert(paymentInsertData)
    .select()
    .single();

  if (error) {
    console.error("Failed to record payment in Supabase:", error);
    throw new Error(`Failed to record payment: ${error.message}`);
  }

  // Sync to Accounts / Ledger
  try {
    const { postCustomerPaymentLedger } = await import("./ledger-service");
    await postCustomerPaymentLedger({
      id: created.id,
      customer_id: created.customer_id,
      invoice_id: created.invoice_id || undefined,
      job_card_id: created.job_card_id || undefined,
      amount: Number(created.amount),
      payment_method: created.payment_method,
      reference_number: created.reference_number || undefined,
      payment_date: created.payment_date,
      created_by: created.created_by,
    });
  } catch (e) {
    console.warn("Ledger post for customer payment notice:", e);
  }

  return created;
}

export async function getPaymentsByInvoice(invoiceId: string, workspaceId?: string) {
  const targetWsId = workspaceId || undefined;
  const supabase = createClient();
  let query = supabase
    .from("payments")
    .select("id, invoice_id, job_card_id, customer_id, amount, payment_method, reference_number, payment_date, notes, created_at")
    .eq("invoice_id", invoiceId);

  if (targetWsId) {
    query = query.eq("workspace_id", targetWsId);
  }

  const { data, error } = await query.order("payment_date", { ascending: false });

  if (error) {
    console.error(`Failed to fetch payments for invoice ${invoiceId}:`, error);
    throw new Error(`Failed to fetch payments for invoice: ${error.message}`);
  }
  return data || [];
}

export async function getPaymentsByJobCard(jobCardId: string, workspaceId?: string) {
  const targetWsId = workspaceId || undefined;
  const supabase = createClient();
  let query = supabase
    .from("payments")
    .select("id, invoice_id, job_card_id, customer_id, amount, payment_method, reference_number, payment_date, notes, created_at")
    .eq("job_card_id", jobCardId);

  if (targetWsId) {
    query = query.eq("workspace_id", targetWsId);
  }

  const { data, error } = await query.order("payment_date", { ascending: false });

  if (error) {
    console.error(`Failed to fetch payments for job card ${jobCardId}:`, error);
    throw new Error(`Failed to fetch payments for job card: ${error.message}`);
  }
  return data || [];
}

/**
 * Record a payment against a Job Card (Advance / Partial Payment / Settlement)
 * - Automatically computes Total Paid, Balance Due, and Payment Status
 * - Synchronizes Job Card and any linked Invoice
 */
export async function recordJobCardPayment(
  jobCardId: string,
  amount: number,
  paymentMethod: string = "cash",
  referenceNumber?: string | null,
  notes?: string | null,
  paymentDate?: string,
  createdBy?: string | null
): Promise<any> {
  const supabase = createClient();
  const now = new Date().toISOString();
  const cleanAmount = Number(amount);

  if (isNaN(cleanAmount) || cleanAmount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const { getJobCardById, getLocalJobCards, saveLocalJobCards } = await import("./job-card-service");
  const jobCard = await getJobCardById(jobCardId);
  if (!jobCard) {
    throw new Error(`Job Card #${jobCardId} not found.`);
  }

  const totalAmount = Number(jobCard.total) || 0;
  const existingPayments = await getPaymentsByJobCard(jobCardId, jobCard.workspace_id);
  const currentPaid = existingPayments.reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
  const newPaid = currentPaid + cleanAmount;
  const newBalance = Math.max(0, totalAmount - newPaid);

  let newStatus = "Pending";
  if (newBalance === 0 && totalAmount > 0) {
    newStatus = "Paid Full";
  } else if (newPaid > 0) {
    newStatus = "Partial";
  }

  const paymentPayload: PaymentInsert = {
    workspace_id: jobCard.workspace_id,
    job_card_id: jobCardId,
    invoice_id: (jobCard as any).invoice_id || null,
    customer_id: jobCard.customer_id,
    amount: cleanAmount,
    payment_method: paymentMethod as any,
    reference_number: referenceNumber || null,
    payment_date: paymentDate || now.slice(0, 10),
    notes: notes || `Advance / Payment for Job Card #${jobCard.job_card_number || jobCardId}`,
    created_by: createdBy || "Owner",
  };

  const createdPayment = await recordPayment(paymentPayload);

  // Update Job Card in Supabase
  const { error: jcErr } = await supabase
    .from("job_cards")
    .update({
      paid: newPaid,
      balance: newBalance,
      payment_status: newStatus,
      updated_at: now,
    })
    .eq("id", jobCardId);

  if (jcErr) {
    console.error("Failed to update job card payment status:", jcErr);
  }

  // If there's a linked invoice, also synchronize it
  const { getInvoiceByJobCardId } = await import("./invoice-service");
  const linkedInvoice = await getInvoiceByJobCardId(jobCardId, jobCard.workspace_id);
  if (linkedInvoice) {
    const invTotal = Number(linkedInvoice.total) || totalAmount;
    const invBalance = Math.max(0, invTotal - newPaid);
    const invStatus = invBalance === 0 ? "paid" : newPaid > 0 ? "partially_paid" : "credit";

    const { error: invErr } = await supabase
      .from("invoices")
      .update({
        paid: newPaid,
        balance: invBalance,
        payment_status: invStatus,
        updated_at: now,
      })
      .eq("id", linkedInvoice.id);

    if (invErr) {
      console.error("Failed to update linked invoice payment status:", invErr);
    }
  }

  try {
    const { invalidateDashboardCache } = await import("./dashboard-service");
    invalidateDashboardCache();
  } catch {}

  return {
    payment: createdPayment,
    paid: newPaid,
    balance: newBalance,
    payment_status: newStatus,
  };
}
