"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  getSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  toggleSupplierStatus,
  deleteSupplier,
  type SupplierWithStats,
} from "@/lib/services/supplier-service";
import {
  getPurchases,
  getPurchaseById,
  createPurchase,
  updatePurchase,
  recordSupplierPayment,
} from "@/lib/services/purchase-service";
import {
  getParts,
  createPart,
} from "@/lib/services/parts-service";
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
  Building2,
  Phone,
  Mail,
  MapPin,
  FileText,
  Search,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  DollarSign,
  ShoppingCart,
  ChevronLeft,
  ChevronRight,
  Eye,
  CreditCard,
  Package,
  Calendar,
  Sparkles,
  RefreshCw,
  SlidersHorizontal,
  ArrowUpDown,
  TrendingDown,
  TrendingUp,
  Receipt,
  UserCheck,
  UserX,
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

export function SuppliersView() {
  const { user, canEdit, isOwner, canDelete } = usePermissions();

  // Data States
  const [suppliers, setSuppliers] = useState<SupplierWithStats[]>([]);
  const [allParts, setAllParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [balanceFilter, setBalanceFilter] = useState<boolean>(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const pageSize = 15;

  // ─── Add / Edit Supplier Modal State ───
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [formName, setFormName] = useState("");
  const [formCompany, setFormCompany] = useState("");
  const [formContact, setFormContact] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formAltPhone, setFormAltPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formCity, setFormCity] = useState("Dubai");
  const [formTrn, setFormTrn] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierFormError, setSupplierFormError] = useState<string | null>(null);

  // ─── Supplier Details & Purchase History Modal State ───
  const [detailsModalOpen, setDetailsModalOpen] = useState(false);
  const [selectedSupplierDetails, setSelectedSupplierDetails] = useState<(SupplierWithStats & { purchases: any[]; parts: any[] }) | null>(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  // ─── Create / Edit Purchase Modal State ───
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [purchaseSupplierId, setPurchaseSupplierId] = useState("");
  const [purchaseInvoiceNo, setPurchaseInvoiceNo] = useState("");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchasePaymentStatus, setPurchasePaymentStatus] = useState<PurchasePaymentStatus>("paid");
  const [purchasePaymentMethod, setPurchasePaymentMethod] = useState<PurchasePaymentMethod>("cash");
  const [purchasePaidAmount, setPurchasePaidAmount] = useState<number | "">("");
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItemRow[]>([
    { part_id: "", part_name: "", part_number: "", quantity: 1, purchase_price: 0 },
  ]);
  const [savingPurchase, setSavingPurchase] = useState(false);
  const [purchaseFormError, setPurchaseFormError] = useState<string | null>(null);
  const [purchaseSuccessMessage, setPurchaseSuccessMessage] = useState<string | null>(null);

  // ─── Add New Spare Part Inline (Within Purchase Form) ───
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
  const [selectedPurchaseForPayment, setSelectedPurchaseForPayment] = useState<any | null>(null);
  const [payAmount, setPayAmount] = useState<number | "">("");
  const [payMethod, setPayMethod] = useState<PurchasePaymentMethod>("cash");
  const [payRef, setPayRef] = useState("");
  const [payNotes, setPayNotes] = useState("");
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  // ─── Delete Confirmation & Selection State ───
  const [selectedSupplierIds, setSelectedSupplierIds] = useState<string[]>([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [suppliersToDelete, setSuppliersToDelete] = useState<SupplierWithStats[]>([]);
  const [deletingSupplier, setDeletingSupplier] = useState(false);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Parts list for purchase dropdowns
  const loadPartsList = useCallback(async () => {
    try {
      const res = await getParts("all", "", 1, 500);
      setAllParts(res.parts);
    } catch (e) {
      console.warn("Could not load parts catalog:", e);
    }
  }, []);

  // Load Suppliers list
  const loadSuppliersData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSuppliers(debouncedQuery, currentPage, pageSize, statusFilter);
      let list = res.suppliers;
      if (balanceFilter) {
        list = list.filter((s) => s.outstanding_balance > 0);
      }
      setSuppliers(list);
      setTotalCount(balanceFilter ? list.length : res.total);
    } catch (e) {
      console.error("Error loading suppliers:", e);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, currentPage, pageSize, statusFilter, balanceFilter]);

  useEffect(() => {
    loadSuppliersData();
    loadPartsList();
  }, [loadSuppliersData, loadPartsList]);

  // Total KPIs
  const kpis = useMemo(() => {
    const totalActive = suppliers.filter((s) => s.is_active !== false).length;
    const totalPurchases = suppliers.reduce((sum, s) => sum + (s.total_purchases || 0), 0);
    const totalPaid = suppliers.reduce((sum, s) => sum + (s.total_paid || 0), 0);
    const totalOutstanding = suppliers.reduce((sum, s) => sum + (s.outstanding_balance || 0), 0);
    return { totalActive, totalPurchases, totalPaid, totalOutstanding };
  }, [suppliers]);

  // Handle Open Add/Edit Supplier Modal
  const handleOpenSupplierModal = (sup?: Supplier) => {
    if (sup) {
      setEditingSupplier(sup);
      setFormName(sup.name);
      setFormCompany(sup.company_name || "");
      setFormContact(sup.contact_person || "");
      setFormPhone(sup.phone || "");
      setFormAltPhone(sup.alternate_phone || "");
      setFormEmail(sup.email || "");
      setFormAddress(sup.address || "");
      setFormCity(sup.city || "Dubai");
      setFormTrn(sup.trn_number || "");
      setFormNotes(sup.notes || "");
      setFormIsActive(sup.is_active !== false);
    } else {
      setEditingSupplier(null);
      setFormName("");
      setFormCompany("");
      setFormContact("");
      setFormPhone("");
      setFormAltPhone("");
      setFormEmail("");
      setFormAddress("");
      setFormCity("Dubai");
      setFormTrn("");
      setFormNotes("");
      setFormIsActive(true);
    }
    setSupplierFormError(null);
    setSupplierModalOpen(true);
  };

  // Submit Add / Edit Supplier
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setSupplierFormError("Supplier Name is required.");
      return;
    }
    if (!formPhone.trim()) {
      setSupplierFormError("Mobile Number is required.");
      return;
    }

    setSavingSupplier(true);
    setSupplierFormError(null);

    const payload = {
      name: formName.trim(),
      company_name: formCompany.trim() || null,
      contact_person: formContact.trim() || null,
      phone: formPhone.trim(),
      alternate_phone: formAltPhone.trim() || null,
      email: formEmail.trim() || null,
      address: formAddress.trim() || null,
      city: formCity.trim() || null,
      trn_number: formTrn.trim() || null,
      notes: formNotes.trim() || null,
      is_active: formIsActive,
    };

    try {
      if (editingSupplier) {
        await updateSupplier(editingSupplier.id, payload);
      } else {
        await createSupplier(payload);
      }

      await loadSuppliersData();
      setSupplierModalOpen(false);
    } catch (err: any) {
      setSupplierFormError(err.message || "Failed to save supplier.");
    } finally {
      setSavingSupplier(false);
    }
  };

  // View Supplier Details & Purchase History
  const handleViewSupplierDetails = async (supId: string) => {
    setDetailsModalOpen(true);
    setLoadingDetails(true);
    try {
      const data = await getSupplierById(supId);
      setSelectedSupplierDetails(data);
    } catch (e) {
      console.error("Error loading supplier details:", e);
    } finally {
      setLoadingDetails(false);
    }
  };

  // Toggle Active/Inactive
  const handleToggleStatus = async (sup: SupplierWithStats) => {
    try {
      const nextStatus = sup.is_active === false ? true : false;
      await toggleSupplierStatus(sup.id, nextStatus);
      await loadSuppliersData();
    } catch (err) {
      console.error("Failed to toggle status:", err);
    }
  };

  // Checkbox Selection Handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedSupplierIds(suppliers.map((s) => s.id));
    } else {
      setSelectedSupplierIds([]);
    }
  };

  const handleToggleSelectSupplier = (id: string) => {
    setSelectedSupplierIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openDeleteDialog = (supplier: SupplierWithStats) => {
    setSuppliersToDelete([supplier]);
    setDeleteConfirmOpen(true);
  };

  const handleRequestBulkDelete = () => {
    if (selectedSupplierIds.length === 0) return;
    const targets = suppliers.filter((s) => selectedSupplierIds.includes(s.id));
    setSuppliersToDelete(targets);
    setDeleteConfirmOpen(true);
  };

  // Safe Delete Supplier
  const handleConfirmDeleteSupplier = async () => {
    if (suppliersToDelete.length === 0) return;
    setDeletingSupplier(true);
    try {
      for (const s of suppliersToDelete) {
        await deleteSupplier(s.id, Boolean(isOwner || canDelete));
      }
      await loadSuppliersData();
      setDeleteConfirmOpen(false);
      setSuppliersToDelete([]);
      setSelectedSupplierIds([]);
    } catch (err: any) {
      console.error("Error deleting supplier(s):", err);
    } finally {
      setDeletingSupplier(false);
    }
  };

  // ─── CREATE / EDIT PURCHASE WORKFLOW ───
  const handleOpenCreatePurchase = (supplierId?: string) => {
    setEditingPurchaseId(null);
    setPurchaseSupplierId(supplierId || suppliers[0]?.id || "");
    setPurchaseInvoiceNo("INV-PO-" + Math.floor(1000 + Math.random() * 9000));
    setPurchaseDate(new Date().toISOString().slice(0, 10));
    setPurchaseNotes("");
    setPurchasePaymentStatus("paid");
    setPurchasePaymentMethod("cash");
    setPurchasePaidAmount("");
    setPurchaseItems([
      { part_id: "", part_name: "", part_number: "", quantity: 1, purchase_price: 0 },
    ]);
    setPurchaseFormError(null);
    setPurchaseSuccessMessage(null);
    setPurchaseModalOpen(true);
  };

  const handleOpenEditPurchase = async (purchase: any) => {
    let fullPurchase = purchase;
    if (!purchase.items || purchase.items.length === 0) {
      try {
        const fetched = await getPurchaseById(purchase.id);
        if (fetched) fullPurchase = fetched;
      } catch (err) {
        console.warn("Could not fetch full purchase details for edit:", err);
      }
    }

    setEditingPurchaseId(fullPurchase.id);
    setPurchaseSupplierId(fullPurchase.supplier_id || "");
    setPurchaseInvoiceNo(fullPurchase.purchase_invoice_number || "");
    setPurchaseDate(fullPurchase.date ? fullPurchase.date.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setPurchaseNotes(fullPurchase.notes || "");
    setPurchasePaymentStatus(fullPurchase.payment_status || "paid");
    setPurchasePaymentMethod(fullPurchase.payment_method || "cash");
    setPurchasePaidAmount(fullPurchase.paid_amount !== undefined ? fullPurchase.paid_amount : "");

    if (fullPurchase.items && fullPurchase.items.length > 0) {
      setPurchaseItems(
        fullPurchase.items.map((it: any) => ({
          part_id: it.part_id,
          part_name: it.part?.name || "",
          part_number: it.part?.part_number || "",
          quantity: it.quantity,
          purchase_price: it.purchase_price,
        }))
      );
    } else {
      setPurchaseItems([
        { part_id: "", part_name: "", part_number: "", quantity: 1, purchase_price: 0 },
      ]);
    }

    setPurchaseFormError(null);
    setPurchaseSuccessMessage(null);
    setPurchaseModalOpen(true);
  };

  // Calculated Purchase Total
  const calculatedPurchaseTotal = useMemo(() => {
    return purchaseItems.reduce(
      (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.purchase_price) || 0),
      0
    );
  }, [purchaseItems]);

  const effectivePaidAmount = useMemo(() => {
    if (purchasePaymentStatus === "paid") return calculatedPurchaseTotal;
    if (purchasePaymentStatus === "credit") return 0;
    if (purchasePaidAmount === "") return 0;
    return Math.min(calculatedPurchaseTotal, Number(purchasePaidAmount));
  }, [purchasePaymentStatus, calculatedPurchaseTotal, purchasePaidAmount]);

  const purchaseRemainingBalance = Math.max(0, calculatedPurchaseTotal - effectivePaidAmount);

  // Add Item Row
  const handleAddPurchaseItemRow = () => {
    setPurchaseItems((prev) => [
      ...prev,
      { part_id: "", part_name: "", part_number: "", quantity: 1, purchase_price: 0 },
    ]);
  };

  // Remove Item Row
  const handleRemovePurchaseItemRow = (index: number) => {
    if (purchaseItems.length <= 1) return;
    setPurchaseItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Select Existing Part in Row
  const handleSelectPartForRow = (index: number, partId: string) => {
    const found = allParts.find((p) => p.id === partId);
    setPurchaseItems((prev) => {
      const copy = [...prev];
      if (found) {
        copy[index] = {
          part_id: found.id,
          part_name: found.name,
          part_number: found.part_number || "",
          quantity: copy[index].quantity || 1,
          purchase_price: Number(found.purchase_price) || 0,
        };
      } else {
        copy[index] = {
          part_id: "",
          part_name: "",
          part_number: "",
          quantity: copy[index].quantity || 1,
          purchase_price: 0,
        };
      }
      return copy;
    });
  };

  // Open Inline Add New Spare Part
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

  // Save Inline New Spare Part
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
        current_stock: 0, // Stock will be added by the purchase order!
        minimum_stock: Number(newPartMinStock) || 5,
        supplier_id: purchaseSupplierId || null,
        location: newPartLocation.trim() || null,
        unit: "piece",
        is_active: true,
      });

      await loadPartsList();

      // Automatically select in row
      if (newPartItemIndex !== null && newPartItemIndex >= 0) {
        setPurchaseItems((prev) => {
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

  // Submit Create / Edit Purchase
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!purchaseSupplierId) {
      setPurchaseFormError("Please select a Supplier.");
      return;
    }

    const validItems = purchaseItems.filter((it) => it.part_id && Number(it.quantity) > 0);
    if (validItems.length === 0) {
      setPurchaseFormError("Please select at least one valid spare part with quantity > 0.");
      return;
    }

    setSavingPurchase(true);
    setPurchaseFormError(null);

    const purchasePayload = {
      supplier_id: purchaseSupplierId,
      purchase_invoice_number: purchaseInvoiceNo.trim() || null,
      date: purchaseDate,
      payment_status: purchasePaymentStatus,
      payment_method: purchasePaymentMethod,
      notes: purchaseNotes.trim() || null,
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
          paid_amount: effectivePaidAmount,
          payment_method: purchasePaymentMethod,
          payment_reference: purchaseInvoiceNo,
        });
        setPurchaseSuccessMessage("Purchase successfully updated and inventory stock adjusted!");
      } else {
        await createPurchase(purchasePayload, itemsPayload, {
          paid_amount: effectivePaidAmount,
          payment_method: purchasePaymentMethod,
          payment_reference: purchaseInvoiceNo,
        });
        setPurchaseSuccessMessage("Purchase successfully finalized and inventory stock increased!");
      }

      await loadSuppliersData();
      await loadPartsList();

      if (detailsModalOpen && selectedSupplierDetails?.id === purchaseSupplierId) {
        await handleViewSupplierDetails(purchaseSupplierId);
      }

      setTimeout(() => {
        setPurchaseModalOpen(false);
        setEditingPurchaseId(null);
        setPurchaseSuccessMessage(null);
      }, 1200);
    } catch (err: any) {
      setPurchaseFormError(err.message || "Failed to save purchase.");
    } finally {
      setSavingPurchase(false);
    }
  };

  // Open Record Payment Dialog
  const handleOpenRecordPayment = (purchase: any) => {
    setSelectedPurchaseForPayment(purchase);
    const bal = Number(purchase.balance !== undefined ? purchase.balance : purchase.total - (purchase.paid_amount || 0));
    setPayAmount(bal);
    setPayMethod("cash");
    setPayRef("REC-" + Math.floor(1000 + Math.random() * 9000));
    setPayNotes("");
    setPaymentError(null);
    setPaymentModalOpen(true);
  };

  // Submit Record Payment
  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPurchaseForPayment) return;

    const amt = Number(payAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError("Please enter a valid payment amount greater than 0.");
      return;
    }

    setSubmittingPayment(true);
    setPaymentError(null);

    try {
      await recordSupplierPayment(
        selectedPurchaseForPayment.id,
        amt,
        payMethod,
        payRef,
        payNotes,
        user?.full_name || "Owner"
      );

      await loadSuppliersData();
      if (detailsModalOpen && selectedSupplierDetails) {
        await handleViewSupplierDetails(selectedSupplierDetails.id);
      }

      setPaymentModalOpen(false);
    } catch (err: any) {
      setPaymentError(err.message || "Failed to record payment.");
    } finally {
      setSubmittingPayment(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="space-y-6">
      {/* ─── Top Header ─── */}
      <PageHeader
        title="Supplier Management & Procurement"
        description="Comprehensive supplier directory, purchases, stock intake, and outstanding accounts"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Suppliers" }]}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          {canEdit && (
            <>
              <Button
                onClick={() => handleOpenSupplierModal()}
                className="h-10 px-4 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-2xs flex items-center gap-2"
              >
                <Plus className="h-4 w-4" /> Add Supplier
              </Button>
              <Button
                onClick={() => handleOpenCreatePurchase()}
                className="h-10 px-3.5 text-xs font-semibold rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 shadow-2xs flex items-center gap-2"
              >
                <ShoppingCart className="h-4 w-4 text-emerald-600" /> Create Purchase
              </Button>
            </>
          )}
          <Button
            onClick={() => {
              loadSuppliersData();
              loadPartsList();
            }}
            variant="outline"
            size="sm"
            className="h-10 px-3 text-xs font-semibold rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs"
            title="Refresh Supplier Data"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
          </Button>
        </div>
      </PageHeader>

      {/* ─── Summary KPI Cards ─── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Suppliers */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Active Suppliers</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 font-mono mt-1">{kpis.totalActive}</p>
            <p className="text-xs text-slate-500 mt-1">Registered vendors</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        {/* Total Purchases */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Purchases</p>
            <p className="text-2xl font-bold tracking-tight text-slate-900 font-mono mt-1">
              {formatCurrency(kpis.totalPurchases)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Cumulative procurement</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
            <ShoppingCart className="h-5 w-5" />
          </div>
        </div>

        {/* Total Paid */}
        <div className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Paid</p>
            <p className="text-2xl font-bold tracking-tight text-emerald-600 font-mono mt-1">
              {formatCurrency(kpis.totalPaid)}
            </p>
            <p className="text-xs text-slate-500 mt-1">Settled invoices</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
        </div>

        {/* Outstanding Balance */}
        <div
          onClick={() => setBalanceFilter((prev) => !prev)}
          className={`rounded-2xl border p-5 shadow-2xs cursor-pointer transition-all flex items-center justify-between ${
            balanceFilter
              ? "border-rose-400 ring-2 ring-rose-500/20 bg-rose-50/30"
              : "border-slate-200/90 bg-white hover:border-slate-300"
          }`}
        >
          <div>
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Outstanding Balance</p>
            <p className="text-2xl font-bold tracking-tight text-rose-600 font-mono mt-1">
              {formatCurrency(kpis.totalOutstanding)}
            </p>
            <p className="text-xs text-rose-600 mt-1">
              {balanceFilter ? "Filtering by balance (click to reset)" : "Pending payables"}
            </p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
            <AlertTriangle className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* ─── Unified Search & Filters Bar ─── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search by supplier, company, phone, TRN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 text-xs rounded-xl border-slate-200 bg-white shadow-2xs focus:border-blue-500 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: "all", label: "All Suppliers" },
            { id: "active", label: "Active" },
            { id: "inactive", label: "Inactive" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setStatusFilter(tab.id as any);
                setCurrentPage(1);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                statusFilter === tab.id
                  ? "bg-blue-600 text-white shadow-2xs"
                  : "border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Suppliers Table ─── */}
      <div className="border border-slate-200/90 shadow-2xs bg-white rounded-2xl overflow-hidden">
        <div className="p-0">
          {loading ? (
            <div className="py-20 text-center text-slate-500">
              <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
              <p className="font-medium text-xs">Loading suppliers...</p>
            </div>
          ) : suppliers.length > 0 ? (
            <div className="overflow-x-auto min-w-full">
              <Table className="min-w-[1050px]">
                <TableHeader>
                  <TableRow className="border-b border-slate-200/80 bg-slate-50/80 hover:bg-slate-50/80 text-[11px] font-bold text-slate-500 uppercase tracking-wider h-11">
                    <TableHead className="w-[44px] pl-4">
                      <Checkbox
                        checked={
                          suppliers.length > 0 && selectedSupplierIds.length === suppliers.length
                            ? true
                            : selectedSupplierIds.length > 0
                            ? "indeterminate"
                            : false
                        }
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all visible suppliers"
                      />
                    </TableHead>
                    <TableHead className="w-[22%] min-w-[200px] text-slate-600 font-bold">Supplier</TableHead>
                    <TableHead className="w-[14%] min-w-[120px] text-slate-600 font-bold">Contact Person</TableHead>
                    <TableHead className="w-[15%] min-w-[130px] text-slate-600 font-bold">Phone / Mobile</TableHead>
                    <TableHead className="w-[13%] min-w-[110px] text-slate-600 font-bold">Company</TableHead>
                    <TableHead className="w-[10%] min-w-[95px] text-slate-600 font-bold">TRN</TableHead>
                    <TableHead className="w-[11%] min-w-[95px] text-right text-slate-600 font-bold">Total Purchases</TableHead>
                    <TableHead className="w-[11%] min-w-[95px] text-right text-slate-600 font-bold">Outstanding</TableHead>
                    <TableHead className="w-[8%] min-w-[75px] text-center text-slate-600 font-bold">Status</TableHead>
                    <TableHead className="w-[105px] min-w-[105px] text-right pr-4 text-slate-600 font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suppliers.map((s) => {
                    const hasBalance = s.outstanding_balance > 0;
                    return (
                      <TableRow
                        key={s.id}
                        className={`h-12 hover:bg-slate-50/60 border-b border-slate-100 text-xs transition-colors ${
                          selectedSupplierIds.includes(s.id) ? "bg-blue-50/30" : ""
                        }`}
                      >
                        <TableCell className="pl-4 py-2.5">
                          <Checkbox
                            checked={selectedSupplierIds.includes(s.id)}
                            onCheckedChange={() => handleToggleSelectSupplier(s.id)}
                            aria-label={`Select ${s.name}`}
                          />
                        </TableCell>

                        {/* Supplier Name & Location */}
                        <TableCell className="font-semibold text-slate-900 py-2.5">
                          <button
                            type="button"
                            onClick={() => handleViewSupplierDetails(s.id)}
                            className="font-bold text-sm text-left text-slate-900 hover:text-blue-600 transition-colors block"
                          >
                            {s.name}
                          </button>
                          {s.city && (
                            <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <MapPin className="h-3 w-3 text-slate-400" /> {s.city}
                            </span>
                          )}
                        </TableCell>

                        {/* Contact Person */}
                        <TableCell className="text-slate-800 py-2.5 font-medium">
                          {s.contact_person || <span className="text-slate-400 italic font-normal">—</span>}
                        </TableCell>

                        {/* Phone & Email */}
                        <TableCell className="py-2.5">
                          <span className="font-mono text-xs font-semibold text-slate-800 block">{s.phone || "—"}</span>
                          {s.email && (
                            <span className="text-[11px] text-slate-500 block truncate max-w-[140px]">
                              {s.email}
                            </span>
                          )}
                        </TableCell>

                        {/* Company */}
                        <TableCell className="py-2.5 text-slate-800">
                          {s.company_name || <span className="text-slate-400 italic font-normal">—</span>}
                        </TableCell>

                        {/* TRN */}
                        <TableCell className="py-2.5">
                          {s.trn_number ? (
                            <span className="font-mono text-[11px] text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-lg">
                              {s.trn_number}
                            </span>
                          ) : (
                            <span className="text-slate-400 italic font-normal">—</span>
                          )}
                        </TableCell>

                        {/* Total Purchases */}
                        <TableCell className="text-right font-mono font-bold text-slate-900 py-2.5 tabular-nums">
                          {formatCurrency(s.total_purchases)}
                        </TableCell>

                        {/* Outstanding Balance */}
                        <TableCell className="text-right font-mono py-2.5 tabular-nums">
                          <span
                            className={`font-bold px-2 py-0.5 rounded-lg text-xs inline-block ${
                              hasBalance
                                ? "bg-rose-50 text-rose-700 border border-rose-200"
                                : "text-emerald-600 font-semibold"
                            }`}
                          >
                            {formatCurrency(s.outstanding_balance)}
                          </span>
                        </TableCell>

                        {/* Status */}
                        <TableCell className="text-center py-2.5">
                          {s.is_active !== false ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <CheckCircle2 className="h-3 w-3" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              <XCircle className="h-3 w-3" /> Inactive
                            </span>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right pr-4 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewSupplierDetails(s.id)}
                              className="h-8 px-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-xl"
                              title="View supplier details & purchase history"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 text-xs rounded-xl shadow-lg border-slate-200">
                                <DropdownMenuLabel>Supplier Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => handleViewSupplierDetails(s.id)}>
                                  <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" /> View Details
                                </DropdownMenuItem>
                                {canEdit && (
                                  <>
                                    <DropdownMenuItem onClick={() => handleOpenCreatePurchase(s.id)}>
                                      <ShoppingCart className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Create PO
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleOpenSupplierModal(s)}>
                                      <Edit2 className="h-3.5 w-3.5 mr-2 text-slate-500" /> Edit Details
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => handleToggleStatus(s)}>
                                      {s.is_active !== false ? (
                                        <>
                                          <UserX className="h-3.5 w-3.5 mr-2 text-amber-600" /> Deactivate
                                        </>
                                      ) : (
                                        <>
                                          <UserCheck className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Activate
                                        </>
                                      )}
                                    </DropdownMenuItem>
                                  </>
                                )}
                                {Boolean(isOwner || canDelete) && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => openDeleteDialog(s)}
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
            <div className="py-16 text-center text-slate-500 space-y-2">
              <Building2 className="h-10 w-10 mx-auto text-slate-300" />
              <p className="text-sm font-semibold text-slate-900">No suppliers match your search criteria</p>
              <p className="text-xs max-w-sm mx-auto text-slate-500">
                Try adjusting your search query or status filter to see other suppliers.
              </p>
            </div>
          )}
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div className="p-3.5 border-t border-slate-200/80 bg-slate-50/40 flex items-center justify-between text-xs text-slate-500">
            <span>
              Showing {(currentPage - 1) * pageSize + 1} to{" "}
              {Math.min(currentPage * pageSize, totalCount)} of {totalCount} suppliers
            </span>
            <div className="flex items-center gap-1.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 text-xs font-semibold rounded-xl border-slate-200 bg-white hover:bg-slate-50"
              >
                <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
              </Button>
              <span className="font-semibold px-2 font-mono text-slate-900">
                {currentPage} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="h-8 text-xs font-semibold rounded-xl border-slate-200 bg-white hover:bg-slate-50"
              >
                Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. ADD / EDIT SUPPLIER MODAL DIALOG                                       */}
      {/* ========================================================================= */}
      <Dialog open={supplierModalOpen} onOpenChange={setSupplierModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Building2 className="h-5 w-5 text-primary" />
              {editingSupplier ? `Edit Supplier: ${editingSupplier.name}` : "Add New Supplier"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Register auto parts supplier profile, corporate details, tax registration number, and contact info.
            </DialogDescription>
          </DialogHeader>

          {supplierFormError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{supplierFormError}</span>
            </div>
          )}

          <form onSubmit={handleSaveSupplier} className="space-y-3.5 pt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sup-name" className="text-xs font-bold">
                  Supplier Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sup-name"
                  placeholder="e.g. Al Futtaim Auto Parts LLC"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  required
                  className="h-8 text-xs font-medium"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-company" className="text-xs font-bold">Company Name</Label>
                <Input
                  id="sup-company"
                  placeholder="e.g. Al Futtaim Group UAE"
                  value={formCompany}
                  onChange={(e) => setFormCompany(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sup-contact" className="text-xs font-bold">Contact Person</Label>
                <Input
                  id="sup-contact"
                  placeholder="e.g. Rashid Ali"
                  value={formContact}
                  onChange={(e) => setFormContact(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-phone" className="text-xs font-bold">
                  Mobile Number <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="sup-phone"
                  placeholder="e.g. +971-4-2987654"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  required
                  className="h-8 text-xs font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-altphone" className="text-xs font-bold">Alternate Phone</Label>
                <Input
                  id="sup-altphone"
                  placeholder="e.g. +971-50-1234567"
                  value={formAltPhone}
                  onChange={(e) => setFormAltPhone(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label htmlFor="sup-email" className="text-xs font-bold">Email Address</Label>
                <Input
                  id="sup-email"
                  type="email"
                  placeholder="e.g. orders@supplier.ae"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-city" className="text-xs font-bold">Emirate / City</Label>
                <select
                  id="sup-city"
                  value={formCity}
                  onChange={(e) => setFormCity(e.target.value)}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm font-medium"
                >
                  <option value="Dubai">Dubai</option>
                  <option value="Abu Dhabi">Abu Dhabi</option>
                  <option value="Sharjah">Sharjah</option>
                  <option value="Ajman">Ajman</option>
                  <option value="Ras Al Khaimah">Ras Al Khaimah</option>
                  <option value="Fujairah">Fujairah</option>
                  <option value="Umm Al Quwain">Umm Al Quwain</option>
                  <option value="Al Ain">Al Ain</option>
                  <option value="Other">Other Region</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="sup-trn" className="text-xs font-bold">TRN / Tax Number</Label>
                <Input
                  id="sup-trn"
                  placeholder="e.g. 100200300400003"
                  value={formTrn}
                  onChange={(e) => setFormTrn(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="sup-address" className="text-xs font-bold">Address / Industrial Area</Label>
              <Input
                id="sup-address"
                placeholder="e.g. Warehouse 14, Al Quoz Industrial 3, Dubai"
                value={formAddress}
                onChange={(e) => setFormAddress(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="space-y-1">
              <Label htmlFor="sup-notes" className="text-xs font-bold">Notes & Special Instructions</Label>
              <Textarea
                id="sup-notes"
                placeholder="e.g. Toyota genuine OEM distributor, 30 days credit terms..."
                rows={2}
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
                className="text-xs"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="sup-active"
                checked={formIsActive}
                onChange={(e) => setFormIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="sup-active" className="text-xs font-bold cursor-pointer">
                Supplier is Active
              </Label>
            </div>

            <DialogFooter className="pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSupplierModalOpen(false)}
                disabled={savingSupplier}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingSupplier}
                className="text-xs font-bold bg-primary text-primary-foreground"
              >
                {savingSupplier ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                {editingSupplier ? "Update Supplier" : "Save Supplier"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 2. SUPPLIER DETAILS & PURCHASE HISTORY MODAL DIALOG                       */}
      {/* ========================================================================= */}
      <Dialog open={detailsModalOpen} onOpenChange={setDetailsModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  {selectedSupplierDetails?.name || "Supplier Profile"}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Complete supplier profile, procurement history, and balance reconciliation.
                </DialogDescription>
              </div>
              {canEdit && selectedSupplierDetails && (
                <Button
                  size="sm"
                  onClick={() => {
                    handleOpenCreatePurchase(selectedSupplierDetails.id);
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5"
                >
                  <ShoppingCart className="h-3.5 w-3.5" /> + New Purchase
                </Button>
              )}
            </div>
          </DialogHeader>

          {loadingDetails ? (
            <div className="py-20 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
              <p className="font-medium text-sm">Loading supplier profile & purchase history...</p>
            </div>
          ) : selectedSupplierDetails ? (
            <div className="space-y-5 pt-1">
              {/* Supplier Info Grid */}
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border text-xs grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Company</span>
                  <span className="font-bold text-foreground">{selectedSupplierDetails.company_name || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Contact Person</span>
                  <span className="font-medium text-foreground">{selectedSupplierDetails.contact_person || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Mobile Phone</span>
                  <span className="font-mono font-bold text-foreground">{selectedSupplierDetails.phone || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">TRN / Tax Number</span>
                  <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                    {selectedSupplierDetails.trn_number ? `#${selectedSupplierDetails.trn_number}` : "—"}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Address</span>
                  <span className="text-foreground">{selectedSupplierDetails.address || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Email</span>
                  <span className="text-foreground">{selectedSupplierDetails.email || "—"}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Account Status</span>
                  <span className="font-bold">
                    {selectedSupplierDetails.is_active !== false ? (
                      <span className="text-emerald-600">Active Partner</span>
                    ) : (
                      <span className="text-rose-600">Inactive</span>
                    )}
                  </span>
                </div>
              </div>

              {/* 4 Financial KPIs */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Total Purchases</span>
                  <span className="text-base font-black font-mono block text-foreground mt-1">
                    {formatCurrency(selectedSupplierDetails.total_purchases)}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Total Paid</span>
                  <span className="text-base font-black font-mono block text-emerald-600 dark:text-emerald-400 mt-1">
                    {formatCurrency(selectedSupplierDetails.total_paid)}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Outstanding Balance</span>
                  <span
                    className={`text-base font-black font-mono block mt-1 ${
                      selectedSupplierDetails.outstanding_balance > 0
                        ? "text-rose-600 dark:text-rose-400"
                        : "text-emerald-600"
                    }`}
                  >
                    {formatCurrency(selectedSupplierDetails.outstanding_balance)}
                  </span>
                </div>
                <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border text-center">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Purchase Invoices</span>
                  <span className="text-base font-black font-mono block text-blue-600 dark:text-blue-400 mt-1">
                    {selectedSupplierDetails.purchases_count}
                  </span>
                </div>
              </div>

              {/* Purchase History Table */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground mb-2 flex items-center gap-1.5">
                  <Receipt className="h-4 w-4 text-blue-600" /> Purchase History & Invoices
                </h4>

                {selectedSupplierDetails.purchases && selectedSupplierDetails.purchases.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold">
                          <TableHead className="w-[15%]">Date</TableHead>
                          <TableHead className="w-[20%]">Purchase Invoice No</TableHead>
                          <TableHead className="w-[15%] text-right">Total Amount</TableHead>
                          <TableHead className="w-[15%] text-right">Paid</TableHead>
                          <TableHead className="w-[15%] text-right">Balance</TableHead>
                          <TableHead className="w-[12%] text-center">Payment Status</TableHead>
                          <TableHead className="w-[8%] text-right pr-4">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedSupplierDetails.purchases.map((p: any) => {
                          const tot = Number(p.total) || 0;
                          const paid = Number(p.paid_amount !== undefined ? p.paid_amount : (p.payment_status === "paid" ? tot : 0));
                          const bal = p.balance !== undefined ? Number(p.balance) : Math.max(0, tot - paid);

                          return (
                            <TableRow key={p.id} className="text-xs border-b">
                              <TableCell className="font-mono text-muted-foreground text-[11px] py-2.5">
                                {formatDate(p.date || p.created_at)}
                              </TableCell>
                              <TableCell className="font-mono font-bold text-foreground py-2.5">
                                {p.purchase_invoice_number || `#${p.id.slice(-6)}`}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-foreground py-2.5">
                                {formatCurrency(tot)}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-emerald-600 py-2.5">
                                {formatCurrency(paid)}
                              </TableCell>
                              <TableCell className="text-right font-mono font-bold text-rose-600 py-2.5">
                                {formatCurrency(bal)}
                              </TableCell>
                              <TableCell className="text-center py-2.5">
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
                                    : "CREDIT / UNPAID"}
                                </span>
                              </TableCell>
                              <TableCell className="text-right pr-4 py-2.5">
                                <div className="flex items-center justify-end gap-1.5">
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleOpenEditPurchase(p)}
                                      className="h-7 px-2 text-[11px] font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                                      title="Edit purchase order"
                                    >
                                      <Edit2 className="h-3 w-3 mr-1" /> Edit
                                    </Button>
                                  )}
                                  {bal > 0 && canEdit ? (
                                    <Button
                                      size="sm"
                                      onClick={() => handleOpenRecordPayment(p)}
                                      className="h-7 px-2 text-[11px] font-bold bg-blue-600 hover:bg-blue-700 text-white gap-1"
                                    >
                                      <CreditCard className="h-3 w-3" /> Pay
                                    </Button>
                                  ) : (
                                    <span className="text-[11px] text-muted-foreground">Settled</span>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-muted-foreground border rounded-lg">
                    No purchase history found for this supplier yet.
                  </div>
                )}
              </div>
            </div>
          ) : null}

          <DialogFooter className="pt-2">
            <Button variant="outline" size="sm" onClick={() => setDetailsModalOpen(false)} className="text-xs">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 3. CREATE / EDIT PURCHASE MODAL DIALOG                                     */}
      {/* ========================================================================= */}
      <Dialog open={purchaseModalOpen} onOpenChange={setPurchaseModalOpen}>
        <DialogContent className="w-[min(1000px,calc(100vw-40px))] max-w-[1000px] max-h-[calc(100vh-40px)] flex flex-col p-0 overflow-hidden bg-background text-foreground shadow-2xl border rounded-2xl">
          <div className="p-5 pb-3 border-b bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <ShoppingCart className="h-5 w-5 text-emerald-600 shrink-0" />
              {editingPurchaseId ? "Edit Purchase Order" : "Create Purchase Order / Stock Intake"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              {editingPurchaseId
                ? "Modify purchase order items, costs, or supplier details with automatic delta stock adjustment."
                : "Add spare parts from supplier. Stock is automatically increased and recorded in the audit ledger upon saving."}
            </DialogDescription>
          </div>

          <form onSubmit={handleSavePurchase} className="flex-1 flex flex-col min-h-0 overflow-hidden">
            <div className="flex-1 overflow-y-auto overflow-x-hidden p-5 space-y-5">
              {purchaseFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs font-semibold text-rose-700 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{purchaseFormError}</span>
                </div>
              )}

              {purchaseSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs font-semibold text-emerald-700 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{purchaseSuccessMessage}</span>
                </div>
              )}

              {/* 1. Top Purchase Header: 3-column responsive layout */}
              <div className="p-4 bg-slate-50/80 dark:bg-slate-800/40 rounded-xl border grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs font-bold text-foreground">
                    Supplier <span className="text-destructive">*</span>
                  </Label>
                  <select
                    value={purchaseSupplierId}
                    onChange={(e) => setPurchaseSupplierId(e.target.value)}
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
                  <Label htmlFor="po-inv" className="text-xs font-bold text-foreground">
                    Supplier Invoice Number
                  </Label>
                  <Input
                    id="po-inv"
                    placeholder="e.g. INV-2026-889"
                    value={purchaseInvoiceNo}
                    onChange={(e) => setPurchaseInvoiceNo(e.target.value)}
                    className="h-9 text-xs font-mono font-semibold w-full"
                  />
                </div>

                <div className="space-y-1.5 min-w-0 sm:col-span-2 lg:col-span-1">
                  <Label htmlFor="po-date" className="text-xs font-bold text-foreground">
                    Purchase Date
                  </Label>
                  <Input
                    id="po-date"
                    type="date"
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
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
                    onClick={handleAddPurchaseItemRow}
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
                      {purchaseItems.map((item, idx) => {
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
                                  onChange={(e) => handleSelectPartForRow(idx, e.target.value)}
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
                                  setPurchaseItems((prev) => {
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
                                  setPurchaseItems((prev) => {
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
                              {purchaseItems.length > 1 ? (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemovePurchaseItemRow(idx)}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                                  title="Remove item row"
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
                      value={purchasePaymentStatus}
                      onChange={(e) => setPurchasePaymentStatus(e.target.value as PurchasePaymentStatus)}
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
                      value={purchasePaymentMethod}
                      onChange={(e) => setPurchasePaymentMethod(e.target.value as PurchasePaymentMethod)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs shadow-sm font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank">Bank Transfer</option>
                      <option value="card">Credit / Debit Card</option>
                      <option value="other">Other / Cheque</option>
                    </select>
                  </div>

                  {purchasePaymentStatus === "partially_paid" && (
                    <div className="space-y-1.5 min-w-0 sm:col-span-2 lg:col-span-1">
                      <Label htmlFor="po-paid" className="text-xs font-bold text-foreground">
                        Paid Amount (AED) <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="po-paid"
                        type="number"
                        min="0"
                        max={calculatedPurchaseTotal}
                        step="0.01"
                        placeholder="0.00"
                        value={purchasePaidAmount}
                        onChange={(e) => setPurchasePaidAmount(e.target.value === "" ? "" : Number(e.target.value))}
                        className="h-8 text-xs font-mono font-bold text-emerald-600 w-full"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t text-xs">
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border text-center">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Amount</span>
                    <span className="font-mono font-black text-foreground text-sm block mt-0.5">
                      {formatCurrency(calculatedPurchaseTotal)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border text-center">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Paid Amount</span>
                    <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm block mt-0.5">
                      {formatCurrency(effectivePaidAmount)}
                    </span>
                  </div>
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border text-center">
                    <span className="text-muted-foreground block text-[10px] uppercase font-bold">Supplier Balance</span>
                    <span
                      className={`font-mono font-black text-sm block mt-0.5 ${
                        purchaseRemainingBalance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"
                      }`}
                    >
                      {formatCurrency(purchaseRemainingBalance)}
                    </span>
                  </div>
                </div>
              </div>

              {/* 4. Purchase Notes */}
              <div className="space-y-1.5">
                <Label htmlFor="po-notes" className="text-xs font-bold text-foreground">Purchase Notes / Delivery Terms</Label>
                <Textarea
                  id="po-notes"
                  placeholder="e.g. Delivery received at workshop gate, verified with supplier packing slip..."
                  rows={2}
                  value={purchaseNotes}
                  onChange={(e) => setPurchaseNotes(e.target.value)}
                  className="text-xs w-full resize-none"
                />
              </div>
            </div>

            {/* 5. Sticky Footer with Full Visibility */}
            <div className="sticky bottom-0 bg-background border-t p-4 flex items-center justify-end gap-3 shrink-0 rounded-b-2xl shadow-sm z-20">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPurchaseModalOpen(false)}
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
      {/* 4. INLINE ADD NEW SPARE PART MODAL (INSIDE PURCHASE FORM)                 */}
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
      {/* 5. RECORD SUPPLIER PAYMENT DIALOG                                         */}
      {/* ========================================================================= */}
      <Dialog open={paymentModalOpen} onOpenChange={setPaymentModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <CreditCard className="h-5 w-5 text-emerald-600" /> Record Supplier Payment
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Settle outstanding balance for Purchase Invoice #
              {selectedPurchaseForPayment?.purchase_invoice_number || selectedPurchaseForPayment?.id?.slice(-6)}
            </DialogDescription>
          </DialogHeader>

          {paymentError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700">
              {paymentError}
            </div>
          )}

          {selectedPurchaseForPayment && (
            <form onSubmit={handleSavePayment} className="space-y-3.5 pt-1">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border text-xs grid grid-cols-2 gap-2">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Total Invoice</span>
                  <span className="font-mono font-bold text-foreground">
                    {formatCurrency(selectedPurchaseForPayment.total)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-bold">Remaining Balance</span>
                  <span className="font-mono font-black text-rose-600 dark:text-rose-400">
                    {formatCurrency(
                      selectedPurchaseForPayment.balance !== undefined
                        ? selectedPurchaseForPayment.balance
                        : selectedPurchaseForPayment.total - (selectedPurchaseForPayment.paid_amount || 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="pay-amt" className="text-xs font-bold">Payment Amount (AED) *</Label>
                  <Input
                    id="pay-amt"
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
                  <Label htmlFor="pay-mth" className="text-xs font-bold">Payment Method</Label>
                  <select
                    id="pay-mth"
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
                <Label htmlFor="pay-ref" className="text-xs font-bold">Payment Reference / Receipt #</Label>
                <Input
                  id="pay-ref"
                  placeholder="e.g. TXN-889922"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="pay-notes" className="text-xs font-bold">Payment Notes</Label>
                <Input
                  id="pay-notes"
                  placeholder="e.g. Paid via workshop corporate card..."
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

      {/* ========================================================================= */}
      {/* 6. DELETE CONFIRMATION MODAL & BULK ACTION BAR                            */}
      {/* ========================================================================= */}
      <RecordDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        recordType="Supplier"
        recordTypePlural="Suppliers"
        recordCount={suppliersToDelete.length}
        singleRecordIdentifier={suppliersToDelete[0]?.name}
        onConfirmDelete={handleConfirmDeleteSupplier}
        isDeleting={deletingSupplier}
      />

      <BulkActionBar
        selectedCount={selectedSupplierIds.length}
        onClearSelection={() => setSelectedSupplierIds([])}
        onDeleteSelected={handleRequestBulkDelete}
        deleteLabel="Delete Selected"
        isDeleting={deletingSupplier}
      />
    </div>
  );
}

export default SuppliersView;
