"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CreditCard,
  DollarSign,
  Receipt,
  FileText,
  Search,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  User,
  Car,
  Phone,
  Building2,
  Calendar,
  Eye,
  RotateCcw,
  Clock,
  ArrowDownRight,
  Wallet,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { getInvoices, recordInvoicePayment } from "@/lib/services/invoice-service";
import { getPayments, recordPayment } from "@/lib/services/payment-service";
import { getCustomers } from "@/lib/services/customer-service";
import { getBankAccounts, postCustomerAdvanceLedger } from "@/lib/services/ledger-service";
import { CustomerAdvanceRefundModal } from "./customer-advance-refund-modal";

const LOCAL_ORDERS_KEY = "atiq_customer_payment_orders";

interface PaymentOrder {
  id: string;
  order_number: string;
  date: string;
  customer_id: string;
  customer_name: string;
  customer_phone?: string;
  vehicle_info?: string;
  plate?: string;
  job_card_id?: string;
  job_card_number?: string;
  advance_amount: number;
  used_amount: number;
  remaining_amount: number;
  purpose: string;
  payment_method: string;
  bank_account_id?: string;
  reference_number?: string;
  notes?: string;
  status: "available" | "partially_used" | "fully_used" | "refunded" | "cancelled";
  created_at: string;
  created_by?: string;
}

function getLocalOrders(): PaymentOrder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalOrders(orders: PaymentOrder[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify(orders));
  } catch (e) {
    console.error("Failed to save local payment orders:", e);
  }
}

