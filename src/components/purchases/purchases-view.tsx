"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  recordSupplierPayment,
  deletePurchase,
} from "@/lib/services/purchase-service";
import { getSuppliers } from "@/lib/services/supplier-service";
import { getParts, createPart } from "@/lib/services/parts-service";
import type { Supplier, Part, PurchaseItemInsert, PurchasePaymentStatus, PurchasePaymentMethod } from "@/types/database";
import { usePermissions } from "@/lib/context/auth-context";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ShoppingCart,
  Building2,
  Package,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  DollarSign,
  ChevronLeft,
  ChevronRight,
  Eye,
  CreditCard,
  Calendar,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  Receipt,
  Pencil,
  MoreVertical,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { BulkActionBar } from "@/components/shared/bulk-action-bar";
import { RecordDeleteDialog } from "@/components/shared/record-delete-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface PurchaseItemRow {
  part_id: string;
  part_name: string;
  part_number: string;
  quantity: number;
  purchase_price: number;
}

export function PurchasesView() {
  const { user, canEdit, isOwner, canDelete } = usePermissions();

  const [purchases, setPurchases] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [allParts, setAllParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 15;

  // ─── Create / Edit Purchase Modal State ───
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [formSupplierId, setFormSupplierId] = useState("");
  const [formInvoiceNo, setFormInvoiceNo] = useState("");
  const [formDate, setFormDate] = useState(new Date().toISOString().slice(0, 10));
  const [formNotes, setFormNotes] = useState("");
  const [formPaymentStatus, setFormPaymentStatus] = useState<PurchasePaymentStatus>("paid");
  const [formPaymentMethod, setFormPaymentMethod] = useState<PurchasePaymentMethod>("cash");
  const [formPaidAmount, setFormPaidAmount] = useState<number | "">("");
  const [formItems, setFormItems] = useState<PurchaseItemRow[]>([
    { part_id: "", part_name: "", part_number: "", quantity: 1, purchase_price: 0 },
  ]);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // ─── View Purchase Details Modal State ───
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<any | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // ─── Inline Add New Spare Part Modal (Inside Purchase Form) ───
  const [newPartModalOpen, setNewPartModalOpen] = useState(false);
  const [newPartItemIndex, setNewPartItemIndex] = useState<number | null>(null);
  const [newPartName, setNewPartName] = useState("");
  const [newPartNumber, setNewPartNumber] = useState("");
  const [newPartBrand, setNewPartBrand] = useState("");
  const [newPartDesc, setNewPartDesc] = useState("");
  const [newPartPPrice, setNewPartPPrice] = useState<number | "">(0);
  const [newPartSPrice, setNewPartSPrice] = useState<number | "">(0);
  const [newPartMinStock, setNewPartMinStock] = useState<number | "">(5);
  const [newPartLocation, setNewPartLocation] = useState("");
  const [savingNewPart, setSavingNewPart] = useState(false);
  const [newPartError, setNewPartError] = useState<string | null>(null);

  // ─── Record Payment Modal State ───
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [payAmount, setPayAmount] = useState<number | "">("");
  const [payMethod, setPayMethod] = useState<PurchasePaymentMethod>("cash");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // ─── Delete & Selection State ───
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [purchasesToDelete, setPurchasesToDelete] = useState<any[]>([]);
  const [deletingPurchase, setDeletingPurchase] = useState(false);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load auxiliary lists (suppliers & parts)
  const loadAuxData = useCallback(async () => {
    try {
      const [supRes, partsRes] = await Promise.all([
        getSuppliers("", 1, 200),
        getParts("all", "", 1, 500),
      ]);
      setSuppliers(supRes.suppliers);
      setAllParts(partsRes.parts);
    } catch (e) {
      console.warn("Could not load suppliers or parts:", e);
    }
  }, []);

  // Load Purchases
  const loadPurchasesList = useCallback(async () => {
    setLoading(true);
    try {
      const supId = supplierFilter === "all" ? undefined : supplierFilter;
      const res = await getPurchases(debouncedQuery, statusFilter, supId, currentPage, pageSize);
      setPurchases(res.purchases);
      setTotalCount(res.total);
    } catch (e) {
      console.error("Error loading purchases:", e);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, statusFilter, supplierFilter, currentPage, pageSize]);

  useEffect(() => {
    loadAuxData();
  }, [loadAuxData]);

  useEffect(() => {
    loadPurchasesList();
  }, [loadPurchasesList]);

  // KPIs
  const kpis = useMemo(() => {
    const totalPurchasesCount = totalCount;
    const totalValue = purchases.reduce((sum, p) => sum + (Number(p.total) || 0), 0);
    const totalPaid = purchases.reduce(
      (sum, p) =>
        sum + Number(p.paid_amount !== undefined ? p.paid_amount : p.payment_status === "paid" ? p.total : 0),
      0
    );
    const totalOutstanding = purchases.reduce(
      (sum, p) =>
        sum +
        Number(
          p.balance !== undefined
            ? p.balance
            : Math.max(0, p.total - (p.paid_amount || (p.payment_status === "paid" ? p.total : 0)))
        ),
      0
    );

    return { totalPurchasesCount, totalValue, totalPaid, totalOutstanding };
  }, [purchases, totalCount]);

  // Open Create Purchase
  const handleOpenCreateModal = (supId?: string) => {
    setEditingPurchaseId(null);
    setFormSupplierId(supId || suppliers[0]?.id || "");
    setFormInvoiceNo("INV-PO-" + Math.floor(1000 + Math.random() * 9000));
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormNotes("");
    setFormPaymentStatus("paid");
    setFormPaymentMethod("cash");
    setFormPaidAmount("");
    setFormItems([
      { part_id: "", part_name: "", part_number: "", quantity: 1, purchase_price: 0 },
    ]);
    setFormError(null);
    setFormSuccess(null);
    setCreateModalOpen(true);
  };

  // Open Edit Purchase
  const handleOpenEditModal = async (p: any) => {
    let fullPurchase = p;
    if (!p.items || p.items.length === 0) {
      try {
        const fetched = await getPurchaseById(p.id);
        if (fetched) fullPurchase = fetched;
      } catch (err) {
        console.warn("Could not fetch full purchase details for edit:", err);
      }
    }

    setEditingPurchaseId(fullPurchase.id);
    setFormSupplierId(fullPurchase.supplier_id || "");
    setFormInvoiceNo(fullPurchase.purchase_invoice_number || "");
    setFormDate(fullPurchase.date ? fullPurchase.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setFormNotes(fullPurchase.notes || "");
    setFormPaymentStatus(fullPurchase.payment_status || "paid");
    setFormPaymentMethod(fullPurchase.payment_method || "cash");
    setFormPaidAmount(fullPurchase.paid_amount !== undefined ? fullPurchase.paid_amount : "");

    if (fullPurchase.items && fullPurchase.items.length > 0) {
      setFormItems(
        fullPurchase.items.map((it: any) => ({
          part_id: it.part_id,
          part_name: it.part?.name || "",
          part_number: it.part?.part_number || "",
          quantity: it.quantity,
          purchase_price: it.purchase_price,
        }))
      );
    } else {
      setFormItems([
        { part_id: "", part_name: "", part_number: "", quantity: 1, purchase_price: 0 },
      ]);
    }

    setFormError(null);
    setFormSuccess(null);
    if (detailsModalOpen) setDetailsModalOpen(false);
    setCreateModalOpen(true);
  };

  // View Details
  const handleViewDetails = async (purchaseId: string) => {
    setDetailsModalOpen(true);
    setLoadingDetails(true);
    try {
      const data = await getPurchaseById(purchaseId);
      setSelectedPurchase(data);
    } catch (e) {
      console.error("Error loading purchase details:", e);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Calculated Totals
  const calculatedTotal = useMemo(() => {
    return formItems.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0),
      0
    );
  }, [formItems]);

  const effectivePaid = useMemo(() => {
    if (formPaymentStatus === "paid") return calculatedTotal;
    if (formPaymentStatus === "credit") return 0;
    if (formPaidAmount === "") return 0;
    return Math.min(calculatedTotal, Number(formPaidAmount));
  }, [formPaymentStatus, calculatedTotal, formPaidAmount]);

  const remainingBalance = Math.max(0, calculatedTotal - effectivePaid);

  // Row Manipulation
  const handleAddItemRow = () => {
    setFormItems((prev) => [
      ...prev,
      { part_id: "", part_name: "", part_number: "", quantity: 1, purchase_price: 0 },
    ]);
  };

  const handleRemoveItemRow = (idx: number) => {
    if (formItems.length <= 1) return;
    setFormItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSelectPart = (idx: number, partId: string) => {
    const found = allParts.find((p) => p.id === partId);
    setFormItems((prev) => {
      const copy = [...prev];
      if (found) {
        copy[idx] = {
          part_id: found.id,
          part_name: found.name,
          part_number: found.part_number || "",
          quantity: copy[idx].quantity || 1,
          purchase_price: Number(found.purchase_price) || 0,
        };
      } else {
        copy[idx] = {
          part_id: "",
          part_name: "",
          part_number: "",
          quantity: copy[idx].quantity || 1,
          purchase_price: 0,
        };
      }
      return copy;
    });
  };

  // Inline Part Creation
  const handleOpenInlineNewPart = (rowIndex: number) => {
    setNewPartItemIndex(rowIndex);
    setNewPartName("");
    setNewPartNumber("");
    setNewPartBrand("");
    setNewPartDesc("");
    setNewPartPPrice(0);
    setNewPartSPrice(0);
    setNewPartMinStock(5);
    setNewPartLocation("");
    setNewPartError(null);
    setNewPartModalOpen(true);
  };

  const handleSaveInlineNewPart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPartName.trim()) {
      setNewPartError("Part Name is required.");
      return;
    }

    setSavingNewPart(true);
    setNewPartError(null);

    try {
      const created = await createPart({
        name: newPartName.trim(),
        part_number: newPartNumber.trim() || null,
        brand: newPartBrand.trim() || null,
        description: newPartDesc.trim() || null,
        purchase_price: Number(newPartPPrice) || 0,
        selling_price: Number(newPartSPrice) || 0,
        current_stock: 0,
        minimum_stock: Number(newPartMinStock) || 5,
        supplier_id: formSupplierId || null,
        location: newPartLocation.trim() || null,
        unit: "piece",
        is_active: true,
      });

      await loadAuxData();

      if (newPartItemIndex !== null && newPartItemIndex >= 0) {
        setFormItems((prev) => {
          const copy = [...prev];
          copy[newPartItemIndex] = {
            part_id: created.id,
            part_name: created.name,
            part_number: created.part_number || "",
            quantity: copy[newPartItemIndex].quantity || 1,
            purchase_price: Number(created.purchase_price) || 0,
          };
          return copy;
        });
      }

      setNewPartModalOpen(false);
    } catch (err: any) {
      setNewPartError(err.message || "Failed to create spare part.");
    } finally {
      setSavingNewPart(false);
    }
  };

  // Finalize Purchase Order
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSupplierId) {
      setFormError("Please select a Supplier.");
      return;
    }

    const validItems = formItems.filter((it) => it.part_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      setFormError("Please select at least one valid spare part with quantity > 0.");
      return;
    }

    setSavingPurchase(true);
    setFormError(null);

    const purchasePayload = {
      supplier_id: formSupplierId,
      purchase_invoice_number: formInvoiceNo.trim() || null,
      date: formDate,
      payment_status: formPaymentStatus,
      payment_method: formPaymentMethod,
      notes: formNotes.trim() || null,
      created_by: user?.full_name || user?.email?.split("@")[0] || "Owner",
    };

    const itemsPayload: PurchaseItemInsert[] = validItems.map((it) => ({
      part_id: it.part_id,
      quantity: Number(it.quantity),
      purchase_price: Number(it.purchase_price) || 0,
      total_price: Number(it.quantity) * (Number(it.purchase_price) || 0),
    }));

    try {
      if (editingPurchaseId) {
        await updatePurchase(editingPurchaseId, purchasePayload, itemsPayload, {
          paid_amount: effectivePaid,
          payment_method: formPaymentMethod,
          payment_reference: formInvoiceNo,
        });
        setFormSuccess("Purchase successfully updated and inventory stock adjusted!");
      } else {
        await createPurchase(purchasePayload, itemsPayload, {
          paid_amount: effectivePaid,
          payment_method: formPaymentMethod,
          payment_reference: formInvoiceNo,
        });
        setFormSuccess("Purchase successfully recorded and inventory stock increased!");
      }

      await loadPurchasesList();
      await loadAuxData();

      setTimeout(() => {
        setCreateModalOpen(false);
        setEditingPurchaseId(null);
        setFormSuccess(null);
      }, 1200);
    } catch (err: any) {
      setFormError(err.message || "Failed to finalize purchase.");
    } finally {
      setSavingPurchase(false);
    }
  };

  // Open Record Payment
  const handleOpenRecordPayment = (p: any) => {
    setSelectedPurchase(p);
    const bal = Number(p.balance !== undefined ? p.balance : p.total - (p.paid_amount || 0));
    setPayAmount(bal);
    setPayMethod("cash");
    setPayRef("REC-" + Math.floor(1000 + Math.random() * 9000));
    setPayNotes("");
    setPaymentError(null);
    setPaymentModalOpen(true);
  };

  // Submit Payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchase) return;

    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError("Please enter a valid payment amount greater than 0.");
      return;
    }

    setSubmittingPayment(true);
    setPaymentError(null);

    try {
      await recordSupplierPayment(
        selectedPurchase.id,
        amt,
        payMethod,
        payRef,
        payNotes,
        user?.full_name || "Owner"
      );

      await loadPurchasesList();
      if (detailsModalOpen && selectedPurchase) {
        await handleViewDetails(selectedPurchase.id);
      }

      setPaymentModalOpen(false);
    } catch (err: any) {
      setPaymentError(err.message || "Failed to record payment.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Checkbox Handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPurchaseIds(purchases.map((p) => p.id));
    } else {
      setSelectedPurchaseIds([]);
    }
  };

  const handleToggleSelectPurchase = (id: string) => {
    setSelectedPurchaseIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openDeleteDialog = (purchase: any) => {
    setPurchasesToDelete([purchase]);
    setDeleteConfirmOpen(true);
  };

  const handleRequestBulkDelete = () => {
    if (selectedPurchaseIds.length === 0) return;
    const targets = purchases.filter((p) => selectedPurchaseIds.includes(p.id));
    setPurchasesToDelete(targets);
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDeletePurchases = async () => {
    if (purchasesToDelete.length === 0) return;
    setDeletingPurchase(true);
    try {
      for (const p of purchasesToDelete) {
        await deletePurchase(p.id);
      }
      await loadPurchasesList();
      setDeleteConfirmOpen(false);
      setPurchasesToDelete([]);
      setSelectedPurchaseIds([]);
    } catch (err: any) {
      console.error("Error deleting purchase(s):", err);
    } finally {
      setDeletingPurchase(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Purchase Orders & Stock Intake"
        description="Track incoming spare parts inventory, supplier invoices, payment terms, and stock additions"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Purchases" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <Button
                onClick={() => handleOpenCreateModal()}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm gap-1.5"
              >
                <ShoppingCart className="h-4 w-4" /> + Create Purchase
              </Button>
            )}
            <Button
              variant="outline"
              render={<Link href="/suppliers" />}
              className="font-semibold text-xs gap-1.5"
            >
              <Building2 className="h-4 w-4 text-blue-600" /> Suppliers Directory
            </Button>
            <Button
              onClick={() => {
                loadPurchasesList();
                loadAuxData();
              }}
              variant="outline"
              size="icon"
              className="h-9 w-9"
              title="Refresh Purchases"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* ─── KPI Dashboard ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="shadow-sm border bg-card">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Invoices
              </span>
              <Receipt className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-2">
              <h3 className="text-2xl font-black text-foreground font-mono">{kpis.totalPurchasesCount}</h3>
              <p className="text-[11px] text-muted-foreground">Recorded POs</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border bg-card">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Procurement
              </span>
              <DollarSign className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-black text-foreground font-mono">
                {formatCurrency(kpis.totalValue)}
              </h3>
              <p className="text-[11px] text-muted-foreground">Total Stock Invoiced</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/10">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Total Paid
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-black text-emerald-700 dark:text-emerald-400 font-mono">
                {formatCurrency(kpis.totalPaid)}
              </h3>
              <p className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">Settled Invoices</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10">
          <CardContent className="p-4 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Outstanding Balance
              </span>
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-black text-rose-700 dark:text-rose-400 font-mono">
                {formatCurrency(kpis.totalOutstanding)}
              </h3>
              <p className="text-[11px] text-rose-700/80 dark:text-rose-400/80">Pending Payables</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Search & Filters Bar ─── */}
      <Card className="shadow-sm border bg-card">
        <div className="p-4 border-b flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by supplier, invoice #, part code..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            {/* Supplier Filter */}
            <select
              value={supplierFilter}
              onChange={(e) => {
                setSupplierFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs font-medium"
            >
              <option value="all">All Suppliers</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <div className="flex items-center gap-1">
              {[
                { id: "all", label: "All Status" },
                { id: "paid", label: "Paid" },
                { id: "partially_paid", label: "Partial" },
                { id: "credit", label: "Credit" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.id);
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all ${
                    statusFilter === tab.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ─── Purchases Table ─── */}
        <CardContent className="p-0">
          {loading ? (
            <div className="py-20 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
              <p className="font-medium text-sm">Loading purchase records...</p>
            </div>
          ) : purchases.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 text-xs font-bold border-b">
                    <TableHead className="w-[40px] pl-4">
                      <Checkbox
                        checked={
                          purchases.length > 0 && selectedPurchaseIds.length === purchases.length
                            ? true
                            : selectedPurchaseIds.length > 0
                            ? "indeterminate"
                            : false
                        }
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all visible purchases"
                      />
                    </TableHead>
                    <TableHead className="w-[12%] font-bold text-foreground">Date</TableHead>
                    <TableHead className="w-[18%] font-bold text-foreground">Invoice / Reference</TableHead>
                    <TableHead className="w-[20%] font-bold text-foreground">Supplier</TableHead>
                    <TableHead className="w-[12%] text-right font-bold text-foreground">Total (AED)</TableHead>
                    <TableHead className="w-[12%] text-right font-bold text-foreground">Paid (AED)</TableHead>
                    <TableHead className="w-[12%] text-right font-bold text-foreground">Balance (AED)</TableHead>
                    <TableHead className="w-[10%] text-center font-bold text-foreground">Payment Status</TableHead>
                    <TableHead className="w-[10%] text-right pr-4 font-bold text-foreground">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchases.map((p) => {
                    const tot = Number(p.total) || 0;
                    const paid = Number(
                      p.paid_amount !== undefined
                        ? p.paid_amount
                        : p.payment_status === "paid"
                        ? tot
                        : 0
                    );
                    const bal =
                      p.balance !== undefined ? Number(p.balance) : Math.max(0, tot - paid);

                    return (
                      <TableRow
                        key={p.id}
                        className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 border-b text-xs transition-colors ${
                          selectedPurchaseIds.includes(p.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                        }`}
                      >
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={selectedPurchaseIds.includes(p.id)}
                            onCheckedChange={() => handleToggleSelectPurchase(p.id)}
                            aria-label={`Select purchase ${p.purchase_invoice_number || p.id}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-muted-foreground py-3">
                          {formatDate(p.date || p.created_at)}
                        </TableCell>

                        <TableCell className="font-mono font-bold text-foreground py-3">
                          <button
                            type="button"
                            onClick={() => handleViewDetails(p.id)}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {p.purchase_invoice_number || `#${p.id.slice(-6)}`}
                          </button>
                        </TableCell>

                        <TableCell className="font-semibold text-foreground py-3">
                          {p.supplier?.name || "Direct Supplier"}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-foreground py-3">
                          {formatCurrency(tot)}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-emerald-600 py-3">
                          {formatCurrency(paid)}
                        </TableCell>

                        <TableCell className="text-right font-mono font-bold text-rose-600 py-3">
                          {formatCurrency(bal)}
                        </TableCell>

                        <TableCell className="text-center py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              bal === 0 || p.payment_status === "paid"
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : paid > 0
                                ? "bg-amber-50 text-amber-700 border border-amber-200"
                                : "bg-rose-50 text-rose-700 border border-rose-200"
                            }`}
                          >
                            {bal === 0 || p.payment_status === "paid"
                              ? "PAID"
                              : paid > 0
                              ? "PARTIAL"
                              : "CREDIT"}
                          </span>
                        </TableCell>

                        <TableCell className="text-right pr-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(p.id)}
                              className="h-8 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                              title="View purchase line items"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 text-xs">
                                <DropdownMenuLabel>Purchase Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleViewDetails(p.id)}>
                                  <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" /> View Details
                                </DropdownMenuItem>
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => handleOpenEditModal(p)}>
                                    <Pencil className="h-3.5 w-3.5 mr-2 text-slate-600" /> Edit Purchase
                                  </DropdownMenuItem>
                                )}
                                {bal > 0 && canEdit && (
                                  <DropdownMenuItem onClick={() => handleOpenRecordPayment(p)}>
                                    <CreditCard className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Record Payment
                                  </DropdownMenuItem>
                                )}
                                {Boolean(isOwner || canDelete) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => openDeleteDialog(p)}
                                      className="text-rose-600 hover:text-rose-700 font-semibold focus:text-rose-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-20 text-center text-muted-foreground space-y-2">
              <ShoppingCart className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-semibold text-foreground">No purchase records found</p>
              <p className="text-xs max-w-sm mx-auto">
                Create a purchase order to record incoming spare parts and automatically increase stock.
              </p>
            </div>
          )}
        </CardContent>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount} purchases
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 text-xs"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
              </Button>
              <span className="font-semibold px-2 font-mono">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-8 text-xs"
              >
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ========================================================================= */}
      {/* 1. CREATE / EDIT PURCHASE MODAL DIALOG                                     */}
      {/* ========================================================================= */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent className="w-[min(1000px,calc(100vw-40px))] max-w-[1000px] max-h-[calc(100vh-40px)] flex flex-col p-0 overflow-hidden bg-background text-foreground shadow-2xl border rounded-2xl">
          <div className="p-5 pb-3 border-b bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <ShoppingCart className="h-5 w-5 text-emerald-600 shrink-0" />
              {editingPurchaseId ? "Edit Purchase Order" : "Create Purchase Order / Stock Intake"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {editingPurchaseId
                ? "Modify purchase order items, costs, or supplier details with automatic delta stock adjustment."
                : "Record incoming spare parts stock from supplier with immediate inventory balance update."}
            </DialogDescription>
          </div>

          <form onSubmit={handleSavePurchase} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-5">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {formSuccess && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-700 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{formSuccess}</span>
                </div>
              )}

              {/* 1. Top Purchase Header: 3-column responsive layout */}
              <div className="p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-bold text-foreground">
                    Supplier <span className="text-destructive">*</span>
                  </Label>
                  <select
                    value={formSupplierId}
                    onChange={(e) => setFormSupplierId(e.target.value)}
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">-- Select Supplier --</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.company_name ? `(${s.company_name})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5 min-w-0">
                  <Label htmlFor="po-inv-2" className="text-xs font-bold text-foreground">
                    Supplier Invoice Number
                  </Label>
                  <Input
                    id="po-inv-2"
                    placeholder="e.g. INV-2026-889"
                    value={formInvoiceNo}
                    onChange={(e) => setFormInvoiceNo(e.target.value)}
                    className="h-9 text-xs font-mono font-semibold w-full"
                  />
                </div>

                <div className="space-y-1.5 min-w-0 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="po-date-2" className="text-xs font-bold text-foreground">
                    Purchase Date
                  </Label>
                  <Input
                    id="po-date-2"
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="h-9 text-xs font-mono w-full"
                  />
                </div>
              </div>

              {/* 2. Spare Part Line Items Table (Desktop: 6%, 42%, 12%, 16%, 16%, 8%) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                    <Package className="h-4 w-4 text-primary" /> Spare Part Items
                  </Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleAddItemRow}
                    className="h-8 text-xs font-bold text-primary gap-1 shadow-sm hover:bg-primary/10"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Item Line
                  </Button>
                </div>

                <div className="border rounded-xl overflow-hidden shadow-sm bg-card">
                  <Table className="w-full table-fixed">
                    <TableHeader>
                      <TableRow className="bg-slate-50/90 dark:bg-slate-800/60 text-xs font-bold border-b">
                        <TableHead className="w-[6%] text-center font-bold">#</TableHead>
                        <TableHead className="w-[42%] font-bold">Spare Part</TableHead>
                        <TableHead className="w-[12%] text-center font-bold">Qty</TableHead>
                        <TableHead className="w-[16%] text-right font-bold">Cost (AED)</TableHead>
                        <TableHead className="w-[16%] text-right font-bold">Amount (AED)</TableHead>
                        <TableHead className="w-[8%] text-center font-bold">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {formItems.map((item, idx) => {
                        const lineTotal = (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0);

                        return (
                          <TableRow key={idx} className="text-xs border-b hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                            <TableCell className="text-center font-mono text-muted-foreground font-bold py-2.5">
                              {idx + 1}
                            </TableCell>

                            <TableCell className="py-2.5">
                              <div className="space-y-1 w-full min-w-0">
                                <select
                                  value={item.part_id}
                                  onChange={(e) => handleSelectPart(idx, e.target.value)}
                                  className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs shadow-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring truncate"
                                >
                                  <option value="">-- Select Spare Part --</option>
                                  {allParts.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} {p.part_number ? `(#${p.part_number})` : ""} {p.brand ? `[${p.brand}]` : ""} — Stock: {p.current_stock}
                                    </option>
                                  ))}
                                </select>
                                <div className="flex items-center justify-between text-[11px] gap-2">
                                  {item.part_number ? (
                                    <span className="font-mono text-blue-600 dark:text-blue-400 truncate">OEM: #{item.part_number}</span>
                                  ) : (
                                    <span className="text-muted-foreground italic truncate">No OEM Code</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => handleOpenInlineNewPart(idx)}
                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 font-bold hover:underline inline-flex items-center gap-0.5 shrink-0"
                                  >
                                    <Sparkles className="h-3 w-3 text-amber-500" /> + Add New Part
                                  </button>
                                </div>
                              </div>
                            </TableCell>

                            <TableCell className="py-2.5">
                              <Input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value, 10);
                                  setFormItems((prev) => {
                                    const copy = [...prev];
                                    copy[idx].quantity = isNaN(val) ? 1 : Math.max(1, val);
                                    return copy;
                                  });
                                }}
                                className="h-8 font-mono font-bold text-center text-xs w-full"
                              />
                            </TableCell>

                            <TableCell className="py-2.5">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.purchase_price}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value);
                                  setFormItems((prev) => {
                                    const copy = [...prev];
                                    copy[idx].purchase_price = isNaN(val) ? 0 : Math.max(0, val);
                                    return copy;
                                  });
                                }}
                                className="h-8 font-mono text-right text-xs w-full"
                              />
                            </TableCell>

                            <TableCell className="text-right py-2.5 font-mono font-bold text-foreground">
                              {formatCurrency(lineTotal)}
                            </TableCell>

                            <TableCell className="text-center py-2.5">
                              {formItems.length > 1 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveItemRow(idx)}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  title="Remove row"
                                >
                                  ✕
                                </Button>
                              ) : (
                                <span className="text-muted-foreground/40 text-xs">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* 3. Payment Section */}
              <div className="p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                  <CreditCard className="h-4 w-4 text-emerald-600" /> Payment Terms & Settlement
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-xs font-bold text-foreground">Payment Status</Label>
                    <select
                      value={formPaymentStatus}
                      onChange={(e) => setFormPaymentStatus(e.target.value as PurchasePaymentStatus)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs shadow-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="paid">Paid in Full</option>
                      <option value="partially_paid">Partially Paid</option>
                      <option value="credit">Credit / Outstanding</option>
                    </select>
                  </div>

                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-xs font-bold text-foreground">Payment Method</Label>
                    <select
                      value={formPaymentMethod}
                      onChange={(e) => setFormPaymentMethod(e.target.value as PurchasePaymentMethod)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs shadow-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="card">Credit / Debit Card</option>
                      <option value="other">Other / Cheque</option>
                    </select>
                  </div>

                  {formPaymentStatus === "partially_paid" && (
                    <div className="space-y-1.5 min-w-0 sm:col-span-2 lg:col-span-1">
                      <Label htmlFor="po-paid-2" className="text-xs font-bold text-foreground">
                        Paid Amount (AED) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="po-paid-2"
                        type="number"
                        min="0"
                        max={calculatedTotal}
                        step="0.01"
                        placeholder="0.00"
                        value={formPaidAmount}
                        onChange={(e) => setFormPaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
                        className="h-8 text-xs font-mono font-bold text-emerald-600 w-full"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t text-xs">
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border text-center">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Amount</span>
                    <span className="font-mono font-black text-foreground text-sm block mt-0.5">
                      {formatCurrency(calculatedTotal)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border text-center">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Paid Amount</span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm block mt-0.5">
                      {formatCurrency(effectivePaid)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border text-center">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Supplier Balance</span>
                    <span
                      className={`font-mono font-black text-sm block mt-0.5 ${
                        remainingBalance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"
                      }`}
                    >
                      {formatCurrency(remainingBalance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Purchase Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="po-notes-2" className="text-xs font-bold text-foreground">Purchase Notes</Label>
                <Textarea
                  id="po-notes-2"
                  placeholder="e.g. Received parts at workshop, signed delivery voucher..."
                  rows={2}
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="text-xs w-full resize-none"
                />
              </div>
            </div>

            {/* 5. Sticky Footer with Full Visibility */}
            <div className="sticky bottom-0 bg-background border-t p-4 flex items-center justify-end gap-3 shrink-0 rounded-b-2xl shadow-sm z-20">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateModalOpen(false)}
                disabled={savingPurchase}
                className="text-xs font-semibold px-4"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingPurchase}
                className="text-xs font-bold px-5 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center gap-1.5"
              >
                {savingPurchase ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {editingPurchaseId ? "Save Changes & Update Stock" : "Finalize Purchase & Update Stock"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 2. VIEW PURCHASE DETAILS MODAL DIALOG                                     */}
      {/* ========================================================================= */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Receipt className="h-5 w-5 text-blue-600" />
              Purchase Invoice #{selectedPurchase?.purchase_invoice_number || selectedPurchase?.id?.slice(-6)}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Procurement order details, line items, and payment reconciliation.
            </DialogDescription>
          </DialogHeader>

          {loadingDetails ? (
            <div className="py-16 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
              <p className="font-medium text-sm">Loading purchase details...</p>
            </div>
          ) : selectedPurchase ? (
            <div className="space-y-4 pt-1">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border text-xs grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Supplier</span>
                  <span className="font-bold text-foreground">{selectedPurchase.supplier?.name || "Direct"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Date</span>
                  <span className="font-mono text-foreground">{formatDate(selectedPurchase.date || selectedPurchase.created_at)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Amount</span>
                  <span className="font-mono font-bold text-foreground">{formatCurrency(selectedPurchase.total)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Balance</span>
                  <span
                    className={`font-mono font-black ${
                      selectedPurchase.balance > 0 ? "text-rose-600" : "text-emerald-600"
                    }`}
                  >
                    {formatCurrency(selectedPurchase.balance || 0)}
                  </span>
                </div>
              </div>

              {/* Line items table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5 flex items-center gap-1">
                  <Package className="h-3.5 w-3.5 text-primary" /> Purchased Spare Parts
                </h4>
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold">
                        <TableHead>Part Name</TableHead>
                        <TableHead>Part Number</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right pr-3">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(selectedPurchase.items || []).map((it: any, i: number) => (
                        <TableRow key={i} className="text-xs border-b">
                          <TableCell className="font-semibold">{it.part?.name || "Spare Part"}</TableCell>
                          <TableCell className="font-mono text-muted-foreground">{it.part?.part_number || "—"}</TableCell>
                          <TableCell className="text-center font-mono font-bold">{it.quantity}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(it.purchase_price)}</TableCell>
                          <TableCell className="text-right font-mono font-bold pr-3">{formatCurrency(it.total_price || it.quantity * it.purchase_price)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Payment History */}
              {selectedPurchase.payments && selectedPurchase.payments.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-1.5 flex items-center gap-1">
                    <CreditCard className="h-3.5 w-3.5 text-emerald-600" /> Payment History
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold">
                          <TableHead>Payment Date</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead className="text-right pr-3">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPurchase.payments.map((pm: any, idx: number) => (
                          <TableRow key={idx} className="text-xs border-b">
                            <TableCell className="font-mono">{formatDate(pm.payment_date || pm.created_at)}</TableCell>
                            <TableCell className="uppercase font-semibold">{pm.payment_method}</TableCell>
                            <TableCell className="font-mono text-muted-foreground">{pm.reference_number || "Direct"}</TableCell>
                            <TableCell className="text-right font-mono font-bold text-emerald-600 pr-3">{formatCurrency(pm.amount)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="pt-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {selectedPurchase && (selectedPurchase.balance > 0 || (selectedPurchase.total - (selectedPurchase.paid_amount || 0)) > 0) && canEdit && (
                <Button
                  size="sm"
                  onClick={() => handleOpenRecordPayment(selectedPurchase)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1"
                >
                  <CreditCard className="h-3.5 w-3.5" /> Record Payment
                </Button>
              )}
              {selectedPurchase && canEdit && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEditModal(selectedPurchase)}
                  className="text-xs font-semibold gap-1"
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit PO
                </Button>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => setDetailsModalOpen(false)} className="text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 3. INLINE ADD NEW SPARE PART MODAL (INSIDE PURCHASE FORM)                 */}
      {/* ========================================================================= */}
      <Dialog open={newPartModalOpen} onOpenChange={setNewPartModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Package className="h-5 w-5 text-blue-600" /> Add New Spare Part
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Register part in catalog. It will automatically attach to this supplier and current purchase order.
            </DialogDescription>
          </DialogHeader>

          {newPartError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700">
              {newPartError}
            </div>
          )}

          <form onSubmit={handleSaveInlineNewPart} className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Part Name <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Toyota Oil Filter"
                  value={newPartName}
                  onChange={(e) => setNewPartName(e.target.value)}
                  required
                  className="h-8 text-xs font-medium"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Part Number / OEM</Label>
                <Input
                  placeholder="e.g. 90915-YZZD1"
                  value={newPartNumber}
                  onChange={(e) => setNewPartNumber(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Brand</Label>
                <Input
                  placeholder="e.g. Toyota / Denso"
                  value={newPartBrand}
                  onChange={(e) => setNewPartBrand(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Rack / Location</Label>
                <Input
                  placeholder="e.g. Shelf B-02"
                  value={newPartLocation}
                  onChange={(e) => setNewPartLocation(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Purchase Cost</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPartPPrice}
                  onChange={(e) => setNewPartPPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Selling Price</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newPartSPrice}
                  onChange={(e) => setNewPartSPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  className="h-8 text-xs font-mono font-bold text-primary"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] font-bold">Min Stock</Label>
                <Input
                  type="number"
                  min="0"
                  value={newPartMinStock}
                  onChange={(e) => setNewPartMinStock(e.target.value === "" ? "" : Number(e.target.value))}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Description</Label>
              <Input
                placeholder="e.g. Premium cartridge filter set"
                value={newPartDesc}
                onChange={(e) => setNewPartDesc(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewPartModalOpen(false)}
                disabled={savingNewPart}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingNewPart}
                className="text-xs font-bold bg-primary text-primary-foreground"
              >
                {savingNewPart ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Add to Purchase"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 4. RECORD SUPPLIER PAYMENT DIALOG                                         */}
      {/* ========================================================================= */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <CreditCard className="h-5 w-5 text-emerald-600" /> Record Supplier Payment
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Settle outstanding balance for Purchase Invoice #
              {selectedPurchase?.purchase_invoice_number || selectedPurchase?.id?.slice(-6)}
            </DialogDescription>
          </DialogHeader>

          {paymentError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700">
              {paymentError}
            </div>
          )}

          {selectedPurchase && (
            <form onSubmit={handleSavePayment} className="space-y-3.5 pt-1">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border text-xs grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Invoice</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatCurrency(selectedPurchase.total)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Remaining Balance</span>
                  <span className="font-mono font-black text-rose-600 dark:text-rose-400">
                    {formatCurrency(
                      selectedPurchase.balance !== undefined
                        ? selectedPurchase.balance
                        : selectedPurchase.total - (selectedPurchase.paid_amount || 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pay-amt-2" className="text-xs font-bold">Payment Amount (AED) *</Label>
                  <Input
                    id="pay-amt-2"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value === "" ? "" : Number(e.target.value))}
                    required
                    className="h-8 text-xs font-mono font-black text-emerald-600"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="pay-mth-2" className="text-xs font-bold">Payment Method</Label>
                  <select
                    id="pay-mth-2"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value as any)}
                    className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm font-medium"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank">Bank Transfer</option>
                    <option value="card">Credit Card</option>
                    <option value="other">Cheque / Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="pay-ref-2" className="text-xs font-bold">Payment Reference / Receipt #</Label>
                <Input
                  id="pay-ref-2"
                  placeholder="e.g. TXN-889922"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="pay-notes-2" className="text-xs font-bold">Payment Notes</Label>
                <Input
                  id="pay-notes-2"
                  placeholder="e.g. Settled via bank transfer..."
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <DialogFooter className="pt-2 border-t">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPaymentModalOpen(false)}
                  disabled={submittingPayment}
                  className="text-xs"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={submittingPayment}
                  className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {submittingPayment ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                  Confirm & Apply Payment
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* Unified Record Delete Confirmation Dialog */}
      <RecordDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        recordType="Purchase Order"
        recordTypePlural="Purchase Orders"
        recordCount={purchasesToDelete.length}
        singleRecordIdentifier={purchasesToDelete[0]?.purchase_invoice_number || purchasesToDelete[0]?.id}
        onConfirmDelete={handleConfirmDeletePurchases}
        isDeleting={deletingPurchase}
      />

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedPurchaseIds.length}
        onClearSelection={() => setSelectedPurchaseIds([])}
        onDeleteSelected={handleRequestBulkDelete}
        deleteLabel="Delete Selected"
        isDeleting={deletingPurchase}
      />
    </div>
  );
}

export default PurchasesView;
