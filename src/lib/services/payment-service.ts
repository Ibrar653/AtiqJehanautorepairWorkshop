import { createClient } from "@/lib/supabase/client";
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

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Payment query timed out")), timeoutMs)
    ),
  ]);
}

export async function getPayments(page = 1, limit = 25): Promise<{ payments: any[]; total: number }> {
  const supabase = createClient();
  const offset = (page - 1) * limit;

  try {
    const fetchWithTimeout = async () => {
      const { data, count, error } = await supabase
        .from("payments")
        .select(
          "id, invoice_id, job_card_id, customer_id, amount, payment_method, reference_number, notes, payment_date, created_at, customer:customers(name, mobile), invoice:invoices(invoice_number), job_card:job_cards(job_card_number, invoice_number)",
          { count: "exact" }
        )
        .order("payment_date", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { payments: data || [], total: count || 0 };
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn("Using local payments fallback store:", err.message || err);
    const list = getLocalPayments();
    const total = list.length;
    const paginated = list.slice(offset, offset + limit);
    return { payments: paginated, total };
  }
}

export async function recordPayment(payload: PaymentInsert) {
  const supabase = createClient();
  const now = new Date().toISOString();

  if (payload.amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  const paymentId = "pay-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6);

  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("payments")
        .insert({
          ...payload,
          id: paymentId,
          created_at: now,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    };

    const created = await withTimeout(fetchWithTimeout(), 2000);
    const list = getLocalPayments();
    list.unshift(created);
    saveLocalPayments(list);

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
  } catch (err: any) {
    console.warn("Recording payment to local fallback store:", err.message || err);
    const localPayment = {
      id: paymentId,
      ...payload,
      created_at: now,
    };
    const list = getLocalPayments();
    list.unshift(localPayment);
    saveLocalPayments(list);

    // Sync to Accounts / Ledger
    try {
      const { postCustomerPaymentLedger } = await import("./ledger-service");
      await postCustomerPaymentLedger({
        id: localPayment.id,
        customer_id: localPayment.customer_id,
        invoice_id: localPayment.invoice_id || undefined,
        job_card_id: localPayment.job_card_id || undefined,
        amount: Number(localPayment.amount),
        payment_method: localPayment.payment_method,
        reference_number: localPayment.reference_number || undefined,
        payment_date: localPayment.payment_date,
        created_by: localPayment.created_by,
      });
    } catch (e) {
      console.warn("Ledger post for customer payment fallback notice:", e);
    }

    return localPayment;
  }
}

export async function getPaymentsByInvoice(invoiceId: string, workspaceId?: string) {
  const targetWsId = workspaceId || undefined;
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      let query = supabase
        .from("payments")
        .select("id, invoice_id, job_card_id, customer_id, amount, payment_method, reference_number, payment_date, notes, created_at")
        .eq("invoice_id", invoiceId);

      if (targetWsId) {
        query = query.eq("workspace_id", targetWsId);
      }

      const { data, error } = await query.order("payment_date", { ascending: false });

      if (error) throw error;
      return data || [];
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn(`Reading payments for invoice ${invoiceId} from local fallback:`, err.message || err);
    const list = getLocalPayments();
    return list.filter((p) => p.invoice_id === invoiceId);
  }
}

export async function getPaymentsByJobCard(jobCardId: string, workspaceId?: string) {
  const targetWsId = workspaceId || undefined;
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      let query = supabase
        .from("payments")
        .select("id, invoice_id, job_card_id, customer_id, amount, payment_method, reference_number, payment_date, notes, created_at")
        .eq("job_card_id", jobCardId);

      if (targetWsId) {
        query = query.eq("workspace_id", targetWsId);
      }

      const { data, error } = await query.order("payment_date", { ascending: false });

      if (error) throw error;
      return data || [];
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn(`Reading payments for job card ${jobCardId} from local fallback:`, err.message || err);
    const list = getLocalPayments();
    return list.filter((p) => p.job_card_id === jobCardId);
  }
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
  const currentPaid = existingPayments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
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

  // Update Job Card in Supabase & local cache
  try {
    await supabase
      .from("job_cards")
      .update({
        paid: newPaid,
        balance: newBalance,
        payment_status: newStatus,
        updated_at: now,
      })
      .eq("id", jobCardId);
  } catch (e) {
    console.warn("Updating job card payment status in Supabase note:", e);
  }

  const localCards = getLocalJobCards(jobCard.workspace_id);
  const cardIndex = localCards.findIndex((c: any) => c.id === jobCardId);
  if (cardIndex !== -1) {
    localCards[cardIndex] = {
      ...localCards[cardIndex],
      paid: newPaid,
      balance: newBalance,
      payment_status: newStatus,
      updated_at: now,
    };
    saveLocalJobCards(localCards, jobCard.workspace_id);
  }

  // If there's a linked invoice, also synchronize it
  const { getInvoiceByJobCardId, getLocalInvoices, saveLocalInvoices } = await import("./invoice-service");
  const linkedInvoice = await getInvoiceByJobCardId(jobCardId, jobCard.workspace_id);
  if (linkedInvoice) {
    const invTotal = Number(linkedInvoice.total) || totalAmount;
    const invBalance = Math.max(0, invTotal - newPaid);
    const invStatus = invBalance === 0 ? "paid" : newPaid > 0 ? "partially_paid" : "credit";

    try {
      await supabase
        .from("invoices")
        .update({
          paid: newPaid,
          balance: invBalance,
          payment_status: invStatus,
          updated_at: now,
        })
        .eq("id", linkedInvoice.id);
    } catch {}

    const localInvs = getLocalInvoices(jobCard.workspace_id);
    const invIdx = localInvs.findIndex((i: any) => i.id === linkedInvoice.id);
    if (invIdx !== -1) {
      localInvs[invIdx] = {
        ...localInvs[invIdx],
        paid: newPaid,
        balance: invBalance,
        payment_status: invStatus,
        updated_at: now,
      };
      saveLocalInvoices(localInvs, jobCard.workspace_id);
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
