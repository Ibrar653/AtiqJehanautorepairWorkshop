"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  getParts,
  createPart,
  updatePart,
  togglePartStatus,
  deletePart,
  checkDuplicatePartNumber,
  type PartsFilterType,
} from "@/lib/services/parts-service";
import {
  getInventoryTransactions,
  recordStockAdjustment,
} from "@/lib/services/inventory-service";
import { getSuppliers, createSupplier } from "@/lib/services/supplier-service";
import type { Part, Supplier, InventoryTransaction } from "@/types/database";
import { usePermissions } from "@/lib/context/auth-context";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Package,
  Plus,
  Pencil,
  Eye,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Filter,
  AlertTriangle,
  RefreshCw,
  Boxes,
  Check,
  PowerOff,
  History,
  ArrowUpDown,
  Building2,
  MapPin,
  TrendingDown,
  TrendingUp,
  Tag,
  Phone,
  User,
  MoreVertical,
} from "lucide-react";
import { formatCurrency, formatAmount, formatDate } from "@/lib/utils";
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

export function PartsListView() {
  const { isViewer, canEdit, canDelete, isOwner } = usePermissions();
  const isOwnerOrAdmin = isOwner || canDelete;

  const [parts, setParts] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PartsFilterType>("all");
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog State: Create / Edit
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Dialog State: View Details
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewingPart, setViewingPart] = useState<Part | null>(null);

  // Dialog & Selection State: Delete Confirmation & Multi-Select
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [partsToDelete, setPartsToDelete] = useState<Part[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Dialog State: Add New Supplier Inline
  const [supplierModalOpen, setSupplierModalOpen] = useState(false);
  const [newSupName, setNewSupName] = useState("");
  const [newSupContact, setNewSupContact] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [newSupAddress, setNewSupAddress] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // Form Field States
  const [formName, setFormName] = useState("");
  const [formPartNumber, setFormPartNumber] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formUnit, setFormUnit] = useState("piece");
  const [formPurchasePrice, setFormPurchasePrice] = useState("0");
  const [formSellingPrice, setFormSellingPrice] = useState("0");
  const [formCurrentStock, setFormCurrentStock] = useState("0");
  const [formMinimumStock, setFormMinimumStock] = useState("5");
  const [formSupplierId, setFormSupplierId] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formActive, setFormActive] = useState(true);

  // Stock History Modal
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPart, setHistoryPart] = useState<Part | null>(null);
  const [historyTransactions, setHistoryTransactions] = useState<InventoryTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Manual Stock Adjustment Modal
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustPart, setAdjustPart] = useState<Part | null>(null);
  const [adjustQty, setAdjustQty] = useState("1");
  const [adjustDirection, setAdjustDirection] = useState<"add" | "reduce">("add");
  const [adjustReason, setAdjustReason] = useState("Inventory count correction");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Request sequence tracker to ignore stale requests
  const requestSeqRef = useRef(0);

  // Load suppliers
  const loadSuppliers = useCallback(async () => {
    try {
      const res = await getSuppliers("", 1, 100);
      setSuppliers(res.suppliers || []);
    } catch (e) {
      console.warn("Could not load suppliers for parts select:", e);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  const loadParts = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);

    try {
      const res = await getParts(statusFilter, searchQuery, page, pageSize);
      if (seq === requestSeqRef.current) {
        setParts(res.parts || []);
        setTotalCount(res.total || 0);
      }
    } catch (err: any) {
      if (seq === requestSeqRef.current) {
        console.error("Spare parts loading error:", err);
        setError("Unable to load spare parts.");
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [statusFilter, searchQuery, page, pageSize]);

  useEffect(() => {
    loadParts();
  }, [loadParts]);

  // Open View Details Dialog
  const openViewDialog = (part: Part) => {
    setViewingPart(part);
    setViewDialogOpen(true);
  };

  // Open Create Dialog
  const openCreateDialog = () => {
    setEditingPart(null);
    setFormName("");
    setFormPartNumber("");
    setFormBrand("");
    setFormDescription("");
    setFormUnit("piece");
    setFormPurchasePrice("0");
    setFormSellingPrice("50");
    setFormCurrentStock("10");
    setFormMinimumStock("5");
    setFormSupplierId("");
    setFormLocation("");
    setFormActive(true);
    setFormError(null);
    setFormDialogOpen(true);
  };

  // Open Edit Dialog
  const openEditDialog = (part: Part) => {
    setEditingPart(part);
    setFormName(part.name);
    setFormPartNumber(part.part_number || "");
    setFormBrand(part.brand || "");
    setFormDescription(part.description || "");
    setFormUnit(part.unit || "piece");
    setFormPurchasePrice(part.purchase_price.toString());
    setFormSellingPrice(part.selling_price.toString());
    setFormCurrentStock(part.current_stock.toString());
    setFormMinimumStock(part.minimum_stock.toString());
    setFormSupplierId(part.supplier_id || "");
    setFormLocation(part.location || "");
    setFormActive(part.is_active);
    setFormError(null);
    setFormDialogOpen(true);
  };

  // Checkbox handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedPartIds(parts.map((p) => p.id));
    } else {
      setSelectedPartIds([]);
    }
  };

  const handleToggleSelectPart = (id: string) => {
    setSelectedPartIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Open Delete Confirmation Dialog
  const openDeleteDialog = (part: Part) => {
    setPartsToDelete([part]);
    setDeleteModalOpen(true);
  };

  const handleRequestBulkDelete = () => {
    if (selectedPartIds.length === 0) return;
    const targets = parts.filter((p) => selectedPartIds.includes(p.id));
    setPartsToDelete(targets);
    setDeleteModalOpen(true);
  };

  // Confirm Delete / Soft-Deactivate
  const handleConfirmDelete = async () => {
    if (partsToDelete.length === 0) return;
    setDeleting(true);
    let count = 0;
    try {
      for (const p of partsToDelete) {
        await deletePart(p.id);
        count++;
      }
      setToastMessage({
        type: "success",
        text: `${count} spare part${count > 1 ? "s" : ""} processed (deleted or safely deactivated to protect repair history).`,
      });
      setDeleteModalOpen(false);
      setPartsToDelete([]);
      setSelectedPartIds([]);
      await loadParts();
    } catch (err: any) {
      setToastMessage({
        type: "error",
        text: err.message || "Failed to delete spare part(s).",
      });
    } finally {
      setDeleting(false);
    }
  };

  // Open Stock History Modal
  const openStockHistory = async (part: Part) => {
    setHistoryPart(part);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const res = await getInventoryTransactions(part.id, "all", 1, 50);
      setHistoryTransactions(res.transactions);
    } catch (e) {
      console.error("Failed to load part stock history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Open Manual Adjust Stock Modal
  const openAdjustModal = (part: Part) => {
    setAdjustPart(part);
    setAdjustQty("1");
    setAdjustDirection("add");
    setAdjustReason("Inventory count reconciliation");
    setAdjustError(null);
    setAdjustModalOpen(true);
  };

  // Save Part (Create or Edit)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("Spare part name is required.");
      return;
    }

    const sPrice = parseFloat(formSellingPrice);
    if (isNaN(sPrice) || sPrice < 0) {
      setFormError("Please enter a valid selling price.");
      return;
    }

    const pPrice = parseFloat(formPurchasePrice) || 0;
    const cStock = parseInt(formCurrentStock, 10) || 0;
    const mStock = parseInt(formMinimumStock, 10) || 0;

    // Check duplicate part number if provided
    if (formPartNumber.trim()) {
      const isDup = await checkDuplicatePartNumber(formPartNumber.trim(), editingPart?.id);
      if (isDup) {
        setFormError(`Part Number "${formPartNumber.trim()}" is already assigned to another spare part.`);
        return;
      }
    }

    setSaving(true);
    setFormError(null);

    try {
      if (editingPart) {
        await updatePart(editingPart.id, {
          name: formName.trim(),
          part_number: formPartNumber.trim() || null,
          brand: formBrand.trim() || null,
          description: formDescription.trim() || null,
          unit: formUnit.trim() || "piece",
          purchase_price: pPrice,
          selling_price: sPrice,
          current_stock: cStock,
          minimum_stock: mStock,
          supplier_id: formSupplierId || null,
          location: formLocation.trim() || null,
          is_active: formActive,
        });

        setToastMessage({
          type: "success",
          text: `Spare part "${formName}" updated successfully.`,
        });
      } else {
        await createPart({
          name: formName.trim(),
          part_number: formPartNumber.trim() || null,
          brand: formBrand.trim() || null,
          description: formDescription.trim() || null,
          unit: formUnit.trim() || "piece",
          purchase_price: pPrice,
          selling_price: sPrice,
          current_stock: cStock,
          minimum_stock: mStock,
          supplier_id: formSupplierId || null,
          location: formLocation.trim() || null,
          is_active: formActive,
        });

        setToastMessage({
          type: "success",
          text: `New spare part "${formName}" registered successfully.`,
        });
      }

      setFormDialogOpen(false);
      await loadParts();
    } catch (err: any) {
      setFormError(err.message || "Failed to save spare part.");
    } finally {
      setSaving(false);
    }
  };

  // Save New Supplier Inline
  const handleSaveNewSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim()) {
      setSupplierError("Supplier name is required.");
      return;
    }

    setSavingSupplier(true);
    setSupplierError(null);

    try {
      const created = await createSupplier({
        name: newSupName.trim(),
        contact_person: newSupContact.trim() || null,
        phone: newSupPhone.trim() || null,
        address: newSupAddress.trim() || null,
        notes: "Created from Spare Part form",
      });

      setSuppliers((prev) => [created, ...prev]);
      setFormSupplierId(created.id);
      setSupplierModalOpen(false);
      setToastMessage({
        type: "success",
        text: `Supplier "${created.name}" created and selected for this part.`,
      });
    } catch (err: any) {
      setSupplierError(err.message || "Failed to create supplier.");
    } finally {
      setSavingSupplier(false);
    }
  };

  // Toggle Part Status
  const handleToggleStatus = async (part: Part) => {
    try {
      const updated = await togglePartStatus(part.id, part.is_active);
      setParts((prev) => prev.map((p) => (p.id === part.id ? { ...p, is_active: updated.is_active } : p)));
      setToastMessage({
        type: "success",
        text: `Spare part "${part.name}" is now ${updated.is_active ? "Active" : "Inactive"}.`,
      });
    } catch (err: any) {
      setToastMessage({
        type: "error",
        text: err.message || "Failed to update status",
      });
    }
  };

  // Stock Adjustment Submit
  const handleStockAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustPart) return;

    const qty = parseInt(adjustQty, 10);
    if (isNaN(qty) || qty <= 0) {
      setAdjustError("Quantity must be a positive whole number.");
      return;
    }

    if (!adjustReason.trim()) {
      setAdjustError("Please specify a reason for this stock adjustment.");
      return;
    }

    setAdjusting(true);
    setAdjustError(null);

    try {
      const finalQty = adjustDirection === "add" ? qty : -qty;
      await recordStockAdjustment(
        adjustPart.id,
        finalQty,
        adjustReason.trim()
      );

      setToastMessage({
        type: "success",
        text: `Stock for "${adjustPart.name}" adjusted by ${adjustDirection === "add" ? "+" : "-"}${qty} units.`,
      });
      setAdjustModalOpen(false);
      await loadParts();
    } catch (err: any) {
      setAdjustError(err.message || "Failed to record stock adjustment.");
    } finally {
      setAdjusting(false);
    }
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // Compute summary stats
  const totalStockCount = parts.reduce((acc, p) => acc + (p.current_stock || 0), 0);
  const lowStockCount = parts.filter((p) => p.is_active && p.current_stock > 0 && p.current_stock <= p.minimum_stock).length;
  const outOfStockCount = parts.filter((p) => p.is_active && p.current_stock <= 0).length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`p-4 rounded-xl flex items-center justify-between text-xs font-semibold shadow-md transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-4 w-4 text-rose-600 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-muted-foreground hover:text-foreground text-xs ml-4"
          >
            ✕
          </button>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Spare Parts Master & Inventory"
        description="Comprehensive auto spare parts catalog, cost & selling pricing, stock alert levels, and supplier links"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadParts}
              disabled={loading}
              className="text-xs h-9 font-medium"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin text-blue-600" : ""}`} />
              Refresh
            </Button>
            {canEdit && (
              <Button
                size="sm"
                onClick={openCreateDialog}
                className="bg-blue-600 hover:bg-blue-700 text-white text-xs h-9 font-semibold shadow-sm"
              >
                <Plus className="h-4 w-4 mr-1.5" />
                Add Spare Part
              </Button>
            )}
          </div>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Total Registered Parts</p>
              <p className="text-2xl font-black text-foreground mt-0.5">{totalCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-100 dark:border-blue-900">
              <Boxes className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground">Units in Stock</p>
              <p className="text-2xl font-black text-foreground mt-0.5">{totalStockCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900">
              <Package className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Low Stock Warnings</p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-0.5">{lowStockCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-100 dark:border-amber-900">
              <AlertTriangle className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">Out of Stock</p>
              <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-0.5">{outOfStockCount}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-100 dark:border-rose-900">
              <PowerOff className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex-1 max-w-md">
          <SearchInput
            placeholder="Search by Part Name, Part #, Brand, or Supplier..."
            onSearch={(q) => {
              setSearchQuery(q);
              setPage(1);
            }}
            defaultValue={searchQuery}
            minChars={2}
            debounceMs={280}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-muted-foreground flex items-center gap-1">
            <Filter className="h-3.5 w-3.5" /> Stock Filter:
          </span>
          {(
            [
              { key: "all", label: "All Items" },
              { key: "in_stock", label: "In Stock" },
              { key: "low_stock", label: "Low Stock" },
              { key: "out_of_stock", label: "Out of Stock" },
              { key: "active", label: "Active" },
              { key: "inactive", label: "Inactive" },
            ] as const
          ).map((st) => (
            <button
              key={st.key}
              type="button"
              onClick={() => {
                setStatusFilter(st.key);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
                statusFilter === st.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </div>

      {/* Main Spare Parts Table */}
      <Card className="shadow-sm border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <CardContent className="p-0">
          {error ? (
            <div className="py-16 text-center space-y-3">
              <div className="p-3 bg-rose-50 text-rose-500 rounded-full w-12 h-12 mx-auto flex items-center justify-center border border-rose-200">
                <AlertCircle className="h-6 w-6" />
              </div>
              <p className="font-bold text-foreground text-sm">{error}</p>
              <Button size="sm" variant="outline" onClick={loadParts} className="gap-2 text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : loading ? (
            <div className="py-20 text-center text-muted-foreground">
              <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
              <p className="text-xs font-semibold">Loading spare parts catalog...</p>
            </div>
          ) : parts.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 hover:bg-slate-50/80 border-b border-slate-200 dark:border-slate-800 text-xs">
                    <TableHead className="w-[40px] pl-4">
                      <Checkbox
                        checked={
                          parts.length > 0 && selectedPartIds.length === parts.length
                            ? true
                            : selectedPartIds.length > 0
                            ? "indeterminate"
                            : false
                        }
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all parts"
                      />
                    </TableHead>
                    <TableHead className="w-[20%] text-slate-700 dark:text-slate-300 font-bold">Spare Part Name</TableHead>
                    <TableHead className="w-[12%] text-slate-700 dark:text-slate-300 font-bold">Part # / OEM</TableHead>
                    <TableHead className="w-[10%] text-slate-700 dark:text-slate-300 font-bold">Brand</TableHead>
                    <TableHead className="w-[9%] text-right text-slate-700 dark:text-slate-300 font-bold">Cost</TableHead>
                    <TableHead className="w-[9%] text-right text-slate-700 dark:text-slate-300 font-bold">Selling Price</TableHead>
                    <TableHead className="w-[11%] text-center text-slate-700 dark:text-slate-300 font-bold">Stock Status</TableHead>
                    <TableHead className="w-[11%] text-slate-700 dark:text-slate-300 font-bold">Supplier</TableHead>
                    <TableHead className="w-[7%] text-slate-700 dark:text-slate-300 font-bold">Location</TableHead>
                    <TableHead className="w-[4%] text-center text-slate-700 dark:text-slate-300 font-bold">Status</TableHead>
                    <TableHead className="w-[9%] text-right pr-4 text-slate-700 dark:text-slate-300 font-bold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parts.map((part) => {
                    const isOutOfStock = part.current_stock <= 0;
                    const isLowStock = part.current_stock > 0 && part.current_stock <= part.minimum_stock;
                    const matchedSupplier = suppliers.find((s) => s.id === part.supplier_id);
                    const supplierName =
                      matchedSupplier?.name ||
                      (part.supplier && typeof part.supplier === "object" && "name" in part.supplier
                        ? (part.supplier as any).name
                        : null);

                    return (
                      <TableRow
                        key={part.id}
                        className={`hover:bg-blue-50/30 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-100 dark:border-slate-800 text-xs ${
                          selectedPartIds.includes(part.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                        } ${!part.is_active ? "opacity-60 bg-slate-50/40" : ""}`}
                      >
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={selectedPartIds.includes(part.id)}
                            onCheckedChange={() => handleToggleSelectPart(part.id)}
                            aria-label={`Select ${part.name}`}
                          />
                        </TableCell>
                        {/* Part Name */}
                        <TableCell className="font-semibold text-foreground py-3">
                          <div className="flex items-start gap-2">
                            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-100 dark:border-blue-900 mt-0.5 shrink-0">
                              <Package className="h-3.5 w-3.5" />
                            </div>
                            <div>
                              <button
                                type="button"
                                onClick={() => openViewDialog(part)}
                                className="font-bold text-foreground text-sm leading-tight text-left hover:text-blue-600 hover:underline"
                              >
                                {part.name}
                              </button>
                              {part.description ? (
                                <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                                  {part.description}
                                </p>
                              ) : null}
                              <p className="text-[10px] text-muted-foreground mt-0.5">
                                Unit: <span className="font-medium text-foreground">{part.unit || "piece"}</span>
                              </p>
                            </div>
                          </div>
                        </TableCell>

                        {/* Part Number */}
                        <TableCell className="py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                          {part.part_number ? part.part_number : <span className="text-muted-foreground italic font-normal">—</span>}
                        </TableCell>

                        {/* Brand */}
                        <TableCell className="py-3 font-medium text-foreground">
                          {part.brand || <span className="text-muted-foreground italic font-normal">—</span>}
                        </TableCell>

                        {/* Cost Price */}
                        <TableCell className="text-right py-3 font-mono text-muted-foreground">
                          {formatCurrency(part.purchase_price)}
                        </TableCell>

                        {/* Selling Price */}
                        <TableCell className="text-right py-3">
                          <span className="font-bold font-mono text-sm text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-2 py-0.5 rounded inline-block">
                            {formatCurrency(part.selling_price)}
                          </span>
                        </TableCell>

                        {/* Stock Status */}
                        <TableCell className="text-center py-3">
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span
                              className={`px-2 py-0.5 rounded-full font-bold text-[11px] border inline-flex items-center gap-1 ${
                                isOutOfStock
                                  ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900"
                                  : isLowStock
                                  ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900"
                              }`}
                            >
                              {isOutOfStock ? (
                                <>0 Out of Stock</>
                              ) : isLowStock ? (
                                <>
                                  <AlertTriangle className="h-3 w-3" /> Low Stock ({part.current_stock})
                                </>
                              ) : (
                                <>{part.current_stock} In Stock</>
                              )}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              Min Alert: {part.minimum_stock}
                            </span>
                          </div>
                        </TableCell>

                        {/* Supplier */}
                        <TableCell className="py-3">
                          {supplierName ? (
                            <span className="font-medium text-foreground truncate block max-w-[130px]" title={supplierName}>
                              {supplierName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic font-normal">—</span>
                          )}
                        </TableCell>

                        {/* Storage Location */}
                        <TableCell className="py-3">
                          {part.location ? (
                            <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-foreground">
                              <MapPin className="h-3 w-3 text-slate-500" />
                              {part.location}
                            </span>
                          ) : (
                            <span className="text-muted-foreground italic font-normal">—</span>
                          )}
                        </TableCell>

                        {/* Active Status */}
                        <TableCell className="text-center py-3">
                          {part.is_active ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800">
                              <Check className="h-2.5 w-2.5" /> Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
                              <PowerOff className="h-2.5 w-2.5" /> Inactive
                            </span>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="text-right pr-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                              onClick={() => openViewDialog(part)}
                              title="View Spare Part Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>

                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                                onClick={() => openEditDialog(part)}
                                title="Edit Part Master"
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-7 w-7 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-48 text-xs">
                                <DropdownMenuLabel>Part Actions</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => openViewDialog(part)}>
                                  <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" /> View Details
                                </DropdownMenuItem>
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => openEditDialog(part)}>
                                    <Pencil className="h-3.5 w-3.5 mr-2 text-slate-600" /> Edit Part
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onClick={() => openStockHistory(part)}>
                                  <History className="h-3.5 w-3.5 mr-2 text-blue-600" /> Stock Movement History
                                </DropdownMenuItem>
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => openAdjustModal(part)}>
                                    <ArrowUpDown className="h-3.5 w-3.5 mr-2 text-amber-600" /> Adjust Stock
                                  </DropdownMenuItem>
                                )}
                                {canEdit && (
                                  <DropdownMenuItem onClick={() => handleToggleStatus(part)}>
                                    {part.is_active ? (
                                      <>
                                        <PowerOff className="h-3.5 w-3.5 mr-2 text-amber-600" /> Deactivate
                                      </>
                                    ) : (
                                      <>
                                        <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Activate
                                      </>
                                    )}
                                  </DropdownMenuItem>
                                )}
                                {isOwnerOrAdmin && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => openDeleteDialog(part)}
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

              {/* Pagination Bar */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50/50 dark:bg-slate-800/40 text-xs">
                  <span className="text-muted-foreground">
                    Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount} parts
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="h-7 px-2 text-xs"
                    >
                      Previous
                    </Button>
                    <span className="px-2 font-bold text-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="h-7 px-2 text-xs"
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="py-20 text-center text-muted-foreground">
              <Package className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <h3 className="text-lg font-semibold text-foreground">No spare parts found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                {searchQuery
                  ? "No spare parts match your query. Try searching by OEM number or brand."
                  : "Start populating your workshop spare parts inventory catalog."}
              </p>
              {canEdit && (
                <Button onClick={openCreateDialog} size="sm" className="mt-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold">
                  <Plus className="mr-1.5 h-4 w-4" /> Add First Spare Part
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── View Part Details Dialog ─── */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <div>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <Package className="h-5 w-5 text-blue-600" />
              Spare Part Specification
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Detailed technical specification, pricing, stock levels, and supplier links
            </DialogDescription>
          </div>

          {viewingPart && (
            <div className="space-y-4 py-2 text-xs">
              <div className="p-3 bg-blue-50/50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900 space-y-1">
                <p className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">Part Name</p>
                <p className="text-base font-black text-foreground">{viewingPart.name}</p>
                {viewingPart.description && (
                  <p className="text-xs text-muted-foreground pt-1">{viewingPart.description}</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Part # / OEM</span>
                  <p className="text-sm font-mono font-bold text-blue-600 mt-0.5">
                    {viewingPart.part_number || "—"}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Brand / Maker</span>
                  <p className="text-sm font-bold text-foreground mt-0.5">
                    {viewingPart.brand || "—"}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Purchase Cost</span>
                  <p className="text-sm font-mono font-bold text-muted-foreground mt-0.5">
                    {formatCurrency(viewingPart.purchase_price)}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-blue-50/50 dark:bg-blue-950/30 border-blue-200">
                  <span className="text-[10px] font-bold text-blue-700 uppercase">Selling Price</span>
                  <p className="text-sm font-mono font-black text-blue-700 mt-0.5">
                    {formatCurrency(viewingPart.selling_price)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Current Stock</span>
                  <p className="text-sm font-mono font-black text-foreground mt-0.5">
                    {viewingPart.current_stock} {viewingPart.unit || "units"}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Min Alert Level</span>
                  <p className="text-sm font-mono font-bold text-amber-600 mt-0.5">
                    {viewingPart.minimum_stock}
                  </p>
                </div>
                <div className="p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Rack / Location</span>
                  <p className="text-xs font-mono font-bold text-foreground mt-0.5">
                    {viewingPart.location || "—"}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase">Purchased From / Supplier</span>
                  <p className="text-xs font-bold text-foreground mt-0.5">
                    Supplier:{" "}
                    <span className="text-blue-600 font-semibold">
                      {suppliers.find((s) => s.id === viewingPart.supplier_id)?.name ||
                        (viewingPart.supplier && typeof viewingPart.supplier === "object" && "name" in viewingPart.supplier
                          ? (viewingPart.supplier as any).name
                          : "No Supplier Linked")}
                    </span>
                  </p>
                </div>
                <div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                      viewingPart.is_active
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : "bg-slate-100 text-slate-600 border-slate-200"
                    }`}
                  >
                    {viewingPart.is_active ? "Active" : "Inactive"}
                  </span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="pt-2 border-t flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unified Record Delete Confirmation Dialog */}
      <RecordDeleteDialog
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        recordType="Spare Part"
        recordTypePlural="Spare Parts"
        recordCount={partsToDelete.length}
        singleRecordIdentifier={partsToDelete[0]?.name}
        onConfirmDelete={handleConfirmDelete}
        isDeleting={deleting}
      />

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedPartIds.length}
        onClearSelection={() => setSelectedPartIds([])}
        onDeleteSelected={handleRequestBulkDelete}
        deleteLabel="Delete Selected"
        isDeleting={deleting}
      />

      {/* ─── Add / Edit Spare Part Master Dialog ─── */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <Package className="h-5 w-5 text-blue-600" />
                {editingPart ? "Edit Spare Part Master" : "Register New Spare Part"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Configure part details, cost and selling pricing, stock alert threshold, and supplier.
              </DialogDescription>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-3">
              {/* Part Name */}
              <div>
                <Label htmlFor="part-name" className="text-xs font-bold text-foreground">
                  Part Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="part-name"
                  placeholder="e.g. Front Ceramic Brake Pads Set"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 font-semibold text-xs"
                  required
                />
              </div>

              {/* Part Number & Brand */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="part-num" className="text-xs font-bold text-foreground">
                    Part Number / OEM Number
                  </Label>
                  <Input
                    id="part-num"
                    placeholder="e.g. 04465-33450 / BRK-PAD-01"
                    value={formPartNumber}
                    onChange={(e) => setFormPartNumber(e.target.value)}
                    className="mt-1 font-mono font-bold text-xs text-blue-600"
                  />
                </div>
                <div>
                  <Label htmlFor="part-brand" className="text-xs font-bold text-foreground">
                    Brand / Manufacturer
                  </Label>
                  <Input
                    id="part-brand"
                    placeholder="e.g. Brembo, Bosch, Denso"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="part-desc" className="text-xs font-bold text-foreground">
                  Description / Specification
                </Label>
                <Input
                  id="part-desc"
                  placeholder="e.g. For Toyota Camry / Avalon 2015-2022"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              {/* Selling Price & Purchase Cost */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="part-sprice" className="text-xs font-bold text-foreground">
                    Selling Price (AED) <span className="text-rose-500">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <span className="absolute left-2.5 top-2 text-xs font-bold text-blue-600">
                      AED
                    </span>
                    <Input
                      id="part-sprice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formSellingPrice}
                      onChange={(e) => setFormSellingPrice(e.target.value)}
                      className="pl-12 font-mono font-bold text-xs"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="part-pprice" className="text-xs font-bold text-foreground">
                    Purchase Cost Price (AED)
                  </Label>
                  <div className="relative mt-1">
                    <span className="absolute left-2.5 top-2 text-xs font-bold text-muted-foreground">
                      AED
                    </span>
                    <Input
                      id="part-pprice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formPurchasePrice}
                      onChange={(e) => setFormPurchasePrice(e.target.value)}
                      className="pl-12 font-mono text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Stock Levels & Unit */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <Label htmlFor="part-cstock" className="text-xs font-bold text-foreground">
                    Current Stock
                  </Label>
                  <Input
                    id="part-cstock"
                    type="number"
                    min="0"
                    step="1"
                    value={formCurrentStock}
                    onChange={(e) => setFormCurrentStock(e.target.value)}
                    className="mt-1 font-mono font-bold text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="part-mstock" className="text-xs font-bold text-foreground">
                    Min Alert Level
                  </Label>
                  <Input
                    id="part-mstock"
                    type="number"
                    min="0"
                    step="1"
                    value={formMinimumStock}
                    onChange={(e) => setFormMinimumStock(e.target.value)}
                    className="mt-1 font-mono text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="part-unit" className="text-xs font-bold text-foreground">
                    Unit
                  </Label>
                  <Input
                    id="part-unit"
                    placeholder="piece, set, can"
                    value={formUnit}
                    onChange={(e) => setFormUnit(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>
              </div>

              {/* Purchased From / Supplier & Storage Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="part-sup" className="text-xs font-bold text-foreground">
                      Purchased From / Supplier
                    </Label>
                    <button
                      type="button"
                      onClick={() => {
                        setNewSupName("");
                        setNewSupContact("");
                        setNewSupPhone("");
                        setNewSupAddress("");
                        setSupplierError(null);
                        setSupplierModalOpen(true);
                      }}
                      className="text-[11px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1 hover:underline"
                    >
                      <Plus className="h-3 w-3" /> Add Supplier
                    </button>
                  </div>
                  <select
                    id="part-sup"
                    value={formSupplierId}
                    onChange={(e) => {
                      if (e.target.value === "__new__") {
                        setNewSupName("");
                        setNewSupContact("");
                        setNewSupPhone("");
                        setNewSupAddress("");
                        setSupplierError(null);
                        setSupplierModalOpen(true);
                      } else {
                        setFormSupplierId(e.target.value);
                      }
                    }}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm font-medium mt-1"
                  >
                    <option value="">No Supplier Linked (General Purchase)</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} {s.phone ? `(${s.phone})` : ""}
                      </option>
                    ))}
                    <option value="__new__" className="text-blue-600 font-bold">
                      + Add New Supplier...
                    </option>
                  </select>
                </div>

                <div>
                  <Label htmlFor="part-loc" className="text-xs font-bold text-foreground">
                    Rack / Storage Location
                  </Label>
                  <Input
                    id="part-loc"
                    placeholder="e.g. Rack A-03, Bin 12"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    className="mt-1 text-xs font-medium"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                  <p className="font-bold text-foreground text-xs">Active Status</p>
                  <p className="text-[11px] text-muted-foreground">
                    Active parts appear in Job Card selection lists
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormActive(!formActive)}
                  className={`p-1 rounded-md transition-colors ${
                    formActive ? "text-blue-600" : "text-muted-foreground"
                  }`}
                >
                  {formActive ? (
                    <ToggleRight className="h-7 w-7" />
                  ) : (
                    <ToggleLeft className="h-7 w-7" />
                  )}
                </button>
              </div>
            </div>

            <DialogFooter className="pt-3 border-t flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setFormDialogOpen(false)}
                disabled={saving}
                size="sm"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                {saving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : editingPart ? (
                  "Save Changes"
                ) : (
                  "Add Spare Part"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Add New Supplier Modal (Inline) ─── */}
      <Dialog open={supplierModalOpen} onOpenChange={setSupplierModalOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSaveNewSupplier} className="space-y-4">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <Building2 className="h-5 w-5 text-blue-600" />
                Add New Supplier
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Save supplier details into master registry and link directly to this spare part.
              </DialogDescription>
            </div>

            {supplierError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{supplierError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <Label htmlFor="sup-name" className="text-xs font-bold text-foreground">
                  Supplier / Company Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="sup-name"
                  placeholder="e.g. Al Futtaim Auto Parts LLC"
                  value={newSupName}
                  onChange={(e) => setNewSupName(e.target.value)}
                  className="mt-1 text-xs font-semibold"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="sup-contact" className="text-xs font-bold text-foreground">
                    Contact Person
                  </Label>
                  <Input
                    id="sup-contact"
                    placeholder="e.g. Tariq Mahmood"
                    value={newSupContact}
                    onChange={(e) => setNewSupContact(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>

                <div>
                  <Label htmlFor="sup-phone" className="text-xs font-bold text-foreground">
                    Phone / Mobile
                  </Label>
                  <Input
                    id="sup-phone"
                    placeholder="e.g. +971-50-1234567"
                    value={newSupPhone}
                    onChange={(e) => setNewSupPhone(e.target.value)}
                    className="mt-1 text-xs font-mono"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="sup-address" className="text-xs font-bold text-foreground">
                  Address / Workshop Location
                </Label>
                <Input
                  id="sup-address"
                  placeholder="e.g. Mussafah M-12, Abu Dhabi"
                  value={newSupAddress}
                  onChange={(e) => setNewSupAddress(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="pt-2 border-t flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSupplierModalOpen(false)}
                disabled={savingSupplier}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingSupplier}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold"
              >
                {savingSupplier ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Plus className="h-4 w-4 mr-1.5" />}
                Save Supplier & Link
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── Stock Movement History & Audit Modal ─── */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="sm:max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-h-[85vh] overflow-y-auto">
          <div>
            <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
              <History className="h-5 w-5 text-blue-600" />
              Stock Movement History: {historyPart?.name}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-1">
              Part #: <span className="font-mono font-bold text-foreground">{historyPart?.part_number || "N/A"}</span> • Current Stock:{" "}
              <span className="font-bold text-blue-600 font-mono">{historyPart?.current_stock} {historyPart?.unit || "units"}</span>
            </DialogDescription>
          </div>

          <div className="py-2">
            {loadingHistory ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="h-6 w-6 mx-auto animate-spin mb-2 text-blue-600" />
                <p className="text-xs">Loading ledger transactions...</p>
              </div>
            ) : historyTransactions.length > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800 text-[11px]">
                      <TableHead className="w-[20%]">Date</TableHead>
                      <TableHead className="w-[22%]">Transaction</TableHead>
                      <TableHead className="w-[18%]">Reference</TableHead>
                      <TableHead className="w-[12%] text-right">Qty In</TableHead>
                      <TableHead className="w-[12%] text-right">Qty Out</TableHead>
                      <TableHead className="w-[16%] text-right">Stock After</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyTransactions.map((tx) => {
                      const isPositive = tx.quantity > 0;
                      const isNegative = tx.quantity < 0;

                      return (
                        <TableRow key={tx.id} className="text-xs">
                          <TableCell className="text-muted-foreground font-mono text-[11px]">
                            {formatDate(tx.created_at)}
                          </TableCell>
                          <TableCell>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                tx.transaction_type.includes("purchase") || tx.transaction_type.includes("in")
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                                  : tx.transaction_type.includes("job_card")
                                  ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                                  : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                              }`}
                            >
                              {tx.transaction_type.replace(/_/g, " ")}
                            </span>
                            {tx.notes && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{tx.notes}</p>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-foreground">
                            {tx.reference_type === "job_card" && tx.reference_id ? (
                              <a
                                href={`/job-cards/${tx.reference_id}`}
                                className="text-blue-600 hover:text-blue-800 hover:underline inline-flex items-center gap-1 font-bold"
                                title="Open Job Card"
                              >
                                {tx.notes?.includes("Job Card #")
                                  ? tx.notes.match(/Job Card #\d+/)?.[0] || tx.reference_id
                                  : `Job Card ${tx.reference_id}`}
                              </a>
                            ) : (
                              tx.reference_id || tx.reference_type || "Direct"
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-emerald-600">
                            {isPositive ? `+${tx.quantity}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-rose-600">
                            {isNegative ? Math.abs(tx.quantity) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-black text-foreground">
                            {tx.quantity_after !== undefined ? tx.quantity_after : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted-foreground">
                No inventory transactions recorded for this part yet.
              </div>
            )}
          </div>

          <DialogFooter className="pt-2 border-t">
            <Button size="sm" variant="outline" onClick={() => setHistoryModalOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Manual Stock Adjustment Modal ─── */}
      <Dialog open={adjustModalOpen} onOpenChange={setAdjustModalOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleStockAdjustmentSubmit} className="space-y-4">
            <div>
              <DialogTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <ArrowUpDown className="h-5 w-5 text-amber-600" />
                Adjust Stock: {adjustPart?.name}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Current Stock: <span className="font-mono font-bold text-foreground">{adjustPart?.current_stock} {adjustPart?.unit || "units"}</span>
              </DialogDescription>
            </div>

            {adjustError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{adjustError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Direction: Add or Deduct */}
              <div>
                <Label className="text-xs font-bold text-foreground">Adjustment Action</Label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setAdjustDirection("add")}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      adjustDirection === "add"
                        ? "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-300 shadow-sm"
                        : "border-slate-200 text-muted-foreground hover:bg-slate-50"
                    }`}
                  >
                    <TrendingUp className="h-4 w-4 text-emerald-600" /> + Add Stock (In)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustDirection("reduce")}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                      adjustDirection === "reduce"
                        ? "bg-rose-50 border-rose-300 text-rose-700 dark:bg-rose-950/40 dark:border-rose-700 dark:text-rose-300 shadow-sm"
                        : "border-slate-200 text-muted-foreground hover:bg-slate-50"
                    }`}
                  >
                    <TrendingDown className="h-4 w-4 text-rose-600" /> - Reduce Stock (Out)
                  </button>
                </div>
              </div>

              {/* Quantity */}
              <div>
                <Label htmlFor="adjust-qty" className="text-xs font-bold text-foreground">
                  Quantity ({adjustPart?.unit || "units"}) <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="adjust-qty"
                  type="number"
                  min="1"
                  step="1"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="mt-1 font-mono font-bold text-sm"
                  required
                />
              </div>

              {/* Reason / Notes */}
              <div>
                <Label htmlFor="adjust-reason" className="text-xs font-bold text-foreground">
                  Reason / Reference Notes <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="adjust-reason"
                  placeholder="e.g. Physical inventory count / Damaged unit return"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="mt-1 text-xs"
                  required
                />
              </div>

              <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border text-[11px] text-muted-foreground">
                Resulting stock after adjustment:{" "}
                <span className="font-mono font-bold text-foreground">
                  {adjustPart
                    ? adjustDirection === "add"
                      ? adjustPart.current_stock + (parseInt(adjustQty, 10) || 0)
                      : Math.max(0, adjustPart.current_stock - (parseInt(adjustQty, 10) || 0))
                    : 0}{" "}
                  {adjustPart?.unit || "units"}
                </span>
              </div>
            </div>

            <DialogFooter className="pt-2 border-t flex gap-2 justify-end">
              <Button type="button" variant="outline" size="sm" onClick={() => setAdjustModalOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={adjusting}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white font-semibold"
              >
                {adjusting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Apply Stock Adjustment
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default PartsListView;
