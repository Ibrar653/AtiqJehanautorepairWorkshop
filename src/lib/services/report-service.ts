import { createClient } from "@/lib/supabase/client";
import {
  getLedgerAccounts,
  getLocalAccounts,
  getLocalEntries,
  getLocalLedgerTransactions,
  getLocalWorkers,
  getLocalBankAccounts,
  getTransferHistory,
  TransferHistoryItem,
  CashFlowType,
} from "./ledger-service";
import { getLocalCustomers } from "./customer-service";
import { getLocalSuppliers } from "./supplier-service";
import { getActiveWorkspaceId } from "./workspace-service";
import { LedgerAccount, LedgerTransaction, LedgerEntry } from "@/types/database";

// ─── Interfaces: Daily Transaction Report ───────────────────────────────────

export interface DailyReportFilterOptions {
  datePreset?: "today" | "yesterday" | "this_week" | "this_month" | "custom";
  startDate?: string;
  endDate?: string;
  accountId?: string;
  accountType?: string;
  referenceType?: string;
  paymentMethod?: string;
  searchQuery?: string;
  page?: number;
  limit?: number;
}

export interface DailyReportRow {
  entryId: string;
  transactionId: string;
  transactionNumber: string;
  transactionDate: string;
  referenceType: string;
  referenceId: string | null;
  description: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountSubType: string;
  debit: number;
  credit: number;
  paymentMethod: string;
  createdBy: string;
  rawEntry?: any;
  rawTransaction?: any;
}

export interface DailyReportSummary {
  totalDebit: number;
  totalCredit: number;
  cashIn: number;
  cashOut: number;
  bankIn: number;
  bankOut: number;
  totalTransactions: number;
  totalEntries: number;
  isBalanced: boolean;
  imbalanceDiff: number;
}

export interface DailyTransactionReportData {
  rows: DailyReportRow[];
  totalRows: number;
  page: number;
  limit: number;
  summary: DailyReportSummary;
  dateRange: { startDate: string; endDate: string };
}

// ─── Interfaces: Balance Summary Report ─────────────────────────────────────

export interface BalanceSummaryAccountRow {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  accountSubType: string;
  openingBalance: number;
  totalDebit: number;
  totalCredit: number;
  closingBalance: number;
  rawAccount?: any;
}

export interface BalanceSummaryGroup {
  type: "asset" | "liability" | "income" | "expense" | "equity";
  title: string;
  accounts: BalanceSummaryAccountRow[];
  totalClosingBalance: number;
}

export interface BalanceSummaryReportData {
  asOfDate: string;
  groups: {
    asset: BalanceSummaryGroup;
    liability: BalanceSummaryGroup;
    income: BalanceSummaryGroup;
    expense: BalanceSummaryGroup;
    equity: BalanceSummaryGroup;
  };
  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
    totalEquity: number;
    totalLiabilitiesAndEquity: number;
    isBalanced: boolean;
    imbalanceDiff: number;
  };
  entitySummaries: {
    customers: {
      totalReceivable: number;
      customersWithBalanceCount: number;
    };
    suppliers: {
      totalPayable: number;
      suppliersWithBalanceCount: number;
    };
    workers: {
      totalPayable: number;
      workersWithBalanceCount: number;
    };
    bank: {
      totalBankBalance: number;
    };
    cash: {
      currentCashBalance: number;
    };
  };
}

// ─── Date Range Utilities ───────────────────────────────────────────────────

export function resolveDateRange(preset: string, customStart?: string, customEnd?: string): { startDate: string; endDate: string } {
  const now = new Date();
  const format = (d: Date) => d.toISOString().slice(0, 10);

  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const yStr = format(y);
    return { startDate: yStr, endDate: yStr };
  }

  if (preset === "this_week") {
    const curr = new Date(now);
    const day = curr.getDay();
    const diff = curr.getDate() - day + (day === 0 ? -6 : 1); // Monday start
    const monday = new Date(curr.setDate(diff));
    return { startDate: format(monday), endDate: format(now) };
  }

  if (preset === "this_month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { startDate: format(firstDay), endDate: format(now) };
  }

  if (preset === "last_month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: format(firstDay), endDate: format(lastDay) };
  }

  if (preset === "custom" && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }

  // Default: Today
  const todayStr = format(now);
  return { startDate: customStart || todayStr, endDate: customEnd || todayStr };
}

// ─── Daily Transaction Report Engine ────────────────────────────────────────

