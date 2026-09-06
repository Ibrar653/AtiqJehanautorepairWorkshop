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
                className="h-8 gap-1.5 text-xs bg-white dark:bg-slate-900 border-slate-200/80 shadow-xs hover:bg-slate-50"
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
                className="h-8 gap-1.5 text-xs bg-white dark:bg-slate-900 border-slate-200/80 shadow-xs hover:bg-slate-50 text-blue-600 hover:text-blue-700"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </Button>

              <Button
                size="sm"
                onClick={handlePrint}
                className="h-8 gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
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
        <TabsList className="grid grid-cols-3 max-w-md h-10 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200/80 dark:border-slate-800 print:hidden">
          <TabsTrigger value="daily" className="text-xs py-1.5 gap-1.5 font-medium rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs">
            <FileText className="w-3.5 h-3.5" />
            Daily Transactions
          </TabsTrigger>
          <TabsTrigger value="balance" className="text-xs py-1.5 gap-1.5 font-medium rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs">
            <Scale className="w-3.5 h-3.5" />
            Balance Summary
          </TabsTrigger>
          <TabsTrigger value="cash_flow" className="text-xs py-1.5 gap-1.5 font-medium rounded-lg data-[state=active]:bg-white dark:data-[state=active]:bg-slate-900 data-[state=active]:shadow-xs">
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
                <div className="p-3.5 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 flex items-center justify-between gap-3 text-xs text-rose-800 dark:text-rose-300">
                  <div className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>⚠️ Ledger imbalance detected! Total Debit does not match Total Credit.</span>
                  </div>
                  <span className="font-mono font-bold bg-rose-100 dark:bg-rose-900/50 px-2.5 py-1 rounded-lg">
                    Difference: AED {dailyData.summary.imbalanceDiff.toFixed(2)}
                  </span>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-800/60 flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300">
                  <div className="flex items-center gap-2 font-medium">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>Double-Entry Reconciled: Total Debit strictly equals Total Credit</span>
                  </div>
                  <Badge variant="outline" className="border-emerald-300 text-emerald-700 bg-white dark:bg-slate-900 text-[10px] font-semibold">
                    BALANCED
                  </Badge>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                {/* Total Debit */}
                <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                  <CardHeader className="p-3 pb-1">
                    <CardDescription className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Debit</CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                      AED {dailyData.summary.totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>

                {/* Total Credit */}
                <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                  <CardHeader className="p-3 pb-1">
                    <CardDescription className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Total Credit</CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                      AED {dailyData.summary.totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>

                {/* Cash In */}
                <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                  <CardHeader className="p-3 pb-1">
                    <CardDescription className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 uppercase tracking-wider">
                      <ArrowDownLeft className="w-3 h-3" /> Cash In
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 tabular-nums">
                      AED {dailyData.summary.cashIn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>

                {/* Cash Out */}
                <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                  <CardHeader className="p-3 pb-1">
                    <CardDescription className="text-[11px] font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1 uppercase tracking-wider">
                      <ArrowUpRight className="w-3 h-3" /> Cash Out
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-base font-bold font-mono text-rose-700 dark:text-rose-400 tabular-nums">
                      AED {dailyData.summary.cashOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>

                {/* Bank In */}
                <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                  <CardHeader className="p-3 pb-1">
                    <CardDescription className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 flex items-center gap-1 uppercase tracking-wider">
                      <ArrowDownLeft className="w-3 h-3" /> Bank In
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-base font-bold font-mono text-blue-700 dark:text-blue-400 tabular-nums">
                      AED {dailyData.summary.bankIn.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>

                {/* Bank Out */}
                <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                  <CardHeader className="p-3 pb-1">
                    <CardDescription className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 flex items-center gap-1 uppercase tracking-wider">
                      <ArrowUpRight className="w-3 h-3" /> Bank Out
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-base font-bold font-mono text-amber-700 dark:text-amber-400 tabular-nums">
                      AED {dailyData.summary.bankOut.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </CardContent>
                </Card>

                {/* Total Transactions */}
                <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs col-span-2 sm:col-span-1">
                  <CardHeader className="p-3 pb-1">
                    <CardDescription className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Transactions</CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-0">
                    <p className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                      {dailyData.summary.totalTransactions} <span className="text-[11px] font-normal text-muted-foreground">({dailyData.summary.totalEntries} lines)</span>
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Filters Bar */}
          <Card className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs print:hidden space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Preset Buttons */}
              <div className="flex items-center gap-1 text-xs">
                <span className="font-semibold text-muted-foreground mr-1 text-[11px]">Date:</span>
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
                      className={`h-8 px-3 text-xs rounded-lg font-medium ${
                        datePreset === p
                          ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                          : "bg-white dark:bg-slate-900 border-slate-200/80 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
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
                    className="h-8 text-xs w-[130px] rounded-lg border-slate-200/80"
                  />
                  <span className="text-xs text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="h-8 text-xs w-[130px] rounded-lg border-slate-200/80"
                  />
                </div>
              )}

              {/* Search Bar */}
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search by Txn No, Invoice, Ref, Account, Description..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 text-xs h-8 rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40"
                />
              </div>
            </div>

            {/* Sub-Filters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {/* Account Type Filter */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground font-semibold">Account Type</Label>
                <Select value={accountTypeFilter} onValueChange={(v) => { if (v) setAccountTypeFilter(v); }}>
                  <SelectTrigger className="h-8 text-xs rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
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
                <Label className="text-[10px] text-muted-foreground font-semibold">Transaction Type</Label>
                <Select value={referenceTypeFilter} onValueChange={(v) => { if (v) setReferenceTypeFilter(v); }}>
                  <SelectTrigger className="h-8 text-xs rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
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
                <Label className="text-[10px] text-muted-foreground font-semibold">Payment Method</Label>
                <Select value={paymentMethodFilter} onValueChange={(v) => { if (v) setPaymentMethodFilter(v); }}>
                  <SelectTrigger className="h-8 text-xs rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40">
                    <SelectValue placeholder="All Methods" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
                    <SelectItem value="cash">Cash on Hand</SelectItem>
                    <SelectItem value="bank">Bank Account</SelectItem>
                    <SelectItem value="other">Other / Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Page Size */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground font-semibold">Rows per page</Label>
                <Select value={String(dailyLimit)} onValueChange={(v) => { if (v) setDailyLimit(Number(v)); }}>
                  <SelectTrigger className="h-8 text-xs rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40">
                    <SelectValue placeholder="50" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20 rows</SelectItem>
                    <SelectItem value="50">50 rows</SelectItem>
                    <SelectItem value="100">100 rows</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>

          {/* Transactions Table */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800">
                  <TableRow className="h-10">
                    <TableHead className="text-xs font-semibold w-[90px]">Date</TableHead>
                    <TableHead className="text-xs font-semibold w-[110px]">Txn No</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[160px]">Account</TableHead>
                    <TableHead className="text-xs font-semibold w-[90px]">Type</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[180px]">Description</TableHead>
                    <TableHead className="text-xs font-semibold w-[100px]">Reference</TableHead>
                    <TableHead className="text-xs font-semibold text-right w-[110px]">Debit (AED)</TableHead>
                    <TableHead className="text-xs font-semibold text-right w-[110px]">Credit (AED)</TableHead>
                    <TableHead className="text-xs font-semibold w-[90px]">Method</TableHead>
                    <TableHead className="text-xs font-semibold w-[90px]">Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dailyLoading ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-14 text-center text-xs text-muted-foreground">
                        <RefreshCw className="w-5 h-5 mx-auto animate-spin mb-2 text-blue-600" />
                        Loading journal transactions...
                      </TableCell>
                    </TableRow>
                  ) : !dailyData || dailyData.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={10} className="py-14 text-center text-xs text-muted-foreground">
                        <FileText className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                        <p className="font-semibold text-slate-700 dark:text-slate-300">No transactions recorded for this period</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">Try selecting a broader date range or clearing filters.</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    dailyData.rows.map((row) => (
                      <TableRow key={row.entryId} className="h-12 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/80">
                        <TableCell className="text-xs font-mono text-slate-600 dark:text-slate-400">
                          {row.transactionDate}
                        </TableCell>
                        <TableCell className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-400">
                          {row.transactionNumber}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono text-[11px] font-semibold text-slate-500 mr-1.5">
                            {row.accountCode}
                          </span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {row.accountName}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <Badge variant="outline" className="text-[10px] uppercase px-1.5 py-0">
                            {row.accountType}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 dark:text-slate-300 max-w-[240px] truncate" title={row.description}>
                          {row.description}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-slate-500">
                          {row.referenceId || "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {row.debit > 0 ? row.debit.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-right font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
                          {row.credit > 0 ? row.credit.toFixed(2) : "—"}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="capitalize text-[11px] text-slate-600 dark:text-slate-400">
                            {row.paymentMethod}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 truncate max-w-[100px]">
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
              <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between text-xs text-muted-foreground print:hidden">
                <span>
                  Showing {((dailyPage - 1) * dailyLimit) + 1} to {Math.min(dailyPage * dailyLimit, dailyData.totalRows)} of {dailyData.totalRows} entries
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dailyPage <= 1}
                    onClick={() => setDailyPage((p) => Math.max(1, p - 1))}
                    className="h-7 px-2 text-xs"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 mr-0.5" /> Previous
                  </Button>
                  <span className="px-2 font-semibold">
                    Page {dailyPage} of {Math.max(1, Math.ceil(dailyData.totalRows / dailyLimit))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={dailyPage >= Math.ceil(dailyData.totalRows / dailyLimit)}
                    onClick={() => setDailyPage((p) => p + 1)}
                    className="h-7 px-2 text-xs"
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  Balance Summary as of: <span className="font-mono text-blue-600 tabular-nums">{asOfDate}</span>
                </h3>
                <p className="text-[11px] text-muted-foreground">
                  Calculated from real General Ledger transactions up to this date
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 print:hidden">
              <Label htmlFor="asOfDateInput" className="text-xs font-semibold text-muted-foreground">As of Date:</Label>
              <Input
                id="asOfDateInput"
                type="date"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
                className="h-8 text-xs w-[140px] rounded-lg border-slate-200/80"
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAsOfDate(new Date().toISOString().slice(0, 10))}
                className="h-8 text-xs rounded-lg border-slate-200/80"
              >
                Today
              </Button>

              {isOwner && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setResetAccountingOpen(true)}
                  className="h-8 text-xs gap-1.5 border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-900/60 dark:text-rose-400 dark:hover:bg-rose-950/40 rounded-lg"
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
              <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                <CardHeader className="p-3.5 pb-1">
                  <CardDescription className="text-xs flex items-center justify-between font-semibold">
                    <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Cash on Hand</span>
                    <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                      <Wallet className="w-3.5 h-3.5" />
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3.5 pt-0">
                  <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.cash.currentCashBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </CardContent>
              </Card>

              {/* Total Bank Balance */}
              <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                <CardHeader className="p-3.5 pb-1">
                  <CardDescription className="text-xs flex items-center justify-between font-semibold">
                    <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Total Bank Balance</span>
                    <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                      <Landmark className="w-3.5 h-3.5" />
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3.5 pt-0">
                  <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.bank.totalBankBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </CardContent>
              </Card>

              {/* Customer Receivables */}
              <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                <CardHeader className="p-3.5 pb-1">
                  <CardDescription className="text-xs flex items-center justify-between font-semibold">
                    <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Customer Receivables</span>
                    <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-950/50 text-cyan-600 flex items-center justify-center">
                      <Users className="w-3.5 h-3.5" />
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3.5 pt-0">
                  <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.customers.totalReceivable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {balanceData.entitySummaries.customers.customersWithBalanceCount} customers with dues
                  </p>
                </CardContent>
              </Card>

              {/* Supplier Payables */}
              <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
                <CardHeader className="p-3.5 pb-1">
                  <CardDescription className="text-xs flex items-center justify-between font-semibold">
                    <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Supplier Payables</span>
                    <div className="w-7 h-7 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 flex items-center justify-center">
                      <Truck className="w-3.5 h-3.5" />
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3.5 pt-0">
                  <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.suppliers.totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {balanceData.entitySummaries.suppliers.suppliersWithBalanceCount} suppliers pending
                  </p>
                </CardContent>
              </Card>

              {/* Worker Payables */}
              <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs col-span-2 sm:col-span-1">
                <CardHeader className="p-3.5 pb-1">
                  <CardDescription className="text-xs flex items-center justify-between font-semibold">
                    <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Worker Payables</span>
                    <div className="w-7 h-7 rounded-lg bg-purple-50 dark:bg-purple-950/50 text-purple-600 flex items-center justify-center">
                      <HardHat className="w-3.5 h-3.5" />
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3.5 pt-0">
                  <p className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100 tabular-nums">
                    AED {balanceData.entitySummaries.workers.totalPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Staff salaries &amp; advances
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Grouped Account Tables */}
          {balanceLoading ? (
            <div className="py-16 text-center text-xs text-muted-foreground">
              <RefreshCw className="w-6 h-6 mx-auto animate-spin mb-2 text-blue-600" />
              Calculating real closing balances from ledger...
            </div>
          ) : !balanceData ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              No balance summary data available.
            </div>
          ) : (
            <div className="space-y-5">
              {(["asset", "liability", "income", "expense", "equity"] as const).map((key) => {
                const group = balanceData.groups[key];
                return (
                  <div key={key} className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
                    <div className="p-3.5 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800">
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
                          <TableRow className="bg-slate-50/40 dark:bg-slate-800/40 border-b border-slate-200/80 h-10">
                            <TableHead className="text-xs font-semibold w-[100px]">Account Code</TableHead>
                            <TableHead className="text-xs font-semibold min-w-[220px]">Account Name</TableHead>
                            <TableHead className="text-xs font-semibold w-[140px]">Category</TableHead>
                            <TableHead className="text-xs font-semibold text-right w-[120px]">Opening Balance</TableHead>
                            <TableHead className="text-xs font-semibold text-right w-[120px]">Debit Activity</TableHead>
                            <TableHead className="text-xs font-semibold text-right w-[120px]">Credit Activity</TableHead>
                            <TableHead className="text-xs font-semibold text-right w-[140px]">Closing Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {group.accounts.length === 0 ? (
                            <TableRow>
                              <TableCell colSpan={7} className="text-center py-6 text-xs text-muted-foreground">
                                No accounts configured under this category.
                              </TableCell>
                            </TableRow>
                          ) : (
                            group.accounts.map((acc) => (
                              <TableRow
                                key={acc.id}
                                onClick={() => handleDrilldownAccount(acc)}
                                className="h-12 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 cursor-pointer group transition border-b border-slate-100 dark:border-slate-800/80"
                                title="Click to view detailed ledger statement"
                              >
                                <TableCell className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">
                                  {acc.accountCode}
                                </TableCell>
                                <TableCell className="text-xs font-medium text-slate-900 dark:text-slate-100 group-hover:text-blue-600 transition flex items-center justify-between">
                                  <span>{acc.accountName}</span>
                                  <Eye className="w-3 h-3 text-slate-400 opacity-0 group-hover:opacity-100 transition" />
                                </TableCell>
                                <TableCell className="text-xs text-slate-500">
                                  {acc.accountSubType}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                  {acc.openingBalance.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                  {acc.totalDebit > 0 ? acc.totalDebit.toFixed(2) : "0.00"}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-right text-slate-600 dark:text-slate-400 tabular-nums">
                                  {acc.totalCredit > 0 ? acc.totalCredit.toFixed(2) : "0.00"}
                                </TableCell>
                                <TableCell className="text-xs font-mono text-right font-bold text-slate-900 dark:text-slate-100 tabular-nums">
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
              <Card className="p-4 rounded-xl bg-slate-900 text-white shadow-xs border border-slate-800">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-semibold">Total Assets</p>
                    <p className="text-lg font-bold font-mono text-emerald-400 tabular-nums">
                      AED {balanceData.totals.totalAssets.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-semibold">Total Liabilities</p>
                    <p className="text-lg font-bold font-mono text-amber-400 tabular-nums">
                      AED {balanceData.totals.totalLiabilities.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-semibold">Net Profit (Income - Expenses)</p>
                    <p className="text-lg font-bold font-mono text-blue-400 tabular-nums">
                      AED {balanceData.totals.netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] text-slate-400 uppercase font-semibold">Total Liabilities &amp; Equity</p>
                    <p className="text-lg font-bold font-mono text-white tabular-nums">
                      AED {balanceData.totals.totalLiabilitiesAndEquity.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              </Card>
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
            <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-xs flex items-center justify-between font-semibold">
                  <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Total Cash In</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center">
                    <ArrowDownLeft className="w-4 h-4" />
                  </div>
                </CardDescription>
                <CardTitle className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
                  AED {cashFlowData?.summary.totalCashIn.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-[11px] text-muted-foreground">
                Inflows entering workshop &bull; {cashFlowData?.summary.cashInCount || 0} transactions
              </CardContent>
            </Card>

            {/* Total Cash Out */}
            <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-xs flex items-center justify-between font-semibold">
                  <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Total Cash Out</span>
                  <div className="w-8 h-8 rounded-lg bg-rose-50 dark:bg-rose-950/50 text-rose-600 flex items-center justify-center">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </CardDescription>
                <CardTitle className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums mt-1">
                  AED {cashFlowData?.summary.totalCashOut.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-[11px] text-muted-foreground">
                Outflows leaving workshop &bull; {cashFlowData?.summary.cashOutCount || 0} transactions
              </CardContent>
            </Card>

            {/* Net Cash Flow */}
            <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-xs flex items-center justify-between font-semibold">
                  <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Net Cash Flow</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/50 text-blue-600 flex items-center justify-center">
                    <Scale className="w-4 h-4" />
                  </div>
                </CardDescription>
                <CardTitle className={`text-2xl font-bold font-mono tabular-nums mt-1 ${(cashFlowData?.summary.netCashFlow || 0) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-rose-600"}`}>
                  {(cashFlowData?.summary.netCashFlow || 0) >= 0 ? "+" : ""}AED {cashFlowData?.summary.netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-[11px] text-muted-foreground">
                Formula: Cash In - Cash Out
              </CardContent>
            </Card>

            {/* Internal Transfers */}
            <Card className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs">
              <CardHeader className="p-4 pb-1">
                <CardDescription className="text-xs flex items-center justify-between font-semibold">
                  <span className="text-slate-600 dark:text-slate-400 uppercase tracking-wider text-[11px]">Internal Transfers</span>
                  <div className="w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 flex items-center justify-center">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                </CardDescription>
                <CardTitle className="text-2xl font-bold font-mono text-slate-800 dark:text-slate-200 tabular-nums mt-1">
                  AED {cashFlowData?.summary.totalInternalTransfers.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-1 text-[11px] text-muted-foreground">
                Excluded from Net &bull; {cashFlowData?.summary.internalTransferCount || 0} account movements
              </CardContent>
            </Card>
          </div>

          {/* Filter Bar */}
          <Card className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs print:hidden space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1 text-[11px]">
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
                    className={`text-xs h-8 px-3 rounded-lg font-medium ${
                      cfDatePreset === p.id
                        ? "bg-blue-600 hover:bg-blue-700 text-white shadow-xs"
                        : "bg-white dark:bg-slate-900 border-slate-200/80 text-slate-700 dark:text-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>

              <div className="text-xs text-muted-foreground font-mono bg-slate-50 dark:bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-200/60">
                {cashFlowData?.dateRange.startDate} to {cashFlowData?.dateRange.endDate}
              </div>
            </div>

            {/* Custom Date Pickers & Dropdown Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
              {/* Start Date */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground font-semibold">Start Date</Label>
                <Input
                  type="date"
                  value={cfStartDate}
                  disabled={cfDatePreset !== "custom"}
                  onChange={(e) => {
                    setCfStartDate(e.target.value);
                    if (cfDatePreset !== "custom") setCfDatePreset("custom");
                  }}
                  className="text-xs h-8 rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40"
                />
              </div>

              {/* End Date */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground font-semibold">End Date</Label>
                <Input
                  type="date"
                  value={cfEndDate}
                  disabled={cfDatePreset !== "custom"}
                  onChange={(e) => {
                    setCfEndDate(e.target.value);
                    if (cfDatePreset !== "custom") setCfDatePreset("custom");
                  }}
                  className="text-xs h-8 rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40"
                />
              </div>

              {/* Cash Flow Type */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground font-semibold">Cash Flow Type</Label>
                <Select value={cfTypeFilter} onValueChange={(val) => { if (val) setCfTypeFilter(val); }}>
                  <SelectTrigger className="text-xs h-8 rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40">
                    <SelectValue placeholder="All Flow Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All Types</SelectItem>
                    <SelectItem value="cash_in" className="text-xs">Cash In (Inflows)</SelectItem>
                    <SelectItem value="cash_out" className="text-xs">Cash Out (Outflows)</SelectItem>
                    <SelectItem value="internal_transfer" className="text-xs">Internal Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Account Filter */}
              <div className="space-y-1">
                <Label className="text-[10px] text-muted-foreground font-semibold">Account</Label>
                <Select value={cfAccountFilter} onValueChange={(val) => { if (val) setCfAccountFilter(val); }}>
                  <SelectTrigger className="text-xs h-8 rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40">
                    <SelectValue placeholder="All Accounts" />
                  </SelectTrigger>
                  <SelectContent className="max-h-56">
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
              <Search className="absolute left-2.5 top-3.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search by Transaction No, Reference, Description, Account..."
                value={cfSearchQuery}
                onChange={(e) => setCfSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8 rounded-lg border-slate-200/80 bg-slate-50/50 dark:bg-slate-800/40"
              />
            </div>
          </Card>

          {/* Cash Flow Table */}
          <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
            <div className="p-3.5 border-b border-slate-200/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/60 flex items-center justify-between">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Cash Flow Records ({cashFlowData?.rows.length || 0})
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                Operating Net: <strong className={(cashFlowData?.summary.netCashFlow || 0) >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  AED {cashFlowData?.summary.netCashFlow.toLocaleString(undefined, { minimumFractionDigits: 2 }) || "0.00"}
                </strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/40 dark:bg-slate-800/40 border-b border-slate-200/80 h-10">
                    <TableHead className="text-xs font-semibold w-[95px]">Date</TableHead>
                    <TableHead className="text-xs font-semibold w-[120px]">Transaction No</TableHead>
                    <TableHead className="text-xs font-semibold w-[120px]">Cash Flow Type</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[150px]">From Account</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[150px]">To Account</TableHead>
                    <TableHead className="text-xs font-semibold min-w-[180px]">Description</TableHead>
                    <TableHead className="text-xs font-semibold text-right w-[110px]">Amount (AED)</TableHead>
                    <TableHead className="text-xs font-semibold w-[100px]">Reference</TableHead>
                    <TableHead className="text-xs font-semibold w-[95px]">Created By</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cashFlowLoading ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-14 text-xs text-muted-foreground">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600" />
                        Loading cash flow report...
                      </TableCell>
                    </TableRow>
                  ) : !cashFlowData || cashFlowData.rows.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-14 text-xs text-muted-foreground">
                        <ArrowRightLeft className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
                        <p className="font-semibold text-slate-700 dark:text-slate-300">No cash flow transactions found</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Try adjusting the date preset, cash flow type, or search filter.
                        </p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    cashFlowData.rows.map((row) => (
                      <TableRow key={row.id} className="h-12 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 border-b border-slate-100 dark:border-slate-800/80">
                        <TableCell className="text-xs font-mono text-muted-foreground">{row.date}</TableCell>
                        <TableCell className="text-xs font-mono font-bold text-blue-600 dark:text-blue-400">
                          {row.transactionNumber}
                        </TableCell>
                        <TableCell>
                          {row.cashFlowType === "cash_in" ? (
                            <Badge variant="outline" className="text-[10px] font-semibold border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40">
                              Cash In
                            </Badge>
                          ) : row.cashFlowType === "cash_out" ? (
                            <Badge variant="outline" className="text-[10px] font-semibold border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40">
                              Cash Out
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] font-semibold border-blue-300 text-blue-700 bg-blue-50 dark:bg-blue-950/40">
                              Internal Transfer
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono text-[10px] text-slate-400 mr-1">{row.fromAccount.code}</span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">{row.fromAccount.name}</span>
                        </TableCell>
                        <TableCell className="text-xs">
                          <span className="font-mono text-[10px] text-slate-400 mr-1">{row.toAccount.code}</span>
                          <span className="font-medium text-slate-900 dark:text-slate-100">{row.toAccount.name}</span>
                        </TableCell>
                        <TableCell className="text-xs text-slate-700 dark:text-slate-300 max-w-[220px] truncate" title={row.description}>
                          {row.description}
                        </TableCell>
                        <TableCell className="text-right text-xs font-mono font-bold text-slate-900 dark:text-slate-100 tabular-nums">
                          {row.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-xs font-mono text-muted-foreground">{row.reference || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground truncate max-w-[95px]">{row.createdBy}</TableCell>
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
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {activeStatement && (
            <div className="space-y-4">
              <div className="flex items-start justify-between border-b pb-3">
                <div>
                  <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    <span>{activeStatement.account.account_code} - {activeStatement.account.account_name}</span>
                    <Badge variant="outline" className="text-xs uppercase font-normal">
                      {activeStatement.account.account_type}
                    </Badge>
                  </DialogTitle>
                  <DialogDescription className="text-xs mt-0.5">
                    Sub-type: {activeStatement.account.account_sub_type} &bull; Generated from General Ledger
                  </DialogDescription>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Current Balance</p>
                  <p className="text-lg font-bold font-mono text-blue-700">
                    AED {activeStatement.closing_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </div>

              {/* Statement summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Opening Balance</p>
                  <p className="text-sm font-bold font-mono">AED {activeStatement.opening_balance.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Total Debits</p>
                  <p className="text-sm font-bold font-mono text-emerald-600">+AED {activeStatement.total_debit.toFixed(2)}</p>
                </div>
                <div className="p-3 bg-slate-50 rounded-lg border">
                  <p className="text-xs text-muted-foreground">Total Credits</p>
                  <p className="text-sm font-bold font-mono text-rose-600">-AED {activeStatement.total_credit.toFixed(2)}</p>
                </div>
              </div>

              {/* Statement Ledger lines */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-50">
                    <TableRow>
                      <TableHead className="text-xs font-semibold w-[90px]">Date</TableHead>
                      <TableHead className="text-xs font-semibold w-[110px]">Txn No</TableHead>
                      <TableHead className="text-xs font-semibold">Description</TableHead>
                      <TableHead className="text-xs font-semibold text-right w-[95px]">Debit (AED)</TableHead>
                      <TableHead className="text-xs font-semibold text-right w-[95px]">Credit (AED)</TableHead>
                      <TableHead className="text-xs font-semibold text-right w-[110px]">Balance (AED)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeStatement.lines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-xs text-muted-foreground">
                          No transactions found for this account.
                        </TableCell>
                      </TableRow>
                    ) : (
                      activeStatement.lines.map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs font-mono">{line.date}</TableCell>
                          <TableCell className="text-xs font-mono font-medium text-blue-600">{line.transaction_number}</TableCell>
                          <TableCell className="text-xs">
                            <span className="font-medium">{line.description}</span>
                            {line.reference_id && (
                              <span className="ml-1 text-muted-foreground font-mono text-[10px]">({line.reference_id})</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-right font-medium">
                            {line.debit > 0 ? line.debit.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-right font-medium">
                            {line.credit > 0 ? line.credit.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-right font-bold text-slate-800">
                            {line.running_balance.toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setStatementDialogOpen(false)}>
                  Close
                </Button>
                <Button size="sm" onClick={handlePrint} className="gap-1.5 bg-blue-600 text-white">
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
        <DialogContent className="max-w-md p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 bg-rose-100 dark:bg-rose-950/60 rounded-full">
                <AlertTriangle className="w-6 h-6 text-rose-600" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Reset ATIQ JEHAN Financial Reports?
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Clear test data and reset financial registers to clean zero
                </DialogDescription>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-lg border text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Target Workspace:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">ATIQ JEHAN AUTO REPAIR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Scope:</span>
                <span className="text-slate-700 dark:text-slate-300">Balance Summary, Cash Flow, General Ledger</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Other Workspaces:</span>
                <span className="text-emerald-600 font-medium">100% Protected & Isolated</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
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
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmResetAccounting}
                disabled={isResettingAccounting}
                className="bg-rose-600 hover:bg-rose-700 text-white font-medium"
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
