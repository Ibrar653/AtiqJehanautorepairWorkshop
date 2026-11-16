import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number as AED currency
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AE', {
    style: 'currency',
    currency: 'AED',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format a number with 2 decimals without currency prefix (e.g. 150.00 or 2,350.00)
 */
export function formatAmount(amount: number): string {
  const n = Number(amount) || 0;
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Format a date string to a readable format (e.g. 30 Aug 2026)
 */
export function formatDate(dateString: string | Date | null | undefined): string {
  if (!dateString) return "—";
  try {
    const d = typeof dateString === "string" ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat('en-AE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d);
  } catch {
    return "—";
  }
}

/**
 * Format a date string with time (e.g. 30 Aug 2026, 04:30 PM)
 */
export function formatDateTime(dateString: string | Date | null | undefined): string {
  if (!dateString) return "—";
  try {
    const d = typeof dateString === "string" ? new Date(dateString) : dateString;
    if (isNaN(d.getTime())) return "—";
    return new Intl.DateTimeFormat('en-AE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d);
  } catch {
    return "—";
  }
}

/**
 * Calculate VAT amount from subtotal
 */
export function calculateVAT(subtotal: number, vatRate: number): number {
  return Math.round((subtotal * vatRate) / 100 * 100) / 100;
}

/**
 * Calculate total with VAT
 */
export function calculateTotal(subtotal: number, discount: number, vatRate: number): {
  discountedSubtotal: number;
  vatAmount: number;
  total: number;
} {
  const discountedSubtotal = subtotal - discount;
  const vatAmount = calculateVAT(discountedSubtotal, vatRate);
  const total = discountedSubtotal + vatAmount;
  return {
    discountedSubtotal: Math.round(discountedSubtotal * 100) / 100,
    vatAmount: Math.round(vatAmount * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Get initials from a name
 */
export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Generate a standard RFC4122 v4 UUID
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export interface ResolvedDocumentFinancials {
  subtotal: number;
  discount: number;
  discountAmbiguous: boolean;
  discountLabel: string;
  taxableAmount: number;
  vatRate: number | null;
  vatRateAmbiguous: boolean;
  vatLabel: string;
  vatAmount: number;
  total: number;
  paid: number;
  balance: number;
}

/**
 * Resolves persisted financial figures for Job Cards & Invoices without
 * silently inventing VAT rates or altering historical totals.
 */
export function resolveDocumentFinancials(
  record: {
    subtotal?: number | null;
    discount?: number | null;
    discount_amount?: number | null;
    discount_type?: string | null;
    discount_percentage?: number | null;
    vat_rate?: number | null;
    vat_amount?: number | null;
    total?: number | null;
    paid?: number | null;
    balance?: number | null;
    payments?: Array<{ amount?: number | null }> | null;
  },
  calculatedSubtotal: number
): ResolvedDocumentFinancials {
  const hasSavedSubtotal =
    record.subtotal !== undefined &&
    record.subtotal !== null &&
    !isNaN(Number(record.subtotal));
  const subtotal = hasSavedSubtotal ? Number(record.subtotal) : calculatedSubtotal;

  const hasSavedTotal =
    record.total !== undefined &&
    record.total !== null &&
    !isNaN(Number(record.total));
  const savedTotal = hasSavedTotal ? Number(record.total) : null;

  const hasSavedVatAmount =
    record.vat_amount !== undefined &&
    record.vat_amount !== null &&
    !isNaN(Number(record.vat_amount));
  const savedVatAmount = hasSavedVatAmount ? Number(record.vat_amount) : null;

  const rawDiscount = record.discount ?? record.discount_amount;
  const hasSavedDiscount =
    rawDiscount !== undefined &&
    rawDiscount !== null &&
    !isNaN(Number(rawDiscount));

  let discount = 0;
  let discountAmbiguous = false;
  if (hasSavedDiscount) {
    discount = Math.max(0, Number(rawDiscount));
  } else {
    const expectedWithoutDiscount = subtotal + (savedVatAmount ?? 0);
    if (savedTotal !== null && Math.abs(savedTotal - expectedWithoutDiscount) < 0.05) {
      discount = 0;
    } else if (savedTotal !== null && savedTotal < subtotal) {
      discount = 0;
      discountAmbiguous = true;
    } else {
      discount = 0;
      discountAmbiguous = savedTotal === null && subtotal > 0;
    }
  }

  let discountLabel = "Discount:";
  if (
    record.discount_type === "percentage" &&
    record.discount_percentage !== undefined &&
    record.discount_percentage !== null &&
    !isNaN(Number(record.discount_percentage))
  ) {
    discountLabel = `Discount (${Number(record.discount_percentage)}%):`;
  } else if (discountAmbiguous) {
    discountLabel = "Discount (Review):";
  }

  const taxableAmount = Math.max(0, subtotal - discount);

  const hasSavedVatRate =
    record.vat_rate !== undefined &&
    record.vat_rate !== null &&
    !isNaN(Number(record.vat_rate));

  let vatRate: number | null = null;
  let vatRateAmbiguous = false;

  if (hasSavedVatRate) {
    vatRate = Number(record.vat_rate);
  } else if (savedVatAmount === 0) {
    vatRate = 0;
  } else if (savedTotal !== null && Math.abs(savedTotal - taxableAmount) < 0.05) {
    vatRate = 0;
  } else if (savedVatAmount !== null && savedVatAmount > 0 && taxableAmount > 0) {
    const derivedRate = Math.round((savedVatAmount / taxableAmount) * 10000) / 100;
    const checkAmt = Math.round(taxableAmount * (derivedRate / 100) * 100) / 100;
    if (Math.abs(checkAmt - savedVatAmount) < 0.05) {
      vatRate = derivedRate;
    } else {
      vatRate = null;
      vatRateAmbiguous = true;
    }
  } else {
    vatRate = null;
    vatRateAmbiguous = true;
  }

  const vatAmount =
    vatRate === 0
      ? 0
      : savedVatAmount !== null
      ? savedVatAmount
      : vatRate !== null
      ? Math.round(taxableAmount * (vatRate / 100) * 100) / 100
      : 0;

  const vatLabel =
    vatRate !== null
      ? `VAT (${vatRate}%):`
      : vatRateAmbiguous
      ? "VAT (Review):"
      : "VAT:";

  const total =
    savedTotal !== null
      ? savedTotal
      : Math.round((taxableAmount + vatAmount) * 100) / 100;

  const paid =
    record.payments && Array.isArray(record.payments) && record.payments.length > 0
      ? record.payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
      : Number(record.paid) || 0;

  const balance =
    record.balance !== undefined && record.balance !== null && !isNaN(Number(record.balance))
      ? Math.max(0, Number(record.balance))
      : Math.max(0, total - paid);

  return {
    subtotal,
    discount,
    discountAmbiguous,
    discountLabel,
    taxableAmount,
    vatRate,
    vatRateAmbiguous,
    vatLabel,
    vatAmount,
    total,
    paid,
    balance,
  };
}