export async function getDailyTransactionReport(
  options: DailyReportFilterOptions = {},
  workspaceId?: string
): Promise<DailyTransactionReportData> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const {
    datePreset = "this_month",
    startDate: propStart,
    endDate: propEnd,
    accountId = "all",
    accountType = "all",
    referenceType = "all",
    paymentMethod = "all",
    searchQuery = "",
    page = 1,
    limit = 50,
  } = options;

  const { startDate, endDate } = resolveDateRange(datePreset, propStart, propEnd);

  // Load all accounts, transactions, and entries for this workspace
  const accounts = await getLedgerAccounts(targetWsId);
  const accountMap = new Map<string, LedgerAccount>();
  accounts.forEach((a) => accountMap.set(a.id, a));

  let txns: LedgerTransaction[] = [];
  let entries: LedgerEntry[] = [];

  try {
    const supabase = createClient();
    const { data: txnData, error: tErr } = await supabase
      .from("ledger_transactions")
      .select("*, entries:ledger_entries(*)")
      .eq("workspace_id", targetWsId)
      .gte("transaction_date", startDate)
      .lte("transaction_date", endDate)
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (tErr) throw tErr;

    if (txnData && txnData.length > 0) {
      txns = txnData;
      entries = txnData.flatMap((t: any) => t.entries || []);
    } else {
      txns = getLocalLedgerTransactions(targetWsId);
      const validTxnIds = new Set(txns.map((t) => t.id));
      entries = getLocalEntries().filter((e) => validTxnIds.has(e.transaction_id));
    }
  } catch {
    txns = getLocalLedgerTransactions(targetWsId);
    const validTxnIds = new Set(txns.map((t) => t.id));
    entries = getLocalEntries().filter((e) => validTxnIds.has(e.transaction_id));
  }

  // Filter transactions by date range
  const dateTxns = txns.filter(
    (t) => t.transaction_date >= startDate && t.transaction_date <= endDate
  );
  const txnIdSet = new Set(dateTxns.map((t) => t.id));
  const txnMap = new Map<string, LedgerTransaction>();
  dateTxns.forEach((t) => txnMap.set(t.id, t));

  // Build entry rows with account details & transaction payment method resolution
  const allRows: DailyReportRow[] = [];

  // Pre-determine payment method per transaction
  const txnPaymentMethodMap = new Map<string, string>();
  for (const t of dateTxns) {
    const relatedEntries = entries.filter((e) => e.transaction_id === t.id);
    let method = "other";
    for (const e of relatedEntries) {
      const acc = accountMap.get(e.account_id);
      if (acc) {
        if (acc.account_sub_type === "Cash" || acc.account_code === "1001") {
          method = "cash";
          break;
        }
        if (acc.account_sub_type === "Bank" || acc.account_code === "1002") {
          method = "bank";
          break;
        }
      }
    }
    txnPaymentMethodMap.set(t.id, method);
  }

  // Build rows
  for (const e of entries) {
    if (!txnIdSet.has(e.transaction_id)) continue;
    const t = txnMap.get(e.transaction_id)!;
    const acc = accountMap.get(e.account_id);

    const accountCode = acc ? acc.account_code : "—";
    const accountName = acc ? acc.account_name : "Unknown Account";
    const accType = acc ? acc.account_type : "other";
    const accSubType = acc ? acc.account_sub_type : "—";
    const rowMethod = txnPaymentMethodMap.get(t.id) || "other";

    allRows.push({
      entryId: e.id,
      transactionId: t.id,
      transactionNumber: t.transaction_number,
      transactionDate: t.transaction_date,
      referenceType: t.reference_type,
      referenceId: t.reference_id,
      description: t.description
        ? e.notes && e.notes !== t.description
          ? `${t.description} (${e.notes})`
          : t.description
        : e.notes || "General Journal Entry",
      accountCode,
      accountName,
      accountType: accType,
      accountSubType: accSubType,
      debit: Number(e.debit) || 0,
      credit: Number(e.credit) || 0,
      paymentMethod: rowMethod,
      createdBy: t.created_by || "System",
      rawEntry: e,
      rawTransaction: t,
    });
  }

  // Sort rows chronologically descending
  allRows.sort((a, b) => {
    if (a.transactionDate !== b.transactionDate) {
      return b.transactionDate.localeCompare(a.transactionDate);
    }
    return b.transactionNumber.localeCompare(a.transactionNumber);
  });

  // Calculate Summary metrics across ALL filtered date transactions (before pagination)
  let totalDebit = 0;
  let totalCredit = 0;
  let cashIn = 0;
  let cashOut = 0;
  let bankIn = 0;
  let bankOut = 0;
  const uniqueTxnIds = new Set<string>();

  for (const r of allRows) {
    totalDebit += r.debit;
    totalCredit += r.credit;
    uniqueTxnIds.add(r.transactionId);

    if (r.accountCode === "1001" || r.accountSubType === "Cash") {
      cashIn += r.debit;
      cashOut += r.credit;
    } else if (r.accountCode === "1002" || r.accountSubType === "Bank") {
      bankIn += r.debit;
      bankOut += r.credit;
    }
  }

  totalDebit = Math.round(totalDebit * 100) / 100;
  totalCredit = Math.round(totalCredit * 100) / 100;
  cashIn = Math.round(cashIn * 100) / 100;
  cashOut = Math.round(cashOut * 100) / 100;
  bankIn = Math.round(bankIn * 100) / 100;
  bankOut = Math.round(bankOut * 100) / 100;

  const imbalanceDiff = Math.round(Math.abs(totalDebit - totalCredit) * 100) / 100;
  const isBalanced = imbalanceDiff === 0;

  // Filter rows by User Selection
  let filteredRows = allRows;

  if (accountId && accountId !== "all") {
    filteredRows = filteredRows.filter((r) => r.rawEntry?.account_id === accountId);
  }

  if (accountType && accountType !== "all") {
    filteredRows = filteredRows.filter((r) => r.accountType === accountType);
  }

  if (referenceType && referenceType !== "all") {
    filteredRows = filteredRows.filter((r) => r.referenceType === referenceType);
  }

  if (paymentMethod && paymentMethod !== "all") {
    filteredRows = filteredRows.filter((r) => r.paymentMethod === paymentMethod);
  }

  if (searchQuery && searchQuery.trim().length > 0) {
    const q = searchQuery.trim().toLowerCase();
    filteredRows = filteredRows.filter(
      (r) =>
        r.transactionNumber.toLowerCase().includes(q) ||
        (r.referenceId && r.referenceId.toLowerCase().includes(q)) ||
        r.description.toLowerCase().includes(q) ||
        r.accountName.toLowerCase().includes(q) ||
        r.accountCode.toLowerCase().includes(q)
    );
  }

  // Pagination
  const totalRows = filteredRows.length;
  const startIndex = (page - 1) * limit;
  const paginatedRows = filteredRows.slice(startIndex, startIndex + limit);

  return {
    rows: paginatedRows,
    totalRows,
    page,
    limit,
    summary: {
      totalDebit,
      totalCredit,
      cashIn,
      cashOut,
      bankIn,
      bankOut,
      totalTransactions: uniqueTxnIds.size,
      totalEntries: allRows.length,
      isBalanced,
      imbalanceDiff,
    },
    dateRange: { startDate, endDate },
  };
}

