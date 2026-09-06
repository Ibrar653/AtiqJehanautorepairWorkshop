"use client";

import React, { useState, useEffect, useTransition } from "react";
import { usePermissions } from "@/lib/context/auth-context";
import {
  getDailyTransactionReport,
  getBalanceSummaryReport,
  getCashFlowReport,
  exportDailyReportCSV,
  exportBalanceSummaryCSV,
  exportCashFlowCSV,
  DailyTransactionReportData,
  BalanceSummaryReportData,
  BalanceSummaryAccountRow,
  CashFlowReportData,
  CashFlowReportRow,
} from "@/lib/services/report-service";
import {
  getAccountLedgerStatement,
  getLedgerAccounts,
  resetAllLedgerData,
  AccountLedgerStatement,
} from "@/lib/services/ledger-service";
import { LedgerAccount } from "@/types/database";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  BarChart3,
  Calendar,
  Download,
  Printer,
  RefreshCw,
  Search,
  Scale,
  FileText,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  Building2,
  Users,
  Truck,
  HardHat,
  Landmark,
  ChevronLeft,
  ChevronRight,
  Filter,
  Eye,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  RotateCcw,
} from "lucide-react";

export function ReportsView() {
  const { isOwner, isManager, isViewer, role } = usePermissions();
  const canViewReports = isOwner || isManager || role === "admin" || isViewer;

  // Active Report Tab
  const [activeReportTab, setActiveReportTab] = useState<"daily" | "balance" | "cash_flow">("daily");

  // ─── Daily Transaction Report State ─────────────────────────────────────────
  const [dailyData, setDailyData] = useState<DailyTransactionReportData | null>(null);
  const [dailyLoading, setDailyLoading] = useState(true);
  const [datePreset, setDatePreset] = useState<"today" | "yesterday" | "this_week" | "this_month" | "custom">("today");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [accountTypeFilter, setAccountTypeFilter] = useState("all");
  const [referenceTypeFilter, setReferenceTypeFilter] = useState("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyLimit, setDailyLimit] = useState(50);

  // ─── Balance Summary Report State ───────────────────────────────────────────
  const [balanceData, setBalanceData] = useState<BalanceSummaryReportData | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(true);
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [resetAccountingOpen, setResetAccountingOpen] = useState(false);
  const [isResettingAccounting, setIsResettingAccounting] = useState(false);

  // ─── Cash Flow Report State ─────────────────────────────────────────────────
  const [cashFlowData, setCashFlowData] = useState<CashFlowReportData | null>(null);
  const [cashFlowLoading, setCashFlowLoading] = useState(false);
  const [cfDatePreset, setCfDatePreset] = useState<"today" | "yesterday" | "this_week" | "this_month" | "last_month" | "custom">("this_month");
  const [cfStartDate, setCfStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [cfEndDate, setCfEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [cfTypeFilter, setCfTypeFilter] = useState<string>("all");
  const [cfAccountFilter, setCfAccountFilter] = useState<string>("all");
  const [cfSearchQuery, setCfSearchQuery] = useState("");
  const [cfAccountsList, setCfAccountsList] = useState<LedgerAccount[]>([]);

  // ─── Ledger Statement Modal (Drilldown) ──────────────────────────────────────
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [activeStatement, setActiveStatement] = useState<AccountLedgerStatement | null>(null);
  const [statementDateFilter, setStatementDateFilter] = useState("all");

  // Load Daily Report
  const loadDailyReport = async () => {
    setDailyLoading(true);
    try {
      const res = await getDailyTransactionReport({
        datePreset,
        startDate,
        endDate,
        accountType: accountTypeFilter,
        referenceType: referenceTypeFilter,
        paymentMethod: paymentMethodFilter,
        searchQuery,
        page: dailyPage,
        limit: dailyLimit,
      });
      setDailyData(res);
    } catch (e) {
      console.error("Failed to load daily report:", e);
    } finally {
      setDailyLoading(false);
    }
  };

  // Load Balance Summary
  const loadBalanceSummary = async () => {
    setBalanceLoading(true);
    try {
      const res = await getBalanceSummaryReport(asOfDate);
      setBalanceData(res);
    } catch (e) {
      console.error("Failed to load balance summary:", e);
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleConfirmResetAccounting = async () => {
    setIsResettingAccounting(true);
    try {
      await resetAllLedgerData();
      setResetAccountingOpen(false);
      await Promise.all([
        loadBalanceSummary(),
        loadDailyReport(),
        loadCashFlowReport(),
      ]);
    } catch (e) {
      console.error("Failed to reset accounting data:", e);
    } finally {
      setIsResettingAccounting(false);
    }
  };

  // Load Cash Flow Report
  const loadCashFlowReport = async () => {
    setCashFlowLoading(true);
    try {
      const [res, accs] = await Promise.all([
        getCashFlowReport({
          datePreset: cfDatePreset,
          startDate: cfStartDate,
          endDate: cfEndDate,
          cashFlowType: cfTypeFilter as any,
          accountId: cfAccountFilter,
          searchQuery: cfSearchQuery,
        }),
        getLedgerAccounts(),
      ]);
      setCashFlowData(res);
      setCfAccountsList(accs);
    } catch (e) {
      console.error("Failed to load cash flow report:", e);
    } finally {
      setCashFlowLoading(false);
    }
  };

  // Effects
  useEffect(() => {
    loadDailyReport();
  }, [datePreset, startDate, endDate, accountTypeFilter, referenceTypeFilter, paymentMethodFilter, searchQuery, dailyPage, dailyLimit]);

  useEffect(() => {
    loadBalanceSummary();
  }, [asOfDate]);

  useEffect(() => {
    loadCashFlowReport();
  }, [cfDatePreset, cfStartDate, cfEndDate, cfTypeFilter, cfAccountFilter, cfSearchQuery]);

  // Handle drilldown click on account row
  const handleDrilldownAccount = async (account: BalanceSummaryAccountRow | { id: string }) => {
    try {
      const stmt = await getAccountLedgerStatement(account.id);
      setActiveStatement(stmt);
      setStatementDialogOpen(true);
    } catch (e: any) {
      console.error("Failed to open statement:", e);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (!canViewReports) {
    return (
      <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
        <CardContent className="py-12 text-center text-red-700 dark:text-red-400">
          <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-red-500" />
          <h3 className="text-lg font-bold">Access Restricted</h3>
          <p className="text-xs mt-1">You do not have permission to view accounting financial reports.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ─── Printable Header (Hidden on screen, visible on print) ─── */}
      <div className="hidden print:block mb-6 text-center border-b pb-4">
        <h1 className="text-xl font-bold uppercase tracking-wider text-slate-900">
          ATIQ JEHAN AUTO REPAIR
        </h1>
        <p className="text-xs text-slate-600">
          Industrial Area, Musaffah, Abu Dhabi, UAE &bull; TRN: 100523498100003 &bull; Phone: +971 50 123 4567
        </p>
        <p className="text-sm font-bold uppercase mt-2 text-slate-800">
          {activeReportTab === "daily"
            ? `Daily Transaction Report (${dailyData?.dateRange.startDate || ""} to ${dailyData?.dateRange.endDate || ""})`
            : activeReportTab === "cash_flow"
            ? `Cash Flow Report (${cashFlowData?.dateRange.startDate || ""} to ${cashFlowData?.dateRange.endDate || ""})`
            : `Balance Summary Report (As of: ${balanceData?.asOfDate || asOfDate})`}
        </p>
      </div>

      {/* ─── Screen Header (Hidden on print) ────────────────────────── */}
      <div className="print:hidden">
        <PageHeader
          title="Reports"
          description="Review workshop performance, operations, inventory and financial reports."
          breadcrumbs={[
            { label: "Finance & Accounts" },
            { label: "Reports" },
          ]}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={
                  activeReportTab === "daily"
                    ? loadDailyReport
                    : activeReportTab === "cash_flow"
                    ? loadCashFlowReport
                    : loadBalanceSummary
                }
                disabled={dailyLoading || balanceLoading || cashFlowLoading}
                className="h-10 px-3.5 gap-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${dailyLoading || balanceLoading || cashFlowLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (activeReportTab === "daily" && dailyData) {
                    exportDailyReportCSV(dailyData);
                  } else if (activeReportTab === "balance" && balanceData) {
                    exportBalanceSummaryCSV(balanceData);
                  } else if (activeReportTab === "cash_flow" && cashFlowData) {
                    exportCashFlowCSV(cashFlowData);
                  }
                }}
                className="h-10 px-3.5 gap-2 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-blue-600 hover:text-blue-700 shadow-2xs transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>

              <Button
                size="sm"
                onClick={handlePrint}
                className="h-10 px-4 gap-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-2xs transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Report
              </Button>
            </div>
          }
        />
      </div>

      {/* ─── Main Reports Tabs ────────────────────────────────────────── */}
      <Tabs
        value={activeReportTab}
        onValueChange={(val: any) => {
          if (val) setActiveReportTab(val);
        }}
        className="space-y-6"
      >
        <TabsList className="grid grid-cols-3 max-w-md h-12 p-1.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs print:hidden">
          <TabsTrigger value="daily" className="text-xs py-2 gap-2 font-bold rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 transition-all">
            <FileText className="w-3.5 h-3.5" />
            Daily Transactions
          </TabsTrigger>
          <TabsTrigger value="balance" className="text-xs py-2 gap-2 font-bold rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 transition-all">
            <Scale className="w-3.5 h-3.5" />
            Balance Summary
          </TabsTrigger>
          <TabsTrigger value="cash_flow" className="text-xs py-2 gap-2 font-bold rounded-xl data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-xs text-slate-600 dark:text-slate-400 transition-all">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Cash Flow Report
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════════
            REPORT 1: DAILY TRANSACTION REPORT
           ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="daily" className="space-y-5">
          {/* Summary Cards */}
          {dailyData?.summary && (
            <div className="space-y-3">
              {/* Imbalance Warning Banner if not balanced */}
              {!dailyData.summary.isBalanced ? (
                <div className="p-4 rounded-2xl bg-rose-50/90 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-300 shadow-2xs">
                  <div className="flex items-center gap-2.5 font-semibold">
                    <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                    <span>⚠️ Ledger imbalance detected! Total Debit does not match Total Credit.</span>
                  </div>
                  <span className="font-mono font-bold bg-rose-100 dark:bg-rose-900/50 px-3 py-1 rounded-xl">
                    Difference: AED {dailyData.summary.imbalanceDiff.toFixed(2)}
                  </span>
                </div>
              ) : (
                <div className="p-4 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 shadow-2xs">
                  <div className="flex items-center gap-2.5 font-semibold">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                    <span>Double-Entry Reconciled: Total Debit strictly equals Total Credit</span>
                  </div>
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-white dark:bg-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-lg">
                    BALANCED
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                {/* Total Debit */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Debit</div>
                  <div className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums mt-2">
                    AED {dailyData.summary.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Total Credit */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Credit</div>
                  <div className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums mt-2">
                    AED {dailyData.summary.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Cash In */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5" /> Cash In
                  </div>
                  <div className="text-xl font-bold font-mono tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums mt-2">
                    AED {dailyData.summary.cashIn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Cash Out */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5" /> Cash Out
                  </div>
                  <div className="text-xl font-bold font-mono tracking-tight text-rose-700 dark:text-rose-400 tabular-nums mt-2">
                    AED {dailyData.summary.cashOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Bank In */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                    <ArrowDownLeft className="w-3.5 h-3.5" /> Bank In
                  </div>
                  <div className="text-xl font-bold font-mono tracking-tight text-blue-700 dark:text-blue-400 tabular-nums mt-2">
                    AED {dailyData.summary.bankIn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Bank Out */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                  <div className="text-[11px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5" /> Bank Out
                  </div>
                  <div className="text-xl font-bold font-mono tracking-tight text-amber-700 dark:text-amber-400 tabular-nums mt-2">
                    AED {dailyData.summary.bankOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                </div>

                {/* Total Transactions */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-1">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Transactions</div>
                  <div className="text-xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums mt-2">
                    {dailyData.summary.totalTransactions} <span className="text-[11px] font-normal text-slate-500">({dailyData.summary.totalEntries} lines)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Filters Bar */}
          <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs print:hidden space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Preset Buttons */}
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <span className="font-bold text-slate-500 mr-1 text-[11px] uppercase tracking-wider">Date:</span>
                {(["today", "yesterday", "this_week", "this_month", "custom"] as const).map((p) => {
                  const labels = {
                    today: "Today",
                    yesterday: "Yesterday",
                    this_week: "This Week",
                    this_month: "This Month",
                    custom: "Custom",
                  };
                  return (
                    <Button
                      key={p}
                      variant={datePreset === p ? "default" : "outline"}
                      size="sm"
                      onClick={() => setDatePreset(p)}
                      className={`h-10 px-3.5 text-xs rounded-xl font-semibold transition-colors ${
                        datePreset === p
                          ? "bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                          : "bg-white dark:bg-slate-900 border-slate-200 text-slate-700 dark:text-slate-300 hover:bg-slate-50 shadow-2xs"
                      }`}
                    >
                      {labels[p]}
                    </Button>
                  );
                })}
              </div>

              {/* Custom Date Pickers */}
              {datePreset === "custom" && (
                <div className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="h-10 text-xs w-[140px] rounded-xl border-slate-200"
                  />
                  <span className="text-xs text-slate-500 font-semibold">to</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-10 text-xs w-[140px] rounded-xl border-slate-200"
                  />
                </div>
              )}

              {/* Search Bar */}
              <div className="relative flex-1 min-w-[220px]">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by Txn No, Invoice, Ref, Account, Description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs h-10 rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40"
                />
              </div>
            </div>

            {/* Sub-Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
              {/* Account Type Filter */}
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Account Type</Label>
                <Select value={accountTypeFilter} onValueChange={(v) => { if (v) setAccountTypeFilter(v); }}>
                  <SelectTrigger className="h-10 text-xs rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40 font-medium">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                    <SelectItem value="all">All Account Types</SelectItem>
                    <SelectItem value="asset">Asset (1000s)</SelectItem>
                    <SelectItem value="liability">Liability (2000s)</SelectItem>
                    <SelectItem value="equity">Equity (3000s)</SelectItem>
                    <SelectItem value="income">Income (4000s)</SelectItem>
                    <SelectItem value="expense">Expense (5000s)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Reference / Transaction Type */}
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Transaction Type</Label>
                <Select value={referenceTypeFilter} onValueChange={(v) => { if (v) setReferenceTypeFilter(v); }}>
                  <SelectTrigger className="h-10 text-xs rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40 font-medium">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="customer_invoice">Customer Invoice</SelectItem>
                    <SelectItem value="customer_payment">Customer Payment</SelectItem>
                    <SelectItem value="supplier_purchase">Supplier Purchase</SelectItem>
                    <SelectItem value="supplier_payment">Supplier Payment</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                    <SelectItem value="worker_salary_due">Worker Salary Due</SelectItem>
                    <SelectItem value="worker_salary_payment">Worker Salary Payment</SelectItem>
                    <SelectItem value="worker_advance">Worker Advance</SelectItem>
                    <SelectItem value="owner_equity">Owner Equity / Drawing</SelectItem>
                    <SelectItem value="manual_journal">Manual Journal</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Payment Method */}
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Payment Method</Label>
                <Select value={paymentMethodFilter} onValueChange={(v) => { if (v) setPaymentMethodFilter(v); }}>
                  <SelectTrigger className="h-10 text-xs rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40 font-medium">
                    <SelectValue placeholder="All Methods" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                    <SelectItem value="all">All Methods</SelectItem>
                    <SelectItem value="cash">Cash on Hand</SelectItem>
                    <SelectItem value="bank">Bank Account</SelectItem>
                    <SelectItem value="other">Other / Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Page Size */}
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Rows per page</Label>
                <Select value={String(dailyLimit)} onValueChange={(v) => { if (v) setDailyLimit(Number(v)); }}>
                  <SelectTrigger className="h-10 text-xs rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40 font-medium">
                    <SelectValue placeholder="50" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                    <SelectItem value="20">20 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                    <SelectItem value="100">100 rows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Transactions Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80 hover:bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                  <TableRow className="h-11">
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[100px]">Date</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[120px]">Txn No</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[160px]">Account</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[90px]">Type</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[180px]">Description</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[100px]">Reference</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[120px]">Debit (AED)</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[120px]">Credit (AED)</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[90px]">Method</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[95px]">Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-14 text-center text-xs text-slate-500">
                        <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-blue-600" />
                        Loading journal transactions...
                      </TableCell>
                    </TableRow>
                  ) : !dailyData || dailyData.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-12 text-center text-xs text-slate-500">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-2 text-slate-400">
                          <FileText className="w-6 h-6" />
                        </div>
                        <p className="font-bold text-slate-700 dark:text-slate-300">No transactions recorded for this period</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Try selecting a broader date range or clearing filters.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    dailyData.rows.map((row) => (
                      <TableRow key={row.entryId} className="h-12 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/80 text-xs">
                        <TableCell className="font-mono text-slate-600 dark:text-slate-400">
                          {row.transactionDate}
                        </TableCell>
                        <TableCell className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {row.transactionNumber}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-[11px] font-bold text-slate-500 mr-1.5">
                            {row.accountCode}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {row.accountName}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-lg">
                            {row.accountType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 max-w-[240px] truncate" title={row.description}>
                          {row.description}
                        </TableCell>
                        <TableCell className="font-mono text-slate-500">
                          {row.referenceId || "—"}
                        </TableCell>
                        <TableCell className="font-mono text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                          {row.debit > 0 ? row.debit.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                          {row.credit > 0 ? row.credit.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell>
                          <span className="capitalize text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            {row.paymentMethod}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-500 truncate max-w-[100px]">
                          {row.createdBy}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {dailyData && dailyData.totalRows > 0 && (
              <div className="p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs text-slate-500 print:hidden">
                <span>
                  Showing {((dailyPage - 1) * dailyLimit) + 1} to {Math.min(dailyPage * dailyLimit, dailyData.totalRows)} of {dailyData.totalRows} entries
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dailyPage <= 1}
                    onClick={() => setDailyPage((p) => Math.max(1, p - 1))}
                    className="h-8 px-3 text-xs rounded-xl font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Previous
                  </Button>
                  <span className="px-2 font-bold font-mono">
                    Page {dailyPage} of {Math.max(1, Math.ceil(dailyData.totalRows / dailyLimit))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dailyPage >= Math.ceil(dailyData.totalRows / dailyLimit)}
                    onClick={() => setDailyPage((p) => p + 1)}
                    className="h-8 px-3 text-xs rounded-xl font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
                  >
                    Next <ChevronRight className="w-3.5 h-3.5 ml-0.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            REPORT 2: BALANCE SUMMARY REPORT
           ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="balance" className="space-y-5">
          {/* As of Date Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl shadow-2xs">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                <Calendar className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Balance Summary as of: <span className="font-mono text-blue-600 tabular-nums">{asOfDate}</span>
                </h3>
                <p className="text-xs text-slate-500">
                  Calculated from real General Ledger transactions up to this date
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden flex-wrap">
              <Label htmlFor="asOfDateInput" className="text-xs font-bold text-slate-500 uppercase tracking-wider">As of Date:</Label>
              <Input
                id="asOfDateInput"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="h-10 text-xs w-[140px] rounded-xl border-slate-200"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAsOfDate(new Date().toISOString().slice(0, 10))}
                className="h-10 text-xs px-3.5 rounded-xl border-slate-200 font-semibold bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
              >
                Today
              </Button>

              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetAccountingOpen(true)}
                  className="h-10 text-xs px-3.5 gap-2 rounded-xl font-semibold border-rose-200 text-rose-700 bg-rose-50 hover:bg-rose-100 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40 shadow-2xs transition-colors"
                  title="Reset ATIQ JEHAN Accounting to Clean Zero"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                  Reset Accounting
                </Button>
              )}
            </div>
          </div>

          {/* Grouped Entity Summary Cards (Section 8) */}
          {balanceData && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {/* Cash Balance */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cash on Hand</span>
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                    <Wallet className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.cash.currentCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Physical cash drawer balance</p>
                </div>
              </div>

              {/* Total Bank Balance */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bank Balance</span>
                  <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                    <Landmark className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.bank.totalBankBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Total corporate bank accounts</p>
                </div>
              </div>

              {/* Customer Receivables */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Receivables</span>
                  <div className="w-10 h-10 rounded-xl bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 flex items-center justify-center">
                    <Users className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.customers.totalReceivable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {balanceData.entitySummaries.customers.customersWithBalanceCount} customers with dues
                  </p>
                </div>
              </div>

              {/* Supplier Payables */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Supplier Payables</span>
                  <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center">
                    <Truck className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.suppliers.totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {balanceData.entitySummaries.suppliers.suppliersWithBalanceCount} suppliers pending
                  </p>
                </div>
              </div>

              {/* Worker Payables */}
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between col-span-2 sm:col-span-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Worker Payables</span>
                  <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center">
                    <HardHat className="w-5 h-5" />
                  </div>
                </div>
                <div className="mt-2">
                  <p className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.workers.totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    Staff salaries &amp; advances
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Grouped Account Tables */}
          {balanceLoading ? (
            <div className="py-16 text-center text-xs text-slate-500">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-blue-600" />
              Calculating real closing balances from ledger...
            </div>
          ) : !balanceData ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No balance summary data available.
            </div>
          ) : (
            <div className="space-y-5">
              {(["asset", "liability", "income", "expense", "equity"] as const).map((key) => {
                const group = balanceData.groups[key];
                return (
                  <div key={key} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
                    <div className="p-4 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800">
                      <h4 className="font-bold text-xs tracking-wider uppercase text-slate-900 dark:text-slate-100">
                        {group.title}
                      </h4>
                      <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-300 tabular-nums">
                        Subtotal: AED {group.totalClosingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/80 h-11">
                            <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[120px]">Account Code</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[220px]">Account Name</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[140px]">Category</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[130px]">Opening Balance</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[130px]">Debit Activity</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[130px]">Credit Activity</TableHead>
                            <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[150px]">Closing Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.accounts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-6 text-xs text-slate-500">
                                No accounts configured under this category.
                              </TableCell>
                            </TableRow>
                          ) : (
                            group.accounts.map((acc) => (
                              <TableRow
                                key={acc.id}
                                onClick={() => handleDrilldownAccount(acc)}
                                className="h-12 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer group transition-colors border-b border-slate-100 dark:border-slate-800/80 text-xs"
                                title="Click to view detailed ledger statement"
                              >
                                <TableCell className="font-mono font-bold text-slate-700 dark:text-slate-300">
                                  {acc.accountCode}
                                </TableCell>
                                <TableCell className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition flex items-center justify-between">
                                  <span>{acc.accountName}</span>
                                  <Eye className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                                </TableCell>
                                <TableCell className="text-slate-500">
                                  {acc.accountSubType}
                                </TableCell>
                                <TableCell className="font-mono text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                  {acc.openingBalance.toFixed(2)}
                                </TableCell>
                                <TableCell className="font-mono text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                  {acc.totalDebit > 0 ? acc.totalDebit.toFixed(2) : "0.00"}
                                </TableCell>
                                <TableCell className="font-mono text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                  {acc.totalCredit > 0 ? acc.totalCredit.toFixed(2) : "0.00"}
                                </TableCell>
                                <TableCell className="font-mono text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                                  AED {acc.closingBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </TableCell>
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                );
              })}

              {/* Total Balance Sheet Summary Equation */}
              <div className="p-6 rounded-2xl bg-slate-900 text-white shadow-2xs border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Total Assets</p>
                    <p className="text-xl font-bold font-mono text-emerald-400 tabular-nums mt-1">
                      AED {balanceData.totals.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Total Liabilities</p>
                    <p className="text-xl font-bold font-mono text-amber-400 tabular-nums mt-1">
                      AED {balanceData.totals.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Net Profit (Income - Expenses)</p>
                    <p className="text-xl font-bold font-mono text-blue-400 tabular-nums mt-1">
                      AED {balanceData.totals.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-bold tracking-wider">Total Liabilities &amp; Equity</p>
                    <p className="text-xl font-bold font-mono text-white tabular-nums mt-1">
                      AED {balanceData.totals.totalLiabilitiesAndEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════════
            REPORT 3: CASH FLOW REPORT
           ══════════════════════════════════════════════════════════════════════ */}
        <TabsContent value="cash_flow" className="space-y-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Total Cash In */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Cash In</span>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                  <ArrowDownLeft className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-2xl font-bold font-mono tracking-tight text-emerald-600 dark:text-emerald-400 tabular-nums">
                  AED {cashFlowData?.summary.totalCashIn.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Inflows entering workshop &bull; {cashFlowData?.summary.cashInCount || 0} transactions
                </p>
              </div>
            </div>

            {/* Total Cash Out */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Cash Out</span>
                <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
                  <ArrowUpRight className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-2xl font-bold font-mono tracking-tight text-rose-600 dark:text-rose-400 tabular-nums">
                  AED {cashFlowData?.summary.totalCashOut.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Outflows leaving workshop &bull; {cashFlowData?.summary.cashOutCount || 0} transactions
                </p>
              </div>
            </div>

            {/* Net Cash Flow */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Net Cash Flow</span>
                <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                  <Scale className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-2">
                <p className={`text-2xl font-bold font-mono tracking-tight tabular-nums ${(cashFlowData?.summary.netCashFlow || 0) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-rose-600"}`}>
                  {(cashFlowData?.summary.netCashFlow || 0) >= 0 ? "+" : ""}AED {cashFlowData?.summary.netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Formula: Cash In - Cash Out
                </p>
              </div>
            </div>

            {/* Internal Transfers */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-2xs flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Internal Transfers</span>
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-2xl font-bold font-mono tracking-tight text-slate-800 dark:text-slate-200 tabular-nums">
                  AED {cashFlowData?.summary.totalInternalTransfers.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Excluded from Net &bull; {cashFlowData?.summary.internalTransferCount || 0} account movements
                </p>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="p-4 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xs print:hidden space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-slate-500 mr-1 flex items-center gap-1 text-[11px] uppercase tracking-wider">
                  <Filter className="w-3.5 h-3.5" /> Date:
                </span>
                {[
                  { id: "today", label: "Today" },
                  { id: "yesterday", label: "Yesterday" },
                  { id: "this_week", label: "This Week" },
                  { id: "this_month", label: "This Month" },
                  { id: "last_month", label: "Last Month" },
                  { id: "custom", label: "Custom Range" },
                ].map((p) => (
                  <Button
                    key={p.id}
                    variant={cfDatePreset === p.id ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCfDatePreset(p.id as any)}
                    className={`text-xs h-10 px-3.5 rounded-xl font-semibold transition-colors ${
                      cfDatePreset === p.id
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                        : "bg-white dark:bg-slate-900 border-slate-200 text-slate-700 dark:text-slate-300 hover:bg-slate-50 shadow-2xs"
                    }`}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>

              <div className="text-xs text-slate-500 font-mono bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 rounded-xl border border-slate-200/80">
                {cashFlowData?.dateRange.startDate} to {cashFlowData?.dateRange.endDate}
              </div>
            </div>

            {/* Custom Date Pickers & Dropdown Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
              {/* Start Date */}
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Start Date</Label>
                <Input
                  type="date"
                  value={cfStartDate}
                  disabled={cfDatePreset !== "custom"}
                  onChange={(e) => {
                    setCfStartDate(e.target.value);
                    if (cfDatePreset !== "custom") setCfDatePreset("custom");
                  }}
                  className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40"
                />
              </div>

              {/* End Date */}
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">End Date</Label>
                <Input
                  type="date"
                  value={cfEndDate}
                  disabled={cfDatePreset !== "custom"}
                  onChange={(e) => {
                    setCfEndDate(e.target.value);
                    if (cfDatePreset !== "custom") setCfDatePreset("custom");
                  }}
                  className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40"
                />
              </div>

              {/* Cash Flow Type */}
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Cash Flow Type</Label>
                <Select value={cfTypeFilter} onValueChange={(val) => { if (val) setCfTypeFilter(val); }}>
                  <SelectTrigger className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40 font-medium">
                    <SelectValue placeholder="All Flow Types" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                    <SelectItem value="all" className="text-xs">All Types</SelectItem>
                    <SelectItem value="cash_in" className="text-xs">Cash In (Inflows)</SelectItem>
                    <SelectItem value="cash_out" className="text-xs">Cash Out (Outflows)</SelectItem>
                    <SelectItem value="internal_transfer" className="text-xs">Internal Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Account Filter */}
              <div className="space-y-1">
                <Label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Account</Label>
                <Select value={cfAccountFilter} onValueChange={(val) => { if (val) setCfAccountFilter(val); }}>
                  <SelectTrigger className="text-xs h-10 rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40 font-medium">
                    <SelectValue placeholder="All Accounts" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56 rounded-xl border-slate-200 shadow-lg">
                    <SelectItem value="all" className="text-xs">All Accounts</SelectItem>
                    {cfAccountsList.map((acc) => (
                      <SelectItem key={acc.id} value={acc.id} className="text-xs">
                        {acc.account_code} - {acc.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Search Bar */}
            <div className="relative pt-1">
              <Search className="absolute left-3 top-4 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search by Transaction No, Reference, Description, Account..."
                value={cfSearchQuery}
                onChange={(e) => setCfSearchQuery(e.target.value)}
                className="pl-9 text-xs h-10 rounded-xl border-slate-200 bg-slate-50/50 dark:bg-slate-800/40"
              />
            </div>
          </div>

          {/* Cash Flow Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                Cash Flow Records ({cashFlowData?.rows.length || 0})
              </div>
              <div className="text-xs text-slate-500 font-mono">
                Operating Net: <strong className={`font-bold ${(cashFlowData?.summary.netCashFlow || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  AED {cashFlowData?.summary.netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/80 h-11">
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[100px]">Date</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">Transaction No</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">Cash Flow Type</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[150px]">From Account</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[150px]">To Account</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[180px]">Description</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[120px]">Amount (AED)</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[100px]">Reference</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[100px]">Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashFlowLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-14 text-xs text-slate-500">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                        Loading cash flow report...
                      </TableCell>
                    </TableRow>
                  ) : !cashFlowData || cashFlowData.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-xs text-slate-500">
                        <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-2 text-slate-400">
                          <ArrowRightLeft className="w-6 h-6" />
                        </div>
                        <p className="font-bold text-slate-700 dark:text-slate-300">No cash flow transactions found</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Try adjusting the date preset, cash flow type, or search filter.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    cashFlowData.rows.map((row) => (
                      <TableRow key={row.id} className="h-12 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors border-b border-slate-100 dark:border-slate-800/80 text-xs">
                        <TableCell className="font-mono text-slate-500">{row.date}</TableCell>
                        <TableCell className="font-mono font-bold text-blue-600 dark:text-blue-400">
                          {row.transactionNumber}
                        </TableCell>
                        <TableCell>
                          {row.cashFlowType === "cash_in" ? (
                            <Badge variant="outline" className="text-[10px] font-bold border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-lg">
                              Cash In
                            </Badge>
                          ) : row.cashFlowType === "cash_out" ? (
                            <Badge variant="outline" className="text-[10px] font-bold border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40 px-2 py-0.5 rounded-lg">
                              Cash Out
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-bold border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-lg">
                              Internal Transfer
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-[10px] text-slate-400 mr-1">{row.fromAccount.code}</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{row.fromAccount.name}</span>
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-[10px] text-slate-400 mr-1">{row.toAccount.code}</span>
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{row.toAccount.name}</span>
                        </TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={row.description}>
                          {row.description}
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                          {row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="font-mono text-slate-500">{row.reference || "—"}</TableCell>
                        <TableCell className="text-slate-500 truncate max-w-[95px]">{row.createdBy}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── STATEMENT DIALOG (DRILL DOWN) ─────────────────────────────────── */}
      <Dialog open={statementDialogOpen} onOpenChange={setStatementDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-6 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xl bg-white dark:bg-slate-950">
          {activeStatement && (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                <div>
                  <DialogTitle className="text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>{activeStatement.account.account_code} - {activeStatement.account.account_name}</span>
                    <Badge variant="outline" className="text-xs uppercase font-bold px-2 py-0.5 rounded-lg">
                      {activeStatement.account.account_type}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-slate-500 mt-0.5">
                    Sub-type: {activeStatement.account.account_sub_type} &bull; Generated from General Ledger
                  </DialogDescription>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Current Balance</p>
                  <p className="text-xl font-bold font-mono text-blue-700 dark:text-blue-400 tabular-nums">
                    AED {activeStatement.closing_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Statement summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/80">
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Opening Balance</p>
                  <p className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums mt-1">AED {activeStatement.opening_balance.toFixed(2)}</p>
                </div>
                <div className="p-4 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-xl border border-emerald-200/80">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold uppercase tracking-wider">Total Debits</p>
                  <p className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums mt-1">+AED {activeStatement.total_debit.toFixed(2)}</p>
                </div>
                <div className="p-4 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200/80">
                  <p className="text-xs text-rose-700 dark:text-rose-400 font-bold uppercase tracking-wider">Total Credits</p>
                  <p className="text-base font-bold font-mono text-rose-700 dark:text-rose-400 tabular-nums mt-1">-AED {activeStatement.total_credit.toFixed(2)}</p>
                </div>
              </div>

              {/* Statement Ledger lines */}
              <div className="border border-slate-200/80 rounded-xl overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50/80">
                    <TableRow className="h-10">
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[100px]">Date</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider w-[120px]">Txn No</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider">Description</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-[110px]">Debit (AED)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-[110px]">Credit (AED)</TableHead>
                      <TableHead className="text-xs font-bold text-slate-500 uppercase tracking-wider text-right w-[130px]">Balance (AED)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeStatement.lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-xs text-slate-500">
                          No transactions found for this account.
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeStatement.lines.map((line, idx) => (
                        <TableRow key={idx} className="h-11 border-b border-slate-100 text-xs">
                          <TableCell className="font-mono text-slate-600">{line.date}</TableCell>
                          <TableCell className="font-mono font-bold text-blue-600">{line.transaction_number}</TableCell>
                          <TableCell>
                            <span className="font-semibold text-slate-900">{line.description}</span>
                            {line.reference_id && (
                              <span className="ml-1.5 text-slate-400 font-mono text-[10px]">({line.reference_id})</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-right font-medium tabular-nums">
                            {line.debit > 0 ? line.debit.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-right font-medium tabular-nums">
                            {line.credit > 0 ? line.credit.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-right font-bold text-slate-900 tabular-nums">
                            {line.running_balance.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <DialogFooter className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setStatementDialogOpen(false)} className="h-10 px-4 text-xs font-semibold rounded-xl border-slate-200">
                  Close
                </Button>
                <Button size="sm" onClick={handlePrint} className="h-10 px-4 gap-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-2xs">
                  <Printer className="w-3.5 h-3.5" />
                  Print Statement
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: RESET ACCOUNTING DATA CONFIRMATION ──────────────────────── */}
      <Dialog open={resetAccountingOpen} onOpenChange={setResetAccountingOpen}>
        <DialogContent className="max-w-md p-6 rounded-2xl border border-slate-200/90 shadow-xl bg-white dark:bg-slate-950">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-100 dark:bg-rose-950/60 rounded-xl">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Reset ATIQ JEHAN Financial Reports?
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-500 mt-0.5">
                  Clear test data and reset financial registers to clean zero
                </DialogDescription>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200/80 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Target Workspace:</span>
                <span className="font-bold text-slate-900 dark:text-slate-100">ATIQ JEHAN AUTO REPAIR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Scope:</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">Balance Summary, Cash Flow, General Ledger</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Other Workspaces:</span>
                <span className="text-emerald-600 font-bold">100% Protected & Isolated</span>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                What will happen:
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-1 pl-1">
                <li>All general ledger transactions (e.g. TRF-000001, TRF-000002) will be purged.</li>
                <li>Cash on Hand, Bank Balance, Receivables, Payables will reset to AED 0.00.</li>
                <li>Opening balances of all accounts and banks will be set to AED 0.00.</li>
                <li>Chart of accounts, customer master, supplier master, and services remain intact.</li>
              </ul>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setResetAccountingOpen(false)}
                disabled={isResettingAccounting}
                className="h-10 px-4 text-xs font-semibold rounded-xl border-slate-200"
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmResetAccounting}
                disabled={isResettingAccounting}
                className="h-10 px-4 text-xs font-semibold rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow-2xs"
              >
                {isResettingAccounting ? "Resetting..." : "Reset ATIQ JEHAN Reports"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