export function PaymentsManagementView() {
  const [activeTab, setActiveTab] = useState<"pending" | "order" | "order_list" | "history">("pending");
  const [loading, setLoading] = useState(true);

  // Invoices & Payments state
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [bankAccounts, setBankAccounts] = useState<any[]>([]);

  // Search & Filters
  const [searchPending, setSearchPending] = useState("");
  const [searchOrders, setSearchOrders] = useState("");
  const [searchHistory, setSearchHistory] = useState("");

  // Receive Payment Modal state
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [targetInvoice, setTargetInvoice] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number | "">("");
  const [payMethod, setPayMethod] = useState<string>("cash");
  const [payBankAccId, setPayBankAccId] = useState<string>("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState<string | null>(null);

  // Create Order / Advance Form State
  const [orderCustId, setOrderCustId] = useState("");
  const [orderCustName, setOrderCustName] = useState("");
  const [orderCustPhone, setOrderCustPhone] = useState("");
  const [orderVehicle, setOrderVehicle] = useState("");
  const [orderPlate, setOrderPlate] = useState("");
  const [orderJobCard, setOrderJobCard] = useState("");
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10));
  const [orderAmount, setOrderAmount] = useState<number | "">("");
  const [orderPurpose, setOrderPurpose] = useState("Parts Procurement & Job Advance Deposit");
  const [orderMethod, setOrderMethod] = useState("cash");
  const [orderBankAccId, setOrderBankAccId] = useState("");
  const [orderRef, setOrderRef] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [savingOrder, setSavingOrder] = useState(false);
  const [orderFormSuccess, setOrderFormSuccess] = useState<string | null>(null);
  const [orderFormError, setOrderFormError] = useState<string | null>(null);

  // Refund Modal State
  const [refundModalOpen, setRefundModalOpen] = useState(false);
  const [refundTargetOrder, setRefundTargetOrder] = useState<PaymentOrder | null>(null);

  // Load auxiliary data and invoices
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [invRes, payRes, custRes, banks] = await Promise.all([
        getInvoices({ query: "", statusFilter: "all", page: 1, limit: 100 }),
        getPayments(1, 100),
        getCustomers("", 1, 100),
        getBankAccounts(),
      ]);

      setInvoices(invRes.invoices || []);
      setPayments(payRes.payments || []);
      setCustomers(custRes.customers || []);
      setBankAccounts(banks || []);
      setOrders(getLocalOrders());
    } catch (err) {
      console.warn("Error loading payments data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Derived Pending Invoices (balance > 0, not void)
  const pendingInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const bal = Number(inv.balance !== undefined ? inv.balance : inv.total - (inv.paid || 0));
      const st = (inv.payment_status || "").toLowerCase();
      const isVoid = st === "void" || inv.is_void;
      return !isVoid && (bal > 0 || st === "unpaid" || st === "credit" || st === "partially_paid");
    });
  }, [invoices]);

  // KPIs
  const kpis = useMemo(() => {
    const totalOutstanding = pendingInvoices.reduce((sum, inv) => {
      const bal = Number(inv.balance !== undefined ? inv.balance : inv.total - (inv.paid || 0));
      return sum + Math.max(0, bal);
    }, 0);

    const pendingCount = pendingInvoices.length;

    const partialCount = pendingInvoices.filter((inv) => Number(inv.paid) > 0).length;

    const todayStr = new Date().toISOString().slice(0, 10);
    const receivedToday = payments
      .filter((p) => (p.payment_date || p.created_at || "").slice(0, 10) === todayStr)
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    return { totalOutstanding, pendingCount, partialCount, receivedToday };
  }, [pendingInvoices, payments]);

  // Open Receive Payment Modal
  const handleOpenReceiveModal = (inv: any) => {
    setTargetInvoice(inv);
    const bal = Number(inv.balance !== undefined ? inv.balance : inv.total - (inv.paid || 0));
    setPayAmount(bal > 0 ? bal : "");
    setPayMethod("cash");
    setPayBankAccId(bankAccounts[0]?.id || "");
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayRef("");
    setPayNotes("");
    setPaymentError(null);
    setPaymentSuccess(null);
    setPayModalOpen(true);
  };

  // Submit Receive Payment
  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetInvoice) return;

    const amt = Number(payAmount);
    if (!amt || amt <= 0) {
      setPaymentError("Payment amount must be greater than 0.");
      return;
    }

    setSubmittingPayment(true);
    setPaymentError(null);

    try {
      await recordInvoicePayment(
        targetInvoice.id,
        amt,
        payMethod,
        payRef.trim() || null,
        payNotes.trim() || null,
        payDate,
        "User"
      );

      setPaymentSuccess(`Payment of ${formatCurrency(amt)} recorded successfully!`);
      await loadData();
      setTimeout(() => {
        setPayModalOpen(false);
      }, 750);
    } catch (err: any) {
      setPaymentError(err.message || "Failed to record payment.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handle Customer Selection in Order Form
  const handleSelectOrderCustomer = (custId: string) => {
    setOrderCustId(custId);
    const cust = customers.find((c) => c.id === custId);
    if (cust) {
      setOrderCustName(cust.name);
      setOrderCustPhone(cust.mobile || "");
      if (cust.vehicles && cust.vehicles.length > 0) {
        const v = cust.vehicles[0];
        setOrderVehicle(`${v.make} ${v.model} ${v.year || ""}`.trim());
        setOrderPlate(v.registration_number || "");
      } else {
        setOrderVehicle("");
        setOrderPlate("");
      }
    }
  };

  // Save Order / Customer Advance
  const handleSaveOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(orderAmount);
    if (!amt || amt <= 0) {
      setOrderFormError("Advance amount must be greater than zero.");
      return;
    }
    if (!orderCustName.trim()) {
      setOrderFormError("Please select or enter customer name.");
      return;
    }

    setSavingOrder(true);
    setOrderFormError(null);

    const orderNo = `ADV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const newOrder: PaymentOrder = {
      id: `ord-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      order_number: orderNo,
      date: orderDate,
      customer_id: orderCustId,
      customer_name: orderCustName.trim(),
      customer_phone: orderCustPhone.trim(),
      vehicle_info: orderVehicle.trim(),
      plate: orderPlate.trim(),
      job_card_number: orderJobCard.trim(),
      advance_amount: amt,
      used_amount: 0,
      remaining_amount: amt,
      purpose: orderPurpose.trim(),
      payment_method: orderMethod,
      bank_account_id: orderBankAccId || undefined,
      reference_number: orderRef.trim(),
      notes: orderNotes.trim(),
      status: "available",
      created_at: new Date().toISOString(),
      created_by: "Owner",
    };

    try {
      // Sync to double-entry ledger
      try {
        await postCustomerAdvanceLedger({
          id: newOrder.id,
          advance_number: newOrder.order_number,
          customer_id: newOrder.customer_id,
          customer_name: newOrder.customer_name,
          amount: newOrder.advance_amount,
          payment_method: newOrder.payment_method,
          bank_account_id: newOrder.bank_account_id,
          reference: newOrder.reference_number,
          payment_date: newOrder.date,
          created_by: "Cashier",
        });
      } catch (ledgerErr) {
        console.warn("Ledger post notice for advance:", ledgerErr);
      }

      const updatedList = [newOrder, ...orders];
      setOrders(updatedList);
      saveLocalOrders(updatedList);

      setOrderFormSuccess(`Payment Order ${orderNo} for ${formatCurrency(amt)} created successfully!`);
      // Reset form
      setOrderAmount("");
      setOrderRef("");
      setOrderNotes("");
      setTimeout(() => {
        setOrderFormSuccess(null);
        setActiveTab("order_list");
      }, 1200);
    } catch (err: any) {
      setOrderFormError(err.message || "Failed to save payment order.");
    } finally {
      setSavingOrder(false);
    }
  };

  // Filtered lists
  const filteredPending = useMemo(() => {
    if (!searchPending.trim()) return pendingInvoices;
    const q = searchPending.toLowerCase();
    return pendingInvoices.filter((inv) =>
      inv.invoice_number?.toLowerCase().includes(q) ||
      inv.customer?.name?.toLowerCase().includes(q) ||
      inv.customer?.mobile?.toLowerCase().includes(q) ||
      inv.vehicle?.registration_number?.toLowerCase().includes(q) ||
      inv.job_card?.job_card_number?.toLowerCase().includes(q)
    );
  }, [pendingInvoices, searchPending]);

  const filteredOrders = useMemo(() => {
    if (!searchOrders.trim()) return orders;
    const q = searchOrders.toLowerCase();
    return orders.filter((o) =>
      o.order_number?.toLowerCase().includes(q) ||
      o.customer_name?.toLowerCase().includes(q) ||
      o.plate?.toLowerCase().includes(q) ||
      o.job_card_number?.toLowerCase().includes(q)
    );
  }, [orders, searchOrders]);

  const filteredHistory = useMemo(() => {
    if (!searchHistory.trim()) return payments;
    const q = searchHistory.toLowerCase();
    return payments.filter((p) =>
      p.customer?.name?.toLowerCase().includes(q) ||
      p.invoice?.invoice_number?.toLowerCase().includes(q) ||
      p.job_card?.job_card_number?.toLowerCase().includes(q) ||
      p.reference_number?.toLowerCase().includes(q) ||
      p.id?.toLowerCase().includes(q)
    );
  }, [payments, searchHistory]);

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <PageHeader
        title="Payments"
        description="Record customer payments, settle pending invoice balances, and manage payment orders."
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Payments" },
        ]}
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="outline"
              size="sm"
              onClick={loadData}
              className="h-10 px-3 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs gap-2"
              title="Refresh payments"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => setActiveTab("order")}
              className="h-10 px-4 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs rounded-xl gap-2"
            >
              <Plus className="h-4 w-4" /> + New Order / Advance
            </Button>
          </div>
        }
      />

      {/* ─── Top KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Total Outstanding
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight text-rose-600 mt-1">
              {formatCurrency(kpis.totalOutstanding)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Pending invoice balance due</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Pending Invoices
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1">
              {kpis.pendingCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">Invoices awaiting full settlement</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
            <Receipt className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Partial Payments
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight text-slate-900 mt-1">
              {kpis.partialCount}
            </p>
            <p className="text-xs text-slate-500 mt-1">Invoices partially collected</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Received Today
            </p>
            <p className="text-2xl font-bold font-mono tracking-tight text-emerald-600 mt-1">
              {formatCurrency(kpis.receivedToday)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Collections settled today</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* ─── The 4 Mandatory Tabs ─── */}
      <div className="border-b border-slate-200">
        <div className="flex items-center gap-2 overflow-x-auto">
          {[
            { id: "pending", label: "Pending Payments", count: pendingInvoices.length },
            { id: "order", label: "Order" },
            { id: "order_list", label: "Order List", count: orders.length },
            { id: "history", label: "Payment History", count: payments.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`pb-3 px-3 text-xs font-semibold transition-all border-b-2 whitespace-nowrap flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-slate-500 hover:text-slate-900"
              }`}
            >
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    activeTab === tab.id
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : "bg-slate-100 text-slate-600 border border-slate-200"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PENDING PAYMENTS                                                   */}
      {/* ========================================================================= */}
      {activeTab === "pending" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Search pending by customer, phone, plate, invoice..."
                value={searchPending}
                onChange={(e) => setSearchPending(e.target.value)}
                className="pl-9 h-10 text-xs rounded-xl border-slate-200 bg-white shadow-2xs focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Showing {filteredPending.length} pending receivable invoice(s)
            </span>
          </div>

          {/* Pending Payments Table */}
          <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
            {loading ? (
              <div className="py-20 text-center text-slate-500">
                <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
                <p className="font-semibold text-xs">Loading pending payments...</p>
              </div>
            ) : filteredPending.length > 0 ? (
              <div className="overflow-x-auto min-w-full">
                <Table className="w-full text-xs min-w-[1100px]">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200/80 bg-slate-50/80 hover:bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider h-11">
                      <TableHead className="text-slate-600 font-bold min-w-[160px]">Customer</TableHead>
                      <TableHead className="text-slate-600 font-bold">Phone</TableHead>
                      <TableHead className="text-slate-600 font-bold min-w-[150px]">Vehicle</TableHead>
                      <TableHead className="text-slate-600 font-bold">Plate</TableHead>
                      <TableHead className="text-slate-600 font-bold">Job Card</TableHead>
                      <TableHead className="text-slate-600 font-bold">Invoice</TableHead>
                      <TableHead className="text-right text-slate-600 font-bold">Total (AED)</TableHead>
                      <TableHead className="text-right text-slate-600 font-bold">Paid (AED)</TableHead>
                      <TableHead className="text-right text-slate-600 font-bold">Balance (AED)</TableHead>
                      <TableHead className="text-center text-slate-600 font-bold">Status</TableHead>
                      <TableHead className="w-[130px] min-w-[130px] text-right pr-4 text-slate-600 font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPending.map((inv) => {
                      const tot = Number(inv.total) || 0;
                      const paid = Number(inv.paid) || 0;
                      const bal = Number(inv.balance !== undefined ? inv.balance : Math.max(0, tot - paid));

                      return (
                        <TableRow
                          key={inv.id}
                          className="h-12 border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                        >
                          <TableCell className="py-2.5 font-semibold text-slate-900">
                            {inv.customer?.name || "Cash Customer"}
                          </TableCell>

                          <TableCell className="py-2.5 font-mono text-slate-500">
                            {inv.customer?.mobile || "—"}
                          </TableCell>

                          <TableCell className="py-2.5">
                            {inv.vehicle ? (
                              <span className="font-semibold text-slate-900">
                                {inv.vehicle.make} {inv.vehicle.model}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>

                          <TableCell className="py-2.5 font-mono font-bold text-xs text-blue-600">
                            {inv.vehicle?.registration_number || "—"}
                          </TableCell>

                          <TableCell className="py-2.5 font-mono text-xs">
                            {inv.job_card ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                {inv.job_card.job_card_number}
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </TableCell>

                          <TableCell className="py-2.5 font-mono font-bold text-xs text-slate-800">
                            {inv.invoice_number}
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold text-slate-900 py-2.5 tabular-nums">
                            {formatCurrency(tot)}
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold text-emerald-600 py-2.5 tabular-nums">
                            {formatCurrency(paid)}
                          </TableCell>

                          <TableCell className="text-right font-mono font-black text-rose-600 py-2.5 tabular-nums">
                            {formatCurrency(bal)}
                          </TableCell>

                          <TableCell className="text-center py-2.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                paid > 0
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-rose-50 text-rose-700 border-rose-200"
                              }`}
                            >
                              {paid > 0 ? "PARTIAL" : "PENDING"}
                            </span>
                          </TableCell>

                          <TableCell className="w-[130px] min-w-[130px] text-right pr-4 py-2.5">
                            <Button
                              size="sm"
                              onClick={() => handleOpenReceiveModal(inv)}
                              className="h-8 px-3 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs rounded-xl gap-1"
                            >
                              <CreditCard className="h-3.5 w-3.5" /> Receive
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 min-h-[220px] max-h-[280px] text-center">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-sm font-bold text-slate-900">No pending payments</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  All customer invoices are settled with zero outstanding balance.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: ORDER (Create Payment Order / Customer Advance Form)               */}
      {/* ========================================================================= */}
      {activeTab === "order" && (
        <div className="max-w-4xl mx-auto bg-white border border-slate-200/90 rounded-2xl shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-200/80 bg-slate-50/50">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Plus className="h-4 w-4 text-blue-600" /> Create Payment Order / Customer Advance
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Record advance deposits from customers before job execution. Automatically credited in the financial ledger.
            </p>
          </div>

          <form onSubmit={handleSaveOrder} className="p-5 space-y-5">
            {orderFormError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{orderFormError}</span>
              </div>
            )}
            {orderFormSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{orderFormSuccess}</span>
              </div>
            )}

            {/* SECTION 1: CUSTOMER */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block border-b border-slate-200 pb-1">
                Customer Information
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Select Customer *</Label>
                  <select
                    value={orderCustId}
                    onChange={(e) => handleSelectOrderCustomer(e.target.value)}
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  >
                    <option value="">-- Choose Existing Customer or Enter Manual --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.mobile ? `(${c.mobile})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Customer Name *</Label>
                  <Input
                    required
                    value={orderCustName}
                    onChange={(e) => setOrderCustName(e.target.value)}
                    placeholder="Full Customer Name"
                    className="h-10 text-xs rounded-xl border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Phone / Mobile</Label>
                  <Input
                    value={orderCustPhone}
                    onChange={(e) => setOrderCustPhone(e.target.value)}
                    placeholder="e.g. 0501234567"
                    className="h-10 text-xs font-mono rounded-xl border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Vehicle Specs</Label>
                  <Input
                    value={orderVehicle}
                    onChange={(e) => setOrderVehicle(e.target.value)}
                    placeholder="e.g. Toyota Camry 2020"
                    className="h-10 text-xs rounded-xl border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Plate Number</Label>
                  <Input
                    value={orderPlate}
                    onChange={(e) => setOrderPlate(e.target.value)}
                    placeholder="e.g. DXB A 12345"
                    className="h-10 text-xs font-mono rounded-xl border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Job Card Reference (Optional)</Label>
                  <Input
                    value={orderJobCard}
                    onChange={(e) => setOrderJobCard(e.target.value)}
                    placeholder="e.g. JC-0012"
                    className="h-10 text-xs font-mono rounded-xl border-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 2: DEPOSIT DETAILS */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block border-b border-slate-200 pb-1">
                Deposit Financials
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Order Date *</Label>
                  <Input
                    type="date"
                    required
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="h-10 text-xs rounded-xl border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Advance Amount (AED) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="1"
                    required
                    value={orderAmount}
                    onChange={(e) => setOrderAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    placeholder="0.00"
                    className="h-10 text-xs font-mono font-bold text-emerald-600 rounded-xl border-slate-200"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Purpose</Label>
                  <Input
                    value={orderPurpose}
                    onChange={(e) => setOrderPurpose(e.target.value)}
                    placeholder="e.g. Parts procurement or repair advance"
                    className="h-10 text-xs rounded-xl border-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 3: PAYMENT */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 block border-b border-slate-200 pb-1">
                Payment &amp; Bank Account
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Payment Method *</Label>
                  <select
                    value={orderMethod}
                    onChange={(e) => setOrderMethod(e.target.value)}
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs"
                  >
                    <option value="cash">Cash In Hand</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="credit_card">Card Payment</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Target Bank Account</Label>
                  <select
                    value={orderBankAccId}
                    onChange={(e) => setOrderBankAccId(e.target.value)}
                    disabled={orderMethod === "cash"}
                    className="w-full h-10 px-3 text-xs rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-2xs disabled:opacity-50"
                  >
                    <option value="">-- Select Bank Account --</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name || b.account_name} ({b.account_number || b.account_code})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-semibold text-slate-700">Reference / Receipt No</Label>
                  <Input
                    value={orderRef}
                    onChange={(e) => setOrderRef(e.target.value)}
                    placeholder="e.g. TR-9821 or Cheque #"
                    className="h-10 text-xs font-mono rounded-xl border-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* SECTION 4: NOTES */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Order Notes</Label>
              <Textarea
                value={orderNotes}
                onChange={(e) => setOrderNotes(e.target.value)}
                placeholder="Additional notes or instructions regarding customer deposit..."
                className="text-xs h-18 resize-none rounded-xl border-slate-200"
              />
            </div>

            {/* Form Footer */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setActiveTab("pending")}
                className="h-9 text-xs font-semibold border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-xl"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingOrder}
                className="h-9 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-2xs px-4 rounded-xl"
              >
                {savingOrder ? "Saving..." : "Save Order"}
              </Button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: ORDER LIST                                                         */}
      {/* ========================================================================= */}
      {activeTab === "order_list" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Search orders by order #, customer, plate..."
                value={searchOrders}
                onChange={(e) => setSearchOrders(e.target.value)}
                className="pl-9 h-10 text-xs rounded-xl border-slate-200 bg-white shadow-2xs focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Total {filteredOrders.length} customer advance deposit(s)
            </span>
          </div>

          {/* Table */}
          <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
            {filteredOrders.length > 0 ? (
              <div className="overflow-x-auto min-w-full">
                <Table className="w-full text-xs min-w-[1050px]">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200/80 bg-slate-50/80 hover:bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider h-11">
                      <TableHead className="text-slate-600 font-bold">Order No</TableHead>
                      <TableHead className="text-slate-600 font-bold">Date</TableHead>
                      <TableHead className="text-slate-600 font-bold min-w-[160px]">Customer</TableHead>
                      <TableHead className="text-slate-600 font-bold min-w-[140px]">Vehicle</TableHead>
                      <TableHead className="text-right text-slate-600 font-bold">Advance (AED)</TableHead>
                      <TableHead className="text-right text-slate-600 font-bold">Used (AED)</TableHead>
                      <TableHead className="text-right text-slate-600 font-bold">Remaining (AED)</TableHead>
                      <TableHead className="text-slate-600 font-bold">Method</TableHead>
                      <TableHead className="text-center text-slate-600 font-bold">Status</TableHead>
                      <TableHead className="w-[110px] min-w-[110px] text-right pr-4 text-slate-600 font-bold">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.map((ord) => {
                      return (
                        <TableRow
                          key={ord.id}
                          className="h-12 border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                        >
                          <TableCell className="py-2.5 font-mono font-bold text-xs text-blue-600">
                            {ord.order_number}
                          </TableCell>

                          <TableCell className="py-2.5 font-mono text-slate-500">
                            {formatDate(ord.date)}
                          </TableCell>

                          <TableCell className="py-2.5">
                            <div className="font-semibold text-slate-900">{ord.customer_name}</div>
                            {ord.customer_phone && (
                              <div className="text-[11px] text-slate-500 font-mono">{ord.customer_phone}</div>
                            )}
                          </TableCell>

                          <TableCell className="py-2.5">
                            <div className="text-slate-800">{ord.vehicle_info || "—"}</div>
                            {ord.plate && (
                              <div className="text-[11px] font-mono text-blue-600 font-bold">{ord.plate}</div>
                            )}
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold text-slate-900 py-2.5 tabular-nums">
                            {formatCurrency(ord.advance_amount)}
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold text-amber-600 py-2.5 tabular-nums">
                            {formatCurrency(ord.used_amount)}
                          </TableCell>

                          <TableCell className="text-right font-mono font-black text-emerald-600 py-2.5 tabular-nums">
                            {formatCurrency(ord.remaining_amount)}
                          </TableCell>

                          <TableCell className="py-2.5 uppercase font-semibold text-[11px] text-slate-500">
                            {ord.payment_method}
                          </TableCell>

                          <TableCell className="text-center py-2.5">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                                ord.status === "available"
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : ord.status === "partially_used"
                                  ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : ord.status === "fully_used"
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : ord.status === "refunded"
                                  ? "bg-purple-50 text-purple-700 border-purple-200"
                                  : "bg-slate-100 text-slate-600 border-slate-200"
                              }`}
                            >
                              {ord.status.replace("_", " ")}
                            </span>
                          </TableCell>

                          <TableCell className="w-[110px] min-w-[110px] text-right pr-4 py-2.5">
                            {ord.remaining_amount > 0 && ord.status !== "refunded" && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRefundTargetOrder(ord);
                                  setRefundModalOpen(true);
                                }}
                                className="h-8 px-2.5 text-xs font-semibold text-rose-600 border-rose-200 bg-white hover:bg-rose-50 rounded-xl gap-1 shadow-2xs"
                              >
                                <RotateCcw className="h-3 w-3" /> Refund
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 min-h-[220px] max-h-[280px] text-center">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <FileText className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-900">No payment orders recorded</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Create a customer advance deposit order to record upfront parts procurement or labor advances.
                </p>
                <Button
                  size="sm"
                  onClick={() => setActiveTab("order")}
                  className="mt-3.5 h-9 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-2xs px-4"
                >
                  <Plus className="h-3.5 w-3.5 mr-1" /> Create First Order
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: PAYMENT HISTORY                                                    */}
      {/* ========================================================================= */}
      {activeTab === "history" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                type="search"
                placeholder="Search transaction history by customer, invoice, ref..."
                value={searchHistory}
                onChange={(e) => setSearchHistory(e.target.value)}
                className="pl-9 h-10 text-xs rounded-xl border-slate-200 bg-white shadow-2xs focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <span className="text-xs text-slate-500 font-medium">
              Total {filteredHistory.length} recorded financial receipt(s)
            </span>
          </div>

          {/* Table */}
          <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
            {filteredHistory.length > 0 ? (
              <div className="overflow-x-auto min-w-full">
                <Table className="w-full text-xs min-w-[1050px]">
                  <TableHeader>
                    <TableRow className="border-b border-slate-200/80 bg-slate-50/80 hover:bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider h-11">
                      <TableHead className="text-slate-600 font-bold">Date</TableHead>
                      <TableHead className="text-slate-600 font-bold">Payment No</TableHead>
                      <TableHead className="text-slate-600 font-bold min-w-[170px]">Customer</TableHead>
                      <TableHead className="text-slate-600 font-bold">Invoice / Order</TableHead>
                      <TableHead className="text-slate-600 font-bold">Type</TableHead>
                      <TableHead className="text-slate-600 font-bold">Method</TableHead>
                      <TableHead className="text-right text-slate-600 font-bold">Amount (AED)</TableHead>
                      <TableHead className="text-slate-600 font-bold">Reference</TableHead>
                      <TableHead className="text-center text-slate-600 font-bold">Status</TableHead>
                      <TableHead className="text-slate-600 font-bold">Received By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHistory.map((pm, idx) => (
                      <TableRow
                        key={pm.id || idx}
                        className="h-12 border-b border-slate-100 hover:bg-slate-50/60 transition-colors"
                      >
                        <TableCell className="py-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {formatDate(pm.payment_date || pm.created_at)}
                        </TableCell>

                        <TableCell className="py-2.5 font-mono font-bold text-xs text-blue-600">
                          {pm.id ? `#${pm.id.slice(-6)}` : `PAY-${idx + 1}`}
                        </TableCell>

                        <TableCell className="py-2.5">
                          <div className="font-semibold text-slate-900">
                            {pm.customer?.name || "Customer Settlement"}
                          </div>
                          {pm.customer?.mobile && (
                            <div className="text-[11px] text-slate-500 font-mono">{pm.customer.mobile}</div>
                          )}
                        </TableCell>

                        <TableCell className="py-2.5 font-mono text-xs font-semibold text-slate-800">
                          {pm.invoice?.invoice_number || (pm.job_card ? `JC: ${pm.job_card.job_card_number}` : "Direct Receipt")}
                        </TableCell>

                        <TableCell className="py-2.5">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                            Invoice Settle
                          </span>
                        </TableCell>

                        <TableCell className="py-2.5 uppercase font-semibold text-[11px] text-slate-600">
                          {pm.payment_method}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-emerald-600 py-2.5 whitespace-nowrap tabular-nums">
                          {formatCurrency(pm.amount)}
                        </TableCell>

                        <TableCell className="py-2.5 font-mono text-slate-500 text-[11px]">
                          {pm.reference_number || "—"}
                        </TableCell>

                        <TableCell className="text-center py-2.5">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            RECEIVED
                          </span>
                        </TableCell>

                        <TableCell className="py-2.5 text-slate-500 text-xs">
                          {pm.created_by || "Cashier"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 px-4 min-h-[220px] max-h-[280px] text-center">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <CreditCard className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-sm font-bold text-slate-900">No payment history found</p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Completed customer payments and settlements will appear here.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* RECEIVE PAYMENT MODAL DIALOG                                              */}
      {/* ========================================================================= */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="max-w-md bg-background text-foreground">
          <DialogHeader className="border-b pb-3">
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <CreditCard className="h-5 w-5 text-emerald-600 shrink-0" />
              Receive Invoice Payment
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Record customer payment for Invoice #{targetInvoice?.invoice_number}.
            </DialogDescription>
          </DialogHeader>

          {targetInvoice && (
            <form onSubmit={handleSubmitPayment} className="space-y-4 pt-1">
              {paymentError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}
              {paymentSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  <span>{paymentSuccess}</span>
                </div>
              )}

              {/* Invoice Summary Cards */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-border/80 text-xs grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Customer:</span>
                  <span className="font-bold text-foreground">{targetInvoice.customer?.name || "Customer"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Vehicle:</span>
                  <span className="font-bold text-foreground">
                    {targetInvoice.vehicle?.registration_number || targetInvoice.vehicle?.make || "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Invoice Total:</span>
                  <span className="font-mono font-bold text-foreground">{formatCurrency(targetInvoice.total)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Balance Due:</span>
                  <span className="font-mono font-black text-rose-600 text-sm">
                    {formatCurrency(targetInvoice.balance !== undefined ? targetInvoice.balance : targetInvoice.total - (targetInvoice.paid || 0))}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Payment Amount (AED) *</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder="0.00"
                  className="font-mono font-bold text-sm h-9"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Payment Method *</Label>
                  <select
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-border/80 bg-background font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="credit_card">Card Payment</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Payment Date *</Label>
                  <Input
                    type="date"
                    required
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              {payMethod !== "cash" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Target Bank Account</Label>
                  <select
                    value={payBankAccId}
                    onChange={(e) => setPayBankAccId(e.target.value)}
                    className="w-full h-9 px-3 text-xs rounded-lg border border-border/80 bg-background font-medium focus:outline-none focus:ring-1 focus:ring-primary shadow-2xs"
                  >
                    <option value="">-- Select Bank Account --</option>
                    {bankAccounts.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bank_name || b.account_name} ({b.account_number || b.account_code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Reference / Receipt Number</Label>
                <Input
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  placeholder="e.g. Bank Ref #, Auth Code, Cheque #"
                  className="h-9 text-xs font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Notes</Label>
                <Textarea
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  placeholder="Internal cashier notes..."
                  className="text-xs h-16 resize-none"
                />
              </div>

              <DialogFooter className="pt-3 border-t flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPayModalOpen(false)}
                  className="h-8 text-xs font-medium border-border/80"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingPayment}
                  className="h-8 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs px-3.5"
                >
                  {submittingPayment ? "Recording..." : "Record Payment"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Refund Modal */}
      <CustomerAdvanceRefundModal
        open={refundModalOpen}
        onOpenChange={setRefundModalOpen}
        order={refundTargetOrder}
        onSuccess={(updatedOrder) => {
          const next = orders.map((o) => (o.id === updatedOrder.id ? updatedOrder : o));
          setOrders(next);
          saveLocalOrders(next);
        }}
      />
    </div>
  );
}

export default PaymentsManagementView;