// ─── Balance Summary Report Engine ──────────────────────────────────────────

export async function getBalanceSummaryReport(
  asOfDate?: string,
  workspaceId?: string
): Promise<BalanceSummaryReportData> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const targetDate = asOfDate || new Date().toISOString().slice(0, 10);

  // 1. Fetch all accounts for this workspace
  const accounts = await getLedgerAccounts(targetWsId);

  // 2. Fetch all entries up to targetDate for this workspace
  let entries: LedgerEntry[] = [];
  try {
    const supabase = createClient();
    const { data: txnData, error } = await supabase
      .from("ledger_transactions")
      .select("id, transaction_date, entries:ledger_entries(*)")
      .eq("workspace_id", targetWsId)
      .lte("transaction_date", targetDate);

    if (error) throw error;
    if (txnData && txnData.length > 0) {
      entries = txnData.flatMap((t: any) => t.entries || []);
    } else {
      const localTxns = getLocalLedgerTransactions(targetWsId).filter((t) => t.transaction_date <= targetDate);
      const validTxnIds = new Set(localTxns.map((t) => t.id));
      entries = getLocalEntries().filter((e) => validTxnIds.has(e.transaction_id));
    }
  } catch {
    const localTxns = getLocalLedgerTransactions(targetWsId).filter((t) => t.transaction_date <= targetDate);
    const validTxnIds = new Set(localTxns.map((t) => t.id));
    entries = getLocalEntries().filter((e) => validTxnIds.has(e.transaction_id));
  }

  // Compute activity per account
  const debitMap = new Map<string, number>();
  const creditMap = new Map<string, number>();

  for (const e of entries) {
    debitMap.set(e.account_id, (debitMap.get(e.account_id) || 0) + (Number(e.debit) || 0));
    creditMap.set(e.account_id, (creditMap.get(e.account_id) || 0) + (Number(e.credit) || 0));
  }

  // Map each account row
  const accountRows: BalanceSummaryAccountRow[] = accounts.map((acc) => {
    const opening = Number(acc.opening_balance) || 0;
    const deb = Math.round((debitMap.get(acc.id) || 0) * 100) / 100;
    const cred = Math.round((creditMap.get(acc.id) || 0) * 100) / 100;

    let closing = 0;
    if (acc.account_type === "asset" || acc.account_type === "expense") {
      closing = Math.round((opening + deb - cred) * 100) / 100;
    } else {
      closing = Math.round((opening + cred - deb) * 100) / 100;
    }

    return {
      id: acc.id,
      accountCode: acc.account_code,
      accountName: acc.account_name,
      accountType: acc.account_type,
      accountSubType: acc.account_sub_type,
      openingBalance: opening,
      totalDebit: deb,
      totalCredit: cred,
      closingBalance: closing,
      rawAccount: acc,
    };
  });

  // Group accounts by type
  const assetAccounts = accountRows.filter((a) => a.accountType === "asset");
  const liabilityAccounts = accountRows.filter((a) => a.accountType === "liability");
  const incomeAccounts = accountRows.filter((a) => a.accountType === "income");
  const expenseAccounts = accountRows.filter((a) => a.accountType === "expense");
  const equityAccounts = accountRows.filter((a) => a.accountType === "equity");

  const totalAssets = Math.round(assetAccounts.reduce((s, a) => s + a.closingBalance, 0) * 100) / 100;
  const totalLiabilities = Math.round(liabilityAccounts.reduce((s, a) => s + a.closingBalance, 0) * 100) / 100;
  const totalIncome = Math.round(incomeAccounts.reduce((s, a) => s + a.closingBalance, 0) * 100) / 100;
  const totalExpenses = Math.round(expenseAccounts.reduce((s, a) => s + a.closingBalance, 0) * 100) / 100;
  const netProfit = Math.round((totalIncome - totalExpenses) * 100) / 100;

  const totalEquity = Math.round(equityAccounts.reduce((s, a) => s + a.closingBalance, 0) * 100) / 100;
  const totalLiabilitiesAndEquity = Math.round((totalLiabilities + totalEquity + netProfit) * 100) / 100;

  const imbalanceDiff = Math.round(Math.abs(totalAssets - totalLiabilitiesAndEquity) * 100) / 100;
  const isBalanced = imbalanceDiff === 0;

  // Grouped Entity Summaries (Customers, Suppliers, Workers, Bank, Cash)
  const customers = getLocalCustomers(targetWsId).filter((c) => !c.is_deleted);
  const suppliers = getLocalSuppliers(targetWsId).filter((s) => !s.is_deleted);
  const workers = getLocalWorkers(targetWsId).filter((w) => w.status === "active");

  const recAccount = assetAccounts.find((a) => a.accountCode === "1100" || a.accountSubType === "Customer Receivable");
  const supPayAccount = liabilityAccounts.find((a) => a.accountCode === "2001" || a.accountSubType === "Supplier Payable");
  const wrkPayAccount = liabilityAccounts.find((a) => a.accountCode === "2100" || a.accountSubType === "Worker Payable");
  const cashAccount = assetAccounts.find((a) => a.accountCode === "1001" || a.accountSubType === "Cash");
  const bankAccount = assetAccounts.find((a) => a.accountCode === "1002" || a.accountSubType === "Bank");

  const totalCustomerReceivable = recAccount ? recAccount.closingBalance : 0;
  const totalSupplierPayable = supPayAccount ? supPayAccount.closingBalance : 0;
  const totalWorkerPayable = wrkPayAccount ? wrkPayAccount.closingBalance : 0;
  const currentCashBalance = cashAccount ? cashAccount.closingBalance : 0;
  const totalBankBalance = bankAccount ? bankAccount.closingBalance : 0;

  const customersWithBalanceCount = customers.filter((c: any) => (Number(c.outstanding_balance) || 0) > 0).length || (totalCustomerReceivable > 0 ? 1 : 0);
  const suppliersWithBalanceCount = suppliers.filter((s: any) => (Number(s.total_pending || s.outstanding_balance) || 0) > 0).length || (totalSupplierPayable > 0 ? 1 : 0);
  const workersWithBalanceCount = workers.filter((w) => (Number(w.opening_balance) || 0) > 0).length || (totalWorkerPayable > 0 ? 1 : 0);

  return {
    asOfDate: targetDate,
    groups: {
      asset: {
        type: "asset",
        title: "ASSETS (1000s)",
        accounts: assetAccounts,
        totalClosingBalance: totalAssets,
      },
      liability: {
        type: "liability",
        title: "LIABILITIES (2000s)",
        accounts: liabilityAccounts,
        totalClosingBalance: totalLiabilities,
      },
      income: {
        type: "income",
        title: "INCOME & REVENUE (4000s)",
        accounts: incomeAccounts,
        totalClosingBalance: totalIncome,
      },
      expense: {
        type: "expense",
        title: "EXPENSES (5000s)",
        accounts: expenseAccounts,
        totalClosingBalance: totalExpenses,
      },
      equity: {
        type: "equity",
        title: "EQUITY & CAPITAL (3000s)",
        accounts: equityAccounts,
        totalClosingBalance: totalEquity,
      },
    },
    totals: {
      totalAssets,
      totalLiabilities,
      totalIncome,
      totalExpenses,
      netProfit,
      totalEquity,
      totalLiabilitiesAndEquity,
      isBalanced,
      imbalanceDiff,
    },
    entitySummaries: {
      customers: {
        totalReceivable: totalCustomerReceivable,
        customersWithBalanceCount,
      },
      suppliers: {
        totalPayable: totalSupplierPayable,
        suppliersWithBalanceCount,
      },
      workers: {
        totalPayable: totalWorkerPayable,
        workersWithBalanceCount,
      },
      bank: {
        totalBankBalance,
      },
      cash: {
        currentCashBalance,
      },
    },
  };
}

