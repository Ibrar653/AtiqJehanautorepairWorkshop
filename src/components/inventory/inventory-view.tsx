"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  getParts,
  getPartById,
  createPart,
  checkDuplicatePartNumber,
  type PartsFilterType,
} from "@/lib/services/parts-service";
import {
  getInventoryTransactions,
  recordStockAdjustment,
} from "@/lib/services/inventory-service";
import {
  getSuppliers,
  createSupplier,
} from "@/lib/services/supplier-service";
import type { Part, InventoryTransaction, Supplier } from "@/types/database";
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
} from "@/components/ui/dialog";
import {
  Package,
  Boxes,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  TrendingDown,
  TrendingUp,
  History,
  Loader2,
  DollarSign,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  XCircle,
  ArrowUpDown,
  Building2,
  Sparkles,
  Info,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";

const ADJUSTMENT_REASONS = [
  "Physical Count Reconciled",
  "Damaged / Broken Part",
  "Found / Unrecorded Stock",
  "Expired / Scrapped",
  "Internal Workshop Use",
  "Supplier Return / RMA",
  "Direct Sale / Counter Sale",
  "Correction of Entry Error",
  "Other Reason",
];

export function InventoryView() {
  const { user, canEdit } = usePermissions();

  // Active Tab
  const [activeTab, setActiveTab] = useState<"inventory" | "ledger">("inventory");

  // Data States
  const [parts, setParts] = useState<Part[]>([]);
  const [allPartsForSelect, setAllPartsForSelect] = useState<Part[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Filters & Search for Inventory Table
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<PartsFilterType>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPartsCount, setTotalPartsCount] = useState(0);
  const pageSize = 15;

  // Filters for Global Ledger Table
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState<string>("all");
  const [ledgerPage, setLedgerPage] = useState(1);
  const [totalLedgerCount, setTotalLedgerCount] = useState(0);
  const ledgerPageSize = 25;

  // ─── Stock Adjustment Modal State ───
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [partEntryMode, setPartEntryMode] = useState<"existing" | "manual">("existing");

  // Existing Part Adjustment Fields
  const [selectedPartForAdjust, setSelectedPartForAdjust] = useState<Part | null>(null);
  const [adjustPartId, setAdjustPartId] = useState("");
  const [existingPartSearch, setExistingPartSearch] = useState("");
  const [adjustType, setAdjustType] = useState<"increase" | "decrease">("increase");
  const [adjustQuantity, setAdjustQuantity] = useState<number | "">(1);
  const [adjustReason, setAdjustReason] = useState<string>(ADJUSTMENT_REASONS[0]);
  const [adjustNotes, setAdjustNotes] = useState("");

  // Manual Part Entry Fields
  const [manualPartName, setManualPartName] = useState("");
  const [manualPartNumber, setManualPartNumber] = useState("");
  const [manualBrand, setManualBrand] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualUnit, setManualUnit] = useState("piece");
  const [manualPurchasePrice, setManualPurchasePrice] = useState<number | "">(0);
  const [manualSellingPrice, setManualSellingPrice] = useState<number | "">(0);
  const [manualOpeningStock, setManualOpeningStock] = useState<number | "">(1);
  const [manualMinStock, setManualMinStock] = useState<number | "">(5);
  const [manualSupplierId, setManualSupplierId] = useState("");
  const [manualLocation, setManualLocation] = useState("");

  // Duplicate Check State
  const [duplicateFoundPart, setDuplicateFoundPart] = useState<Part | null>(null);
  const [checkingDuplicate, setCheckingDuplicate] = useState(false);

  // Quick Inline New Supplier Modal State
  const [newSupplierModalOpen, setNewSupplierModalOpen] = useState(false);
  const [newSupName, setNewSupName] = useState("");
  const [newSupContact, setNewSupContact] = useState("");
  const [newSupPhone, setNewSupPhone] = useState("");
  const [newSupAddress, setNewSupAddress] = useState("");
  const [savingSupplier, setSavingSupplier] = useState(false);
  const [supplierError, setSupplierError] = useState<string | null>(null);

  // Form Submission Feedback
  const [adjustSubmitting, setAdjustSubmitting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [adjustSuccess, setAdjustSuccess] = useState<string | null>(null);

  // Per-Part History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [historyPart, setHistoryPart] = useState<Part | null>(null);
  const [historyTransactions, setHistoryTransactions] = useState<InventoryTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Debounce search query
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setCurrentPage(1);
    }, 250);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Suppliers
  const loadSuppliersList = useCallback(async () => {
    try {
      const res = await getSuppliers("", 1, 200);
      setSuppliers(res.suppliers);
    } catch (e) {
      console.warn("Could not load suppliers:", e);
    }
  }, []);

  // Load Inventory Master Data
  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const [partsRes, allPartsRes, allTxRes] = await Promise.all([
        getParts(statusFilter, debouncedQuery, currentPage, pageSize),
        getParts("all", "", 1, 500),
        getInventoryTransactions(undefined, "all", 1, 100),
      ]);

      setParts(partsRes.parts);
      setTotalPartsCount(partsRes.total);
      setAllPartsForSelect(allPartsRes.parts);
      setTransactions(allTxRes.transactions);
      setTotalLedgerCount(allTxRes.total);
    } catch (e) {
      console.error("Error loading inventory overview data:", e);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, debouncedQuery, currentPage, pageSize]);

  // Load Global Ledger Data
  const loadLedger = useCallback(async () => {
    setLoadingLedger(true);
    try {
      const txRes = await getInventoryTransactions(
        undefined,
        ledgerTypeFilter,
        ledgerPage,
        ledgerPageSize
      );
      setTransactions(txRes.transactions);
      setTotalLedgerCount(txRes.total);
    } catch (e) {
      console.error("Error loading transaction ledger:", e);
    } finally {
      setLoadingLedger(false);
    }
  }, [ledgerTypeFilter, ledgerPage, ledgerPageSize]);

  useEffect(() => {
    loadInventory();
    loadSuppliersList();
  }, [loadInventory, loadSuppliersList]);

  useEffect(() => {
    if (activeTab === "ledger") {
      loadLedger();
    }
  }, [activeTab, loadLedger]);

  // Real-time Duplicate Check for Manual Entry Part Number
  useEffect(() => {
    if (partEntryMode !== "manual" || !manualPartNumber.trim()) {
      setDuplicateFoundPart(null);
      return;
    }

    const cleanNum = manualPartNumber.trim().toLowerCase();
    const timer = setTimeout(() => {
      setCheckingDuplicate(true);
      const match = allPartsForSelect.find(
        (p) => p.part_number && p.part_number.trim().toLowerCase() === cleanNum
      );
      setDuplicateFoundPart(match || null);
      setCheckingDuplicate(false);
    }, 300);

    return () => clearTimeout(timer);
  }, [manualPartNumber, partEntryMode, allPartsForSelect]);

  // Filtered list of existing parts for dropdown search
  const filteredPartsForSelect = useMemo(() => {
    if (!existingPartSearch.trim()) return allPartsForSelect;
    const q = existingPartSearch.toLowerCase().trim();
    return allPartsForSelect.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.part_number && p.part_number.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q))
    );
  }, [allPartsForSelect, existingPartSearch]);

  // Global KPIs Calculation
  const kpis = useMemo(() => {
    const active = allPartsForSelect.filter((p) => p.is_active !== false);
    const totalParts = active.length;
    const totalUnits = active.reduce((sum, p) => sum + (Number(p.current_stock) || 0), 0);

    // Strict inventory cost valuation: current_stock * purchase_price (cost price)
    const inventoryCostValue = active.reduce(
      (sum, p) => sum + (Number(p.current_stock) || 0) * (Number(p.purchase_price) || 0),
      0
    );

    const lowStockParts = active.filter(
      (p) => p.current_stock > 0 && p.current_stock <= (p.minimum_stock || 0)
    ).length;

    const outOfStockParts = active.filter((p) => (Number(p.current_stock) || 0) <= 0).length;

    // Stock In / Out Today
    const todayStr = new Date().toISOString().slice(0, 10);
    let stockInToday = 0;
    let stockOutToday = 0;

    transactions.forEach((tx) => {
      const txDateStr = (tx.created_at || "").slice(0, 10);
      if (txDateStr === todayStr) {
        if (tx.quantity > 0) {
          stockInToday += tx.quantity;
        } else if (tx.quantity < 0) {
          stockOutToday += Math.abs(tx.quantity);
        }
      }
    });

    return {
      totalParts,
      totalUnits,
      inventoryCostValue,
      lowStockParts,
      outOfStockParts,
      stockInToday,
      stockOutToday,
    };
  }, [allPartsForSelect, transactions]);

  // Open Adjust Modal
  const handleOpenAdjustModal = (part?: Part) => {
    if (part) {
      setPartEntryMode("existing");
      setSelectedPartForAdjust(part);
      setAdjustPartId(part.id);
    } else {
      setPartEntryMode("existing");
      setSelectedPartForAdjust(allPartsForSelect[0] || null);
      setAdjustPartId(allPartsForSelect[0]?.id || "");
    }
    setExistingPartSearch("");
    setAdjustType("increase");
    setAdjustQuantity(1);
    setAdjustReason(ADJUSTMENT_REASONS[0]);
    setAdjustNotes("");

    // Reset Manual Fields
    setManualPartName("");
    setManualPartNumber("");
    setManualBrand("");
    setManualDescription("");
    setManualUnit("piece");
    setManualPurchasePrice(0);
    setManualSellingPrice(0);
    setManualOpeningStock(1);
    setManualMinStock(5);
    setManualSupplierId("");
    setManualLocation("");
    setDuplicateFoundPart(null);

    setAdjustError(null);
    setAdjustSuccess(null);
    setAdjustModalOpen(true);
  };

  // Switch to existing part from duplicate banner
  const handleSelectDuplicatePart = (part: Part) => {
    setPartEntryMode("existing");
    setSelectedPartForAdjust(part);
    setAdjustPartId(part.id);
    setDuplicateFoundPart(null);
  };

  // Open Part Stock History Modal
  const handleOpenHistoryModal = async (part: Part) => {
    setHistoryPart(part);
    setHistoryModalOpen(true);
    setLoadingHistory(true);
    try {
      const res = await getInventoryTransactions(part.id, "all", 1, 100);
      setHistoryTransactions(res.transactions);
    } catch (e) {
      console.error("Error loading part history:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Save New Supplier Inline
  const handleSaveInlineSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSupName.trim()) {
      setSupplierError("Supplier Name is required.");
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
        notes: null,
      });

      await loadSuppliersList();
      setManualSupplierId(created.id);
      setNewSupplierModalOpen(false);
      setNewSupName("");
      setNewSupContact("");
      setNewSupPhone("");
      setNewSupAddress("");
    } catch (err: any) {
      setSupplierError(err.message || "Failed to create supplier.");
    } finally {
      setSavingSupplier(false);
    }
  };

  // Submit Stock Adjustment / Manual Part Entry
  const handlePerformAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjustError(null);

    const createdByName = user?.full_name || user?.email?.split("@")[0] || "Owner";

    // ─────────────────────────────────────────────────────────────
    // CASE A: Add / Enter Spare Part Manually
    // ─────────────────────────────────────────────────────────────
    if (partEntryMode === "manual") {
      if (!manualPartName.trim()) {
        setAdjustError("Part Name is required.");
        return;
      }

      const openingStock = Number(manualOpeningStock);
      if (isNaN(openingStock) || openingStock < 0) {
        setAdjustError("Opening Stock / Quantity must be 0 or greater.");
        return;
      }

      // Check duplicate part number
      if (manualPartNumber.trim()) {
        const isDup = await checkDuplicatePartNumber(manualPartNumber.trim());
        if (isDup) {
          setAdjustError(
            `A spare part with Part Number "${manualPartNumber.trim()}" already exists in the catalog. Please select it or use a unique part number.`
          );
          return;
        }
      }

      setAdjustSubmitting(true);

      try {
        const pPrice = Number(manualPurchasePrice) || 0;
        const sPrice = Number(manualSellingPrice) || 0;
        const mStock = Number(manualMinStock) || 0;

        const newCreatedPart = await createPart({
          name: manualPartName.trim(),
          part_number: manualPartNumber.trim() || null,
          brand: manualBrand.trim() || null,
          description: manualDescription.trim() || null,
          unit: manualUnit.trim() || "piece",
          purchase_price: pPrice,
          selling_price: sPrice,
          current_stock: openingStock,
          minimum_stock: mStock,
          supplier_id: manualSupplierId || null,
          location: manualLocation.trim() || null,
          is_active: true,
        });

        setAdjustSuccess(
          `New spare part "${newCreatedPart.name}" registered successfully with Opening Stock of ${openingStock} ${newCreatedPart.unit || "pcs"}!`
        );

        // Immediate reload of inventory and catalog
        await loadInventory();
        if (activeTab === "ledger") {
          await loadLedger();
        }

        setTimeout(() => {
          setAdjustModalOpen(false);
          setAdjustSuccess(null);
        }, 1200);
      } catch (err: any) {
        setAdjustError(err.message || "Failed to create spare part.");
      } finally {
        setAdjustSubmitting(false);
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────
    // CASE B: Existing Spare Part Adjustment
    // ─────────────────────────────────────────────────────────────
    if (!adjustPartId) {
      setAdjustError("Please select a spare part.");
      return;
    }

    const qty = Number(adjustQuantity);
    if (isNaN(qty) || qty <= 0) {
      setAdjustError("Please enter a valid positive quantity greater than 0.");
      return;
    }

    if (!adjustReason || !adjustReason.trim()) {
      setAdjustError("Please select a reason for this stock adjustment.");
      return;
    }

    const part = allPartsForSelect.find((p) => p.id === adjustPartId) || selectedPartForAdjust;
    if (!part) {
      setAdjustError("Selected spare part could not be found.");
      return;
    }

    const currentStock = Number(part.current_stock) || 0;
    const delta = adjustType === "increase" ? qty : -qty;
    const targetStock = currentStock + delta;

    if (targetStock < 0) {
      setAdjustError(
        `Cannot decrease stock by ${qty}. Current stock is only ${currentStock} ${part.unit || "units"}. Stock cannot be negative.`
      );
      return;
    }

    setAdjustSubmitting(true);

    try {
      await recordStockAdjustment(
        adjustPartId,
        delta,
        adjustReason,
        adjustNotes,
        createdByName
      );

      setAdjustSuccess(
        `Stock successfully adjusted for "${part.name}". New Stock: ${targetStock} ${part.unit || "units"}.`
      );

      // Immediate reload
      await loadInventory();
      if (activeTab === "ledger") {
        await loadLedger();
      }

      setTimeout(() => {
        setAdjustModalOpen(false);
        setAdjustSuccess(null);
      }, 1200);
    } catch (err: any) {
      setAdjustError(err.message || "Failed to record stock adjustment.");
    } finally {
      setAdjustSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalPartsCount / pageSize));
  const totalLedgerPages = Math.max(1, Math.ceil(totalLedgerCount / ledgerPageSize));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <PageHeader
        title="Inventory & Stock Control"
        description="Comprehensive stock tracking, cost valuation, low-stock warnings, and transaction audit ledger"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Inventory" }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canEdit && (
              <>
                <Button
                  onClick={() => handleOpenAdjustModal()}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold text-xs shadow-sm gap-1.5"
                >
                  <ArrowUpDown className="h-4 w-4" /> + Adjust Stock
                </Button>
                <Button
                  variant="outline"
                  render={<Link href="/purchases" />}
                  className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800 font-bold text-xs shadow-sm gap-1.5"
                >
                  <Building2 className="h-4 w-4 text-emerald-600" /> + Purchase Intake
                </Button>
              </>
            )}
            <Button
              variant="outline"
              render={<Link href="/parts" />}
              className="font-semibold text-xs gap-1.5 bg-background hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Package className="h-4 w-4 text-blue-600" /> Parts Master Catalog
            </Button>
            <Button
              onClick={() => {
                loadInventory();
                if (activeTab === "ledger") loadLedger();
              }}
              variant="outline"
              size="icon"
              className="h-9 w-9"
              title="Refresh Inventory Data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        }
      />

      {/* 1. INVENTORY DASHBOARD - 7 KPI CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {/* Total Parts */}
        <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-card">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Parts
              </span>
              <Package className="h-4 w-4 text-blue-600" />
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-black text-foreground font-mono">{kpis.totalParts}</h3>
              <p className="text-[10px] text-muted-foreground">Active Catalog SKUs</p>
            </div>
          </CardContent>
        </Card>

        {/* Total Units */}
        <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-card">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Total Units
              </span>
              <Boxes className="h-4 w-4 text-indigo-600" />
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-black text-foreground font-mono">{kpis.totalUnits.toLocaleString()}</h3>
              <p className="text-[10px] text-muted-foreground">Physical items in stock</p>
            </div>
          </CardContent>
        </Card>

        {/* Inventory Cost Value */}
        <Card className="shadow-sm border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/20 dark:bg-emerald-950/10 col-span-2 sm:col-span-1 lg:col-span-1">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                Inventory Cost Value
              </span>
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="mt-2">
              <h3 className="text-lg font-black text-emerald-700 dark:text-emerald-400 font-mono">
                {formatCurrency(kpis.inventoryCostValue)}
              </h3>
              <p className="text-[10px] text-emerald-700/80 dark:text-emerald-400/80">
                Stock × Cost Price
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Parts */}
        <Card
          onClick={() => {
            setActiveTab("inventory");
            setStatusFilter("low_stock");
          }}
          className={`shadow-sm border transition-all cursor-pointer ${
            statusFilter === "low_stock"
              ? "ring-2 ring-amber-500 border-amber-400"
              : "border-amber-200 dark:border-amber-900/50 bg-amber-50/20 dark:bg-amber-950/10 hover:border-amber-400"
          }`}
        >
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">
                Low Stock Parts
              </span>
              <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-black text-amber-700 dark:text-amber-400 font-mono">
                {kpis.lowStockParts}
              </h3>
              <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">≤ Minimum stock</p>
            </div>
          </CardContent>
        </Card>

        {/* Out of Stock Parts */}
        <Card
          onClick={() => {
            setActiveTab("inventory");
            setStatusFilter("out_of_stock");
          }}
          className={`shadow-sm border transition-all cursor-pointer ${
            statusFilter === "out_of_stock"
              ? "ring-2 ring-rose-500 border-rose-400"
              : "border-rose-200 dark:border-rose-900/50 bg-rose-50/20 dark:bg-rose-950/10 hover:border-rose-400"
          }`}
        >
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                Out of Stock
              </span>
              <TrendingDown className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-black text-rose-700 dark:text-rose-400 font-mono">
                {kpis.outOfStockParts}
              </h3>
              <p className="text-[10px] text-rose-700/80 dark:text-rose-400/80">0 units remaining</p>
            </div>
          </CardContent>
        </Card>

        {/* Stock In Today */}
        <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-card">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Stock In Today
              </span>
              <ArrowUpRight className="h-4 w-4 text-emerald-600" />
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
                +{kpis.stockInToday}
              </h3>
              <p className="text-[10px] text-muted-foreground">Purchases & returns</p>
            </div>
          </CardContent>
        </Card>

        {/* Stock Out Today */}
        <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-card">
          <CardContent className="p-3.5 flex flex-col justify-between h-full">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Stock Out Today
              </span>
              <ArrowDownRight className="h-4 w-4 text-rose-600" />
            </div>
            <div className="mt-2">
              <h3 className="text-xl font-black text-rose-600 dark:text-rose-400 font-mono">
                -{kpis.stockOutToday}
              </h3>
              <p className="text-[10px] text-muted-foreground">Job Card usages</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-border">
        <button
          type="button"
          onClick={() => setActiveTab("inventory")}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "inventory"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <Boxes className="h-4 w-4" /> Stock Inventory List ({totalPartsCount})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("ledger")}
          className={`pb-3 px-4 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "ledger"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          <History className="h-4 w-4" /> Transaction Audit Ledger ({totalLedgerCount})
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: STOCK INVENTORY LIST & SEARCH                                      */}
      {/* ========================================================================= */}
      {activeTab === "inventory" && (
        <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-card">
          {/* Filter Bar */}
          <div className="p-4 border-b border-border flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, part #, brand, supplier..."
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

            {/* Status Filter Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 w-full md:w-auto">
              <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Filter:
              </span>
              {[
                { id: "all", label: "All Parts" },
                { id: "in_stock", label: "In Stock" },
                { id: "low_stock", label: "Low Stock" },
                { id: "out_of_stock", label: "Out of Stock" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(tab.id as PartsFilterType);
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
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

          {/* INVENTORY TABLE */}
          <CardContent className="p-0">
            {loading ? (
              <div className="py-20 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
                <p className="font-medium text-sm">Loading stock inventory...</p>
              </div>
            ) : parts.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 text-xs font-bold border-b">
                      <TableHead className="w-[22%] font-bold text-foreground">Spare Part Name</TableHead>
                      <TableHead className="w-[12%] font-bold text-foreground">Part Number</TableHead>
                      <TableHead className="w-[10%] font-bold text-foreground">Brand</TableHead>
                      <TableHead className="w-[14%] font-bold text-foreground">Purchased From</TableHead>
                      <TableHead className="w-[8%] text-center font-bold text-foreground">Stock</TableHead>
                      <TableHead className="w-[7%] text-center font-bold text-foreground">Min</TableHead>
                      <TableHead className="w-[9%] text-right font-bold text-foreground">Cost (AED)</TableHead>
                      <TableHead className="w-[9%] text-right font-bold text-foreground">Sell (AED)</TableHead>
                      <TableHead className="w-[8%] font-bold text-foreground">Rack</TableHead>
                      <TableHead className="w-[10%] text-center font-bold text-foreground">Status</TableHead>
                      <TableHead className="w-[9%] text-right pr-4 font-bold text-foreground">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parts.map((p) => {
                      const stock = Number(p.current_stock) || 0;
                      const minStock = Number(p.minimum_stock) || 0;

                      let statusBadge = (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800 inline-flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> In Stock
                        </span>
                      );

                      if (stock <= 0) {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800 inline-flex items-center gap-1">
                            <XCircle className="h-3 w-3" /> Out of Stock
                          </span>
                        );
                      } else if (stock <= minStock) {
                        statusBadge = (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800 inline-flex items-center gap-1 animate-pulse">
                            <AlertTriangle className="h-3 w-3" /> Low Stock
                          </span>
                        );
                      }

                      return (
                        <TableRow
                          key={p.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 border-b text-xs transition-colors"
                        >
                          {/* Part Name */}
                          <TableCell className="font-semibold text-foreground py-3">
                            <span className="font-bold text-sm block">{p.name}</span>
                            {p.description && (
                              <span className="text-[11px] text-muted-foreground line-clamp-1">
                                {p.description}
                              </span>
                            )}
                          </TableCell>

                          {/* Part Number */}
                          <TableCell className="font-mono font-bold text-blue-600 dark:text-blue-400 py-3">
                            {p.part_number ? `#${p.part_number}` : "—"}
                          </TableCell>

                          {/* Brand */}
                          <TableCell className="text-muted-foreground py-3 font-medium">
                            {p.brand || "Generic"}
                          </TableCell>

                          {/* Supplier */}
                          <TableCell className="py-3">
                            {p.supplier ? (
                              <span className="font-medium text-foreground">{p.supplier.name}</span>
                            ) : (
                              <span className="text-muted-foreground italic text-[11px]">Direct / Local</span>
                            )}
                          </TableCell>

                          {/* Current Stock */}
                          <TableCell className="text-center py-3">
                            <span
                              className={`font-mono font-black text-sm px-2 py-0.5 rounded ${
                                stock <= 0
                                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                  : stock <= minStock
                                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                  : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
                              }`}
                            >
                              {stock} {p.unit || "pcs"}
                            </span>
                          </TableCell>

                          {/* Minimum Stock */}
                          <TableCell className="text-center font-mono text-muted-foreground py-3 font-semibold">
                            {minStock}
                          </TableCell>

                          {/* Purchase Price */}
                          <TableCell className="text-right font-mono text-muted-foreground py-3">
                            {formatCurrency(p.purchase_price)}
                          </TableCell>

                          {/* Selling Price */}
                          <TableCell className="text-right font-mono font-bold text-foreground py-3">
                            {formatCurrency(p.selling_price)}
                          </TableCell>

                          {/* Rack / Location */}
                          <TableCell className="font-mono text-muted-foreground text-[11px] py-3">
                            {p.location || "—"}
                          </TableCell>

                          {/* Status Badge */}
                          <TableCell className="text-center py-3">{statusBadge}</TableCell>

                          {/* Actions */}
                          <TableCell className="text-right pr-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {canEdit && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleOpenAdjustModal(p)}
                                  className="h-8 px-2 text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/50"
                                  title="Adjust stock quantity"
                                >
                                  <ArrowUpDown className="h-3.5 w-3.5 mr-1" /> Adjust
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleOpenHistoryModal(p)}
                                className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
                                title="View stock history ledger"
                              >
                                <History className="h-3.5 w-3.5" />
                              </Button>
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
                <Boxes className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">No spare parts match your criteria</p>
                <p className="text-xs max-w-sm mx-auto">
                  Try changing your search query or status filter to view other items.
                </p>
              </div>
            )}
          </CardContent>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {(currentPage - 1) * pageSize + 1} to{" "}
                {Math.min(currentPage * pageSize, totalPartsCount)} of {totalPartsCount} parts
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
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GLOBAL TRANSACTION AUDIT LEDGER                                    */}
      {/* ========================================================================= */}
      {activeTab === "ledger" && (
        <Card className="shadow-sm border border-slate-200 dark:border-slate-800 bg-card">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-2 text-foreground">
                <History className="h-4 w-4 text-blue-600" /> Full Stock Movement Audit Trail
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Chronological stock ledger logging all additions, job card allocations, returns, and adjustments
              </p>
            </div>

            {/* Transaction Type Filter */}
            <div className="flex flex-wrap items-center gap-1 text-xs">
              {[
                { id: "all", label: "All Types" },
                { id: "purchase", label: "Purchases" },
                { id: "opening_stock", label: "Opening Stock" },
                { id: "job_card_usage", label: "Job Card Usages" },
                { id: "adjustment_in", label: "Adjustments" },
                { id: "job_card_reversal", label: "Returns / Reversals" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    setLedgerTypeFilter(f.id);
                    setLedgerPage(1);
                  }}
                  className={`px-3 py-1 rounded-md font-bold transition-all ${
                    ledgerTypeFilter === f.id
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </CardHeader>

          <CardContent className="p-0">
            {loadingLedger ? (
              <div className="py-20 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
                <p className="font-medium text-sm">Loading transaction ledger records...</p>
              </div>
            ) : transactions.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 text-xs font-bold border-b">
                      <TableHead className="w-[14%] font-bold text-foreground">Date & Time</TableHead>
                      <TableHead className="w-[24%] font-bold text-foreground">Spare Part</TableHead>
                      <TableHead className="w-[14%] font-bold text-foreground">Transaction Type</TableHead>
                      <TableHead className="w-[14%] font-bold text-foreground">Reference</TableHead>
                      <TableHead className="w-[8%] text-right font-bold text-foreground">Qty In</TableHead>
                      <TableHead className="w-[8%] text-right font-bold text-foreground">Qty Out</TableHead>
                      <TableHead className="w-[8%] text-right font-bold text-foreground">Stock Before</TableHead>
                      <TableHead className="w-[8%] text-right font-bold text-foreground">Stock After</TableHead>
                      <TableHead className="w-[10%] text-right pr-4 font-bold text-foreground">User</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => {
                      const isPositive = tx.quantity > 0;
                      const isNegative = tx.quantity < 0;

                      return (
                        <TableRow
                          key={tx.id}
                          className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 border-b text-xs"
                        >
                          <TableCell className="font-mono text-muted-foreground text-[11px] py-3">
                            {formatDate(tx.created_at)}
                          </TableCell>

                          <TableCell className="font-semibold text-foreground py-3">
                            <span className="font-bold text-sm block">{tx.part?.name || "Spare Part"}</span>
                            {tx.part?.part_number && (
                              <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">
                                Part #{tx.part.part_number}
                              </span>
                            )}
                          </TableCell>

                          <TableCell className="py-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border inline-block ${
                                tx.transaction_type.includes("purchase") || tx.transaction_type.includes("in") || tx.transaction_type.includes("opening")
                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                  : tx.transaction_type.includes("job_card")
                                  ? "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                                  : "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                              }`}
                            >
                              {tx.transaction_type.replace(/_/g, " ")}
                            </span>
                            {tx.notes && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1 max-w-[200px]" title={tx.notes}>
                                {tx.notes}
                              </p>
                            )}
                          </TableCell>

                          <TableCell className="py-3 font-mono text-xs font-semibold text-foreground">
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

                          <TableCell className="text-right font-mono font-bold text-emerald-600 py-3">
                            {isPositive ? `+${tx.quantity}` : "—"}
                          </TableCell>

                          <TableCell className="text-right font-mono font-bold text-rose-600 py-3">
                            {isNegative ? Math.abs(tx.quantity) : "—"}
                          </TableCell>

                          <TableCell className="text-right font-mono text-muted-foreground py-3">
                            {tx.quantity_before !== undefined ? tx.quantity_before : "—"}
                          </TableCell>

                          <TableCell className="text-right font-mono font-black text-foreground py-3">
                            {tx.quantity_after !== undefined ? tx.quantity_after : "—"}
                          </TableCell>

                          <TableCell className="text-right pr-4 font-medium text-muted-foreground py-3">
                            {tx.created_by || "System"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-20 text-center text-muted-foreground space-y-2">
                <History className="h-10 w-10 mx-auto text-muted-foreground/40" />
                <p className="text-sm font-semibold text-foreground">No transaction records found</p>
                <p className="text-xs max-w-sm mx-auto">
                  Transactions will automatically log here whenever parts are purchased, used in job cards, or adjusted.
                </p>
              </div>
            )}
          </CardContent>

          {/* Ledger Pagination */}
          {totalLedgerPages > 1 && (
            <div className="p-4 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
              <span>
                Showing {(ledgerPage - 1) * ledgerPageSize + 1} to{" "}
                {Math.min(ledgerPage * ledgerPageSize, totalLedgerCount)} of {totalLedgerCount} records
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLedgerPage((p) => Math.max(1, p - 1))}
                  disabled={ledgerPage === 1}
                  className="h-8 text-xs"
                >
                  <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Previous
                </Button>
                <span className="font-semibold px-2 font-mono">
                  {ledgerPage} / {totalLedgerPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLedgerPage((p) => Math.min(totalLedgerPages, p + 1))}
                  disabled={ledgerPage >= totalLedgerPages}
                  className="h-8 text-xs"
                >
                  Next <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* ========================================================================= */}
      {/* 4. STOCK ADJUSTMENT MODAL DIALOG (DUAL MODE: EXISTING VS MANUAL ENTRY)    */}
      {/* ========================================================================= */}
      <Dialog open={adjustModalOpen} onOpenChange={setAdjustModalOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <ArrowUpDown className="h-5 w-5 text-primary" /> Adjust Inventory Stock
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Select an existing catalog spare part or register a brand new spare part manually.
            </DialogDescription>
          </DialogHeader>

          {/* Mode Switcher Radio Buttons */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg text-xs font-bold border">
            <button
              type="button"
              onClick={() => {
                setPartEntryMode("existing");
                setAdjustError(null);
              }}
              className={`py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                partEntryMode === "existing"
                  ? "bg-white dark:bg-slate-900 text-primary shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Package className="h-3.5 w-3.5" /> Select Existing Spare Part
            </button>
            <button
              type="button"
              onClick={() => {
                setPartEntryMode("manual");
                setAdjustError(null);
              }}
              className={`py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 ${
                partEntryMode === "manual"
                  ? "bg-white dark:bg-slate-900 text-primary shadow-sm ring-1 ring-slate-200 dark:ring-slate-700"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Add / Enter Spare Part Manually
            </button>
          </div>

          {adjustError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700 flex items-start gap-2 animate-in fade-in-50">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{adjustError}</span>
            </div>
          )}

          {adjustSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-md text-xs font-semibold text-emerald-700 flex items-start gap-2 animate-in fade-in-50">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{adjustSuccess}</span>
            </div>
          )}

          <form onSubmit={handlePerformAdjustment} className="space-y-4 pt-1">
            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODE 1: SELECT EXISTING SPARE PART                            */}
            {/* ───────────────────────────────────────────────────────────── */}
            {partEntryMode === "existing" && (
              <div className="space-y-4">
                {/* Search / Select Dropdown */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Search & Select Spare Part <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                    <Input
                      placeholder="Type to filter parts list..."
                      value={existingPartSearch}
                      onChange={(e) => setExistingPartSearch(e.target.value)}
                      className="pl-8 h-8 text-xs mb-1.5"
                    />
                  </div>
                  <select
                    value={adjustPartId}
                    onChange={(e) => {
                      setAdjustPartId(e.target.value);
                      const p = allPartsForSelect.find((x) => x.id === e.target.value) || null;
                      setSelectedPartForAdjust(p);
                    }}
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                  >
                    <option value="">-- Select Spare Part ({filteredPartsForSelect.length} parts) --</option>
                    {filteredPartsForSelect.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} {p.part_number ? `(#${p.part_number})` : ""} {p.brand ? `[${p.brand}]` : ""} — Stock: {p.current_stock} {p.unit || "pcs"}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selected Part Details Card */}
                {selectedPartForAdjust && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-lg border text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-bold text-foreground text-sm block">
                          {selectedPartForAdjust.name}
                        </span>
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                          {selectedPartForAdjust.part_number && (
                            <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                              #{selectedPartForAdjust.part_number}
                            </span>
                          )}
                          {selectedPartForAdjust.brand && <span>Brand: {selectedPartForAdjust.brand}</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-muted-foreground block uppercase font-bold">Current Stock</span>
                        <span
                          className={`font-mono font-black text-sm px-2 py-0.5 rounded ${
                            selectedPartForAdjust.current_stock <= 0
                              ? "bg-rose-100 text-rose-800"
                              : selectedPartForAdjust.current_stock <= selectedPartForAdjust.minimum_stock
                              ? "bg-amber-100 text-amber-800"
                              : "bg-emerald-100 text-emerald-800"
                          }`}
                        >
                          {selectedPartForAdjust.current_stock} {selectedPartForAdjust.unit || "pcs"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t text-[11px]">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Purchase Cost:</span>
                        <span className="font-mono font-bold text-foreground">
                          {formatCurrency(selectedPartForAdjust.purchase_price)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Selling Price:</span>
                        <span className="font-mono font-bold text-foreground">
                          {formatCurrency(selectedPartForAdjust.selling_price)}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Supplier:</span>
                        <span className="font-medium text-foreground truncate block">
                          {selectedPartForAdjust.supplier ? selectedPartForAdjust.supplier.name : "Direct / Local"}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Adjustment Action: Increase or Decrease */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Adjustment Action <span className="text-destructive">*</span></Label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustType("increase")}
                      className={`py-2 px-3 rounded-md text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                        adjustType === "increase"
                          ? "bg-emerald-50 border-emerald-400 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 ring-2 ring-emerald-500 shadow-sm"
                          : "border-input bg-background text-muted-foreground hover:bg-slate-50"
                      }`}
                    >
                      <ArrowUpRight className="h-4 w-4 text-emerald-600" /> + Increase (+ Stock In)
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdjustType("decrease")}
                      className={`py-2 px-3 rounded-md text-xs font-bold border transition-all flex items-center justify-center gap-1.5 ${
                        adjustType === "decrease"
                          ? "bg-rose-50 border-rose-400 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 ring-2 ring-rose-500 shadow-sm"
                          : "border-input bg-background text-muted-foreground hover:bg-slate-50"
                      }`}
                    >
                      <ArrowDownRight className="h-4 w-4 text-rose-600" /> - Decrease (- Stock Out)
                    </button>
                  </div>
                </div>

                {/* Quantity */}
                <div className="space-y-1.5">
                  <Label htmlFor="adj-qty" className="text-xs font-bold">
                    Quantity to {adjustType === "increase" ? "Add" : "Deduct"} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="adj-qty"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="1"
                    value={adjustQuantity}
                    onChange={(e) => setAdjustQuantity(e.target.value === "" ? "" : Math.max(1, parseInt(e.target.value, 10)))}
                    required
                    className="h-9 font-mono font-bold text-sm"
                  />
                </div>

                {/* Reason */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold">Reason for Adjustment <span className="text-destructive">*</span></Label>
                  <select
                    value={adjustReason}
                    onChange={(e) => setAdjustReason(e.target.value)}
                    required
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm font-medium"
                  >
                    {ADJUSTMENT_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Optional Notes */}
                <div className="space-y-1.5">
                  <Label htmlFor="adj-notes" className="text-xs font-bold">Optional Notes / Details</Label>
                  <Textarea
                    id="adj-notes"
                    placeholder="e.g. Discovered 2 missing oil filter boxes during physical month-end shelf audit..."
                    rows={2}
                    value={adjustNotes}
                    onChange={(e) => setAdjustNotes(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* ───────────────────────────────────────────────────────────── */}
            {/* MODE 2: ADD / ENTER SPARE PART MANUALLY                       */}
            {/* ───────────────────────────────────────────────────────────── */}
            {partEntryMode === "manual" && (
              <div className="space-y-3">
                {/* Duplicate Found Warning Banner */}
                {duplicateFoundPart && (
                  <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg text-xs space-y-2 text-amber-900 animate-in fade-in-50">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                      <span>This spare part already exists in catalog!</span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Found matching Part: <span className="font-bold">{duplicateFoundPart.name}</span> (Part #{duplicateFoundPart.part_number}, Current Stock: {duplicateFoundPart.current_stock} {duplicateFoundPart.unit || "pcs"}).
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => handleSelectDuplicatePart(duplicateFoundPart)}
                      className="h-7 text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white"
                    >
                      Select Existing Part
                    </Button>
                  </div>
                )}

                {/* Part Name & OEM Number */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="man-name" className="text-xs font-bold">
                      Part Name <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="man-name"
                      placeholder="e.g. Toyota Oil Filter"
                      value={manualPartName}
                      onChange={(e) => setManualPartName(e.target.value)}
                      required
                      className="h-8 text-xs font-medium"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="man-partno" className="text-xs font-bold">Part Number / OEM Number</Label>
                    <Input
                      id="man-partno"
                      placeholder="e.g. 90915-YZZD1"
                      value={manualPartNumber}
                      onChange={(e) => setManualPartNumber(e.target.value)}
                      className="h-8 text-xs font-mono font-semibold"
                    />
                  </div>
                </div>

                {/* Brand & Unit */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="man-brand" className="text-xs font-bold">Brand</Label>
                    <Input
                      id="man-brand"
                      placeholder="e.g. Toyota Genuine / Denso"
                      value={manualBrand}
                      onChange={(e) => setManualBrand(e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="man-unit" className="text-xs font-bold">Unit of Measure</Label>
                    <select
                      id="man-unit"
                      value={manualUnit}
                      onChange={(e) => setManualUnit(e.target.value)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm font-medium"
                    >
                      <option value="piece">Piece (pcs)</option>
                      <option value="set">Set</option>
                      <option value="pair">Pair</option>
                      <option value="liter">Liter (L)</option>
                      <option value="can">Can / Bottle</option>
                      <option value="box">Box</option>
                      <option value="drum">Drum</option>
                    </select>
                  </div>
                </div>

                {/* Purchase Price, Selling Price, Opening Stock, Min Stock */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="space-y-1">
                    <Label htmlFor="man-pprice" className="text-[11px] font-bold">Purchase Cost (AED)</Label>
                    <Input
                      id="man-pprice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={manualPurchasePrice}
                      onChange={(e) => setManualPurchasePrice(e.target.value === "" ? "" : Number(e.target.value))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="man-sprice" className="text-[11px] font-bold">Selling Price (AED)</Label>
                    <Input
                      id="man-sprice"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={manualSellingPrice}
                      onChange={(e) => setManualSellingPrice(e.target.value === "" ? "" : Number(e.target.value))}
                      className="h-8 text-xs font-mono font-bold text-primary"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="man-ostock" className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                      Opening Stock *
                    </Label>
                    <Input
                      id="man-ostock"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="20"
                      value={manualOpeningStock}
                      onChange={(e) => setManualOpeningStock(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10)))}
                      required
                      className="h-8 text-xs font-mono font-black bg-emerald-50/50 border-emerald-300 dark:bg-emerald-950/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="man-mstock" className="text-[11px] font-bold">Min Alert Stock</Label>
                    <Input
                      id="man-mstock"
                      type="number"
                      min="0"
                      step="1"
                      placeholder="5"
                      value={manualMinStock}
                      onChange={(e) => setManualMinStock(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value, 10)))}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Supplier & Rack Location */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="man-sup" className="text-xs font-bold">Purchased From / Supplier</Label>
                      <button
                        type="button"
                        onClick={() => setNewSupplierModalOpen(true)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline font-bold inline-flex items-center gap-0.5"
                      >
                        <Plus className="h-3 w-3" /> Add Supplier
                      </button>
                    </div>
                    <select
                      id="man-sup"
                      value={manualSupplierId}
                      onChange={(e) => setManualSupplierId(e.target.value)}
                      className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs shadow-sm font-medium"
                    >
                      <option value="">-- Direct / Unknown Supplier --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="man-loc" className="text-xs font-bold">Rack / Storage Location</Label>
                    <Input
                      id="man-loc"
                      placeholder="e.g. Shelf A-02 / Bin 14"
                      value={manualLocation}
                      onChange={(e) => setManualLocation(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="space-y-1">
                  <Label htmlFor="man-desc" className="text-xs font-bold">Description / Technical Notes</Label>
                  <Textarea
                    id="man-desc"
                    placeholder="e.g. Spin-on oil filter for 2.5L and 3.5L V6 engines..."
                    rows={2}
                    value={manualDescription}
                    onChange={(e) => setManualDescription(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-3 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setAdjustModalOpen(false)}
                disabled={adjustSubmitting}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={adjustSubmitting}
                className="text-xs font-bold gap-1 bg-primary text-primary-foreground"
              >
                {adjustSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : partEntryMode === "manual" ? (
                  "Save & Register Spare Part"
                ) : (
                  `Confirm ${adjustType === "increase" ? "+ Increase" : "- Decrease"}`
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 5. INLINE ADD NEW SUPPLIER MODAL DIALOG                                   */}
      {/* ========================================================================= */}
      <Dialog open={newSupplierModalOpen} onOpenChange={setNewSupplierModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <Building2 className="h-5 w-5 text-blue-600" /> Quick Add Supplier
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Register a new auto parts supplier and automatically attach it to this spare part.
            </DialogDescription>
          </DialogHeader>

          {supplierError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs font-semibold text-rose-700">
              {supplierError}
            </div>
          )}

          <form onSubmit={handleSaveInlineSupplier} className="space-y-3 pt-1">
            <div className="space-y-1">
              <Label className="text-xs font-bold">Supplier Name <span className="text-destructive">*</span></Label>
              <Input
                placeholder="e.g. Al Futtaim Auto Parts LLC"
                value={newSupName}
                onChange={(e) => setNewSupName(e.target.value)}
                required
                className="h-8 text-xs font-medium"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs font-bold">Contact Person</Label>
                <Input
                  placeholder="e.g. Rashid Ali"
                  value={newSupContact}
                  onChange={(e) => setNewSupContact(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs font-bold">Phone Number</Label>
                <Input
                  placeholder="e.g. +971-4-2987654"
                  value={newSupPhone}
                  onChange={(e) => setNewSupPhone(e.target.value)}
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-bold">Address / Location</Label>
              <Input
                placeholder="e.g. Al Quoz Industrial 3, Dubai"
                value={newSupAddress}
                onChange={(e) => setNewSupAddress(e.target.value)}
                className="h-8 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setNewSupplierModalOpen(false)}
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
                {savingSupplier ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Select Supplier"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* 6. PER-PART STOCK HISTORY MODAL                                           */}
      {/* ========================================================================= */}
      <Dialog open={historyModalOpen} onOpenChange={setHistoryModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
              <History className="h-5 w-5 text-blue-600" /> Stock Movement History
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {historyPart ? (
                <>
                  History for <span className="font-bold text-foreground">{historyPart.name}</span>
                  {historyPart.part_number && (
                    <span className="font-mono text-blue-600 dark:text-blue-400 font-bold ml-1.5">
                      (Part #{historyPart.part_number})
                    </span>
                  )}
                  {" — "}Current Stock:{" "}
                  <span className="font-black text-foreground font-mono">
                    {historyPart.current_stock} {historyPart.unit || "pcs"}
                  </span>
                </>
              ) : (
                "Spare part transaction log"
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 max-h-[60vh] overflow-y-auto">
            {loadingHistory ? (
              <div className="py-16 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
                <p className="font-medium text-sm">Loading stock history...</p>
              </div>
            ) : historyTransactions.length > 0 ? (
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-slate-800/60 text-xs font-bold">
                      <TableHead className="w-[20%]">Date</TableHead>
                      <TableHead className="w-[22%]">Type</TableHead>
                      <TableHead className="w-[18%]">Reference</TableHead>
                      <TableHead className="w-[10%] text-right">Qty In</TableHead>
                      <TableHead className="w-[10%] text-right">Qty Out</TableHead>
                      <TableHead className="w-[10%] text-right">Before</TableHead>
                      <TableHead className="w-[10%] text-right font-black">After</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historyTransactions.map((tx) => {
                      const isPositive = tx.quantity > 0;
                      const isNegative = tx.quantity < 0;

                      return (
                        <TableRow key={tx.id} className="text-xs">
                          <TableCell className="text-muted-foreground font-mono text-[11px] py-2.5">
                            {formatDate(tx.created_at)}
                          </TableCell>
                          <TableCell className="py-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                tx.transaction_type.includes("purchase") || tx.transaction_type.includes("in") || tx.transaction_type.includes("opening")
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                                  : tx.transaction_type.includes("job_card")
                                  ? "bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800"
                                  : "bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                              }`}
                            >
                              {tx.transaction_type.replace(/_/g, " ")}
                            </span>
                            {tx.notes && (
                              <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{tx.notes}</p>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold text-foreground py-2.5">
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
                          <TableCell className="text-right font-mono font-bold text-emerald-600 py-2.5">
                            {isPositive ? `+${tx.quantity}` : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-rose-600 py-2.5">
                            {isNegative ? Math.abs(tx.quantity) : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground py-2.5">
                            {tx.quantity_before !== undefined ? tx.quantity_before : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono font-black text-foreground py-2.5">
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

          <div className="flex justify-end pt-2">
            <Button variant="outline" size="sm" onClick={() => setHistoryModalOpen(false)} className="text-xs">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default InventoryView;
