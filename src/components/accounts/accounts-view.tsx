"use client";

import React, { useState, useEffect, useTransition } from "react";
import { usePermissions } from "@/lib/context/auth-context";
import {
  getLedgerAccounts,
  getAccountDashboardMetrics,
  getAccountLedgerStatement,
  getCustomerLedgerStatement,
  getSupplierLedgerStatement,
  getWorkerLedgerStatement,
  getWorkers,
  getBankAccounts,
  createLedgerAccount,
  updateLedgerAccount,
  archiveLedgerAccount,
  createWorker,
  createBankAccount,
  postTransaction,
  postWorkerSalaryDue,
  postWorkerPayment,
  postWorkerAdvance,
  postOwnerTransaction,
  getLocalLedgerTransactions,
  getLocalEntries,
  AccountDashboardMetrics,
  AccountLedgerStatement,
  searchAccountsAndLedger,
  type LedgerSearchFilter,
  type LedgerSearchResult,
  postMoneyTransfer,
  reverseMoneyTransfer,
  postAccountEntry,
  reverseLedgerTransaction,
  getSourceModuleLabel,
  type PostAccountEntryParams,
  type LedgerStatementLine,
  getTransferHistory,
  getNextTransferNumber,
  isEligibleTransferAccount,
  getCashFlowSummary,
  getAllTransferrableAccounts,
  type TransferrableAccountItem,
  type CashFlowSummary,
  type CashFlowType,
  type DifferenceHandling,
  type TransferHistoryItem,
  deleteLedgerTransaction,
  bulkDeleteLedgerTransactions,
  deleteCustomLedgerAccount,
  resetAllLedgerData,
  PROTECTED_ACCOUNT_CODES,
} from "@/lib/services/ledger-service";
import { Checkbox } from "@/components/ui/checkbox";
import { PageHeader } from "@/components/shared/page-header";
import { getCustomers } from "@/lib/services/customer-service";
import { getSuppliers } from "@/lib/services/supplier-service";
import {
  LedgerAccount,
  LedgerTransaction,
  Worker,
  BankAccount,
  AccountType,
} from "@/types/database";
import {
  ACCOUNT_TYPES,
  DEFAULT_ACCOUNT_SUB_TYPES,
} from "@/lib/constants";
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
  BookOpen,
  LayoutDashboard,
  Wallet,
  Building2,
  Users,
  Truck,
  HardHat,
  Landmark,
  UserCheck,
  FileSpreadsheet,
  Plus,
  Search,
  RefreshCw,
  Printer,
  ChevronRight,
  ArrowUpRight,
  ArrowDownLeft,
  DollarSign,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  X,
  ShieldCheck,
  Edit,
  Trash2,
  Archive,
  Eye,
  Info,
  ArrowRightLeft,
  RotateCcw,
  Scale,
  Download,
} from "lucide-react";

const SEARCH_FILTERS: { id: LedgerSearchFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "customers", label: "Customers" },
  { id: "suppliers", label: "Suppliers" },
  { id: "workers", label: "Workers" },
  { id: "banks", label: "Banks" },
  { id: "owner", label: "Owner/Admin" },
  { id: "asset", label: "Asset" },
  { id: "liability", label: "Liability" },
  { id: "income", label: "Income" },
  { id: "expense", label: "Expense" },
  { id: "equity", label: "Equity" },
];