// ─── CSV Export Utilities ───────────────────────────────────────────────────

export function exportDailyReportCSV(data: DailyTransactionReportData): void {
  if (typeof window === "undefined") return;

  const headers = [
    "Date",
    "Transaction Number",
    "Account Code",
    "Account Name",
    "Account Type",
    "Description",
    "Reference",
    "Debit (AED)",
    "Credit (AED)",
    "Payment Method",
    "Created By",
  ];

  const rows = data.rows.map((r) => [
    `"${r.transactionDate}"`,
    `"${r.transactionNumber}"`,
    `"${r.accountCode}"`,
    `"${r.accountName.replace(/"/g, '""')}"`,
    `"${r.accountType.toUpperCase()}"`,
    `"${(r.description || "").replace(/"/g, '""')}"`,
    `"${r.referenceId || "—"}"`,
    r.debit.toFixed(2),
    r.credit.toFixed(2),
    `"${r.paymentMethod.toUpperCase()}"`,
    `"${r.createdBy}"`,
  ]);

  const summaryRows = [
    [],
    ["SUMMARY"],
    ["Total Debit", data.summary.totalDebit.toFixed(2)],
    ["Total Credit", data.summary.totalCredit.toFixed(2)],
    ["Cash In", data.summary.cashIn.toFixed(2)],
    ["Cash Out", data.summary.cashOut.toFixed(2)],
    ["Bank In", data.summary.bankIn.toFixed(2)],
    ["Bank Out", data.summary.bankOut.toFixed(2)],
    ["Total Transactions", data.summary.totalTransactions.toString()],
    ["Status", data.summary.isBalanced ? "BALANCED" : `IMBALANCE: AED ${data.summary.imbalanceDiff.toFixed(2)}`],
  ];

  const csvContent =
    "data:text/csv;charset=utf-8," +
    [headers.join(","), ...rows.map((e) => e.join(",")), ...summaryRows.map((e) => e.join(","))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `Daily_Transaction_Report_${data.dateRange.startDate}_to_${data.dateRange.endDate}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function exportBalanceSummaryCSV(data: BalanceSummaryReportData): void {
  if (typeof window === "undefined") return;

  const lines: string[] = [
    `"ATIQ JEHAN AUTO REPAIR - BALANCE SUMMARY REPORT"`,
    `"As of Date: ${data.asOfDate}"`,
    "",
    ["Account Code", "Account Name", "Category", "Opening Balance", "Debit", "Credit", "Closing Balance"].join(","),
  ];

  const groupKeys: (keyof typeof data.groups)[] = ["asset", "liability", "income", "expense", "equity"];

  for (const k of groupKeys) {
    const grp = data.groups[k];
    lines.push(`\n"--- ${grp.title} ---"`);
    for (const acc of grp.accounts) {
      lines.push(
        [
          `"${acc.accountCode}"`,
          `"${acc.accountName.replace(/"/g, '""')}"`,
          `"${acc.accountSubType}"`,
          acc.openingBalance.toFixed(2),
          acc.totalDebit.toFixed(2),
          acc.totalCredit.toFixed(2),
          acc.closingBalance.toFixed(2),
        ].join(",")
      );
    }
    lines.push(`"SUBTOTAL ${grp.title}",,,,,"${grp.totalClosingBalance.toFixed(2)}"`);
  }

  lines.push("\n");
  lines.push(`"TOTAL ASSETS",,,,,"${data.totals.totalAssets.toFixed(2)}"`);
  lines.push(`"TOTAL LIABILITIES",,,,,"${data.totals.totalLiabilities.toFixed(2)}"`);
  lines.push(`"NET PROFIT (Income - Expenses)",,,,,"${data.totals.netProfit.toFixed(2)}"`);
  lines.push(`"TOTAL LIABILITIES & EQUITY",,,,,"${data.totals.totalLiabilitiesAndEquity.toFixed(2)}"`);
  lines.push(`"STATUS",,,,,"${data.totals.isBalanced ? "BALANCED" : "IMBALANCE DETECTED"}"`);

  const csvContent = "data:text/csv;charset=utf-8," + lines.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `Balance_Summary_As_Of_${data.asOfDate}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// ─── Interfaces: Cash Flow Report ──────────────────────────────────────────

export interface CashFlowReportFilterOptions {
  datePreset?: "today" | "yesterday" | "this_week" | "this_month" | "last_month" | "custom";
  startDate?: string;
  endDate?: string;
  cashFlowType?: "all" | CashFlowType;
  accountId?: string;
  searchQuery?: string;
}

export interface CashFlowReportRow {
  id: string;
  date: string;
  transactionNumber: string;
  cashFlowType: CashFlowType;
  fromAccount: { id: string; code: string; name: string; type: string };
  toAccount: { id: string; code: string; name: string; type: string };
  description: string;
  amount: number;
  fee: number;
  reference: string;
  createdBy: string;
  isReversed: boolean;
}

export interface CashFlowReportSummary {
  totalCashIn: number;
  totalCashOut: number;
  netCashFlow: number;
  totalInternalTransfers: number;
  transactionCount: number;
  cashInCount: number;
  cashOutCount: number;
  internalTransferCount: number;
}

export interface CashFlowReportData {
  rows: CashFlowReportRow[];
  summary: CashFlowReportSummary;
  dateRange: {
    startDate: string;
    endDate: string;
    preset: string;
  };
  filters: {
    cashFlowType: string;
    accountId: string;
    searchQuery: string;
  };
}

/**
 * Generates the Cash Flow Report based on specified date range, flow type, and account filters.
 * Pure internal transfers are separated to prevent double counting in Net Cash Flow.
 */
export async function getCashFlowReport(
  options: CashFlowReportFilterOptions = {},
  workspaceId?: string
): Promise<CashFlowReportData> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const {
    datePreset = "this_month",
    startDate: propStart,
    endDate: propEnd,
    cashFlowType = "all",
    accountId = "all",
    searchQuery = "",
  } = options;

  const { startDate, endDate } = resolveDateRange(datePreset, propStart, propEnd);
  const history = await getTransferHistory(targetWsId);

  const filtered = history.filter((item) => {
    const itemDate = item.date ? item.date.slice(0, 10) : "";
    if (itemDate < startDate || itemDate > endDate) return false;

    if (cashFlowType !== "all" && item.cash_flow_type !== cashFlowType) {
      return false;
    }

    if (accountId !== "all") {
      if (item.from_account.id !== accountId && item.to_account.id !== accountId) {
        return false;
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        item.transfer_number.toLowerCase().includes(q) ||
        item.reference.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.from_account.name.toLowerCase().includes(q) ||
        item.from_account.code.toLowerCase().includes(q) ||
        item.to_account.name.toLowerCase().includes(q) ||
        item.to_account.code.toLowerCase().includes(q) ||
        item.created_by.toLowerCase().includes(q);
      if (!match) return false;
    }

    return true;
  });

  const rows: CashFlowReportRow[] = filtered.map((item) => ({
    id: item.id,
    date: item.date,
    transactionNumber: item.transfer_number,
    cashFlowType: item.cash_flow_type,
    fromAccount: item.from_account,
    toAccount: item.to_account,
    description: item.description,
    amount: item.amount,
    fee: item.fee,
    reference: item.reference,
    createdBy: item.created_by,
    isReversed: item.is_reversed,
  }));

  let totalCashIn = 0;
  let totalCashOut = 0;
  let totalInternalTransfers = 0;
  let cashInCount = 0;
  let cashOutCount = 0;
  let internalTransferCount = 0;

  for (const r of rows) {
    if (r.isReversed) continue;
    if (r.cashFlowType === "cash_in") {
      totalCashIn += r.amount;
      cashInCount++;
    } else if (r.cashFlowType === "cash_out") {
      totalCashOut += r.amount;
      cashOutCount++;
    } else if (r.cashFlowType === "internal_transfer") {
      totalInternalTransfers += r.amount;
      internalTransferCount++;
    }
  }

  totalCashIn = Math.round(totalCashIn * 100) / 100;
  totalCashOut = Math.round(totalCashOut * 100) / 100;
  totalInternalTransfers = Math.round(totalInternalTransfers * 100) / 100;
  const netCashFlow = Math.round((totalCashIn - totalCashOut) * 100) / 100;

  return {
    rows,
    summary: {
      totalCashIn,
      totalCashOut,
      netCashFlow,
      totalInternalTransfers,
      transactionCount: rows.length,
      cashInCount,
      cashOutCount,
      internalTransferCount,
    },
    dateRange: {
      startDate,
      endDate,
      preset: datePreset,
    },
    filters: {
      cashFlowType,
      accountId,
      searchQuery,
    },
  };
}

export function exportCashFlowCSV(data: CashFlowReportData): void {
  if (typeof window === "undefined") return;

  const lines: string[] = [
    `"ATIQ JEHAN AUTO REPAIR - CASH FLOW REPORT"`,
    `"Period: ${data.dateRange.startDate} to ${data.dateRange.endDate}"`,
    `"Cash Flow Type Filter: ${data.filters.cashFlowType}"`,
    "",
    [
      "Date",
      "Transaction No",
      "Cash Flow Type",
      "From Account",
      "To Account",
      "Description",
      "Amount (AED)",
      "Fee (AED)",
      "Reference",
      "Created By",
      "Status",
    ].join(","),
  ];

  for (const r of data.rows) {
    const flowLabel =
      r.cashFlowType === "cash_in"
        ? "Cash In"
        : r.cashFlowType === "cash_out"
        ? "Cash Out"
        : "Internal Transfer";

    lines.push(
      [
        `"${r.date}"`,
        `"${r.transactionNumber}"`,
        `"${flowLabel}"`,
        `"${r.fromAccount.code} - ${r.fromAccount.name.replace(/"/g, '""')}"`,
        `"${r.toAccount.code} - ${r.toAccount.name.replace(/"/g, '""')}"`,
        `"${r.description.replace(/"/g, '""')}"`,
        r.amount.toFixed(2),
        r.fee.toFixed(2),
        `"${r.reference}"`,
        `"${r.createdBy}"`,
        `"${r.isReversed ? "Reversed" : "Completed"}"`,
      ].join(",")
    );
  }

  lines.push("\n");
  lines.push(`"TOTAL CASH IN",,,,,,"${data.summary.totalCashIn.toFixed(2)}"`);
  lines.push(`"TOTAL CASH OUT",,,,,,"${data.summary.totalCashOut.toFixed(2)}"`);
  lines.push(`"NET CASH FLOW",,,,,,"${data.summary.netCashFlow.toFixed(2)}"`);
  lines.push(`"INTERNAL TRANSFERS (EXCLUDED FROM NET)",,,,,,"${data.summary.totalInternalTransfers.toFixed(2)}"`);

  const csvContent = "data:text/csv;charset=utf-8," + lines.join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute(
    "download",
    `Cash_Flow_Report_${data.dateRange.startDate}_to_${data.dateRange.endDate}.csv`
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
