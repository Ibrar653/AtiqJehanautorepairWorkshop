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
        amount: Number(localPayment.amount),
        payment_method: localPayment.payment_method,
        reference_number: localPayment.reference_number || undefined,
        created_by: localPayment.created_by,
      });
    } catch (e) {
      console.warn("Ledger post for customer payment fallback notice:", e);
    }

    return localPayment;
  }
}

export async function getPaymentsByInvoice(invoiceId: string) {
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("payments")
        .select("id, amount, payment_method, reference_number, payment_date, notes, created_at")
        .eq("invoice_id", invoiceId)
        .order("payment_date", { ascending: false });

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
