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