export function AccountsView() {
  const { user, role, isOwner, isManager, isViewer, canDelete: authCanDelete, canEdit: authCanEdit } = usePermissions();
  const canManageAccounts = isOwner || role === "admin";
  const canEdit = !isViewer && (authCanEdit || canManageAccounts);
  const canTransfer = !isViewer && (isOwner || role === "admin" || (isManager && canEdit));
  const canDeleteEntry = isOwner || role === "admin" || Boolean((user?.permissions as any)?.accounting?.can_delete_entry);
  const canBulkDeleteEntry = isOwner || role === "admin" || Boolean((user?.permissions as any)?.accounting?.can_bulk_delete_entry);

  const [selectedTxnIds, setSelectedTxnIds] = useState<string[]>([]);
  const [deleteEntryOpen, setDeleteEntryOpen] = useState(false);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [txnToDelete, setTxnToDelete] = useState<any>(null);
  const [isDeletingTxn, setIsDeletingTxn] = useState(false);
  const [resetAccountingOpen, setResetAccountingOpen] = useState(false);
  const [isResettingAccounting, setIsResettingAccounting] = useState(false);

  const [activeTab, setActiveTab] = useState("dashboard");
  const [metrics, setMetrics] = useState<AccountDashboardMetrics>({
    cashBalance: 0,
    totalBankBalance: 0,
    customerReceivables: 0,
    supplierPayables: 0,
    workerPayables: 0,
    totalExpensesThisMonth: 0,
    totalIncomeThisMonth: 0,
    ownerCapital: 0,
    netCashFlow: 0,
  });

  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState("all");
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // ─── Fast Global Universal Search State ─────────────────────────────────────
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [searchFilter, setSearchFilter] = useState<LedgerSearchFilter>("all");
  const [searchResults, setSearchResults] = useState<LedgerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  // Debounce global search query by 280ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(globalSearchQuery);
    }, 280);
    return () => clearTimeout(timer);
  }, [globalSearchQuery]);

  // Execute fast search across all accounts & ledger entities
  useEffect(() => {
    let isMounted = true;
    if (!debouncedSearchQuery.trim() || debouncedSearchQuery.trim().length < 2) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    searchAccountsAndLedger({
      query: debouncedSearchQuery,
      filter: searchFilter,
      limit: 20,
      dataContext: {
        accounts,
        customers,
        suppliers,
        workers,
        bankAccounts,
        transactions,
      },
    })
      .then((res) => {
        if (isMounted) {
          setSearchResults(res);
          setIsSearching(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          console.error("Fast search error:", err);
          setIsSearching(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [debouncedSearchQuery, searchFilter, accounts, customers, suppliers, workers, bankAccounts, transactions]);

  // ─── Dialog States ────────────────────────────────────────────────────────
  // Statement Modal
  const [statementDialogOpen, setStatementDialogOpen] = useState(false);
  const [activeStatement, setActiveStatement] = useState<AccountLedgerStatement | null>(null);
  const [statementDateFilter, setStatementDateFilter] = useState("all");
  const [statementCustomStart, setStatementCustomStart] = useState("");
  const [statementCustomEnd, setStatementCustomEnd] = useState("");
  const [statementSearchQuery, setStatementSearchQuery] = useState("");

  // Add Account Entry Modal State
  const [addEntryOpen, setAddEntryOpen] = useState(false);
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [entryAccountId, setEntryAccountId] = useState("");
  const [entryType, setEntryType] = useState<"money_in" | "money_out" | "debit" | "credit" | "adjustment" | "opening_balance_adjustment">("money_in");
  const [entryAmount, setEntryAmount] = useState("");
  const [entryCounterAccountId, setEntryCounterAccountId] = useState("");
  const [entryCounterSearch, setEntryCounterSearch] = useState("");
  const [entryCounterSelectorOpen, setEntryCounterSelectorOpen] = useState(false);
  const [entryRef, setEntryRef] = useState("");
  const [entryRemarks, setEntryRemarks] = useState("");
  const [entryPaymentMethod, setEntryPaymentMethod] = useState("Cash");
  const [entryNotes, setEntryNotes] = useState("");
  const [entrySubmitting, setEntrySubmitting] = useState(false);

  // Transaction Details Modal State
  const [txnDetailsOpen, setTxnDetailsOpen] = useState(false);
  const [activeTxnDetails, setActiveTxnDetails] = useState<LedgerStatementLine | null>(null);

  // Transaction Reversal Modal State
  const [txnReversalOpen, setTxnReversalOpen] = useState(false);
  const [txnToReverse, setTxnToReverse] = useState<LedgerStatementLine | null>(null);
  const [txnReversalReason, setTxnReversalReason] = useState("");
  const [txnReversing, setTxnReversing] = useState(false);

  // Print Ledger Modal State
  const [printLedgerOpen, setPrintLedgerOpen] = useState(false);

  // Customer Statement Modal
  const [customerStmtOpen, setCustomerStmtOpen] = useState(false);
  const [customerStmtData, setCustomerStmtData] = useState<any | null>(null);

  // Supplier Statement Modal
  const [supplierStmtOpen, setSupplierStmtOpen] = useState(false);
  const [supplierStmtData, setSupplierStmtData] = useState<any | null>(null);

  // Worker Statement Modal
  const [workerStmtOpen, setWorkerStmtOpen] = useState(false);
  const [workerStmtData, setWorkerStmtData] = useState<any | null>(null);

  // Add Account Modal
  const [newAccountOpen, setNewAccountOpen] = useState(false);
  const [accCode, setAccCode] = useState("");
  const [accName, setAccName] = useState("");
  const [accType, setAccType] = useState<AccountType>("expense");
  const [accSubType, setAccSubType] = useState("Miscellaneous Expense");
  const [accOpeningBal, setAccOpeningBal] = useState("0");
  const [accNotes, setAccNotes] = useState("");

  // Add Worker Modal
  const [newWorkerOpen, setNewWorkerOpen] = useState(false);
  const [workerName, setWorkerName] = useState("");
  const [workerPhone, setWorkerPhone] = useState("");
  const [workerRole, setWorkerRole] = useState("Mechanic");
  const [workerSalary, setWorkerSalary] = useState("3000");

  // Record Worker Salary Due Modal
  const [workerSalaryDueOpen, setWorkerSalaryDueOpen] = useState(false);
  const [selectedWorkerId, setSelectedWorkerId] = useState("");
  const [salaryDueAmount, setSalaryDueAmount] = useState("");
  const [salaryDuePeriod, setSalaryDuePeriod] = useState("Current Month Salary");

  // Record Worker Payment Modal
  const [workerPayOpen, setWorkerPayOpen] = useState(false);
  const [workerPayAmount, setWorkerPayAmount] = useState("");
  const [workerPayMethod, setWorkerPayMethod] = useState("cash");
  const [workerPayBankId, setWorkerPayBankId] = useState("");
  const [workerPayNotes, setWorkerPayNotes] = useState("");

  // Worker Advance Modal
  const [workerAdvanceOpen, setWorkerAdvanceOpen] = useState(false);
  const [advanceWorkerId, setAdvanceWorkerId] = useState("");
  const [advanceAmount, setAdvanceAmount] = useState("");
  const [advanceMethod, setAdvanceMethod] = useState<"cash" | "bank">("cash");
  const [advanceBankId, setAdvanceBankId] = useState("");
  const [advanceNotes, setAdvanceNotes] = useState("");

  // ─── Transfer Money Modal State (2-Step System) ───────────────────────────
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferCashFlowType, setTransferCashFlowType] = useState<CashFlowType>("internal_transfer");
  const [transferNumberPreview, setTransferNumberPreview] = useState("TRF-000001");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10));
  const [transferRef, setTransferRef] = useState("");
  const [transferNotes, setTransferNotes] = useState("");
  const [transferAllowNegative, setTransferAllowNegative] = useState(false);
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [transferrableAccounts, setTransferrableAccounts] = useState<TransferrableAccountItem[]>([]);

  // Step 1: Payable Account
  const [transferFromId, setTransferFromId] = useState("");
  const [payableAmount, setPayableAmount] = useState("");
  const [payableRemarks, setPayableRemarks] = useState("");
  const [payableSearchQuery, setPayableSearchQuery] = useState("");
  const [payableSelectorOpen, setPayableSelectorOpen] = useState(false);

  // Step 2: Receivable Account
  const [transferToId, setTransferToId] = useState("");
  const [receivableAmount, setReceivableAmount] = useState("");
  const [receivableRemarks, setReceivableRemarks] = useState("");
  const [receivableSearchQuery, setReceivableSearchQuery] = useState("");
  const [receivableSelectorOpen, setReceivableSelectorOpen] = useState(false);
  const [receivableManuallyEdited, setReceivableManuallyEdited] = useState(false);

  // Step 3: Optional Saving / Difference Account
  const [transferSavingId, setTransferSavingId] = useState("");
  const [savingAmount, setSavingAmount] = useState("");
  const [savingRemarks, setSavingRemarks] = useState("");
  const [savingSearchQuery, setSavingSearchQuery] = useState("");
  const [savingSelectorOpen, setSavingSelectorOpen] = useState(false);

  // Difference Handling Option
  const [differenceHandlingOption, setDifferenceHandlingOption] = useState<"saving_account" | "receivable_account" | "payable_account">("saving_account");
  const [differenceHandling, setDifferenceHandling] = useState<DifferenceHandling>("saving_account");
  // Backward compatibility alias
  const transferAmount = receivableAmount || payableAmount;
  const transferFee = Number(payableAmount) > Number(receivableAmount) ? String(Math.round((Number(payableAmount) - Number(receivableAmount)) * 100) / 100) : "";

  // Cash Flow Summary State
  const [cashFlowSummary, setCashFlowSummary] = useState<CashFlowSummary>({
    cashInToday: 0,
    cashOutToday: 0,
    netCashFlowToday: 0,
    cashInThisMonth: 0,
    cashOutThisMonth: 0,
    netCashFlowThisMonth: 0,
  });

  // Transfer History State
  const [transferHistoryList, setTransferHistoryList] = useState<TransferHistoryItem[]>([]);
  const [transferHistoryLoading, setTransferHistoryLoading] = useState(false);
  const [transferHistorySearch, setTransferHistorySearch] = useState("");

  // Transfer Voucher Modal State
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [activeVoucher, setActiveVoucher] = useState<TransferHistoryItem | null>(null);

  // Transfer Reversal State
  const [reversalDialogOpen, setReversalDialogOpen] = useState(false);
  const [transferToReverse, setTransferToReverse] = useState<TransferHistoryItem | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversingTransfer, setReversingTransfer] = useState(false);

  // Record Worker Advance Modal
  const [workerAdvOpen, setWorkerAdvOpen] = useState(false);
  const [workerAdvAmount, setWorkerAdvAmount] = useState("");
  const [workerAdvMethod, setWorkerAdvMethod] = useState("cash");
  const [workerAdvNotes, setWorkerAdvNotes] = useState("");

  // Add Bank Account Modal
  const [newBankOpen, setNewBankOpen] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankAccName, setBankAccName] = useState("");
  const [bankLastDigits, setBankLastDigits] = useState("");
  const [bankOpeningBal, setBankOpeningBal] = useState("0");

  // Owner Transaction Modal
  const [ownerTxnOpen, setOwnerTxnOpen] = useState(false);
  const [ownerTxnType, setOwnerTxnType] = useState<"capital" | "drawings" | "advance" | "reimbursement">("capital");
  const [ownerTxnAmount, setOwnerTxnAmount] = useState("");
  const [ownerTxnMethod, setOwnerTxnMethod] = useState<"cash" | "bank">("bank");
  const [ownerTxnBankId, setOwnerTxnBankId] = useState("");
  const [ownerTxnDesc, setOwnerTxnDesc] = useState("");

  // Manual Journal Modal
  const [journalOpen, setJournalOpen] = useState(false);
  const [journalDate, setJournalDate] = useState(new Date().toISOString().slice(0, 10));
  const [journalDesc, setJournalDesc] = useState("");
  const [journalRows, setJournalRows] = useState<
    { accountId: string; debit: string; credit: string; notes: string }[]
  >([
    { accountId: "", debit: "", credit: "", notes: "" },
    { accountId: "", debit: "", credit: "", notes: "" },
  ]);

  // Load all data
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [m, a, w, b, c, s, tHistory, cfSummary, allTransferAccs] = await Promise.all([
        getAccountDashboardMetrics(),
        getLedgerAccounts(),
        getWorkers(),
        getBankAccounts(),
        getCustomers(),
        getSuppliers(),
        getTransferHistory(),
        getCashFlowSummary(),
        getAllTransferrableAccounts(),
      ]);
      setMetrics(m);
      setAccounts(a);
      setTransferrableAccounts(allTransferAccs || []);
      setWorkers(w);
      setBankAccounts(b);
      setCustomers(c?.customers || (Array.isArray(c) ? c : []));
      setSuppliers(s?.suppliers || (Array.isArray(s) ? s : []));
      setTransferHistoryList(tHistory || []);
      setCashFlowSummary(cfSummary || {
        cashInToday: 0,
        cashOutToday: 0,
        netCashFlowToday: 0,
        cashInThisMonth: 0,
        cashOutThisMonth: 0,
        netCashFlowThisMonth: 0,
      });
      setTransactions(getLocalLedgerTransactions());
    } catch (err: any) {
      console.error("Failed to load accounts data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  useEffect(() => {
    if (transferOpen) {
      getNextTransferNumber()
        .then((num) => {
          if (num) setTransferNumberPreview(num);
        })
        .catch(() => {});
      getAllTransferrableAccounts()
        .then((accs) => {
          if (accs && accs.length > 0) setTransferrableAccounts(accs);
        })
        .catch(() => {});
    }
  }, [transferOpen]);

  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // ─── Universal Account Ledger & Entry Handlers ────────────────────────────

  const handleOpenAccountLedger = async (accountOrItem: any) => {
    try {
      let targetId = accountOrItem.id || accountOrItem.account_id;
      // If it's a bank account object:
      if (accountOrItem.bank_name) {
        const matchingAcc = accounts.find(
          (a) => a.related_entity_id === accountOrItem.id || a.account_name.includes(accountOrItem.bank_name)
        );
        if (matchingAcc) targetId = matchingAcc.id;
      }
      // If customer:
      if (accountOrItem.name && !accountOrItem.account_type && !accountOrItem.job_position) {
        const matchingAcc = accounts.find(
          (a) => a.related_entity_id === accountOrItem.id && a.related_entity_type === "customer"
        );
        if (matchingAcc) targetId = matchingAcc.id;
      }
      // If supplier:
      if (accountOrItem.name && (accountOrItem.trn !== undefined || accountOrItem.tax_number !== undefined)) {
        const matchingAcc = accounts.find(
          (a) => a.related_entity_id === accountOrItem.id && a.related_entity_type === "supplier"
        );
        if (matchingAcc) targetId = matchingAcc.id;
      }

      const stmt = await getAccountLedgerStatement(targetId);
      setActiveStatement(stmt);
      setStatementDateFilter("all");
      setStatementSearchQuery("");
      setStatementCustomStart("");
      setStatementCustomEnd("");
      setSelectedTxnIds([]);
      setStatementDialogOpen(true);
    } catch (e: any) {
      showToast(e.message || "Failed to load account ledger statement", "error");
    }
  };

  const handleOpenAccountStatement = handleOpenAccountLedger;

  const handleOpenAddEntryModal = (accountOrItem?: any) => {
    let accId = "";
    let defaultType: "money_in" | "money_out" | "debit" | "credit" = "money_in";
    let defaultCounterId = "";

    const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
    const bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];

    if (accountOrItem) {
      if (accountOrItem.bank_name) {
        const m = accounts.find(
          (a) => a.related_entity_id === accountOrItem.id || a.account_name.includes(accountOrItem.bank_name)
        );
        accId = m ? m.id : accountOrItem.id;
        defaultType = "money_in";
        defaultCounterId = cashAcc?.id || "";
      } else if (accountOrItem.account_type === "expense") {
        accId = accountOrItem.id;
        defaultType = "money_out";
        defaultCounterId = cashAcc?.id || bankAcc?.id || "";
      } else if (accountOrItem.related_entity_type === "supplier" || accountOrItem.account_sub_type === "Supplier Payable") {
        accId = accountOrItem.id;
        defaultType = "money_out";
        defaultCounterId = bankAcc?.id || cashAcc?.id || "";
      } else if (accountOrItem.related_entity_type === "customer" || accountOrItem.account_sub_type === "Customer Receivable") {
        accId = accountOrItem.id;
        defaultType = "money_in";
        defaultCounterId = cashAcc?.id || bankAcc?.id || "";
      } else if (accountOrItem.id) {
        accId = accountOrItem.id;
        defaultType = accountOrItem.account_type === "expense" ? "money_out" : "money_in";
        defaultCounterId = (accId === cashAcc?.id ? bankAcc?.id : cashAcc?.id) || "";
      }
    } else {
      accId = cashAcc?.id || "";
      defaultCounterId = bankAcc?.id || "";
    }

    setEntryDate(new Date().toISOString().slice(0, 10));
    setEntryAccountId(accId);
    setEntryType(defaultType);
    setEntryAmount("");
    setEntryCounterAccountId(defaultCounterId);
    setEntryCounterSearch("");
    setEntryCounterSelectorOpen(false);
    setEntryRef("");
    setEntryRemarks("");
    setEntryPaymentMethod("Cash");
    setEntryNotes("");
    setAddEntryOpen(true);
  };

  const handleExecuteAddEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryAccountId || !entryCounterAccountId) {
      showToast("Please select both Primary Account and Counter Account.", "error");
      return;
    }
    if (entryAccountId === entryCounterAccountId) {
      showToast("Primary Account and Counter Account cannot be the same.", "error");
      return;
    }
    const num = Number(entryAmount) || 0;
    if (num <= 0) {
      showToast("Amount must be greater than zero.", "error");
      return;
    }
    if (!entryRemarks.trim()) {
      showToast("Please enter a Description / Remarks for this entry.", "error");
      return;
    }

    setEntrySubmitting(true);
    try {
      const res = await postAccountEntry({
        date: entryDate,
        account_id: entryAccountId,
        counter_account_id: entryCounterAccountId,
        entry_type: entryType,
        amount: num,
        reference_number: entryRef.trim() || undefined,
        description: entryRemarks.trim(),
        payment_method: entryPaymentMethod,
        notes: entryNotes.trim() || undefined,
        created_by: user?.full_name || (isOwner ? "Owner" : "Admin"),
      });

      showToast(`Entry ${res.transaction.transaction_number} of AED ${num.toFixed(2)} posted successfully! Both ledgers updated.`);
      setAddEntryOpen(false);

      // Refresh data
      await loadAllData();

      // If active statement is open, refresh it so running balance is immediately updated
      if (activeStatement) {
        const updatedStmt = await getAccountLedgerStatement(activeStatement.account.id);
        setActiveStatement(updatedStmt);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to post account entry", "error");
    } finally {
      setEntrySubmitting(false);
    }
  };

  const handleExecuteTransactionReversal = async () => {
    if (!txnToReverse) return;
    setTxnReversing(true);
    try {
      const res = await reverseLedgerTransaction({
        transactionNumberOrId: txnToReverse.transaction_number,
        reason: txnReversalReason.trim() || undefined,
        reversed_by: user?.full_name || (isOwner ? "Owner" : "Admin"),
      });

      showToast(`Transaction ${txnToReverse.transaction_number} reversed successfully! Reversal ${res.transaction_number} posted.`);
      setTxnReversalOpen(false);
      setTxnToReverse(null);
      setTxnReversalReason("");
      setTxnDetailsOpen(false);

      await loadAllData();

      if (activeStatement) {
        const updatedStmt = await getAccountLedgerStatement(activeStatement.account.id);
        setActiveStatement(updatedStmt);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to reverse transaction", "error");
    } finally {
      setTxnReversing(false);
    }
  };

  const handleOpenCustomerStatement = async (cust: any) => {
    handleOpenAccountLedger(cust);
  };

  const handleOpenSupplierStatement = async (supp: any) => {
    handleOpenAccountLedger(supp);
  };

  const handleOpenWorkerStatement = async (worker: Worker) => {
    handleOpenAccountLedger(worker);
  };

  const handleSelectSearchResult = (result: LedgerSearchResult) => {
    setIsSearchOpen(false);

    if (result.related_entity_type === "customer") {
      const cust = customers.find((c) => c.id === result.related_entity_id) || result.raw;
      if (cust) {
        handleOpenCustomerStatement(cust);
      }
    } else if (result.related_entity_type === "supplier") {
      const supp = suppliers.find((s) => s.id === result.related_entity_id) || result.raw;
      if (supp) {
        handleOpenSupplierStatement(supp);
      }
    } else if (result.related_entity_type === "worker") {
      const w = workers.find((item) => item.id === result.related_entity_id) || result.raw;
      if (w) {
        handleOpenWorkerStatement(w);
      }
    } else if (result.related_entity_type === "bank") {
      const linkedAcc = accounts.find(
        (a) => a.account_sub_type === "Bank" && (a.id === result.related_entity_id || a.account_code === result.account_code)
      );
      if (linkedAcc) {
        handleOpenAccountStatement(linkedAcc);
      } else {
        setActiveTab("banks");
      }
    } else if (result.related_entity_type === "owner") {
      const ownerAcc =
        accounts.find((a) => a.id === result.related_entity_id || a.account_code === result.account_code) ||
        accounts.find((a) => a.account_code === "3001") ||
        result.raw;
      if (ownerAcc && ownerAcc.account_code) {
        handleOpenAccountStatement(ownerAcc);
      } else {
        setActiveTab("owner");
      }
    } else if (result.related_entity_type === "transaction") {
      setActiveTab("journal");
      setSearchQuery(result.account_code);
    } else {
      // ledger_account
      const acc = accounts.find((a) => a.id === result.related_entity_id) || result.raw;
      if (acc) {
        handleOpenAccountStatement(acc);
      }
    }
  };

  const getTypeBadgeClass = (relatedType: string, accountType: string) => {
    const norm = (accountType || "").toLowerCase();
    if (relatedType === "customer") return "border-blue-300 text-blue-700 bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:bg-blue-950/40";
    if (relatedType === "supplier") return "border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-950/40";
    if (relatedType === "worker") return "border-purple-300 text-purple-700 bg-purple-50 dark:border-purple-700 dark:text-purple-300 dark:bg-purple-950/40";
    if (relatedType === "bank") return "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:bg-emerald-950/40";
    if (relatedType === "owner") return "border-violet-300 text-violet-700 bg-violet-50 dark:border-violet-700 dark:text-violet-300 dark:bg-violet-950/40";
    if (norm.includes("expense")) return "border-rose-300 text-rose-700 bg-rose-50 dark:border-rose-700 dark:text-rose-300 dark:bg-rose-950/40";
    if (norm.includes("income")) return "border-emerald-300 text-emerald-700 bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:bg-emerald-950/40";
    if (norm.includes("asset")) return "border-cyan-300 text-cyan-700 bg-cyan-50 dark:border-cyan-700 dark:text-cyan-300 dark:bg-cyan-950/40";
    if (norm.includes("liability")) return "border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-950/40";
    return "border-slate-300 text-slate-700 bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:bg-slate-800";
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createLedgerAccount({
        account_code: accCode.trim(),
        account_name: accName.trim(),
        account_type: accType,
        account_sub_type: accSubType,
        related_entity_type: "none",
        related_entity_id: null,
        opening_balance: Number(accOpeningBal) || 0,
        opening_balance_date: new Date().toISOString().slice(0, 10),
        is_active: true,
        notes: accNotes || null,
      });
      showToast(`Account ${accCode} - ${accName} created successfully!`);
      setNewAccountOpen(false);
      setAccCode("");
      setAccName("");
      setAccNotes("");
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to create account", "error");
    }
  };

  const handleArchiveAccount = async (account: LedgerAccount) => {
    if (!confirm(`Are you sure you want to deactivate/archive account "${account.account_code} - ${account.account_name}"? Historical transactions will remain preserved.`)) {
      return;
    }
    try {
      const res = await archiveLedgerAccount(account.id);
      showToast(res.message);
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to archive account", "error");
    }
  };

  const handleDeleteCustomAccount = async (account: LedgerAccount) => {
    if (!confirm(`Are you sure you want to permanently delete custom account "${account.account_code} - ${account.account_name}"?\n\nThis is only allowed for custom accounts with AED 0.00 balance and no transaction history.`)) {
      return;
    }
    try {
      const res = await deleteCustomLedgerAccount(account.id);
      showToast(res.message);
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to delete account", "error");
    }
  };

  const handleConfirmDeleteEntry = async () => {
    if (!txnToDelete) return;
    setIsDeletingTxn(true);
    try {
      const txnId = txnToDelete.transaction_id || txnToDelete.id;
      const res = await deleteLedgerTransaction({
        transactionId: txnId,
        deleted_by: user?.full_name || "Primary Owner",
        reason: "Manual deletion via account transaction history",
      });

      if (activeStatement?.account) {
        const updatedStmt = await getAccountLedgerStatement(activeStatement.account.id);
        setActiveStatement(updatedStmt);
      }
      await loadAllData();
      showToast(`Transaction ${res.deletedTxnNumber} and matching entries permanently deleted.`);
      setDeleteEntryOpen(false);
      setTxnToDelete(null);
    } catch (err: any) {
      showToast(err.message || "Failed to delete transaction", "error");
    } finally {
      setIsDeletingTxn(false);
    }
  };

  const handleConfirmBulkDelete = async () => {
    if (selectedTxnIds.length === 0) return;
    setIsDeletingTxn(true);
    try {
      const res = await bulkDeleteLedgerTransactions({
        transactionIds: selectedTxnIds,
        deleted_by: user?.full_name || "Primary Owner",
        reason: "Bulk deletion via account transaction history",
      });

      setSelectedTxnIds([]);
      if (activeStatement?.account) {
        const updatedStmt = await getAccountLedgerStatement(activeStatement.account.id);
        setActiveStatement(updatedStmt);
      }
      await loadAllData();
      showToast(`Successfully deleted ${res.deletedCount} transaction(s).`);
      setBulkDeleteOpen(false);
    } catch (err: any) {
      showToast(err.message || "Failed to bulk delete transactions", "error");
    } finally {
      setIsDeletingTxn(false);
    }
  };

  const handleConfirmResetAccounting = async () => {
    setIsResettingAccounting(true);
    try {
      const res = await resetAllLedgerData();
      showToast(res.message || "ATIQ JEHAN accounting data reset to clean zero.");
      setResetAccountingOpen(false);
      await loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to reset accounting data", "error");
    } finally {
      setIsResettingAccounting(false);
    }
  };

  const handleCreateWorker = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createWorker({
        name: workerName.trim(),
        phone: workerPhone.trim() || null,
        job_position: workerRole,
        salary_type: "monthly",
        basic_salary: Number(workerSalary) || 0,
        opening_balance: 0,
        status: "active",
        notes: null,
      });
      showToast(`Worker ${workerName} added successfully!`);
      setNewWorkerOpen(false);
      setWorkerName("");
      setWorkerPhone("");
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to add worker", "error");
    }
  };

  const handleRecordWorkerSalaryDue = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await postWorkerSalaryDue(selectedWorkerId, Number(salaryDueAmount), salaryDuePeriod, user?.full_name || "Admin");
      showToast("Worker salary accrued and posted to ledger!");
      setWorkerSalaryDueOpen(false);
      setSalaryDueAmount("");
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to record salary due", "error");
    }
  };

  const handleRecordWorkerPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await postWorkerPayment(
        selectedWorkerId,
        Number(workerPayAmount),
        workerPayMethod,
        workerPayBankId || undefined,
        workerPayNotes,
        user?.full_name || "Admin"
      );
      showToast("Worker salary payment recorded and posted to ledger!");
      setWorkerPayOpen(false);
      setWorkerPayAmount("");
      setWorkerPayNotes("");
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to record payment", "error");
    }
  };

  const handleRecordWorkerAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await postWorkerAdvance(
        selectedWorkerId,
        Number(workerAdvAmount),
        workerAdvMethod,
        workerAdvNotes,
        user?.full_name || "Admin"
      );
      showToast("Staff advance posted to ledger!");
      setWorkerAdvOpen(false);
      setWorkerAdvAmount("");
      setWorkerAdvNotes("");
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to record advance", "error");
    }
  };

  const handleCreateBank = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createBankAccount({
        bank_name: bankName.trim(),
        account_name: bankAccName.trim(),
        account_number_last_digits: bankLastDigits.trim() || null,
        opening_balance: Number(bankOpeningBal) || 0,
        currency: "AED",
        status: "active",
        notes: null,
      });
      showToast(`Bank Account ${bankName} added and linked to Ledger!`);
      setNewBankOpen(false);
      setBankName("");
      setBankAccName("");
      setBankLastDigits("");
      setBankOpeningBal("0");
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to create bank account", "error");
    }
  };

  const handleOwnerTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await postOwnerTransaction({
        type: ownerTxnType,
        amount: Number(ownerTxnAmount),
        payment_method: ownerTxnMethod,
        bank_account_id: ownerTxnBankId || undefined,
        description: ownerTxnDesc.trim() || undefined,
        created_by: user?.full_name || "Owner",
      });
      showToast(`Owner ${ownerTxnType} transaction posted successfully!`);
      setOwnerTxnOpen(false);
      setOwnerTxnAmount("");
      setOwnerTxnDesc("");
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to post owner transaction", "error");
    }
  };

  const handleSaveManualJournal = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formattedEntries = journalRows
        .filter((r) => r.accountId && (Number(r.debit) > 0 || Number(r.credit) > 0))
        .map((r) => ({
          account_id: r.accountId,
          debit: Number(r.debit) || 0,
          credit: Number(r.credit) || 0,
          notes: r.notes || null,
        }));

      if (formattedEntries.length < 2) {
        throw new Error("Journal entry requires at least 2 lines.");
      }

      await postTransaction({
        transaction_date: journalDate,
        reference_type: "manual_journal",
        reference_id: `manual-${Date.now()}`,
        description: journalDesc.trim() || "Manual Journal Entry",
        created_by: user?.full_name || "Admin",
        entries: formattedEntries,
      });

      showToast("Manual Journal entry successfully posted!");
      setJournalOpen(false);
      setJournalDesc("");
      setJournalRows([
        { accountId: "", debit: "", credit: "", notes: "" },
        { accountId: "", debit: "", credit: "", notes: "" },
      ]);
      loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to post journal entry", "error");
    }
  };

  const selectedFromAccount: TransferrableAccountItem | undefined =
    transferrableAccounts.find((a) => a.id === transferFromId) ||
    (accounts.find((a) => a.id === transferFromId) as TransferrableAccountItem | undefined);

  const selectedToAccount: TransferrableAccountItem | undefined =
    transferrableAccounts.find((a) => a.id === transferToId) ||
    (accounts.find((a) => a.id === transferToId) as TransferrableAccountItem | undefined);

  const selectedSavingAccount: TransferrableAccountItem | undefined =
    transferrableAccounts.find((a) => a.id === transferSavingId) ||
    (accounts.find((a) => a.id === transferSavingId) as TransferrableAccountItem | undefined);

  const numPayable = Number(payableAmount) || 0;
  const numReceivable = Number(receivableAmount) || 0;
  const rawDiff = Math.round((numPayable - numReceivable) * 100) / 100;
  const hasDifference = Math.abs(rawDiff) > 0.001;
  const diffAmount = Math.abs(rawDiff);

  const isSameTransferAccount = Boolean(transferFromId && transferToId && transferFromId === transferToId);

  // Numeric saving amount
  const numSaving = savingAmount !== "" ? (Number(savingAmount) || 0) : (hasDifference && differenceHandlingOption === "saving_account" ? diffAmount : 0);

  // Compute Double-Entry Debit & Credit Totals
  let totalDebit = 0;
  let totalCredit = 0;

  if (hasDifference && differenceHandlingOption === "receivable_account") {
    totalDebit = numPayable;
    totalCredit = numPayable;
  } else if (hasDifference && differenceHandlingOption === "payable_account") {
    totalDebit = numReceivable;
    totalCredit = numReceivable;
  } else if (hasDifference && differenceHandlingOption === "saving_account") {
    if (numPayable > numReceivable) {
      totalDebit = Math.round((numReceivable + numSaving) * 100) / 100;
      totalCredit = numPayable;
    } else {
      totalDebit = numReceivable;
      totalCredit = Math.round((numPayable + numSaving) * 100) / 100;
    }
  } else {
    // 1:1 transfer or direct match
    totalDebit = numReceivable;
    totalCredit = numPayable;
  }

  const isSavingAmountMatching =
    !hasDifference ||
    differenceHandlingOption !== "saving_account" ||
    (Boolean(transferSavingId) && Math.abs(numSaving - diffAmount) <= 0.01);

  const isDoubleEntryBalanced =
    numPayable > 0 &&
    numReceivable > 0 &&
    Math.abs(totalDebit - totalCredit) <= 0.01 &&
    isSavingAmountMatching &&
    (!hasDifference || differenceHandlingOption !== "saving_account" || Boolean(transferSavingId));

  const isFromLiquidAsset =
    selectedFromAccount &&
    ((selectedFromAccount.account_sub_type || "").toLowerCase() === "cash" ||
      (selectedFromAccount.account_sub_type || "").toLowerCase() === "bank" ||
      selectedFromAccount.account_code === "1001" ||
      selectedFromAccount.account_code === "1002" ||
      selectedFromAccount.account_code === "1003");

  const isInsufficientTransferBalance = Boolean(
    selectedFromAccount &&
    isFromLiquidAsset &&
    selectedFromAccount.current_balance !== undefined &&
    selectedFromAccount.current_balance < numPayable &&
    !transferAllowNegative
  );

  const filterTransferAccounts = (query: string, excludeIds: (string | undefined)[] = []) => {
    const q = (query || "").trim().toLowerCase();
    const sourceList: TransferrableAccountItem[] =
      transferrableAccounts.length > 0 ? transferrableAccounts : (accounts as TransferrableAccountItem[]);

    return sourceList.filter((acc) => {
      if (excludeIds.filter(Boolean).includes(acc.id)) return false;
      if (!q) return true;

      const name = (acc.account_name || "").toLowerCase();
      const code = (acc.account_code || "").toLowerCase();
      const type = (acc.account_type || "").toLowerCase();
      const sub = (acc.account_sub_type || "").toLowerCase();
      const entity = (acc.related_entity_type || "").toLowerCase();
      const phone = (acc.phone || "").toLowerCase();
      const entityName = (acc.entity_name || "").toLowerCase();
      const notes = (acc.notes || "").toLowerCase();

      return (
        name.includes(q) ||
        code.includes(q) ||
        type.includes(q) ||
        sub.includes(q) ||
        entity.includes(q) ||
        phone.includes(q) ||
        entityName.includes(q) ||
        notes.includes(q)
      );
    });
  };

  // ─── Entry Modal Account Selection & Double Entry Preview ─────────────────
  const selectedPrimaryAccount =
    transferrableAccounts.find((a) => a.id === entryAccountId) ||
    (accounts.find((a) => a.id === entryAccountId) as TransferrableAccountItem | undefined);

  const selectedCounterAccount =
    transferrableAccounts.find((a) => a.id === entryCounterAccountId) ||
    (accounts.find((a) => a.id === entryCounterAccountId) as TransferrableAccountItem | undefined);

  const numEntryAmount = Number(entryAmount) || 0;

  const entryLegsPreview = React.useMemo(() => {
    if (!selectedPrimaryAccount || !selectedCounterAccount || numEntryAmount <= 0) {
      return null;
    }

    const isPrimaryAsset = selectedPrimaryAccount.account_type === "asset";
    const isPrimaryCustomer =
      selectedPrimaryAccount.related_entity_type === "customer" ||
      selectedPrimaryAccount.account_sub_type === "Customer Receivable";
    const isPrimarySupplier =
      selectedPrimaryAccount.related_entity_type === "supplier" ||
      selectedPrimaryAccount.account_sub_type === "Supplier Payable";
    const isPrimaryExpense = selectedPrimaryAccount.account_type === "expense";
    const isPrimaryIncome = selectedPrimaryAccount.account_type === "income";

    let debitAccount = selectedPrimaryAccount;
    let creditAccount = selectedCounterAccount;

    if (entryType === "debit") {
      debitAccount = selectedPrimaryAccount;
      creditAccount = selectedCounterAccount;
    } else if (entryType === "credit") {
      debitAccount = selectedCounterAccount;
      creditAccount = selectedPrimaryAccount;
    } else if (entryType === "money_in") {
      if (isPrimaryAsset) {
        debitAccount = selectedPrimaryAccount;
        creditAccount = selectedCounterAccount;
      } else if (isPrimaryCustomer || isPrimaryIncome) {
        debitAccount = selectedCounterAccount;
        creditAccount = selectedPrimaryAccount;
      } else {
        debitAccount = selectedPrimaryAccount;
        creditAccount = selectedCounterAccount;
      }
    } else if (entryType === "money_out") {
      if (isPrimaryAsset) {
        debitAccount = selectedCounterAccount;
        creditAccount = selectedPrimaryAccount;
      } else if (isPrimarySupplier || isPrimaryExpense) {
        debitAccount = selectedPrimaryAccount;
        creditAccount = selectedCounterAccount;
      } else {
        debitAccount = selectedCounterAccount;
        creditAccount = selectedPrimaryAccount;
      }
    } else {
      debitAccount = selectedPrimaryAccount;
      creditAccount = selectedCounterAccount;
    }

    return {
      debitAccount,
      creditAccount,
      amount: numEntryAmount,
    };
  }, [selectedPrimaryAccount, selectedCounterAccount, numEntryAmount, entryType]);

  // ─── Account Ledger Filtered Lines & Computed Totals ─────────────────────
  const displayedLedgerLines = React.useMemo(() => {
    if (!activeStatement) return [];
    let lines = [...activeStatement.lines];

    // 1. Date Filter
    if (statementDateFilter !== "all") {
      const now = new Date();
      const y = now.getFullYear();
      const m = now.getMonth();
      const d = now.getDate();
      const toIso = (dt: Date) => dt.toISOString().slice(0, 10);
      let sDate = "";
      let eDate = "";

      if (statementDateFilter === "today") {
        sDate = toIso(now);
        eDate = sDate;
      } else if (statementDateFilter === "yesterday") {
        const yest = new Date(y, m, d - 1);
        sDate = toIso(yest);
        eDate = sDate;
      } else if (statementDateFilter === "last_7_days") {
        const past = new Date(y, m, d - 6);
        sDate = toIso(past);
        eDate = toIso(now);
      } else if (statementDateFilter === "this_month") {
        sDate = `${y}-${String(m + 1).padStart(2, "0")}-01`;
        eDate = toIso(now);
      } else if (statementDateFilter === "last_month") {
        const prevM = m === 0 ? 12 : m;
        const prevY = m === 0 ? y - 1 : y;
        sDate = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        eDate = `${prevY}-${String(prevM).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      } else if (statementDateFilter === "this_year") {
        sDate = `${y}-01-01`;
        eDate = toIso(now);
      } else if (statementDateFilter === "custom") {
        sDate = statementCustomStart;
        eDate = statementCustomEnd;
      }

      if (sDate) {
        lines = lines.filter((l) => l.date >= sDate);
      }
      if (eDate) {
        lines = lines.filter((l) => l.date <= eDate);
      }
    }

    // 2. Search Query Filter
    if (statementSearchQuery.trim()) {
      const q = statementSearchQuery.trim().toLowerCase();
      lines = lines.filter(
        (l) =>
          l.transaction_number.toLowerCase().includes(q) ||
          (l.reference_id && l.reference_id.toLowerCase().includes(q)) ||
          l.description.toLowerCase().includes(q) ||
          (l.counter_accounts && l.counter_accounts.toLowerCase().includes(q)) ||
          (l.counter_account_name && l.counter_account_name.toLowerCase().includes(q)) ||
          (l.counter_account_code && l.counter_account_code.toLowerCase().includes(q)) ||
          (l.notes && l.notes.toLowerCase().includes(q)) ||
          (l.source_module && l.source_module.toLowerCase().includes(q)) ||
          String(l.debit).includes(q) ||
          String(l.credit).includes(q) ||
          String(l.running_balance).includes(q)
      );
    }

    return lines;
  }, [activeStatement, statementDateFilter, statementCustomStart, statementCustomEnd, statementSearchQuery]);

  const filteredTotalDebit = React.useMemo(() => {
    return displayedLedgerLines.reduce((acc, l) => acc + (Number(l.debit) || 0), 0);
  }, [displayedLedgerLines]);

  const filteredTotalCredit = React.useMemo(() => {
    return displayedLedgerLines.reduce((acc, l) => acc + (Number(l.credit) || 0), 0);
  }, [displayedLedgerLines]);

  const filteredClosingBalance = React.useMemo(() => {
    if (displayedLedgerLines.length === 0) return activeStatement?.closing_balance || 0;
    return displayedLedgerLines[displayedLedgerLines.length - 1].running_balance;
  }, [displayedLedgerLines, activeStatement]);

  const handleExportLedgerCSV = () => {
    if (!activeStatement) return;
    const headers = [
      "Date",
      "Transaction No",
      "Reference",
      "Description",
      "Counter Account",
      "Debit (AED)",
      "Credit (AED)",
      "Running Balance (AED)",
      "Source Module",
      "Payment Method",
      "Created By",
    ];

    const rows = displayedLedgerLines.map((l) => [
      `"${l.date}"`,
      `"${l.transaction_number}"`,
      `"${l.reference_id || ""}"`,
      `"${(l.description || "").replace(/"/g, '""')}"`,
      `"${(l.counter_accounts || l.counter_account_name || "").replace(/"/g, '""')}"`,
      l.debit > 0 ? l.debit.toFixed(2) : "0.00",
      l.credit > 0 ? l.credit.toFixed(2) : "0.00",
      l.running_balance.toFixed(2),
      `"${l.source_module || ""}"`,
      `"${l.payment_method || ""}"`,
      `"${l.created_by || ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute(
      "download",
      `Ledger_${activeStatement.account.account_code}_${activeStatement.account.account_name.replace(/\s+/g, "_")}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePayableAmountChange = (val: string) => {
    setPayableAmount(val);
    if (!receivableManuallyEdited) {
      setReceivableAmount(val);
    } else {
      const p = Number(val) || 0;
      const r = Number(receivableAmount) || 0;
      const d = Math.round(Math.abs(p - r) * 100) / 100;
      if (d > 0.001 && differenceHandlingOption === "saving_account") {
        setSavingAmount(d.toFixed(2));
      }
    }
  };

  const handleReceivableAmountChange = (val: string) => {
    setReceivableAmount(val);
    setReceivableManuallyEdited(true);
    const p = Number(payableAmount) || 0;
    const r = Number(val) || 0;
    const d = Math.round(Math.abs(p - r) * 100) / 100;
    if (d > 0.001 && differenceHandlingOption === "saving_account") {
      setSavingAmount(d.toFixed(2));
    }
  };

  const handleCancelDifference = () => {
    setReceivableAmount(payableAmount);
    setReceivableManuallyEdited(false);
    setDifferenceHandlingOption("saving_account");
    setTransferSavingId("");
    setSavingAmount("");
    setSavingRemarks("");
  };

  const handleExecuteTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferFromId || !transferToId) {
      showToast("Please select both Payable and Receivable accounts.", "error");
      return;
    }
    if (transferFromId === transferToId) {
      showToast("Payable and Receivable accounts must be different.", "error");
      return;
    }
    if (!numPayable || numPayable <= 0) {
      showToast("Payable Amount must be greater than 0.", "error");
      return;
    }
    if (!numReceivable || numReceivable <= 0) {
      showToast("Receivable Amount must be greater than 0.", "error");
      return;
    }
    if (isInsufficientTransferBalance && !transferAllowNegative) {
      showToast("Insufficient balance in selected Payable Account.", "error");
      return;
    }
    if (hasDifference && differenceHandlingOption === "saving_account") {
      if (!transferSavingId) {
        showToast("Please search and select a Saving Account.", "error");
        return;
      }
      const sAmtEntered = Number(savingAmount) || 0;
      if (Math.abs(sAmtEntered - diffAmount) > 0.01) {
        showToast("Saving Amount must match the transfer difference.", "error");
        return;
      }
      if (!savingRemarks.trim()) {
        showToast("Please enter Saving Account Remarks.", "error");
        return;
      }
    }
    if (transferSavingId && (transferSavingId === transferFromId || transferSavingId === transferToId)) {
      showToast("Saving Account cannot be the same as Payable or Receivable Account.", "error");
      return;
    }
    if (!isDoubleEntryBalanced) {
      showToast("Transfer cannot be completed: Total Debit must equal Total Credit.", "error");
      return;
    }

    setTransferSubmitting(true);
    try {
      const res = await postMoneyTransfer({
        transfer_date: transferDate,
        cash_flow_type: transferCashFlowType,
        from_account_id: transferFromId,
        to_account_id: transferToId,
        payable_amount: numPayable,
        receivable_amount: numReceivable,
        payable_remarks: payableRemarks.trim() || undefined,
        receivable_remarks: receivableRemarks.trim() || undefined,
        saving_account_id: hasDifference && differenceHandlingOption === "saving_account" ? transferSavingId : undefined,
        saving_amount: hasDifference && differenceHandlingOption === "saving_account" ? (Number(savingAmount) || diffAmount) : undefined,
        saving_remarks: savingRemarks.trim() || undefined,
        difference_handling: hasDifference ? differenceHandlingOption : undefined,
        reference_number: transferRef.trim() || undefined,
        notes: transferNotes.trim() || undefined,
        created_by: user?.full_name || (isOwner ? "Owner" : "Admin"),
        allow_negative: transferAllowNegative,
      });

      showToast(`Transfer ${res.transfer_number} of AED ${numReceivable.toFixed(2)} completed successfully!`);
      setTransferOpen(false);

      // Reset form
      setPayableAmount("");
      setReceivableAmount("");
      setPayableRemarks("");
      setReceivableRemarks("");
      setPayableSearchQuery("");
      setReceivableSearchQuery("");
      setPayableSelectorOpen(false);
      setReceivableSelectorOpen(false);
      setReceivableManuallyEdited(false);
      setTransferSavingId("");
      setSavingAmount("");
      setSavingRemarks("");
      setSavingSearchQuery("");
      setSavingSelectorOpen(false);
      setDifferenceHandlingOption("saving_account");
      setTransferRef("");
      setTransferNotes("");
      setTransferFromId("");
      setTransferToId("");
      setTransferAllowNegative(false);
      setDifferenceHandling("bank_fee");
      setTransferCashFlowType("internal_transfer");

      // Refresh data
      await loadAllData();

      // Open voucher receipt modal
      const updatedHistory = await getTransferHistory();
      const matched = updatedHistory.find((t) => t.transfer_number === res.transfer_number);
      if (matched) {
        setActiveVoucher(matched);
        setVoucherOpen(true);
      }
    } catch (err: any) {
      showToast(err.message || "Failed to execute transfer", "error");
    } finally {
      setTransferSubmitting(false);
    }
  };

  const handleExecuteReversal = async () => {
    if (!transferToReverse) return;
    setReversingTransfer(true);
    try {
      await reverseMoneyTransfer({
        transferNumberOrTxnId: transferToReverse.transfer_number,
        reason: reversalReason.trim() || undefined,
        reversed_by: user?.full_name || (isOwner ? "Owner" : "Admin"),
      });

      showToast(`Transfer ${transferToReverse.transfer_number} reversed successfully! Offset journal posted.`);
      setReversalDialogOpen(false);
      setTransferToReverse(null);
      setReversalReason("");

      await loadAllData();
    } catch (err: any) {
      showToast(err.message || "Failed to reverse transfer", "error");
    } finally {
      setReversingTransfer(false);
    }
  };

  // Filtered accounts
  const filteredAccounts = accounts.filter((acc) => {
    if (accountTypeFilter !== "all" && acc.account_type !== accountTypeFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        acc.account_code.toLowerCase().includes(q) ||
        acc.account_name.toLowerCase().includes(q) ||
        acc.account_sub_type.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Calculate Debits and Credits per account for high-density accounting view
  const accountDebitsAndCredits = React.useMemo(() => {
    const map: Record<string, { debit: number; credit: number }> = {};
    for (const t of transactions) {
      if (t.entries && Array.isArray(t.entries)) {
        for (const e of t.entries) {
          if (e.account_id) {
            if (!map[e.account_id]) map[e.account_id] = { debit: 0, credit: 0 };
            map[e.account_id].debit += Number(e.debit || 0);
            map[e.account_id].credit += Number(e.credit || 0);
          }
        }
      }
    }
    return map;
  }, [transactions]);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg flex items-center gap-3 text-sm max-w-md animate-in fade-in slide-in-from-top-4 duration-200 ${
            toastMessage.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toastMessage.type === "success" ? (
            <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          ) : (
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
          )}
          <span className="font-medium">{toastMessage.text}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Accounts / Ledger"
          description="Professional double-entry general ledger, chart of accounts, and financial registers."
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Accounts / Ledger" },
          ]}
        />

        {/* Global Quick Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <Button
            variant="outline"
            onClick={loadAllData}
            disabled={loading}
            className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold h-10 px-3.5 shadow-2xs gap-1.5 text-xs transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          {canTransfer && (
            <Button
              variant="outline"
              onClick={() => setTransferOpen(true)}
              className="rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50/60 text-indigo-700 font-semibold h-10 px-3.5 shadow-2xs gap-1.5 text-xs transition-colors"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" />
              Transfer Money
            </Button>
          )}

          {canManageAccounts && (
            <>
              <Button
                variant="outline"
                onClick={() => setJournalOpen(true)}
                className="rounded-xl border border-blue-200 bg-white hover:bg-blue-50/60 text-blue-700 font-semibold h-10 px-3.5 shadow-2xs gap-1.5 text-xs transition-colors"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                Manual Journal
              </Button>

              <Button
                onClick={() => setNewAccountOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs h-10 px-4 gap-1.5 text-xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Account
              </Button>
            </>
          )}

          {isOwner && (
            <Button
              variant="outline"
              onClick={() => setResetAccountingOpen(true)}
              className="rounded-xl border border-rose-200 bg-white hover:bg-rose-50/60 text-rose-700 font-semibold h-10 px-3.5 shadow-2xs gap-1.5 text-xs transition-colors"
              title="Reset ATIQ JEHAN Accounting to Clean Zero"
            >
              <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
              Reset Accounting
            </Button>
          )}
        </div>
      </div>

      {/* ─── FAST GLOBAL SEARCH ─────────────────────────────────────────── */}
      <div className="relative bg-white border border-slate-200/90 rounded-2xl shadow-2xs p-4 space-y-3">
        <div className="relative flex items-center">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            id="accounts-global-search-input"
            type="text"
            placeholder="Search Accounts / Ledger... (e.g. Account Name, Customer, Supplier, Worker, Bank, Invoice No...)"
            value={globalSearchQuery}
            onChange={(e) => {
              setGlobalSearchQuery(e.target.value);
              setIsSearchOpen(true);
            }}
            onFocus={() => {
              if (globalSearchQuery.trim().length >= 2) setIsSearchOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsSearchOpen(false);
              }
            }}
            className="pl-10 pr-24 h-11 text-sm bg-slate-50/70 border-slate-200 rounded-xl focus-visible:ring-blue-500"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
            {isSearching && <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />}
            {globalSearchQuery && (
              <button
                type="button"
                onClick={() => {
                  setGlobalSearchQuery("");
                  setSearchResults([]);
                  setIsSearchOpen(false);
                }}
                className="p-1 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <kbd className="hidden sm:inline-flex text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-lg border border-slate-200 font-mono">
              ESC
            </kbd>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          <span className="text-[11px] font-bold text-slate-500 uppercase mr-1 tracking-wider">
            Filter:
          </span>
          {SEARCH_FILTERS.map((f) => {
            const isActive = searchFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setSearchFilter(f.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ${
                  isActive
                    ? "bg-blue-600 text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Results Dropdown Panel */}
        {isSearchOpen && debouncedSearchQuery.trim().length >= 2 && (
          <div className="mt-2 border border-slate-200/90 rounded-2xl bg-white shadow-xl overflow-hidden divide-y divide-slate-100 animate-in fade-in-50 duration-150 z-20">
            <div className="px-4 py-2.5 bg-slate-50/80 flex items-center justify-between text-xs text-slate-500">
              <span>
                {isSearching ? (
                  "Searching accounts and ledger records..."
                ) : (
                  <>
                    Found <strong className="text-slate-900">{searchResults.length}</strong> matching record{searchResults.length === 1 ? "" : "s"}
                  </>
                )}
              </span>
              <span className="text-[11px] text-blue-600 font-semibold">Click any record to open ledger details</span>
            </div>

            {searchResults.length === 0 && !isSearching ? (
              <div className="p-6 text-center text-sm text-slate-500">
                <AlertCircle className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                <p className="font-semibold text-slate-700">No account or ledger record found</p>
                <p className="text-xs text-slate-400 mt-0.5">Try searching with a different keyword or change the category filter.</p>
              </div>
            ) : (
              <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                {searchResults.map((result) => {
                  return (
                    <div
                      key={result.id}
                      onClick={() => handleSelectSearchResult(result)}
                      className="p-3.5 hover:bg-blue-50/60 cursor-pointer transition flex items-center justify-between gap-4 group"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition truncate">
                            {result.name}
                          </span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-medium ${getTypeBadgeClass(result.related_entity_type, result.account_type)}`}>
                            {result.account_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] text-slate-700 font-semibold">
                            Code: {result.account_code}
                          </span>
                          {result.reference && (
                            <span className="truncate">
                              {result.reference}
                            </span>
                          )}
                          {result.phone && (
                            <span className="text-slate-400">
                              Tel: {result.phone}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0 flex items-center gap-3">
                        <div>
                          <p className="text-[11px] text-slate-400 uppercase font-bold">Balance</p>
                          <p className="text-sm font-bold font-mono text-slate-900 tabular-nums">
                            AED {Number(result.balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 h-auto p-1.5 bg-slate-100/80 rounded-2xl border border-slate-200/80 shadow-2xs gap-1">
          <TabsTrigger value="dashboard" className="text-xs py-2.5 rounded-xl font-semibold gap-1.5 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-xs">
            <LayoutDashboard className="w-3.5 h-3.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="accounts" className="text-xs py-2.5 rounded-xl font-semibold gap-1.5 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-xs">
            <BookOpen className="w-3.5 h-3.5" />
            Accounts
          </TabsTrigger>
          <TabsTrigger value="customers" className="text-xs py-2.5 rounded-xl font-semibold gap-1.5 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-xs">
            <Users className="w-3.5 h-3.5" />
            Customers
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="text-xs py-2.5 rounded-xl font-semibold gap-1.5 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-xs">
            <Truck className="w-3.5 h-3.5" />
            Suppliers
          </TabsTrigger>
          <TabsTrigger value="workers" className="text-xs py-2.5 rounded-xl font-semibold gap-1.5 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-xs">
            <HardHat className="w-3.5 h-3.5" />
            Workers
          </TabsTrigger>
          <TabsTrigger value="banks" className="text-xs py-2.5 rounded-xl font-semibold gap-1.5 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-xs">
            <Landmark className="w-3.5 h-3.5" />
            Banks
          </TabsTrigger>
          <TabsTrigger value="owner" className="text-xs py-2.5 rounded-xl font-semibold gap-1.5 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-xs">
            <UserCheck className="w-3.5 h-3.5" />
            Owner
          </TabsTrigger>
          <TabsTrigger value="transfers" className="text-xs py-2.5 rounded-xl font-semibold gap-1.5 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-xs">
            <ArrowRightLeft className="w-3.5 h-3.5" />
            Transfers
          </TabsTrigger>
          <TabsTrigger value="journal" className="text-xs py-2.5 rounded-xl font-semibold gap-1.5 transition-all data-[state=active]:bg-white data-[state=active]:text-blue-600 data-[state=active]:shadow-xs">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Journal
          </TabsTrigger>
        </TabsList>

        {/* ─── TAB 1: DASHBOARD ───────────────────────────────────────────── */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* 5 Enterprise Account Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Cash on Hand */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Cash on Hand</span>
                  <div className="h-10 w-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0 border border-emerald-100">
                    <Wallet className="h-5 w-5 text-emerald-600" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
                    AED {metrics.cashBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">Drawer & counter float</p>
              </div>
              <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
                    if (cashAcc) handleOpenAddEntryModal(cashAcc);
                  }}
                  className="flex-1 text-xs h-8 px-2 gap-1 rounded-xl border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-3 h-3" /> Entry
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const cashAcc = accounts.find((a) => a.account_code === "1001") || accounts[0];
                    if (cashAcc) handleOpenAccountLedger(cashAcc);
                  }}
                  className="flex-1 text-xs h-8 px-2 gap-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs"
                >
                  <BookOpen className="w-3 h-3" /> Ledger
                </Button>
              </div>
            </div>

            {/* Bank Balance */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Bank Balance</span>
                  <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0 border border-blue-100">
                    <Landmark className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-xl font-bold font-mono tracking-tight text-blue-600 tabular-nums">
                    AED {metrics.totalBankBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">ADCB + FAB accounts</p>
              </div>
              <div className="flex items-center gap-2 pt-3 mt-3 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const bankAcc = accounts.find((a) => a.account_code === "1002") || accounts[1];
                    if (bankAcc) handleOpenAddEntryModal(bankAcc);
                  }}
                  className="flex-1 text-xs h-8 px-2 gap-1 rounded-xl border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="w-3 h-3" /> Entry
                </Button>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("banks")}
                  className="flex-1 text-xs h-8 px-2 gap-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs"
                >
                  <Landmark className="w-3 h-3" /> Banks
                </Button>
              </div>
            </div>

            {/* Receivables */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Receivables</span>
                  <div className="h-10 w-10 rounded-xl bg-amber-50 flex items-center justify-center shrink-0 border border-amber-100">
                    <Users className="h-5 w-5 text-amber-600" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-xl font-bold font-mono tracking-tight text-amber-600 tabular-nums">
                    AED {metrics.customerReceivables.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">Customer unpaid invoices</p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("customers")}
                  className="w-full text-xs h-8 px-2 gap-1 rounded-xl border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Users className="w-3 h-3" /> View Debtors
                </Button>
              </div>
            </div>

            {/* Payables */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Payables</span>
                  <div className="h-10 w-10 rounded-xl bg-rose-50 flex items-center justify-center shrink-0 border border-rose-100">
                    <Truck className="h-5 w-5 text-rose-600" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-xl font-bold font-mono tracking-tight text-rose-600 tabular-nums">
                    AED {(metrics.supplierPayables + metrics.workerPayables).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">
                  Suppliers &bull; Workers
                </p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("suppliers")}
                  className="w-full text-xs h-8 px-2 gap-1 rounded-xl border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Truck className="w-3 h-3" /> View Payables
                </Button>
              </div>
            </div>

            {/* Owner Capital */}
            <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Owner Capital</span>
                  <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0 border border-indigo-100">
                    <UserCheck className="h-5 w-5 text-indigo-600" />
                  </div>
                </div>
                <div className="mt-2">
                  <span className="text-xl font-bold font-mono tracking-tight text-indigo-600 tabular-nums">
                    AED {metrics.ownerCapital.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 truncate">Equity capital introduced</p>
              </div>
              <div className="pt-3 mt-3 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("owner")}
                  className="w-full text-xs h-8 px-2 gap-1 rounded-xl border-slate-200 font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <UserCheck className="w-3 h-3" /> Equity Register
                </Button>
              </div>
            </div>
          </div>

          {/* ─── CASH FLOW SUMMARY (OPERATING CASH FLOW) ────────────────── */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 bg-indigo-50/30">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-2xs">
                    <ArrowRightLeft className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <span>Business Cash Flow Summary</span>
                      <Badge variant="outline" className="border-indigo-200 text-indigo-700 bg-indigo-50 text-[10px] rounded-lg">
                        Net = In - Out
                      </Badge>
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Formula: <strong className="text-slate-700 font-semibold">Net Cash Flow = Cash In - Cash Out</strong>. Pure internal transfers are excluded to prevent double-counting.
                    </p>
                  </div>
                </div>
                {canTransfer && (
                  <Button
                    size="sm"
                    onClick={() => setTransferOpen(true)}
                    className="text-xs h-9 px-3.5 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-2xs"
                  >
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    Transfer / Cash Flow
                  </Button>
                )}
              </div>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
                {/* Cash In Today */}
                <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                    <span>Cash In Today</span>
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-700 tabular-nums">
                    AED {cashFlowSummary.cashInToday.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400">Today's inflows</div>
                </div>

                {/* Cash Out Today */}
                <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-rose-800 uppercase tracking-wider">
                    <span>Cash Out Today</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <div className="text-lg font-bold font-mono text-rose-700 tabular-nums">
                    AED {cashFlowSummary.cashOutToday.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400">Today's outflows</div>
                </div>

                {/* Net Cash Flow Today */}
                <div className={`p-4 rounded-xl border space-y-1 ${cashFlowSummary.netCashFlowToday >= 0 ? "border-blue-100 bg-blue-50/40" : "border-rose-100 bg-rose-50/40"}`}>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    <span>Net Flow Today</span>
                    <Scale className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className={`text-lg font-bold font-mono tabular-nums ${cashFlowSummary.netCashFlowToday >= 0 ? "text-blue-700" : "text-rose-700"}`}>
                    {cashFlowSummary.netCashFlowToday >= 0 ? "+" : ""}AED {cashFlowSummary.netCashFlowToday.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400">In - Out (Today)</div>
                </div>

                {/* Cash In This Month */}
                <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
                    <span>Cash In Month</span>
                    <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-lg font-bold font-mono text-emerald-700 tabular-nums">
                    AED {cashFlowSummary.cashInThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400">Monthly inflows</div>
                </div>

                {/* Cash Out This Month */}
                <div className="p-4 rounded-xl border border-rose-100 bg-rose-50/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-rose-800 uppercase tracking-wider">
                    <span>Cash Out Month</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <div className="text-lg font-bold font-mono text-rose-700 tabular-nums">
                    AED {cashFlowSummary.cashOutThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400">Monthly outflows</div>
                </div>

                {/* Net Cash Flow This Month */}
                <div className={`p-4 rounded-xl border space-y-1 ${cashFlowSummary.netCashFlowThisMonth >= 0 ? "border-blue-100 bg-blue-50/40" : "border-rose-100 bg-rose-50/40"}`}>
                  <div className="flex items-center justify-between text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                    <span>Net Flow Month</span>
                    <Scale className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className={`text-lg font-bold font-mono tabular-nums ${cashFlowSummary.netCashFlowThisMonth >= 0 ? "text-blue-700" : "text-rose-700"}`}>
                    {cashFlowSummary.netCashFlowThisMonth >= 0 ? "+" : ""}AED {cashFlowSummary.netCashFlowThisMonth.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-[10px] text-slate-400">In - Out (This Month)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Action Banner */}
          <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-blue-50/30 rounded-2xl border border-blue-200/90 shadow-2xs p-5 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-2xs shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">
                  Workshop Net Liquid Position: AED {metrics.netCashFlow.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </h4>
                <p className="text-xs text-slate-500 mt-0.5">
                  Calculated in real-time from active Cash and Bank account ledgers.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveTab("owner");
                  setOwnerTxnOpen(true);
                }}
                className="text-xs h-9 px-3 rounded-xl border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700"
              >
                Owner Capital / Drawing
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setActiveTab("workers");
                  setWorkerSalaryDueOpen(true);
                }}
                className="text-xs h-9 px-3 rounded-xl border-slate-200 bg-white hover:bg-slate-50 font-semibold text-slate-700"
              >
                Accrue Worker Salary
              </Button>
              <Button
                size="sm"
                onClick={() => setActiveTab("accounts")}
                className="text-xs h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs"
              >
                View Full Chart of Accounts &rarr;
              </Button>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB 2: CHART OF ACCOUNTS (LEDGER ACCOUNTS) ─────────────────── */}
        <TabsContent value="accounts" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Search by code, account name, or sub-type..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 text-xs h-10 rounded-xl border-slate-200 bg-white"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Select value={accountTypeFilter} onValueChange={(val) => { if (val) setAccountTypeFilter(val); }}>
                <SelectTrigger className="w-[160px] text-xs h-10 rounded-xl border-slate-200 bg-white font-medium">
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent className="rounded-xl border-slate-200 shadow-lg">
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="asset">Asset (1000s)</SelectItem>
                  <SelectItem value="liability">Liability (2000s)</SelectItem>
                  <SelectItem value="equity">Equity (3000s)</SelectItem>
                  <SelectItem value="income">Income (4000s)</SelectItem>
                  <SelectItem value="expense">Expense (5000s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                    <TableHead className="w-[110px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Account Code</TableHead>
                    <TableHead className="min-w-[180px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Account Name</TableHead>
                    <TableHead className="w-[100px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-right w-[130px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Opening Balance</TableHead>
                    <TableHead className="text-right w-[120px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Debit</TableHead>
                    <TableHead className="text-right w-[120px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Credit</TableHead>
                    <TableHead className="text-right w-[130px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Closing Balance</TableHead>
                    <TableHead className="w-[90px] text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</TableHead>
                    <TableHead className="w-[160px] min-w-[160px] text-right pr-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-12 text-xs text-slate-400">
                        No accounts match the current filter.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAccounts.map((acc) => {
                      const typeColors: Record<string, string> = {
                        asset: "bg-emerald-50 text-emerald-700 border-emerald-200",
                        liability: "bg-red-50 text-red-700 border-red-200",
                        income: "bg-teal-50 text-teal-700 border-teal-200",
                        expense: "bg-rose-50 text-rose-700 border-rose-200",
                        equity: "bg-indigo-50 text-indigo-700 border-indigo-200",
                      };

                      return (
                        <TableRow key={acc.id} className="h-12 border-b border-slate-100 hover:bg-slate-50/60 transition-colors text-xs">
                          <TableCell className="font-mono font-bold text-xs text-blue-600 whitespace-nowrap">
                            {acc.account_code}
                          </TableCell>
                          <TableCell className="font-medium text-slate-900">
                            <div>{acc.account_name}</div>
                            {acc.account_sub_type && (
                              <div className="text-[11px] text-slate-400 font-normal">{acc.account_sub_type}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={`text-[10px] capitalize font-semibold rounded-lg ${typeColors[acc.account_type]}`}>
                              {acc.account_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-slate-500 tabular-nums whitespace-nowrap">
                            AED {Number(acc.opening_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-emerald-600 font-semibold tabular-nums whitespace-nowrap">
                            {accountDebitsAndCredits[acc.id]?.debit ? `AED ${Number(accountDebitsAndCredits[acc.id].debit).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs text-rose-600 font-semibold tabular-nums whitespace-nowrap">
                            {accountDebitsAndCredits[acc.id]?.credit ? `AED ${Number(accountDebitsAndCredits[acc.id].credit).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-xs text-slate-900 tabular-nums whitespace-nowrap">
                            AED {Number(acc.current_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-center">
                            {acc.is_active ? (
                              <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-200 rounded-lg">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] bg-slate-50 text-slate-600 border-slate-200 rounded-lg">Archived</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right pr-4 whitespace-nowrap">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenAddEntryModal(acc)}
                                className="text-xs h-8 px-2.5 gap-1 text-blue-700 border-blue-200 hover:bg-blue-50 rounded-xl font-semibold"
                                title="+ Add Entry"
                              >
                                <Plus className="w-3 h-3" />
                                Entry
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => handleOpenAccountLedger(acc)}
                                className="text-xs h-8 px-2.5 gap-1 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold shadow-2xs"
                                title="View Ledger & Statement"
                              >
                                <BookOpen className="w-3 h-3" />
                                Ledger
                              </Button>

                              {canManageAccounts && acc.is_active && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleArchiveAccount(acc)}
                                  title="Deactivate / Archive Account"
                                  className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                                >
                                  <Archive className="h-3.5 w-3.5" />
                                </Button>
                              )}

                              {canManageAccounts && !PROTECTED_ACCOUNT_CODES.has(acc.account_code) && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteCustomAccount(acc)}
                                  title="Delete Custom Account"
                                  className="h-8 w-8 p-0 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB 3: CUSTOMER ACCOUNTS ───────────────────────────────────── */}
        <TabsContent value="customers" className="space-y-4">
          <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
            <div className="p-4 pb-3 bg-slate-50/50 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                Customer Ledgers & Receivables
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time outstanding balances from workshop invoices and received payments
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Customer Name</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phone</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Company</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">TRN</TableHead>
                    <TableHead className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Outstanding (AED)</TableHead>
                    <TableHead className="w-[190px] text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-xs text-slate-400">
                        No customers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    customers.map((c) => (
                      <TableRow key={c.id} className="h-12 border-b border-slate-100 hover:bg-slate-50/60 transition-colors text-xs">
                        <TableCell className="font-semibold text-slate-900">{c.name}</TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono">{c.mobile || c.phone || "—"}</TableCell>
                        <TableCell className="text-xs text-slate-600">{c.company_name || "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-slate-500">{c.trn || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-amber-600 tabular-nums">
                          AED {Number(c.outstanding_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenAddEntryModal(c)}
                              className="text-xs h-8 px-2.5 gap-1 rounded-xl font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                              title="+ Add Entry"
                            >
                              <Plus className="w-3 h-3" />
                              Entry
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleOpenAccountLedger(c)}
                              className="text-xs h-8 px-2.5 gap-1 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                              title="View Ledger & Transaction History"
                            >
                              <BookOpen className="w-3 h-3" />
                              View Ledger
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB 4: SUPPLIER ACCOUNTS ───────────────────────────────────── */}
        <TabsContent value="suppliers" className="space-y-4">
          <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
            <div className="p-4 pb-3 bg-slate-50/50 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                Supplier Ledgers & Payables
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Accrued parts purchases, payments made, and current supplier balances
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Supplier Name</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Contact / Phone</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">TRN</TableHead>
                    <TableHead className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Remaining Payable (AED)</TableHead>
                    <TableHead className="w-[190px] text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-xs text-slate-400">
                        No suppliers found.
                      </TableCell>
                    </TableRow>
                  ) : (
                    suppliers.map((s) => (
                      <TableRow key={s.id} className="h-12 border-b border-slate-100 hover:bg-slate-50/60 transition-colors text-xs">
                        <TableCell className="font-semibold text-slate-900">{s.name}</TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono">{s.phone || s.contact_person || "—"}</TableCell>
                        <TableCell className="text-xs font-mono text-slate-500">{s.trn || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-rose-600 tabular-nums">
                          AED {Number(s.outstanding_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenAddEntryModal(s)}
                              className="text-xs h-8 px-2.5 gap-1 rounded-xl font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                              title="+ Add Entry"
                            >
                              <Plus className="w-3 h-3" />
                              Entry
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleOpenAccountLedger(s)}
                              className="text-xs h-8 px-2.5 gap-1 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                              title="View Ledger & Transaction History"
                            >
                              <BookOpen className="w-3 h-3" />
                              View Ledger
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB 5: WORKER ACCOUNTS ─────────────────────────────────────── */}
        <TabsContent value="workers" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Workshop Staff & Worker Financial Accounts</h3>
              <p className="text-xs text-slate-500">Track accrued salaries, advances, disbursements, and dues</p>
            </div>

            {canEdit && (
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (workers.length > 0) setSelectedWorkerId(workers[0].id);
                    setWorkerSalaryDueOpen(true);
                  }}
                  className="text-xs h-10 px-3.5 gap-1.5 border-purple-200 text-purple-700 hover:bg-purple-50 rounded-xl font-semibold transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Accrue Salary
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    if (workers.length > 0) setSelectedWorkerId(workers[0].id);
                    setWorkerPayOpen(true);
                  }}
                  className="text-xs h-10 px-3.5 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-xl font-semibold transition-colors"
                >
                  <DollarSign className="w-3 h-3" />
                  Pay Salary
                </Button>

                <Button
                  variant="outline"
                  onClick={() => {
                    if (workers.length > 0) setSelectedWorkerId(workers[0].id);
                    setWorkerAdvOpen(true);
                  }}
                  className="text-xs h-10 px-3.5 gap-1.5 border-amber-200 text-amber-700 hover:bg-amber-50 rounded-xl font-semibold transition-colors"
                >
                  <Wallet className="w-3 h-3" />
                  Pay Advance
                </Button>

                <Button
                  onClick={() => setNewWorkerOpen(true)}
                  className="text-xs h-10 px-4 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold shadow-2xs transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  Add Worker
                </Button>
              </div>
            )}
          </div>

          <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Worker Name</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Position</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Phone</TableHead>
                    <TableHead className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Basic Salary (AED)</TableHead>
                    <TableHead className="text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</TableHead>
                    <TableHead className="w-[190px] text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-xs text-slate-400">
                        No workers recorded. Click &quot;+ Add Worker&quot; to create one.
                      </TableCell>
                    </TableRow>
                  ) : (
                    workers.map((w) => (
                      <TableRow key={w.id} className="h-12 border-b border-slate-100 hover:bg-slate-50/60 transition-colors text-xs">
                        <TableCell className="font-semibold text-slate-900">{w.name}</TableCell>
                        <TableCell className="text-xs text-slate-500">{w.job_position}</TableCell>
                        <TableCell className="text-xs font-mono text-slate-500">{w.phone || "—"}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                          AED {Number(w.basic_salary).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="outline" className="text-[10px] capitalize bg-emerald-50 text-emerald-700 border-emerald-200 rounded-lg">
                            {w.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleOpenAddEntryModal(w)}
                              className="text-xs h-8 px-2.5 gap-1 rounded-xl font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                              title="+ Add Entry"
                            >
                              <Plus className="w-3 h-3" />
                              Entry
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleOpenAccountLedger(w)}
                              className="text-xs h-8 px-2.5 gap-1 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                              title="View Ledger & Transaction History"
                            >
                              <BookOpen className="w-3 h-3" />
                              View Ledger
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB 6: BANK ACCOUNTS ───────────────────────────────────────── */}
        <TabsContent value="banks" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">Workshop Business Bank Accounts</h3>
              <p className="text-xs text-muted-foreground">Manage corporate bank accounts linked directly to ledger accounts</p>
            </div>

            {canManageAccounts && (
              <Button
                onClick={() => setNewBankOpen(true)}
                className="text-xs h-10 px-4 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Bank Account
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bankAccounts.map((b) => (
              <div key={b.id} className="bg-white rounded-2xl border border-slate-200/90 border-t-4 border-t-blue-600 shadow-2xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-base font-bold text-slate-900">{b.bank_name}</h4>
                    <p className="text-xs text-slate-500 mt-0.5">{b.account_name}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase font-mono font-bold rounded-lg border-slate-200">
                    {b.currency}
                  </Badge>
                </div>

                <div className="flex items-center justify-between text-xs font-mono text-slate-500">
                  <span>Ending with:</span>
                  <span className="font-bold text-slate-700">•••• {b.account_number_last_digits || "0000"}</span>
                </div>

                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                  <span className="text-xs text-slate-500 font-medium">Current Balance:</span>
                  <span className="text-xl font-bold font-mono text-blue-600 tabular-nums">
                    AED {Number(b.current_balance || b.opening_balance).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOpenAddEntryModal(b)}
                    className="flex-1 text-xs h-9 gap-1.5 rounded-xl font-semibold text-blue-700 border-blue-200 hover:bg-blue-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Entry
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleOpenAccountLedger(b)}
                    className="flex-1 text-xs h-9 gap-1.5 rounded-xl font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    Ledger
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ─── TAB 7: OWNER / ADMIN ACCOUNTS ──────────────────────────────── */}
        <TabsContent value="owner" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Owner & Admin Equity Accounts</h3>
              <p className="text-xs text-slate-500">
                Track owner capital injections, personal drawings/withdrawals, advances, and expense reimbursements
              </p>
            </div>

            {canManageAccounts && (
              <Button
                onClick={() => setOwnerTxnOpen(true)}
                className="text-xs h-10 px-4 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-2xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Record Owner Transaction
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200/90 border-l-4 border-l-emerald-600 shadow-2xs p-5 space-y-3">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Owner Capital Introduced</span>
                <div className="text-2xl font-bold font-mono text-emerald-600 tabular-nums mt-1">
                  AED {metrics.ownerCapital.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-slate-500 mt-1">Total equity capital invested in workshop</p>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const acc = accounts.find((a) => a.account_code === "3001");
                    if (acc) handleOpenAddEntryModal(acc);
                  }}
                  className="flex-1 text-xs h-8 gap-1 rounded-xl font-semibold text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                >
                  <Plus className="w-3 h-3" />
                  Entry
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const acc = accounts.find((a) => a.account_code === "3001");
                    if (acc) handleOpenAccountLedger(acc);
                  }}
                  className="flex-1 text-xs h-8 gap-1 rounded-xl font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
                >
                  <BookOpen className="w-3 h-3" />
                  Ledger
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 border-l-4 border-l-rose-600 shadow-2xs p-5 space-y-3">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Owner Drawings / Withdrawals</span>
                <div className="text-2xl font-bold font-mono text-rose-600 tabular-nums mt-1">
                  AED {(accounts.find((a) => a.account_code === "3002")?.current_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-slate-500 mt-1">Total profit distributions taken by owner</p>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const acc = accounts.find((a) => a.account_code === "3002");
                    if (acc) handleOpenAddEntryModal(acc);
                  }}
                  className="flex-1 text-xs h-8 gap-1 rounded-xl font-semibold text-rose-700 border-rose-200 hover:bg-rose-50"
                >
                  <Plus className="w-3 h-3" />
                  Entry
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const acc = accounts.find((a) => a.account_code === "3002");
                    if (acc) handleOpenAccountLedger(acc);
                  }}
                  className="flex-1 text-xs h-8 gap-1 rounded-xl font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-2xs"
                >
                  <BookOpen className="w-3 h-3" />
                  Ledger
                </Button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200/90 border-l-4 border-l-indigo-600 shadow-2xs p-5 space-y-3">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Owner Advances to Workshop</span>
                <div className="text-2xl font-bold font-mono text-indigo-600 tabular-nums mt-1">
                  AED {(accounts.find((a) => a.account_code === "3003")?.current_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-slate-500 mt-1">Short-term liquidity funding loans by owner</p>
              </div>
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const acc = accounts.find((a) => a.account_code === "3003");
                    if (acc) handleOpenAddEntryModal(acc);
                  }}
                  className="flex-1 text-xs h-8 gap-1 rounded-xl font-semibold text-indigo-700 border-indigo-200 hover:bg-indigo-50"
                >
                  <Plus className="w-3 h-3" />
                  Entry
                </Button>
                <Button
                  size="sm"
                  onClick={() => {
                    const acc = accounts.find((a) => a.account_code === "3003");
                    if (acc) handleOpenAccountLedger(acc);
                  }}
                  className="flex-1 text-xs h-8 gap-1 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs"
                >
                  <BookOpen className="w-3 h-3" />
                  Ledger
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB 8: GENERAL JOURNAL & TRANSACTIONS ──────────────────────── */}
        <TabsContent value="journal" className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">General Journal Transactions</h3>
              <p className="text-xs text-slate-500">
                Chronological list of all balanced double-entry accounting transactions
              </p>
            </div>

            {canManageAccounts && (
              <Button
                onClick={() => setJournalOpen(true)}
                className="text-xs h-10 px-4 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl shadow-2xs transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                New Manual Journal Entry
              </Button>
            )}
          </div>

          <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                    <TableHead className="w-[130px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Txn No</TableHead>
                    <TableHead className="w-[110px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Date</TableHead>
                    <TableHead className="w-[120px] text-[11px] font-bold text-slate-500 uppercase tracking-wider">Type</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[200px]">Description</TableHead>
                    <TableHead className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[140px]">Debit (AED)</TableHead>
                    <TableHead className="text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[140px]">Credit (AED)</TableHead>
                    <TableHead className="w-[100px] text-center text-[11px] font-bold text-slate-500 uppercase tracking-wider">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-xs text-slate-400">
                        No transactions recorded yet.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((t) => (
                      <TableRow key={t.id} className="h-12 border-b border-slate-100 hover:bg-slate-50/60 transition-colors text-xs">
                        <TableCell className="font-mono text-xs font-bold text-blue-600">
                          {t.transaction_number}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono">{t.transaction_date}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-mono capitalize rounded-lg">
                            {t.reference_type.replace("_", " ")}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-slate-900">{t.description}</TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                          {Number(t.total_debit || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs font-bold text-slate-900 tabular-nums">
                          {Number(t.total_credit || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            Balanced
                          </span>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ─── TAB 8: MONEY TRANSFERS HISTORY ─────────────────────────────── */}
        <TabsContent value="transfers" className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-600" />
                Internal Money Transfers
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Movement between Cash, Bank, and Financial accounts with full double-entry audit history
              </p>
            </div>
            {canTransfer && (
              <Button
                onClick={() => setTransferOpen(true)}
                className="text-xs h-10 px-4 gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-2xs transition-colors"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                Transfer Money
              </Button>
            )}
          </div>

          <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  placeholder="Search by Transfer No, Reference, Description, Account..."
                  value={transferHistorySearch}
                  onChange={(e) => setTransferHistorySearch(e.target.value)}
                  className="pl-9 text-xs h-10 rounded-xl border-slate-200 bg-white"
                />
              </div>
              <div className="text-xs text-slate-500">
                Total Transfers: <strong className="text-slate-900 font-semibold">{transferHistoryList.length}</strong>
              </div>
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[100px]">Date</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[130px]">Transfer No</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[150px]">Payable Account</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[150px]">Receivable Account</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[150px]">Saving/Diff Account</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[120px]">Payable Amount</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[120px]">Receivable Amount</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[100px]">Difference</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider min-w-[130px]">Remarks</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[100px]">Created By</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider w-[90px]">Status</TableHead>
                    <TableHead className="text-[11px] font-bold text-slate-500 uppercase tracking-wider text-right w-[110px] pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const filtered = transferHistoryList.filter((item) => {
                      if (!transferHistorySearch.trim()) return true;
                      const q = transferHistorySearch.toLowerCase();
                      return (
                        item.transfer_number.toLowerCase().includes(q) ||
                        item.reference.toLowerCase().includes(q) ||
                        item.description.toLowerCase().includes(q) ||
                        item.from_account.name.toLowerCase().includes(q) ||
                        item.to_account.name.toLowerCase().includes(q) ||
                        (item.saving_account?.name && item.saving_account.name.toLowerCase().includes(q)) ||
                        (item.cash_flow_type && item.cash_flow_type.toLowerCase().includes(q))
                      );
                    });

                    if (filtered.length === 0) {
                      return (
                        <TableRow>
                          <TableCell colSpan={12} className="text-center py-12 text-xs text-slate-400">
                            <ArrowRightLeft className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                            <p className="font-semibold text-slate-700">No money transfers found</p>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                              Click &quot;+ Transfer Money&quot; to transfer funds between Payable and Receivable accounts.
                            </p>
                          </TableCell>
                        </TableRow>
                      );
                    }

                    return filtered.map((item) => {
                      const payAmt = item.payable_amount || (item.amount + item.fee);
                      const recAmt = item.receivable_amount || item.amount;
                      const diff = item.difference !== undefined ? item.difference : item.fee;

                      return (
                        <TableRow key={item.id} className="h-12 border-b border-slate-100 hover:bg-slate-50/60 transition-colors text-xs">
                          <TableCell className="text-xs font-mono text-slate-500">{item.date}</TableCell>
                          <TableCell className="text-xs font-mono font-bold text-blue-600">
                            <div>{item.transfer_number}</div>
                            <span className="text-[9px] font-sans uppercase text-slate-400 font-semibold">
                              {item.cash_flow_type === "cash_in"
                                ? "Cash In"
                                : item.cash_flow_type === "cash_out"
                                ? "Cash Out"
                                : "Internal"}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="font-mono text-[10px] text-slate-400 mr-1">{item.from_account.code}</span>
                            <span className="font-medium text-slate-900">{item.from_account.name}</span>
                          </TableCell>
                          <TableCell className="text-xs">
                            <span className="font-mono text-[10px] text-slate-400 mr-1">{item.to_account.code}</span>
                            <span className="font-medium text-slate-900">{item.to_account.name}</span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {item.saving_account ? (
                              <div>
                                <span className="font-mono text-[10px] text-slate-400 mr-1">{item.saving_account.code}</span>
                                <span className="font-medium text-amber-700">{item.saving_account.name}</span>
                                {item.saving_amount ? (
                                  <span className="text-[10px] text-slate-400 font-mono ml-1">
                                    (AED {item.saving_amount.toFixed(2)})
                                  </span>
                                ) : null}
                              </div>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                            AED {payAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono font-bold text-slate-900 dark:text-slate-100">
                            AED {recAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right text-xs font-mono text-slate-600 dark:text-slate-400">
                            {diff > 0 ? (
                              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                                AED {diff.toFixed(2)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[150px]" title={item.description}>
                            {item.description || "—"}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground truncate max-w-[90px]">{item.created_by}</TableCell>
                          <TableCell>
                            {item.is_reversed ? (
                              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-700 bg-amber-50 dark:bg-amber-950/40">
                                Reversed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40">
                                Completed
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setActiveVoucher(item);
                                setVoucherOpen(true);
                              }}
                              className="h-7 w-7 p-0"
                              title="View Voucher"
                            >
                              <Eye className="w-3.5 h-3.5 text-slate-500 hover:text-blue-600" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setActiveVoucher(item);
                                setVoucherOpen(true);
                                setTimeout(() => window.print(), 300);
                              }}
                              className="h-7 w-7 p-0"
                              title="Print Voucher"
                            >
                              <Printer className="w-3.5 h-3.5 text-slate-500 hover:text-blue-600" />
                            </Button>

                            {canManageAccounts && !item.is_reversed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setTransferToReverse(item);
                                  setReversalReason("");
                                  setReversalDialogOpen(true);
                                }}
                                className="h-7 w-7 p-0 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                                title="Reverse Transfer"
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                              </Button>
                            )}

                            {canDeleteEntry && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setTxnToDelete({
                                    id: item.id,
                                    transaction_id: item.id,
                                    transaction_number: item.transfer_number,
                                    date: item.date,
                                    description: item.description,
                                    debit: item.payable_amount || item.amount,
                                    credit: 0,
                                  });
                                  setDeleteEntryOpen(true);
                                }}
                                className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
                                title="Delete Transfer Entry"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      );
                    });
                  })()}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* ─── MODAL 1: ACCOUNT DETAILS & TRANSACTION HISTORY ───────────────────── */}
      <Dialog open={statementDialogOpen} onOpenChange={setStatementDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[92vh] overflow-y-auto p-4 sm:p-6">
          {activeStatement && (
            <div className="space-y-4">
              {/* Account Details Header Card */}
              <div className="bg-gradient-to-r from-slate-50 to-blue-50/40 dark:from-slate-900 dark:to-blue-950/20 p-4 rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono text-xs px-2 py-0.5 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-300">
                        {activeStatement.account.account_code}
                      </Badge>
                      <DialogTitle className="text-xl font-bold tracking-tight">
                        {activeStatement.account.account_name}
                      </DialogTitle>
                      <Badge variant="outline" className="text-[11px] capitalize font-medium">
                        {activeStatement.account.account_type}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">
                        {activeStatement.account.account_sub_type}
                      </Badge>
                      {activeStatement.account.is_active ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] hover:bg-emerald-600">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500 text-[10px]">Archived</Badge>
                      )}
                    </div>
                    <DialogDescription className="text-xs text-muted-foreground flex flex-wrap items-center gap-3">
                      <span>Related Entity: <strong className="text-foreground">{activeStatement.account.related_entity_type !== "none" ? `${activeStatement.account.related_entity_type.toUpperCase()}` : "General Ledger"}</strong></span>
                      {activeStatement.account.notes && (
                        <span>&bull; Note: {activeStatement.account.notes}</span>
                      )}
                    </DialogDescription>
                  </div>

                  {/* Header Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleOpenAddEntryModal(activeStatement.account)}
                      className="text-xs h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      + Add Entry
                    </Button>
                    {canTransfer && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setTransferFromId(activeStatement.account.id);
                          setTransferOpen(true);
                        }}
                        className="text-xs h-8 gap-1.5 text-indigo-700 border-indigo-200 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300"
                      >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        Transfer
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPrintLedgerOpen(true)}
                      className="text-xs h-8 gap-1.5 text-slate-700 border-slate-300 hover:bg-slate-100 dark:text-slate-300"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Print Ledger
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleExportLedgerCSV}
                      className="text-xs h-8 gap-1.5 text-slate-700 border-slate-300 hover:bg-slate-100 dark:text-slate-300"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export CSV
                    </Button>
                  </div>
                </div>

                {/* Account Balances Summary Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-200/80 dark:border-slate-800">
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                    <div className="text-[11px] text-muted-foreground font-medium">Opening Balance</div>
                    <div className="text-base font-bold font-mono text-slate-800 dark:text-slate-200">
                      AED {activeStatement.opening_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                    <div className="text-[11px] text-muted-foreground font-medium">Total Debits (Period)</div>
                    <div className="text-base font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      AED {filteredTotalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200/80 dark:border-slate-800 shadow-2xs">
                    <div className="text-[11px] text-muted-foreground font-medium">Total Credits (Period)</div>
                    <div className="text-base font-bold font-mono text-rose-600 dark:text-rose-400">
                      AED {filteredTotalCredit.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                  <div className="p-2.5 bg-blue-50/80 dark:bg-blue-950/40 rounded-lg border border-blue-200 dark:border-blue-900 shadow-2xs">
                    <div className="text-[11px] text-blue-700 dark:text-blue-300 font-semibold">Current Balance</div>
                    <div className="text-base font-bold font-mono text-blue-900 dark:text-blue-100">
                      AED {filteredClosingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              </div>

              {/* History Filters & Search Bar */}
              <div className="space-y-3 bg-slate-50/80 dark:bg-slate-900/60 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  {/* Quick Date Pills */}
                  <div className="flex flex-wrap items-center gap-1">
                    {[
                      { id: "all", label: "All" },
                      { id: "today", label: "Today" },
                      { id: "yesterday", label: "Yesterday" },
                      { id: "last_7_days", label: "Last 7 Days" },
                      { id: "this_month", label: "This Month" },
                      { id: "last_month", label: "Last Month" },
                      { id: "this_year", label: "This Year" },
                      { id: "custom", label: "Custom Range" },
                    ].map((pill) => (
                      <Button
                        key={pill.id}
                        type="button"
                        variant={statementDateFilter === pill.id ? "default" : "outline"}
                        size="sm"
                        onClick={() => setStatementDateFilter(pill.id)}
                        className={`text-xs h-7 px-2.5 ${statementDateFilter === pill.id ? "bg-blue-600 text-white font-medium" : "bg-white dark:bg-slate-800 text-muted-foreground hover:text-foreground"}`}
                      >
                        {pill.label}
                      </Button>
                    ))}
                  </div>

                  {/* Search Input */}
                  <div className="relative w-full sm:w-72">
                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Search Txn No, Ref, Counter, Desc..."
                      value={statementSearchQuery}
                      onChange={(e) => setStatementSearchQuery(e.target.value)}
                      className="pl-8 h-8 text-xs bg-white dark:bg-slate-800"
                    />
                    {statementSearchQuery && (
                      <button
                        onClick={() => setStatementSearchQuery("")}
                        className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Custom Date Range Pickers (if active) */}
                {statementDateFilter === "custom" && (
                  <div className="flex flex-wrap items-center gap-3 pt-2 border-t text-xs">
                    <span className="text-muted-foreground font-medium">Custom Range:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">From:</span>
                      <Input
                        type="date"
                        value={statementCustomStart}
                        onChange={(e) => setStatementCustomStart(e.target.value)}
                        className="h-7 text-xs w-36 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground">To:</span>
                      <Input
                        type="date"
                        value={statementCustomEnd}
                        onChange={(e) => setStatementCustomEnd(e.target.value)}
                        className="h-7 text-xs w-36 bg-white dark:bg-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Bulk Selection Action Bar */}
              {selectedTxnIds.length > 0 && (
                <div className="flex items-center justify-between p-2.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-lg text-xs animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-semibold bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                      {selectedTxnIds.length} Selected
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedTxnIds([])}
                      className="h-7 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Clear Selection
                    </Button>
                  </div>
                  {canBulkDeleteEntry && (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setBulkDeleteOpen(true)}
                      className="h-7 text-xs gap-1.5 bg-red-600 hover:bg-red-700 text-white shadow-xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete Selected ({selectedTxnIds.length})
                    </Button>
                  )}
                </div>
              )}

              {/* Transaction History Table */}
              <div className="border rounded-xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto max-h-[50vh]">
                  <Table>
                    <TableHeader className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
                      <TableRow>
                        <TableHead className="w-[36px] px-2 text-center">
                          <Checkbox
                            checked={
                              displayedLedgerLines.length > 0 &&
                              selectedTxnIds.length === displayedLedgerLines.length
                            }
                            onCheckedChange={(checked) => {
                              if (checked) {
                                const ids = displayedLedgerLines
                                  .map((l) => (l.transaction_id || l.id) as string)
                                  .filter((id): id is string => Boolean(id));
                                setSelectedTxnIds(ids);
                              } else {
                                setSelectedTxnIds([]);
                              }
                            }}
                            aria-label="Select all transactions"
                          />
                        </TableHead>
                        <TableHead className="text-xs font-semibold">Date</TableHead>
                        <TableHead className="text-xs font-semibold">Txn No</TableHead>
                        <TableHead className="text-xs font-semibold">Reference</TableHead>
                        <TableHead className="text-xs font-semibold">Description</TableHead>
                        <TableHead className="text-xs font-semibold">Counter Account</TableHead>
                        <TableHead className="text-right text-xs font-semibold">Debit (AED)</TableHead>
                        <TableHead className="text-right text-xs font-semibold">Credit (AED)</TableHead>
                        <TableHead className="text-right text-xs font-semibold">Running Balance</TableHead>
                        <TableHead className="text-xs font-semibold">Source</TableHead>
                        <TableHead className="text-xs font-semibold">Method</TableHead>
                        <TableHead className="text-xs font-semibold">By</TableHead>
                        <TableHead className="w-[90px] text-right text-xs font-semibold">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {displayedLedgerLines.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={13} className="text-center py-10 text-xs text-muted-foreground">
                            No ledger transactions recorded matching the selected filter.
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayedLedgerLines.map((l, idx) => {
                          const rowTxnId = ((l.transaction_id || l.id) as string) || "";
                          return (
                          <TableRow key={l.id || idx} className={`hover:bg-slate-50/70 dark:hover:bg-slate-900/40 text-xs ${l.is_reversal ? "bg-amber-50/30 dark:bg-amber-950/10 text-muted-foreground" : ""}`}>
                            <TableCell className="px-2 text-center">
                              <Checkbox
                                checked={Boolean(rowTxnId && selectedTxnIds.includes(rowTxnId))}
                                onCheckedChange={(checked) => {
                                  if (!rowTxnId) return;
                                  if (checked) {
                                    setSelectedTxnIds((prev) => [...prev, rowTxnId]);
                                  } else {
                                    setSelectedTxnIds((prev) => prev.filter((x) => x !== rowTxnId));
                                  }
                                }}
                                aria-label={`Select transaction ${l.transaction_number}`}
                              />
                            </TableCell>
                            <TableCell className="font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">{l.date}</TableCell>
                            <TableCell className="font-mono font-semibold text-blue-600 dark:text-blue-400 whitespace-nowrap">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveTxnDetails(l);
                                  setTxnDetailsOpen(true);
                                }}
                                className="hover:underline flex items-center gap-1 text-left"
                                title="Click to view full double-entry voucher"
                              >
                                {l.transaction_number}
                              </button>
                            </TableCell>
                            <TableCell className="font-mono text-muted-foreground text-[11px] whitespace-nowrap">
                              {l.reference_id || "—"}
                            </TableCell>
                            <TableCell className="font-medium max-w-[220px] truncate" title={l.description}>
                              {l.description}
                              {l.is_reversal && (
                                <Badge variant="outline" className="ml-1.5 text-[9px] border-amber-300 text-amber-700 bg-amber-50">
                                  Reversal
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-[11px] text-slate-600 dark:text-slate-300 max-w-[170px] truncate" title={l.counter_accounts || l.counter_account_name || "—"}>
                              <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[10px]">
                                {l.counter_accounts || l.counter_account_name || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                              {l.debit > 0 ? l.debit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold text-rose-700 dark:text-rose-400 whitespace-nowrap">
                              {l.credit > 0 ? l.credit.toLocaleString("en-US", { minimumFractionDigits: 2 }) : "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                              AED {l.running_balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              <Badge variant="outline" className="text-[10px] capitalize font-medium">
                                {l.source_module || "Manual"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {l.payment_method || "—"}
                            </TableCell>
                            <TableCell className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {l.created_by || "System"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setActiveTxnDetails(l);
                                    setTxnDetailsOpen(true);
                                  }}
                                  className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700"
                                  title="View Transaction Details"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </Button>
                                {canManageAccounts && !l.is_reversal && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setTxnToReverse(l);
                                      setTxnReversalReason("");
                                      setTxnReversalOpen(true);
                                    }}
                                    className="h-6 w-6 p-0 text-slate-400 hover:text-amber-600"
                                    title="Reverse / Void Transaction"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </Button>
                                )}
                                {canDeleteEntry && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      setTxnToDelete(l);
                                      setDeleteEntryOpen(true);
                                    }}
                                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/50"
                                    title="Delete Entry"
                                  >
                                    <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Table Footer Summary Bar */}
              <div className="p-3 bg-slate-100 dark:bg-slate-800/80 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
                <div className="text-muted-foreground">
                  Showing <strong>{displayedLedgerLines.length}</strong> transactions
                </div>
                <div className="flex items-center gap-4">
                  <div>Debits: <strong className="text-emerald-700 dark:text-emerald-400">AED {filteredTotalDebit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></div>
                  <div>Credits: <strong className="text-rose-700 dark:text-rose-400">AED {filteredTotalCredit.toLocaleString("en-US", { minimumFractionDigits: 2 })}</strong></div>
                  <div className="pl-3 border-l font-bold text-blue-800 dark:text-blue-200">
                    Closing: AED {filteredClosingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: DELETE TRANSACTION ENTRY CONFIRMATION ───────────────────── */}
      <Dialog open={deleteEntryOpen} onOpenChange={setDeleteEntryOpen}>
        <DialogContent className="max-w-md p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 dark:bg-red-950/60 rounded-full">
                <AlertTriangle className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {activeStatement?.account?.account_code === "1001" || activeStatement?.account?.account_name?.toLowerCase().includes("cash")
                    ? "Delete Cash Transaction Entry?"
                    : "Delete Account Transaction Entry?"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Permanent removal of double-entry transaction voucher
                </DialogDescription>
              </div>
            </div>

            {txnToDelete && (
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900 rounded-lg border text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction No:</span>
                  <span className="font-mono font-bold text-blue-600">{txnToDelete.transaction_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Date:</span>
                  <span className="font-mono">{txnToDelete.date}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Amount:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    AED {((Number(txnToDelete.debit) || 0) > 0 ? Number(txnToDelete.debit) : Number(txnToDelete.credit) || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Description:</span>
                  <span className="truncate max-w-[220px] font-medium">{txnToDelete.description || "—"}</span>
                </div>
                {(txnToDelete.counter_accounts || txnToDelete.counter_account_name) && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Counter Account:</span>
                    <span className="font-mono text-[11px] truncate max-w-[200px]">{txnToDelete.counter_accounts || txnToDelete.counter_account_name}</span>
                  </div>
                )}
              </div>
            )}

            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg text-xs text-red-800 dark:text-red-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Automatic Double-Entry Removal
              </div>
              <p className="text-[11px] leading-relaxed">
                Deleting this transaction will permanently delete both sides of the double-entry voucher. Account balances and financial reports will be updated automatically.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setDeleteEntryOpen(false);
                  setTxnToDelete(null);
                }}
                disabled={isDeletingTxn}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmDeleteEntry}
                disabled={isDeletingTxn}
                className="bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                {isDeletingTxn ? "Deleting..." : "Permanently Delete Entry"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: BULK DELETE TRANSACTIONS CONFIRMATION ───────────────────── */}
      <Dialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <DialogContent className="max-w-md p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-3 text-red-600">
              <div className="p-2.5 bg-red-100 dark:bg-red-950/60 rounded-full">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <div>
                <DialogTitle className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Delete {selectedTxnIds.length} Selected Entries?
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Bulk removal of accounting transaction vouchers
                </DialogDescription>
              </div>
            </div>

            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-lg text-xs text-red-800 dark:text-red-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Permanent Double-Entry Deletion
              </div>
              <p className="text-[11px] leading-relaxed">
                You have selected <strong>{selectedTxnIds.length}</strong> transactions. Deleting them will remove both debit and credit sides of every transaction voucher, and recalculate all corresponding account balances. This cannot be undone.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBulkDeleteOpen(false)}
                disabled={isDeletingTxn}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleConfirmBulkDelete}
                disabled={isDeletingTxn}
                className="bg-red-600 hover:bg-red-700 text-white font-medium"
              >
                {isDeletingTxn ? "Deleting..." : `Delete ${selectedTxnIds.length} Entries`}
              </Button>
            </div>
          </div>
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
                  Reset ATIQ JEHAN Accounting Data?
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                  Reset financial ledger and bank balances to clean zero
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
                <span className="text-slate-700 dark:text-slate-300">Transactions, Test Journals, Opening Balances</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Other Workspaces:</span>
                <span className="text-emerald-600 font-medium">100% Protected & Isolated</span>
              </div>
            </div>

            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-lg text-xs text-amber-800 dark:text-amber-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" />
                What will happen:
              </div>
              <ul className="list-disc list-inside text-[11px] space-y-1 pl-1">
                <li>All general ledger transactions and journal entries will be purged.</li>
                <li>All bank account and chart of account opening balances will be set to AED 0.00.</li>
                <li>Cash on Hand, Bank Balance, Receivables, Payables will be AED 0.00.</li>
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
                {isResettingAccounting ? "Resetting..." : "Reset ATIQ JEHAN Accounting"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 2: ADD ACCOUNT ENTRY (STRICT DOUBLE-ENTRY) ──────────────── */}
      <Dialog open={addEntryOpen} onOpenChange={setAddEntryOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <form onSubmit={handleExecuteAddEntry} className="space-y-4">
            <div className="border-b pb-3">
              <DialogTitle className="text-lg font-bold flex items-center gap-2">
                <Scale className="w-5 h-5 text-emerald-600" />
                Add Account Entry
              </DialogTitle>
              <DialogDescription className="text-xs">
                Post an individual accounting entry with mandatory counter account ensuring strict double-entry balance.
              </DialogDescription>
            </div>

            {/* Primary Account Overview Banner */}
            {selectedPrimaryAccount && (
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <div>
                  <span className="text-muted-foreground">Target Account:</span>
                  <div className="font-semibold text-sm flex items-center gap-2 mt-0.5">
                    <span className="font-mono text-blue-600">{selectedPrimaryAccount.account_code}</span>
                    <span>{selectedPrimaryAccount.account_name}</span>
                    <Badge variant="outline" className="text-[10px] uppercase font-mono">{selectedPrimaryAccount.account_type}</Badge>
                  </div>
                </div>
                <div className="sm:text-right">
                  <div className="text-muted-foreground text-[11px]">Current Balance:</div>
                  <div className="font-mono font-bold text-sm text-blue-700 dark:text-blue-300">
                    AED {Number(selectedPrimaryAccount.current_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Date */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Date *</Label>
                <Input
                  type="date"
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="h-8 text-xs font-mono"
                  required
                />
              </div>

              {/* Entry Type */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Entry Type *</Label>
                <Select
                  value={entryType}
                  onValueChange={(v: any) => setEntryType(v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="money_in">Money In (Deposit / Payment In)</SelectItem>
                    <SelectItem value="money_out">Money Out (Disbursement / Payment Out)</SelectItem>
                    <SelectItem value="debit">Direct Debit (Dr Target, Cr Counter)</SelectItem>
                    <SelectItem value="credit">Direct Credit (Cr Target, Dr Counter)</SelectItem>
                    <SelectItem value="adjustment">General Adjustment</SelectItem>
                    {canManageAccounts && (
                      <SelectItem value="opening_balance_adjustment">Opening Balance Adjustment</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Amount */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Amount (AED) *</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  placeholder="0.00"
                  value={entryAmount}
                  onChange={(e) => setEntryAmount(e.target.value)}
                  className="h-8 text-xs font-mono font-bold"
                  required
                />
              </div>

              {/* Payment Method */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Method</Label>
                <Select
                  value={entryPaymentMethod}
                  onValueChange={(v: any) => v && setEntryPaymentMethod(v)}
                >
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                    <SelectItem value="Cheque">Cheque</SelectItem>
                    <SelectItem value="Credit Card">Credit Card</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Counter Account (Mandatory) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Counter Account * <span className="text-muted-foreground font-normal">(Required for balanced double-entry)</span></Label>
                {selectedCounterAccount && (
                  <span className="text-[11px] text-muted-foreground font-mono">
                    Bal: AED {Number(selectedCounterAccount.current_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </span>
                )}
              </div>

              <div className="relative">
                <Select
                  value={entryCounterAccountId}
                  onValueChange={(v: any) => v && setEntryCounterAccountId(v)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="Select Counter Account..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {transferrableAccounts
                      .filter((a) => a.id !== entryAccountId)
                      .map((acc) => (
                        <SelectItem key={acc.id} value={acc.id} className="text-xs font-mono py-1.5">
                          <div className="flex items-center justify-between gap-4 w-full">
                            <div>
                              <span className="font-bold text-blue-600 mr-2">{acc.account_code}</span>
                              <span className="font-medium">{acc.account_name}</span>
                              <span className="text-muted-foreground text-[10px] ml-1.5">({acc.account_sub_type})</span>
                            </div>
                            <span className="text-slate-500 text-[10px]">
                              AED {Number(acc.current_balance || 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Reference Number */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Reference Number</Label>
                <Input
                  placeholder="e.g. CHQ-10492, RCPT-402, INV-200"
                  value={entryRef}
                  onChange={(e) => setEntryRef(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              {/* Description / Remarks */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Description / Remarks *</Label>
                <Input
                  placeholder="e.g. Spare parts payment, Counter float top-up"
                  value={entryRemarks}
                  onChange={(e) => setEntryRemarks(e.target.value)}
                  className="h-8 text-xs"
                  required
                />
              </div>
            </div>

            {/* Optional Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs">Notes / Internal Memorandum (Optional)</Label>
              <Input
                placeholder="Additional audit details or authorized notes"
                value={entryNotes}
                onChange={(e) => setEntryNotes(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            {/* Live Double-Entry Preview Card */}
            {entryLegsPreview && (
              <div className="p-3.5 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-900 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-blue-900 dark:text-blue-200">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Double-Entry Voucher Preview
                  </span>
                  <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                    Balanced: Total Debit = Total Credit
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono pt-1">
                  <div className="p-2 bg-white dark:bg-slate-900 rounded border border-emerald-200 dark:border-emerald-900/60">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide">Debit Leg</span>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {entryLegsPreview.debitAccount.account_code} - {entryLegsPreview.debitAccount.account_name}
                    </div>
                    <div className="text-emerald-700 dark:text-emerald-400 font-bold mt-0.5">
                      + AED {entryLegsPreview.amount.toFixed(2)}
                    </div>
                  </div>

                  <div className="p-2 bg-white dark:bg-slate-900 rounded border border-rose-200 dark:border-rose-900/60">
                    <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wide">Credit Leg</span>
                    <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {entryLegsPreview.creditAccount.account_code} - {entryLegsPreview.creditAccount.account_name}
                    </div>
                    <div className="text-rose-700 dark:text-rose-400 font-bold mt-0.5">
                      - AED {entryLegsPreview.amount.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddEntryOpen(false)}
                disabled={entrySubmitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={entrySubmitting || numEntryAmount <= 0 || !entryCounterAccountId}
                className="text-xs gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
              >
                {entrySubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    Posting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Post Entry
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 3: TRANSACTION DETAILS & JOURNAL VOUCHER ─────────────────── */}
      <Dialog open={txnDetailsOpen} onOpenChange={setTxnDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          {activeTxnDetails && (
            <div className="space-y-4">
              <div className="border-b pb-3">
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-lg font-bold flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600" />
                    Journal Transaction Voucher
                  </DialogTitle>
                  <Badge variant="outline" className="font-mono text-xs text-blue-600">
                    {activeTxnDetails.transaction_number}
                  </Badge>
                </div>
                <DialogDescription className="text-xs text-muted-foreground mt-1">
                  Posted on {activeTxnDetails.date} &bull; Source: {activeTxnDetails.source_module || "Manual"} &bull; Created By: {activeTxnDetails.created_by || "System"}
                </DialogDescription>
              </div>

              {/* Transaction Metadata Card */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border text-xs">
                <div>
                  <span className="text-muted-foreground text-[11px]">Transaction No:</span>
                  <div className="font-mono font-semibold">{activeTxnDetails.transaction_number}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Date:</span>
                  <div className="font-mono">{activeTxnDetails.date}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Reference:</span>
                  <div className="font-mono">{activeTxnDetails.reference_id || "—"}</div>
                </div>
                <div>
                  <span className="text-muted-foreground text-[11px]">Payment Method:</span>
                  <div>{activeTxnDetails.payment_method || "—"}</div>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border text-xs">
                <span className="text-muted-foreground text-[11px] block">Description:</span>
                <span className="font-medium text-slate-900 dark:text-slate-100">{activeTxnDetails.description}</span>
              </div>

              {/* Breakdown of Debit & Credit Entries */}
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Double-Entry Breakdown</h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-slate-100 dark:bg-slate-800">
                      <TableRow>
                        <TableHead className="text-xs font-semibold">Account Code</TableHead>
                        <TableHead className="text-xs font-semibold">Account Name</TableHead>
                        <TableHead className="text-right text-xs font-semibold">Debit (AED)</TableHead>
                        <TableHead className="text-right text-xs font-semibold">Credit (AED)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeTxnDetails.entries && activeTxnDetails.entries.length > 0 ? (
                        activeTxnDetails.entries.map((entry, idx) => (
                          <TableRow key={idx} className="text-xs font-mono">
                            <TableCell className="font-semibold text-blue-600">{entry.account_code}</TableCell>
                            <TableCell className="font-sans font-medium">{entry.account_name}</TableCell>
                            <TableCell className="text-right text-emerald-600 font-bold">
                              {entry.debit > 0 ? entry.debit.toFixed(2) : "—"}
                            </TableCell>
                            <TableCell className="text-right text-rose-600 font-bold">
                              {entry.credit > 0 ? entry.credit.toFixed(2) : "—"}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow className="text-xs font-mono">
                          <TableCell className="font-semibold text-blue-600">{activeTxnDetails.counter_account_code || "—"}</TableCell>
                          <TableCell className="font-sans font-medium">{activeTxnDetails.counter_accounts || activeTxnDetails.counter_account_name || "Offsetting Entry"}</TableCell>
                          <TableCell className="text-right text-emerald-600 font-bold">
                            {activeTxnDetails.debit > 0 ? activeTxnDetails.debit.toFixed(2) : "—"}
                          </TableCell>
                          <TableCell className="text-right text-rose-600 font-bold">
                            {activeTxnDetails.credit > 0 ? activeTxnDetails.credit.toFixed(2) : "—"}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Total Balance Verification */}
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-900 text-xs flex items-center justify-between">
                <span className="text-emerald-800 dark:text-emerald-200 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Double-Entry Equation Balanced
                </span>
                <span className="font-mono font-bold text-emerald-900 dark:text-emerald-100">
                  Total Debit = Total Credit
                </span>
              </div>

              <DialogFooter className="gap-2 pt-2 border-t">
                {canManageAccounts && !activeTxnDetails.is_reversal && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setTxnToReverse(activeTxnDetails);
                      setTxnReversalReason("");
                      setTxnReversalOpen(true);
                    }}
                    className="text-xs text-rose-700 border-rose-200 hover:bg-rose-50 gap-1"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reverse Transaction
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setTxnDetailsOpen(false)}
                  className="text-xs"
                >
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 4: REVERSAL CONFIRMATION DIALOG ─────────────────────────── */}
      <Dialog open={txnReversalOpen} onOpenChange={setTxnReversalOpen}>
        <DialogContent className="max-w-md p-5">
          {txnToReverse && (
            <div className="space-y-4">
              <div>
                <DialogTitle className="text-base font-bold flex items-center gap-2 text-rose-700">
                  <AlertCircle className="w-5 h-5 text-rose-600" />
                  Reverse Transaction
                </DialogTitle>
                <DialogDescription className="text-xs mt-1">
                  This will post an offsetting balanced journal entry reversing transaction <strong className="text-foreground">{txnToReverse.transaction_number}</strong>. Original entries remain preserved in audit history.
                </DialogDescription>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border text-xs space-y-1 font-mono">
                <div>Txn No: <strong>{txnToReverse.transaction_number}</strong></div>
                <div>Date: {txnToReverse.date}</div>
                <div>Description: {txnToReverse.description}</div>
                <div>Amount: AED {Math.max(txnToReverse.debit, txnToReverse.credit).toFixed(2)}</div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Reason for Reversal (Optional)</Label>
                <Input
                  placeholder="e.g. Duplicate entry, Incorrect account, Voided transaction"
                  value={txnReversalReason}
                  onChange={(e) => setTxnReversalReason(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <DialogFooter className="gap-2 pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTxnReversalOpen(false)}
                  disabled={txnReversing}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleExecuteTransactionReversal}
                  disabled={txnReversing}
                  className="text-xs bg-rose-600 hover:bg-rose-700 text-white gap-1.5 shadow-sm"
                >
                  {txnReversing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Reversing...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-3.5 h-3.5" />
                      Confirm Reversal
                    </>
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL 5: PRINT ACCOUNT LEDGER STATEMENT ───────────────────────── */}
      <Dialog open={printLedgerOpen} onOpenChange={setPrintLedgerOpen}>
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto p-6">
          {activeStatement && (
            <div className="space-y-6">
              {/* Printable Header */}
              <div className="border-b pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black tracking-wider text-slate-900">ATIQ JEHAN AUTO REPAIR</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Musaffah M-14, Abu Dhabi, UAE &bull; TRN: 100234567800003 &bull; Phone: +971 50 123 4567</p>
                  <h3 className="text-base font-bold text-blue-700 mt-2 uppercase tracking-wide">General Ledger Account Statement</h3>
                </div>
                <div className="sm:text-right text-xs">
                  <div className="font-mono text-slate-500">Printed: {new Date().toISOString().slice(0, 10)}</div>
                  <div className="font-mono text-slate-700 font-semibold">Statement Period: {statementDateFilter.toUpperCase().replace(/_/g, " ")}</div>
                </div>
              </div>

              {/* Account Header Details */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 bg-slate-50 rounded-lg border text-xs">
                <div>
                  <span className="text-slate-500">Account Code:</span>
                  <div className="font-mono font-bold text-sm text-blue-700">{activeStatement.account.account_code}</div>
                </div>
                <div>
                  <span className="text-slate-500">Account Name:</span>
                  <div className="font-bold text-sm text-slate-900">{activeStatement.account.account_name}</div>
                </div>
                <div>
                  <span className="text-slate-500">Account Type / Sub:</span>
                  <div className="font-medium text-slate-800">{activeStatement.account.account_type.toUpperCase()} ({activeStatement.account.account_sub_type})</div>
                </div>
                <div>
                  <span className="text-slate-500">Opening Balance:</span>
                  <div className="font-mono font-bold text-slate-900">AED {activeStatement.opening_balance.toFixed(2)}</div>
                </div>
              </div>

              {/* Ledger Statement Table */}
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-slate-100">
                    <TableRow>
                      <TableHead className="text-xs font-semibold text-slate-900">Date</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-900">Txn No</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-900">Reference</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-900">Description</TableHead>
                      <TableHead className="text-xs font-semibold text-slate-900">Counter Account</TableHead>
                      <TableHead className="text-right text-xs font-semibold text-slate-900">Debit (AED)</TableHead>
                      <TableHead className="text-right text-xs font-semibold text-slate-900">Credit (AED)</TableHead>
                      <TableHead className="text-right text-xs font-semibold text-slate-900">Balance (AED)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {displayedLedgerLines.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-6 text-xs text-slate-500">
                          No transactions found for the selected period.
                        </TableCell>
                      </TableRow>
                    ) : (
                      displayedLedgerLines.map((l, idx) => (
                        <TableRow key={idx} className="text-xs font-mono">
                          <TableCell className="text-slate-700">{l.date}</TableCell>
                          <TableCell className="font-semibold text-blue-700">{l.transaction_number}</TableCell>
                          <TableCell className="text-slate-500">{l.reference_id || "—"}</TableCell>
                          <TableCell className="font-sans font-medium text-slate-800">{l.description}</TableCell>
                          <TableCell className="text-slate-600">{l.counter_accounts || l.counter_account_name || "—"}</TableCell>
                          <TableCell className="text-right text-emerald-700 font-bold">{l.debit > 0 ? l.debit.toFixed(2) : "—"}</TableCell>
                          <TableCell className="text-right text-rose-700 font-bold">{l.credit > 0 ? l.credit.toFixed(2) : "—"}</TableCell>
                          <TableCell className="text-right font-bold text-slate-900">{l.running_balance.toFixed(2)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Totals Summary */}
              <div className="grid grid-cols-3 gap-3 p-3 bg-slate-100 rounded-lg text-xs font-mono border">
                <div>Total Period Debits: <strong className="text-emerald-700 font-bold">AED {filteredTotalDebit.toFixed(2)}</strong></div>
                <div>Total Period Credits: <strong className="text-rose-700 font-bold">AED {filteredTotalCredit.toFixed(2)}</strong></div>
                <div className="text-right">Closing Balance: <strong className="text-blue-800 text-sm font-bold">AED {filteredClosingBalance.toFixed(2)}</strong></div>
              </div>

              {/* Signatures */}
              <div className="pt-8 grid grid-cols-2 gap-12 text-xs">
                <div className="border-t border-slate-300 pt-2 text-center text-slate-600">
                  Prepared By (Accountant / Cashier)
                </div>
                <div className="border-t border-slate-300 pt-2 text-center text-slate-600">
                  Approved By (Workshop Owner / Director)
                </div>
              </div>

              <DialogFooter className="gap-2 pt-4 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPrintLedgerOpen(false)}
                  className="text-xs"
                >
                  Close
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => window.print()}
                  className="text-xs bg-blue-600 hover:bg-blue-700 text-white gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / Save as PDF
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: CUSTOMER STATEMENT ────────────────────────────────────── */}
      <Dialog open={customerStmtOpen} onOpenChange={setCustomerStmtOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {customerStmtData && (
            <div className="space-y-4">
              <div className="border-b pb-3">
                <DialogTitle className="text-base font-bold">
                  Customer Ledger Statement: {customerStmtData.customer?.name}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Company: {customerStmtData.customer?.company_name || "—"} &bull; Phone: {customerStmtData.customer?.mobile || "—"}
                </DialogDescription>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded border text-xs">
                  <div className="text-muted-foreground">Total Invoiced (Debits)</div>
                  <div className="text-base font-bold font-mono">
                    AED {customerStmtData.totalInvoiced.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded border text-xs">
                  <div className="text-muted-foreground">Total Paid (Credits)</div>
                  <div className="text-base font-bold font-mono text-emerald-600">
                    AED {customerStmtData.totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3 bg-amber-50 rounded border border-amber-200 text-xs">
                  <div className="text-amber-800 font-semibold">Current Outstanding</div>
                  <div className="text-base font-bold font-mono text-amber-900">
                    AED {customerStmtData.outstandingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <Table className="border rounded">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Ref</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-right text-xs">Debit</TableHead>
                    <TableHead className="text-right text-xs">Credit</TableHead>
                    <TableHead className="text-right text-xs">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerStmtData.lines.map((l: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{l.date}</TableCell>
                      <TableCell className="text-xs font-mono">{l.transaction_number}</TableCell>
                      <TableCell className="text-xs">{l.description}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{l.debit > 0 ? l.debit : "—"}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{l.credit > 0 ? l.credit : "—"}</TableCell>
                      <TableCell className="text-right text-xs font-mono font-semibold">{l.running_balance}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: SUPPLIER STATEMENT ────────────────────────────────────── */}
      <Dialog open={supplierStmtOpen} onOpenChange={setSupplierStmtOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {supplierStmtData && (
            <div className="space-y-4">
              <div className="border-b pb-3">
                <DialogTitle className="text-base font-bold">
                  Supplier Ledger Statement: {supplierStmtData.supplier?.name}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Phone: {supplierStmtData.supplier?.phone || "—"} &bull; TRN: {supplierStmtData.supplier?.trn || "—"}
                </DialogDescription>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded border text-xs">
                  <div className="text-muted-foreground">Total Purchases</div>
                  <div className="text-base font-bold font-mono">
                    AED {supplierStmtData.totalPurchases.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded border text-xs">
                  <div className="text-muted-foreground">Total Payments</div>
                  <div className="text-base font-bold font-mono text-blue-600">
                    AED {supplierStmtData.totalPayments.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3 bg-red-50 rounded border border-red-200 text-xs">
                  <div className="text-red-800 font-semibold">Remaining Payable</div>
                  <div className="text-base font-bold font-mono text-red-900">
                    AED {supplierStmtData.remainingBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <Table className="border rounded">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Ref</TableHead>
                    <TableHead className="text-xs">Purchase / Payment</TableHead>
                    <TableHead className="text-right text-xs">Debit</TableHead>
                    <TableHead className="text-right text-xs">Credit</TableHead>
                    <TableHead className="text-right text-xs">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {supplierStmtData.lines.map((l: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{l.date}</TableCell>
                      <TableCell className="text-xs font-mono">{l.transaction_number}</TableCell>
                      <TableCell className="text-xs">{l.description}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{l.debit > 0 ? l.debit : "—"}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{l.credit > 0 ? l.credit : "—"}</TableCell>
                      <TableCell className="text-right text-xs font-mono font-semibold">{l.running_balance}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: WORKER STATEMENT ──────────────────────────────────────── */}
      <Dialog open={workerStmtOpen} onOpenChange={setWorkerStmtOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {workerStmtData && (
            <div className="space-y-4">
              <div className="border-b pb-3">
                <DialogTitle className="text-base font-bold">
                  Worker Financial Ledger: {workerStmtData.worker?.name}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {workerStmtData.worker?.job_position} &bull; Basic Salary: AED {workerStmtData.worker?.basic_salary}
                </DialogDescription>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 rounded border text-xs">
                  <div className="text-muted-foreground">Salary Due (Credits)</div>
                  <div className="text-base font-bold font-mono">
                    AED {workerStmtData.totalSalaryDue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3 bg-slate-50 rounded border text-xs">
                  <div className="text-muted-foreground">Disbursed (Debits)</div>
                  <div className="text-base font-bold font-mono text-emerald-600">
                    AED {workerStmtData.totalPaid.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
                <div className="p-3 bg-purple-50 rounded border border-purple-200 text-xs">
                  <div className="text-purple-800 font-semibold">Remaining Payable</div>
                  <div className="text-base font-bold font-mono text-purple-900">
                    AED {workerStmtData.remainingPayable.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </div>
                </div>
              </div>

              <Table className="border rounded">
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs">Date</TableHead>
                    <TableHead className="text-xs">Ref</TableHead>
                    <TableHead className="text-xs">Description</TableHead>
                    <TableHead className="text-right text-xs">Debit</TableHead>
                    <TableHead className="text-right text-xs">Credit</TableHead>
                    <TableHead className="text-right text-xs">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workerStmtData.lines.map((l: any, i: number) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs font-mono">{l.date}</TableCell>
                      <TableCell className="text-xs font-mono">{l.transaction_number}</TableCell>
                      <TableCell className="text-xs">{l.description}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{l.debit > 0 ? l.debit : "—"}</TableCell>
                      <TableCell className="text-right text-xs font-mono">{l.credit > 0 ? l.credit : "—"}</TableCell>
                      <TableCell className="text-right text-xs font-mono font-semibold">{l.running_balance}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: ADD LEDGER ACCOUNT ────────────────────────────────────── */}
      <Dialog open={newAccountOpen} onOpenChange={setNewAccountOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <DialogTitle className="text-base font-bold">Add New Ledger Account</DialogTitle>
            <DialogDescription className="text-xs">
              Create a new account in the workshop's Chart of Accounts
            </DialogDescription>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Account Code *</Label>
                  <Input
                    required
                    placeholder="e.g. 5015"
                    value={accCode}
                    onChange={(e) => setAccCode(e.target.value)}
                    className="text-xs h-9 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Account Type *</Label>
                  <Select
                    value={accType}
                    onValueChange={(val: any) => {
                      setAccType(val);
                      const defaultSubs = DEFAULT_ACCOUNT_SUB_TYPES[val] || [];
                      if (defaultSubs.length > 0) setAccSubType(defaultSubs[0]);
                    }}
                  >
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Select Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Account Name *</Label>
                <Input
                  required
                  placeholder="e.g. Generator Maintenance Expense"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Account Sub Type *</Label>
                <Select value={accSubType} onValueChange={(val) => { if (val) setAccSubType(val); }}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Sub Type" />
                  </SelectTrigger>
                  <SelectContent>
                    {(DEFAULT_ACCOUNT_SUB_TYPES[accType] || []).map((sub) => (
                      <SelectItem key={sub} value={sub}>
                        {sub}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Opening Balance (AED)</Label>
                <Input
                  type="number"
                  step="any"
                  placeholder="0.00"
                  value={accOpeningBal}
                  onChange={(e) => setAccOpeningBal(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes (Optional)</Label>
                <Input
                  placeholder="Purpose of this ledger account..."
                  value={accNotes}
                  onChange={(e) => setAccNotes(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewAccountOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                Save Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: ADD WORKER ────────────────────────────────────────────── */}
      <Dialog open={newWorkerOpen} onOpenChange={setNewWorkerOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateWorker} className="space-y-4">
            <DialogTitle className="text-base font-bold">Add Worker Account</DialogTitle>
            <DialogDescription className="text-xs">
              Add a workshop technician for financial salary and advance tracking
            </DialogDescription>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Worker Full Name *</Label>
                <Input
                  required
                  placeholder="e.g. Tariq Mehmood"
                  value={workerName}
                  onChange={(e) => setWorkerName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Phone Number</Label>
                <Input
                  placeholder="+971 50 000 0000"
                  value={workerPhone}
                  onChange={(e) => setWorkerPhone(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Job / Position</Label>
                  <Select value={workerRole} onValueChange={(val) => { if (val) setWorkerRole(val); }}>
                    <SelectTrigger className="text-xs h-9">
                      <SelectValue placeholder="Position" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Mechanic">Mechanic</SelectItem>
                      <SelectItem value="Auto Electrician">Auto Electrician</SelectItem>
                      <SelectItem value="Denter & Painter">Denter & Painter</SelectItem>
                      <SelectItem value="Workshop Assistant">Workshop Assistant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Basic Salary (AED)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={workerSalary}
                    onChange={(e) => setWorkerSalary(e.target.value)}
                    className="text-xs h-9 font-mono"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewWorkerOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                Save Worker
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: ACCRUE WORKER SALARY DUE ──────────────────────────────── */}
      <Dialog open={workerSalaryDueOpen} onOpenChange={setWorkerSalaryDueOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleRecordWorkerSalaryDue} className="space-y-4">
            <DialogTitle className="text-base font-bold">Accrue Worker Salary Due</DialogTitle>
            <DialogDescription className="text-xs">
              Debits: Salaries & Wages Expense &bull; Credits: Worker Payable
            </DialogDescription>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Select Worker *</Label>
                <Select value={selectedWorkerId} onValueChange={(val) => { if (val) setSelectedWorkerId(val); }}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Select Worker" />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name} ({w.job_position})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Salary Amount (AED) *</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  placeholder="2500"
                  value={salaryDueAmount}
                  onChange={(e) => setSalaryDueAmount(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Period / Description</Label>
                <Input
                  value={salaryDuePeriod}
                  onChange={(e) => setSalaryDuePeriod(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setWorkerSalaryDueOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                Post Salary Due
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: PAY WORKER SALARY ─────────────────────────────────────── */}
      <Dialog open={workerPayOpen} onOpenChange={setWorkerPayOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleRecordWorkerPayment} className="space-y-4">
            <DialogTitle className="text-base font-bold">Disburse Worker Salary</DialogTitle>
            <DialogDescription className="text-xs">
              Debits: Worker Payable &bull; Credits: Cash on Hand or Bank Account
            </DialogDescription>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Select Worker *</Label>
                <Select value={selectedWorkerId} onValueChange={(val) => { if (val) setSelectedWorkerId(val); }}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Select Worker" />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Disbursement Amount (AED) *</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  placeholder="1500"
                  value={workerPayAmount}
                  onChange={(e) => setWorkerPayAmount(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Disbursement Method</Label>
                <Select value={workerPayMethod} onValueChange={(val) => { if (val) setWorkerPayMethod(val); }}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash on Hand</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer (ADCB / FAB)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes / Receipt Ref</Label>
                <Input
                  placeholder="e.g. Paid in cash at workshop counter"
                  value={workerPayNotes}
                  onChange={(e) => setWorkerPayNotes(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setWorkerPayOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white">
                Post Salary Disbursement
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: WORKER ADVANCE ────────────────────────────────────────── */}
      <Dialog open={workerAdvOpen} onOpenChange={setWorkerAdvOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleRecordWorkerAdvance} className="space-y-4">
            <DialogTitle className="text-base font-bold">Disburse Staff Advance Loan</DialogTitle>
            <DialogDescription className="text-xs">
              Debits: Staff & Worker Advances (Asset) &bull; Credits: Cash/Bank
            </DialogDescription>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Select Worker *</Label>
                <Select value={selectedWorkerId} onValueChange={(val) => { if (val) setSelectedWorkerId(val); }}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Select Worker" />
                  </SelectTrigger>
                  <SelectContent>
                    {workers.map((w) => (
                      <SelectItem key={w.id} value={w.id}>
                        {w.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Advance Amount (AED) *</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  placeholder="500"
                  value={workerAdvAmount}
                  onChange={(e) => setWorkerAdvAmount(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Disbursement Method</Label>
                <Select value={workerAdvMethod} onValueChange={(val) => { if (val) setWorkerAdvMethod(val); }}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash on Hand</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Notes / Purpose</Label>
                <Input
                  placeholder="e.g. Emergency personal loan advance"
                  value={workerAdvNotes}
                  onChange={(e) => setWorkerAdvNotes(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setWorkerAdvOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-amber-600 hover:bg-amber-700 text-white">
                Disburse Advance
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: ADD BANK ACCOUNT ──────────────────────────────────────── */}
      <Dialog open={newBankOpen} onOpenChange={setNewBankOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleCreateBank} className="space-y-4">
            <DialogTitle className="text-base font-bold">Add Business Bank Account</DialogTitle>
            <DialogDescription className="text-xs">
              Automatically creates a corresponding 1000s Asset account in the Ledger
            </DialogDescription>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Bank Name *</Label>
                <Input
                  required
                  placeholder="e.g. Abu Dhabi Commercial Bank (ADCB)"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Account Title / Name *</Label>
                <Input
                  required
                  placeholder="e.g. Atiq Jehan Auto Repair - Operations"
                  value={bankAccName}
                  onChange={(e) => setBankAccName(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Last 4 Digits</Label>
                  <Input
                    placeholder="4920"
                    value={bankLastDigits}
                    onChange={(e) => setBankLastDigits(e.target.value)}
                    className="text-xs h-9 font-mono"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Opening Balance (AED)</Label>
                  <Input
                    type="number"
                    step="any"
                    value={bankOpeningBal}
                    onChange={(e) => setBankOpeningBal(e.target.value)}
                    className="text-xs h-9 font-mono"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewBankOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                Save Bank Account
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: OWNER TRANSACTIONS ────────────────────────────────────── */}
      <Dialog open={ownerTxnOpen} onOpenChange={setOwnerTxnOpen}>
        <DialogContent className="max-w-md">
          <form onSubmit={handleOwnerTransaction} className="space-y-4">
            <DialogTitle className="text-base font-bold">Record Owner Equity Transaction</DialogTitle>
            <DialogDescription className="text-xs">
              Proper double-entry posting to Owner Capital, Drawings, or Advance accounts
            </DialogDescription>

            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Transaction Type *</Label>
                <Select value={ownerTxnType} onValueChange={(val: any) => setOwnerTxnType(val)}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Select Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="capital">Capital Introduced (Inflow)</SelectItem>
                    <SelectItem value="drawings">Owner Drawings / Personal Withdrawal (Outflow)</SelectItem>
                    <SelectItem value="advance">Owner Advance to Workshop (Inflow)</SelectItem>
                    <SelectItem value="reimbursement">Expense Reimbursement (Outflow)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Amount (AED) *</Label>
                <Input
                  required
                  type="number"
                  step="any"
                  placeholder="10000"
                  value={ownerTxnAmount}
                  onChange={(e) => setOwnerTxnAmount(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Financial Channel</Label>
                <Select value={ownerTxnMethod} onValueChange={(val: any) => setOwnerTxnMethod(val)}>
                  <SelectTrigger className="text-xs h-9">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">Bank Account</SelectItem>
                    <SelectItem value="cash">Cash on Hand</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Description / Purpose</Label>
                <Input
                  placeholder="e.g. Capital injection for new hydraulic lift"
                  value={ownerTxnDesc}
                  onChange={(e) => setOwnerTxnDesc(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setOwnerTxnOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-indigo-600 hover:bg-indigo-700 text-white">
                Post Transaction
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: MANUAL JOURNAL ENTRY ──────────────────────────────────── */}
      <Dialog open={journalOpen} onOpenChange={setJournalOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <form onSubmit={handleSaveManualJournal} className="space-y-4">
            <div className="border-b pb-2">
              <DialogTitle className="text-base font-bold">New Manual Journal Entry</DialogTitle>
              <DialogDescription className="text-xs">
                Owner/Admin authorized entry. Total Debits must equal Total Credits.
              </DialogDescription>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Entry Date *</Label>
                <Input
                  required
                  type="date"
                  value={journalDate}
                  onChange={(e) => setJournalDate(e.target.value)}
                  className="text-xs h-9 font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Description / Narration *</Label>
                <Input
                  required
                  placeholder="e.g. Month-end depreciation adjustment"
                  value={journalDesc}
                  onChange={(e) => setJournalDesc(e.target.value)}
                  className="text-xs h-9"
                />
              </div>
            </div>

            {/* Journal Lines Table */}
            <div className="border rounded-lg p-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/30">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Journal Lines</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setJournalRows([
                      ...journalRows,
                      { accountId: "", debit: "", credit: "", notes: "" },
                    ])
                  }
                  className="text-xs h-7 gap-1"
                >
                  <Plus className="w-3 h-3" />
                  Add Line
                </Button>
              </div>

              <div className="space-y-2">
                {journalRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      <Select
                        value={row.accountId}
                        onValueChange={(val) => {
                          if (val) {
                            const updated = [...journalRows];
                            updated[idx].accountId = val;
                            setJournalRows(updated);
                          }
                        }}
                      >
                        <SelectTrigger className="text-xs h-8">
                          <SelectValue placeholder="Select Account" />
                        </SelectTrigger>
                        <SelectContent>
                          {accounts.map((acc) => (
                            <SelectItem key={acc.id} value={acc.id}>
                              {acc.account_code} - {acc.account_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="col-span-3">
                      <Input
                        type="number"
                        step="any"
                        placeholder="Debit (AED)"
                        value={row.debit}
                        onChange={(e) => {
                          const updated = [...journalRows];
                          updated[idx].debit = e.target.value;
                          if (Number(e.target.value) > 0) updated[idx].credit = "";
                          setJournalRows(updated);
                        }}
                        className="text-xs h-8 font-mono text-right"
                      />
                    </div>

                    <div className="col-span-3">
                      <Input
                        type="number"
                        step="any"
                        placeholder="Credit (AED)"
                        value={row.credit}
                        onChange={(e) => {
                          const updated = [...journalRows];
                          updated[idx].credit = e.target.value;
                          if (Number(e.target.value) > 0) updated[idx].debit = "";
                          setJournalRows(updated);
                        }}
                        className="text-xs h-8 font-mono text-right"
                      />
                    </div>

                    <div className="col-span-1 text-center">
                      {journalRows.length > 2 && (
                        <button
                          type="button"
                          onClick={() => setJournalRows(journalRows.filter((_, i) => i !== idx))}
                          className="text-red-500 hover:text-red-700 text-xs p-1"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Debits / Credits Validation Bar */}
              {(() => {
                const totDeb = journalRows.reduce((sum, r) => sum + (Number(r.debit) || 0), 0);
                const totCred = journalRows.reduce((sum, r) => sum + (Number(r.credit) || 0), 0);
                const isBalanced = Math.abs(totDeb - totCred) <= 0.01 && totDeb > 0;

                return (
                  <div className="flex items-center justify-between p-2.5 rounded bg-white dark:bg-slate-900 border text-xs font-mono">
                    <div className="flex items-center gap-4">
                      <span>Total Debit: <strong className="text-blue-600">AED {totDeb.toFixed(2)}</strong></span>
                      <span>Total Credit: <strong className="text-rose-600">AED {totCred.toFixed(2)}</strong></span>
                    </div>
                    <div>
                      {isBalanced ? (
                        <Badge className="bg-emerald-600 text-white text-[10px] gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Balanced Entry
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-[10px] gap-1">
                          <AlertCircle className="w-3 h-3" />
                          Unbalanced (Diff: {Math.abs(totDeb - totCred).toFixed(2)})
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setJournalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                Post Journal Entry
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: TRANSFER MONEY (2-STEP SYSTEM) ─────────────────────────── */}
      <Dialog open={transferOpen} onOpenChange={setTransferOpen}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto p-0">
          <form onSubmit={handleExecuteTransfer}>
            {/* Header */}
            <div className="bg-slate-900 text-white p-5 rounded-t-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-blue-600 rounded-lg text-white">
                    <ArrowRightLeft className="w-5 h-5" />
                  </div>
                  <div>
                    <DialogTitle className="text-lg font-bold text-white tracking-wide">
                      TRANSFER MONEY
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-300 mt-0.5">
                      Professional 2-Step Double-Entry Transfer: Step 1 (Payable Account) → Step 2 (Receivable Account)
                    </DialogDescription>
                  </div>
                </div>
                <Badge className="bg-blue-500/20 text-blue-300 border-blue-400/30 text-xs font-mono">
                  {transferNumberPreview}
                </Badge>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* TOP TRANSFER INFORMATION */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Transfer Date *</Label>
                    <Input
                      type="date"
                      required
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                      className="text-xs h-9 bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Transfer Number (Auto Generated)
                    </Label>
                    <div className="h-9 px-3 flex items-center bg-slate-100 dark:bg-slate-800 border rounded-md font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                      {transferNumberPreview}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">Transfer Reference</Label>
                    <Input
                      type="text"
                      placeholder="e.g. DEP-001, CHQ-401"
                      value={transferRef}
                      onChange={(e) => setTransferRef(e.target.value)}
                      className="text-xs h-9 font-mono bg-white dark:bg-slate-900"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Description / General Remarks
                  </Label>
                  <Input
                    type="text"
                    placeholder="General description of transfer or reference notes..."
                    value={transferNotes}
                    onChange={(e) => setTransferNotes(e.target.value)}
                    className="text-xs h-9 bg-white dark:bg-slate-900"
                  />
                </div>
              </div>

              {/* STEP 1 — PAYABLE ACCOUNT */}
              <div className="border border-blue-200 dark:border-blue-900/60 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                <div className="bg-blue-50/70 dark:bg-blue-950/40 px-4 py-2.5 border-b border-blue-200 dark:border-blue-900/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-600 text-white text-[11px] font-bold px-2 py-0.5">
                      STEP 1
                    </Badge>
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      PAYABLE ACCOUNT
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Account FROM which money is deducted
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Payable Account Search / Selection */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Payable Account *</Label>
                      {selectedFromAccount && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setPayableSelectorOpen(!payableSelectorOpen)}
                          className="h-6 text-[11px] text-blue-600 hover:text-blue-700 px-1.5"
                        >
                          {payableSelectorOpen ? "Close Search" : "Change Account"}
                        </Button>
                      )}
                    </div>

                    {/* If no account chosen, or user clicked Change Account, show searchable selector */}
                    {(!selectedFromAccount || payableSelectorOpen) && (
                      <div className="border rounded-lg p-2.5 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            type="text"
                            placeholder="Type to search: Cash, ADCB, Bank, Customer, Supplier, Worker, Code..."
                            value={payableSearchQuery}
                            onChange={(e) => setPayableSearchQuery(e.target.value)}
                            className="text-xs pl-8 h-9 bg-white dark:bg-slate-900"
                            autoFocus={payableSelectorOpen}
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto divide-y rounded-md border bg-white dark:bg-slate-900 text-xs">
                          {filterTransferAccounts(payableSearchQuery, [transferToId]).map((acc) => (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => {
                                setTransferFromId(acc.id);
                                setPayableSelectorOpen(false);
                                setPayableSearchQuery("");
                              }}
                              className="w-full text-left p-2.5 hover:bg-blue-50/80 dark:hover:bg-blue-950/40 flex items-center justify-between transition-colors"
                            >
                              <div>
                                <span className="font-semibold text-slate-900 dark:text-slate-100">{acc.account_name}</span>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mt-0.5">
                                  <span>Code: {acc.account_code}</span>
                                  <span>&bull;</span>
                                  <span className="uppercase">{acc.account_type} / {acc.account_sub_type}</span>
                                  {acc.related_entity_type && acc.related_entity_type !== "none" && (
                                    <>
                                      <span>&bull;</span>
                                      <span className="uppercase text-blue-600 font-semibold">{acc.related_entity_type}</span>
                                    </>
                                  )}
                                  {acc.phone && (
                                    <>
                                      <span>&bull;</span>
                                      <span>Ph: {acc.phone}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                  AED {Number(acc.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected Payable Account Details Panel */}
                    {selectedFromAccount && (
                      <div className="border border-blue-200 dark:border-blue-900 rounded-lg p-3 bg-blue-50/30 dark:bg-blue-950/20 space-y-2">
                        <div className="flex items-center justify-between border-b pb-2">
                          <span className="text-[10px] font-bold tracking-wider uppercase text-blue-700 dark:text-blue-300">
                            PAYABLE ACCOUNT DETAILS
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            Available: <strong className={isInsufficientTransferBalance ? "text-rose-600 font-bold" : "text-emerald-600 font-bold"}>
                              AED {Number(selectedFromAccount.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Name:</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">{selectedFromAccount.account_name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Code:</span>
                            <span className="font-mono font-semibold text-blue-600">{selectedFromAccount.account_code}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Type:</span>
                            <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                              {selectedFromAccount.account_type}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Sub Type:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{selectedFromAccount.account_sub_type}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Related Person / Entity:</span>
                            <span className="font-medium capitalize text-slate-700 dark:text-slate-300">
                              {selectedFromAccount.related_entity_type === "none" ? "General / Internal" : selectedFromAccount.related_entity_type}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Current Balance:</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              AED {Number(selectedFromAccount.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {selectedFromAccount.phone && (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Phone:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{selectedFromAccount.phone}</span>
                            </div>
                          )}
                          {selectedFromAccount.address && (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Address:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">{selectedFromAccount.address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 1 Inputs: Payable Amount & Payable Remarks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Payable Amount *</Label>
                      <Input
                        type="number"
                        step="any"
                        min="0.01"
                        required
                        placeholder="0.00"
                        value={payableAmount}
                        onChange={(e) => handlePayableAmountChange(e.target.value)}
                        className="text-xs h-9 font-mono font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Payable Remarks *</Label>
                      <Input
                        type="text"
                        required
                        placeholder="e.g. Cash deposited into ADCB Bank"
                        value={payableRemarks}
                        onChange={(e) => setPayableRemarks(e.target.value)}
                        className="text-xs h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* STEP 2 — RECEIVABLE ACCOUNT */}
              <div className="border border-indigo-200 dark:border-indigo-900/60 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                <div className="bg-indigo-50/70 dark:bg-indigo-950/40 px-4 py-2.5 border-b border-indigo-200 dark:border-indigo-900/60 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-indigo-600 text-white text-[11px] font-bold px-2 py-0.5">
                      STEP 2
                    </Badge>
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      RECEIVABLE ACCOUNT
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Account INTO which money is received
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Receivable Account Search / Selection */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Receivable Account *</Label>
                      {selectedToAccount && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setReceivableSelectorOpen(!receivableSelectorOpen)}
                          className="h-6 text-[11px] text-indigo-600 hover:text-indigo-700 px-1.5"
                        >
                          {receivableSelectorOpen ? "Close Search" : "Change Account"}
                        </Button>
                      )}
                    </div>

                    {/* If no account chosen, or user clicked Change Account, show searchable selector */}
                    {(!selectedToAccount || receivableSelectorOpen) && (
                      <div className="border rounded-lg p-2.5 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            type="text"
                            placeholder="Type to search: Cash, ADCB, Bank, Customer, Supplier, Worker, Code..."
                            value={receivableSearchQuery}
                            onChange={(e) => setReceivableSearchQuery(e.target.value)}
                            className="text-xs pl-8 h-9 bg-white dark:bg-slate-900"
                            autoFocus={receivableSelectorOpen}
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto divide-y rounded-md border bg-white dark:bg-slate-900 text-xs">
                          {filterTransferAccounts(receivableSearchQuery, [transferFromId]).map((acc) => (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => {
                                setTransferToId(acc.id);
                                setReceivableSelectorOpen(false);
                                setReceivableSearchQuery("");
                              }}
                              className="w-full text-left p-2.5 hover:bg-indigo-50/80 dark:hover:bg-indigo-950/40 flex items-center justify-between transition-colors"
                            >
                              <div>
                                <span className="font-semibold text-slate-900 dark:text-slate-100">{acc.account_name}</span>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mt-0.5">
                                  <span>Code: {acc.account_code}</span>
                                  <span>&bull;</span>
                                  <span className="uppercase">{acc.account_type} / {acc.account_sub_type}</span>
                                  {acc.related_entity_type && acc.related_entity_type !== "none" && (
                                    <>
                                      <span>&bull;</span>
                                      <span className="uppercase text-indigo-600 font-semibold">{acc.related_entity_type}</span>
                                    </>
                                  )}
                                  {acc.phone && (
                                    <>
                                      <span>&bull;</span>
                                      <span>Ph: {acc.phone}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                  AED {Number(acc.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Selected Receivable Account Details Panel */}
                    {selectedToAccount && (
                      <div className="border border-indigo-200 dark:border-indigo-900 rounded-lg p-3 bg-indigo-50/30 dark:bg-indigo-950/20 space-y-2">
                        <div className="flex items-center justify-between border-b pb-2">
                          <span className="text-[10px] font-bold tracking-wider uppercase text-indigo-700 dark:text-indigo-300">
                            RECEIVABLE ACCOUNT DETAILS
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            Current: <strong className="text-indigo-600 font-bold">
                              AED {Number(selectedToAccount.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Name:</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">{selectedToAccount.account_name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Code:</span>
                            <span className="font-mono font-semibold text-indigo-600">{selectedToAccount.account_code}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Type:</span>
                            <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                              {selectedToAccount.account_type}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Sub Type:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{selectedToAccount.account_sub_type}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Related Person / Entity:</span>
                            <span className="font-medium capitalize text-slate-700 dark:text-slate-300">
                              {selectedToAccount.related_entity_type === "none" ? "General / Internal" : selectedToAccount.related_entity_type}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Current Balance:</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              AED {Number(selectedToAccount.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {selectedToAccount.phone && (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Phone:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{selectedToAccount.phone}</span>
                            </div>
                          )}
                          {selectedToAccount.address && (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Address:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">{selectedToAccount.address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Step 2 Inputs: Receivable Amount & Receivable Remarks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Receivable Amount *</Label>
                        {!receivableManuallyEdited && payableAmount && (
                          <span className="text-[10px] text-muted-foreground">Auto-copied from Step 1</span>
                        )}
                      </div>
                      <Input
                        type="number"
                        step="any"
                        min="0.01"
                        required
                        placeholder="0.00"
                        value={receivableAmount}
                        onChange={(e) => handleReceivableAmountChange(e.target.value)}
                        className="text-xs h-9 font-mono font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Receivable Remarks *</Label>
                      <Input
                        type="text"
                        required
                        placeholder="e.g. Cash received from workshop Cash Account"
                        value={receivableRemarks}
                        onChange={(e) => setReceivableRemarks(e.target.value)}
                        className="text-xs h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── 1. SAVING ACCOUNT (OPTIONAL) ─────────────────────────────────────── */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900">
                <div className="bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-slate-600 text-white text-[11px] font-bold px-2 py-0.5">
                      OPTIONAL
                    </Badge>
                    <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                      SAVING ACCOUNT
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground font-medium">
                    Account for transfer difference, savings, or fees
                  </span>
                </div>

                <div className="p-4 space-y-4">
                  {/* Saving Acc # / Saving Account [Search Account] */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">Saving Acc # / Saving Account</Label>
                      {selectedSavingAccount && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setSavingSelectorOpen(!savingSelectorOpen)}
                          className="h-6 text-[11px] text-blue-600 hover:text-blue-700 px-1.5"
                        >
                          {savingSelectorOpen ? "Close Search" : "Change Account"}
                        </Button>
                      )}
                    </div>

                    {(!selectedSavingAccount || savingSelectorOpen) && (
                      <div className="border rounded-lg p-2.5 bg-slate-50 dark:bg-slate-800/60 space-y-2">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          <Input
                            type="text"
                            placeholder="Search by Account Name, Code, Customer, Supplier, Worker, Bank, Cash, Owner, Expense..."
                            value={savingSearchQuery}
                            onChange={(e) => setSavingSearchQuery(e.target.value)}
                            className="text-xs pl-8 h-9 bg-white dark:bg-slate-900"
                            autoFocus={savingSelectorOpen}
                          />
                        </div>
                        <div className="max-h-48 overflow-y-auto divide-y rounded-md border bg-white dark:bg-slate-900 text-xs">
                          {filterTransferAccounts(savingSearchQuery, [transferFromId, transferToId]).map((acc) => (
                            <button
                              key={acc.id}
                              type="button"
                              onClick={() => {
                                setTransferSavingId(acc.id);
                                setSavingSelectorOpen(false);
                                setSavingSearchQuery("");
                                if (hasDifference) {
                                  setDifferenceHandlingOption("saving_account");
                                  if (!savingAmount) setSavingAmount(diffAmount.toFixed(2));
                                }
                                if (!savingRemarks) {
                                  setSavingRemarks(`Transfer difference (${acc.account_name})`);
                                }
                              }}
                              className="w-full text-left p-2.5 hover:bg-blue-50/80 dark:hover:bg-blue-950/40 flex items-center justify-between transition-colors"
                            >
                              <div>
                                <span className="font-semibold text-slate-900 dark:text-slate-100">{acc.account_name}</span>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono mt-0.5">
                                  <span>Code: {acc.account_code}</span>
                                  <span>&bull;</span>
                                  <span className="uppercase">{acc.account_type} / {acc.account_sub_type}</span>
                                  {acc.related_entity_type && acc.related_entity_type !== "none" && (
                                    <>
                                      <span>&bull;</span>
                                      <span className="uppercase text-blue-600 font-semibold">{acc.related_entity_type}</span>
                                    </>
                                  )}
                                  {acc.phone && (
                                    <>
                                      <span>&bull;</span>
                                      <span>Ph: {acc.phone}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                                  AED {Number(acc.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Auto-filled Saving Account Details */}
                    {selectedSavingAccount && (
                      <div className="border border-blue-200 dark:border-blue-900/60 rounded-lg p-3 bg-blue-50/40 dark:bg-blue-950/20 space-y-2">
                        <div className="flex items-center justify-between border-b pb-2">
                          <span className="text-[10px] font-bold tracking-wider uppercase text-blue-800 dark:text-blue-300">
                            SAVING ACCOUNT DETAILS
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            Current Balance: <strong className="text-slate-900 dark:text-slate-100 font-bold">
                              AED {Number(selectedSavingAccount.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Name:</span>
                            <span className="font-bold text-slate-900 dark:text-slate-100">{selectedSavingAccount.account_name}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Code:</span>
                            <span className="font-mono font-semibold text-blue-600">{selectedSavingAccount.account_code}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Type:</span>
                            <Badge variant="outline" className="text-[10px] uppercase font-semibold">
                              {selectedSavingAccount.account_type}
                            </Badge>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Account Sub Type:</span>
                            <span className="font-medium text-slate-700 dark:text-slate-300">{selectedSavingAccount.account_sub_type}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Related Person / Entity:</span>
                            <span className="font-medium capitalize text-slate-700 dark:text-slate-300">
                              {selectedSavingAccount.related_entity_type === "none" ? "General / Internal" : selectedSavingAccount.related_entity_type}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-muted-foreground block">Current Balance:</span>
                            <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                              AED {Number(selectedSavingAccount.current_balance || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                          {selectedSavingAccount.phone && (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Phone:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300">{selectedSavingAccount.phone}</span>
                            </div>
                          )}
                          {selectedSavingAccount.address && (
                            <div>
                              <span className="text-[10px] text-muted-foreground block">Address:</span>
                              <span className="font-medium text-slate-700 dark:text-slate-300 truncate block">{selectedSavingAccount.address}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Saving Amount & Saving Account Remarks */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold">Saving Amount (AED)</Label>
                        {hasDifference && differenceHandlingOption === "saving_account" && (
                          <span className="text-[10px] text-blue-600 font-medium">Difference: AED {diffAmount.toFixed(2)}</span>
                        )}
                      </div>
                      <Input
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="0.00"
                        value={savingAmount}
                        onChange={(e) => setSavingAmount(e.target.value)}
                        className={`text-xs h-9 font-mono font-bold ${
                          hasDifference && differenceHandlingOption === "saving_account" && savingAmount && Math.abs(Number(savingAmount) - diffAmount) > 0.01
                            ? "border-rose-500 focus:ring-rose-500"
                            : ""
                        }`}
                      />
                      {hasDifference && differenceHandlingOption === "saving_account" && savingAmount && Math.abs(Number(savingAmount) - diffAmount) > 0.01 && (
                        <p className="text-[11px] text-rose-600 font-semibold mt-1">
                          Saving Amount must match the transfer difference.
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Saving Account Remarks</Label>
                      <Input
                        type="text"
                        placeholder="e.g. Transfer fee / Bank charge / Savings"
                        value={savingRemarks}
                        onChange={(e) => setSavingRemarks(e.target.value)}
                        className="text-xs h-9"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── 2. DIFFERENCE HANDLING (WHEN DIFFERENCE EXISTS) ───────────────── */}
              {hasDifference && (
                <div className="p-4 rounded-xl bg-amber-50/90 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                      <div>
                        <span className="font-bold text-sm text-amber-950 dark:text-amber-100">
                          Difference Amount: AED {diffAmount.toFixed(2)}
                        </span>
                        <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                          Payable Amount (AED {numPayable.toFixed(2)}) and Receivable Amount (AED {numReceivable.toFixed(2)}) are different.
                        </p>
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCancelDifference}
                      className="h-7 text-xs border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200"
                    >
                      Cancel Difference (Sync to AED {numPayable.toFixed(2)})
                    </Button>
                  </div>

                  <div className="space-y-2 pt-1 border-t border-amber-200 dark:border-amber-800/80">
                    <Label className="text-xs font-bold text-amber-950 dark:text-amber-100 uppercase tracking-wide">
                      Save difference amount in:
                    </Label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {/* Option 1: Receivable Account */}
                      <button
                        type="button"
                        onClick={() => {
                          setDifferenceHandlingOption("receivable_account");
                          setReceivableAmount(payableAmount);
                          setReceivableManuallyEdited(false);
                        }}
                        className={`p-3 text-left rounded-lg border transition-all text-xs flex flex-col justify-between ${
                          differenceHandlingOption === "receivable_account"
                            ? "bg-white dark:bg-slate-900 border-blue-600 ring-2 ring-blue-500/20 shadow-sm"
                            : "bg-white/60 dark:bg-slate-900/60 border-amber-200 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                          <input
                            type="radio"
                            checked={differenceHandlingOption === "receivable_account"}
                            onChange={() => {}}
                            className="text-blue-600"
                          />
                          <span>Receivable Account</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 ml-5">
                          Absorb difference into Receivable (Syncs to AED {numPayable.toFixed(2)})
                        </p>
                      </button>

                      {/* Option 2: Payable Account */}
                      <button
                        type="button"
                        onClick={() => {
                          setDifferenceHandlingOption("payable_account");
                          setPayableAmount(receivableAmount);
                        }}
                        className={`p-3 text-left rounded-lg border transition-all text-xs flex flex-col justify-between ${
                          differenceHandlingOption === "payable_account"
                            ? "bg-white dark:bg-slate-900 border-blue-600 ring-2 ring-blue-500/20 shadow-sm"
                            : "bg-white/60 dark:bg-slate-900/60 border-amber-200 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                          <input
                            type="radio"
                            checked={differenceHandlingOption === "payable_account"}
                            onChange={() => {}}
                            className="text-blue-600"
                          />
                          <span>Payable Account</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 ml-5">
                          Adjust Payable down to match Receivable (AED {numReceivable.toFixed(2)})
                        </p>
                      </button>

                      {/* Option 3: Saving Account (Third Option as requested) */}
                      <button
                        type="button"
                        onClick={() => {
                          setDifferenceHandlingOption("saving_account");
                          setSavingAmount(diffAmount.toFixed(2));
                          if (!savingRemarks) {
                            setSavingRemarks("Transfer fee / difference");
                          }
                        }}
                        className={`p-3 text-left rounded-lg border transition-all text-xs flex flex-col justify-between ${
                          differenceHandlingOption === "saving_account"
                            ? "bg-white dark:bg-slate-900 border-blue-600 ring-2 ring-blue-500/20 shadow-sm"
                            : "bg-white/60 dark:bg-slate-900/60 border-amber-200 hover:border-amber-300"
                        }`}
                      >
                        <div className="flex items-center gap-2 font-semibold text-slate-900 dark:text-slate-100">
                          <input
                            type="radio"
                            checked={differenceHandlingOption === "saving_account"}
                            onChange={() => {}}
                            className="text-blue-600"
                          />
                          <span>Saving Account</span>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 ml-5">
                          Assign AED {diffAmount.toFixed(2)} to Saving Account
                        </p>
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Validation Warnings */}
              {isSameTransferAccount && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="font-semibold">Payable and Receivable accounts must be different.</span>
                </div>
              )}

              {isInsufficientTransferBalance && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-amber-600" />
                    <span className="font-semibold">
                      Insufficient balance in Payable Account. Available: AED {Number(selectedFromAccount?.current_balance || 0).toFixed(2)}
                    </span>
                  </div>
                  {canManageAccounts && (
                    <label className="flex items-center gap-2 text-[11px] cursor-pointer pt-1 font-medium">
                      <input
                        type="checkbox"
                        checked={transferAllowNegative}
                        onChange={(e) => setTransferAllowNegative(e.target.checked)}
                        className="rounded border-amber-400"
                      />
                      <span>Allow overdraft / proceed with negative balance (Admin Override)</span>
                    </label>
                  )}
                </div>
              )}

              {/* ─── 3. TRANSFER SUMMARY (BEFORE SAVE) ────────────────────────────── */}
              <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                    TRANSFER SUMMARY &bull; DOUBLE-ENTRY VERIFICATION
                  </span>
                  {isDoubleEntryBalanced ? (
                    <Badge className="bg-emerald-600 text-white text-[10px] font-semibold">
                      Total Debit = Total Credit (Balanced)
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-[10px] font-semibold">
                      Unbalanced (Debit &ne; Credit)
                    </Badge>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-1">
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Payable Account:</span>
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                      {selectedFromAccount ? `${selectedFromAccount.account_name} (${selectedFromAccount.account_code})` : "— Not Selected —"}
                    </p>
                    <p className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      Payable Amount: AED {numPayable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Receivable Account:</span>
                    <p className="font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                      {selectedToAccount ? `${selectedToAccount.account_name} (${selectedToAccount.account_code})` : "— Not Selected —"}
                    </p>
                    <p className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                      Receivable Amount: AED {numReceivable.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Saving Account (if used) */}
                {selectedSavingAccount && (
                  <div className="text-xs border-t pt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[10px] text-blue-700 dark:text-blue-300 uppercase font-semibold">Saving Account:</span>
                      <p className="font-bold text-slate-900 dark:text-slate-100 truncate mt-0.5">
                        {selectedSavingAccount.account_name} ({selectedSavingAccount.account_code})
                      </p>
                    </div>
                    <div>
                      <span className="text-[10px] text-blue-700 dark:text-blue-300 uppercase font-semibold">Saving Amount:</span>
                      <p className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                        AED {numSaving.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 pt-2 border-t text-xs font-mono">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-sans block">Difference Amount:</span>
                    <strong className={hasDifference ? "text-amber-600 dark:text-amber-400" : "text-slate-600"}>
                      AED {diffAmount.toFixed(2)}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-sans block">Total Debit:</span>
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      AED {totalDebit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-sans block">Total Credit:</span>
                    <strong className="text-blue-700 dark:text-blue-400">
                      AED {totalCredit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="p-4 bg-slate-50 dark:bg-slate-800/40 border-t flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setTransferOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  transferSubmitting ||
                  isSameTransferAccount ||
                  !numPayable ||
                  !numReceivable ||
                  !isDoubleEntryBalanced ||
                  (isInsufficientTransferBalance && !transferAllowNegative)
                }
                className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 px-5"
              >
                {transferSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                Transfer Money
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: TRANSFER RECEIPT / VOUCHER ─────────────────────────────── */}
      <Dialog open={voucherOpen} onOpenChange={setVoucherOpen}>
        <DialogContent className="max-w-xl">
          {activeVoucher && (
            <div className="space-y-4">
              {/* Printable Voucher Section */}
              <div id="transfer-voucher-print" className="p-4 border rounded-lg bg-white dark:bg-slate-900 shadow-sm space-y-4">
                <div className="border-b pb-3 text-center">
                  <h2 className="text-lg font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                    ATIQ JEHAN AUTO REPAIR
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Industrial Area, Musaffah, Abu Dhabi, UAE &bull; TRN: 100523498100003
                  </p>
                  <p className="text-xs font-bold uppercase text-indigo-600 dark:text-indigo-400 mt-1">
                    {activeVoucher.cash_flow_type === "cash_in"
                      ? "CASH IN RECEIPT VOUCHER"
                      : activeVoucher.cash_flow_type === "cash_out"
                      ? "CASH OUT PAYMENT VOUCHER"
                      : "INTERNAL FUNDS TRANSFER VOUCHER"}
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Transfer Number</span>
                    <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300">
                      {activeVoucher.transfer_number}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase">Cash Flow Type</span>
                    <Badge variant="outline" className={`text-[10px] font-semibold mt-0.5 ${
                      activeVoucher.cash_flow_type === "cash_in"
                        ? "border-emerald-300 text-emerald-700 bg-emerald-50"
                        : activeVoucher.cash_flow_type === "cash_out"
                        ? "border-rose-300 text-rose-700 bg-rose-50"
                        : "border-blue-300 text-blue-700 bg-blue-50"
                    }`}>
                      {activeVoucher.cash_flow_type === "cash_in"
                        ? "Cash In"
                        : activeVoucher.cash_flow_type === "cash_out"
                        ? "Cash Out"
                        : "Internal Transfer"}
                    </Badge>
                  </div>
                  <div className="text-right">
                    <span className="text-muted-foreground block text-[10px] uppercase">Transfer Date</span>
                    <span className="font-mono font-medium">{activeVoucher.date}</span>
                  </div>
                </div>

                <div className={`grid ${activeVoucher.saving_account ? "grid-cols-3" : "grid-cols-2"} gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs`}>
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-blue-700 dark:text-blue-300">
                      <Badge className="bg-blue-600 text-white text-[9px] px-1 py-0 h-4">STEP 1</Badge>
                      <span>PAYABLE ACCOUNT</span>
                    </div>
                    <p className="font-bold text-slate-900 dark:text-slate-100 mt-1">{activeVoucher.from_account.name}</p>
                    <span className="text-[10px] text-slate-500 font-mono">Code: {activeVoucher.from_account.code}</span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-indigo-700 dark:text-indigo-300">
                      <Badge className="bg-indigo-600 text-white text-[9px] px-1 py-0 h-4">STEP 2</Badge>
                      <span>RECEIVABLE ACCOUNT</span>
                    </div>
                    <p className="font-bold text-slate-900 dark:text-slate-100 mt-1">{activeVoucher.to_account.name}</p>
                    <span className="text-[10px] text-slate-500 font-mono">Code: {activeVoucher.to_account.code}</span>
                  </div>
                  {activeVoucher.saving_account && (
                    <div>
                      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-700 dark:text-amber-300">
                        <Badge className="bg-amber-600 text-white text-[9px] px-1 py-0 h-4">SAVING</Badge>
                        <span>SAVING / DIFF ACCOUNT</span>
                      </div>
                      <p className="font-bold text-slate-900 dark:text-slate-100 mt-1">{activeVoucher.saving_account.name}</p>
                      <span className="text-[10px] text-slate-500 font-mono">Code: {activeVoucher.saving_account.code}</span>
                    </div>
                  )}
                </div>

                {/* Amount breakdown */}
                <div className="border rounded divide-y text-xs font-mono">
                  <div className="p-2 flex justify-between">
                    <span className="font-sans text-slate-700 dark:text-slate-300">Payable Amount (Step 1 Deducted):</span>
                    <strong>AED {(activeVoucher.payable_amount || (activeVoucher.amount + activeVoucher.fee)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="p-2 flex justify-between">
                    <span className="font-sans text-slate-700 dark:text-slate-300">Receivable Amount (Step 2 Received):</span>
                    <strong>AED {(activeVoucher.receivable_amount || activeVoucher.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong>
                  </div>
                  {activeVoucher.saving_account && (
                    <div className="p-2 flex justify-between text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20">
                      <span className="font-sans">Saving / Difference Amount ({activeVoucher.saving_account.name}):</span>
                      <strong>AED {(activeVoucher.saving_amount || activeVoucher.difference || 0).toFixed(2)}</strong>
                    </div>
                  )}
                  {!activeVoucher.saving_account && ((activeVoucher.difference !== undefined ? activeVoucher.difference : activeVoucher.fee) || 0) > 0 && (
                    <div className="p-2 flex justify-between text-amber-700 dark:text-amber-400 bg-amber-50/50 dark:bg-amber-950/20">
                      <span className="font-sans">Difference / Charge ({activeVoucher.difference_handling || "Fee"}):</span>
                      <strong>AED {((activeVoucher.difference !== undefined ? activeVoucher.difference : activeVoucher.fee) || 0).toFixed(2)}</strong>
                    </div>
                  )}
                </div>

                <div className="text-xs space-y-1">
                  {activeVoucher.reference && (
                    <p><span className="text-muted-foreground">Reference:</span> <span className="font-mono font-medium">{activeVoucher.reference}</span></p>
                  )}
                  {activeVoucher.description && (
                    <p><span className="text-muted-foreground">Notes:</span> {activeVoucher.description}</p>
                  )}
                  <p><span className="text-muted-foreground">Recorded By:</span> {activeVoucher.created_by}</p>
                </div>

                {/* Signature placeholders */}
                <div className="pt-6 grid grid-cols-2 gap-8 text-center text-xs">
                  <div>
                    <div className="border-b border-slate-300 dark:border-slate-700 mb-1 h-6"></div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Prepared By</span>
                  </div>
                  <div>
                    <div className="border-b border-slate-300 dark:border-slate-700 mb-1 h-6"></div>
                    <span className="text-[10px] text-muted-foreground uppercase font-semibold">Authorized Signatory</span>
                  </div>
                </div>
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setVoucherOpen(false)}>
                  Close
                </Button>
                <Button
                  size="sm"
                  onClick={() => window.print()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print Voucher
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: REVERSE TRANSFER CONFIRMATION ──────────────────────────── */}
      <Dialog open={reversalDialogOpen} onOpenChange={setReversalDialogOpen}>
        <DialogContent className="max-w-md">
          {transferToReverse && (
            <div className="space-y-4">
              <DialogTitle className="text-base font-bold text-red-600 flex items-center gap-2">
                <RotateCcw className="w-4 h-4" />
                Reverse Money Transfer
              </DialogTitle>
              <DialogDescription className="text-xs">
                This will post an offsetting double-entry journal entry to reverse Transfer{" "}
                <strong className="font-mono">{transferToReverse.transfer_number}</strong>.
              </DialogDescription>

              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-900 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transfer Number:</span>
                  <span className="font-mono font-bold">{transferToReverse.transfer_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Original Movement:</span>
                  <span>{transferToReverse.from_account.name} → {transferToReverse.to_account.name}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Reversal Action:</span>
                  <span className="text-red-700 dark:text-red-400">
                    Return AED {transferToReverse.amount.toFixed(2)} to {transferToReverse.from_account.name}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Reason for Reversal (Optional)</Label>
                <Input
                  placeholder="e.g. Erroneous account selection / customer refund"
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  className="text-xs h-9"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button variant="outline" size="sm" onClick={() => setReversalDialogOpen(false)}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  disabled={reversingTransfer}
                  onClick={handleExecuteReversal}
                  className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
                >
                  {reversingTransfer && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  Confirm Reversal
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
