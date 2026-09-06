"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Package,
  Wrench,
  Search,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  CreditCard,
  User,
  Car,
  Building2,
  Phone,
  Receipt,
  X,
  ChevronDown,
  ChevronUp,
  Loader2,
  Sparkles,
  Layers,
  BookmarkPlus,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { getParts } from "@/lib/services/parts-service";
import { getServices } from "@/lib/services/service-catalog-service";
import { getCustomers } from "@/lib/services/customer-service";
import { getBankAccounts } from "@/lib/services/ledger-service";
import {
  createDirectInvoice,
  CreateDirectInvoicePayload,
} from "@/lib/services/invoice-service";
import { useWorkspace } from "@/lib/context/workspace-context";
import { usePermissions } from "@/lib/context/auth-context";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";
import type { Part, Service, Customer, BankAccount } from "@/types/database";

export interface SelectedServiceRow {
  id: string; // client temporary id
  service_id?: string | null;
  name: string;
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  save_to_catalog?: boolean;
}

export interface SelectedPartRow {
  id: string; // client temporary id
  part_id: string;
  part_name: string;
  part_number?: string | null;
  brand?: string | null;
  available_stock: number;
  quantity: number;
  unit_price: number;
  discount: number;
  cost_price?: number;
}

export interface DirectInvoiceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (createdInvoice: any) => void;
}

export function DirectInvoiceModal({
  open,
  onOpenChange,
  onSuccess,
}: DirectInvoiceModalProps) {
  const { currentWorkspace } = useWorkspace();
  const { user } = usePermissions();
  const activeWorkspaceId = currentWorkspace?.id || DEFAULT_WORKSPACE_ID;

  // 1. INVOICE TYPE: "service" | "parts" | "mixed"
  const [invoiceTypeMode, setInvoiceTypeMode] = useState<"service" | "parts" | "mixed">("mixed");

  // 2. CUSTOMER STATE
  const [customerMode, setCustomerMode] = useState<"walk_in" | "existing" | "new">("walk_in");
  const [customerName, setCustomerName] = useState("Walk-in Customer");
  const [customerPhone, setCustomerPhone] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [trnNumber, setTrnNumber] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState("");

  // Existing Customers Search
  const [existingCustomers, setExistingCustomers] = useState<Customer[]>([]);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);

  // 3. OPTIONAL VEHICLE STATE
  const [showVehicleFields, setShowVehicleFields] = useState(false);
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [vehicleYear, setVehicleYear] = useState("");
  const [vehiclePlate, setVehiclePlate] = useState("");
  const [vehicleVin, setVehicleVin] = useState("");

  // 4. SERVICES CATALOG & SELECTED SERVICES
  const [catalogServices, setCatalogServices] = useState<Service[]>([]);
  const [serviceSearchQuery, setServiceSearchQuery] = useState("");
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const [selectedServices, setSelectedServices] = useState<SelectedServiceRow[]>([]);

  // Manual Service Dialog / Inline Entry State
  const [manualServiceModalOpen, setManualServiceModalOpen] = useState(false);
  const [manualDesc, setManualDesc] = useState("");
  const [manualQty, setManualQty] = useState<number | "">(1);
  const [manualRate, setManualRate] = useState<number | "">("");
  const [manualDisc, setManualDisc] = useState<number | "">(0);
  const [manualSaveToCatalog, setManualSaveToCatalog] = useState(false);

  // 5. SPARE PARTS CATALOG & SELECTED PARTS
  const [catalogParts, setCatalogParts] = useState<Part[]>([]);
  const [partSearchQuery, setPartSearchQuery] = useState("");
  const [partDropdownOpen, setPartDropdownOpen] = useState(false);
  const [selectedParts, setSelectedParts] = useState<SelectedPartRow[]>([]);

  // 6. FINANCIALS & PAYMENT
  const [discountAmount, setDiscountAmount] = useState<number | "">("");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "partially_paid" | "credit">("paid");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank" | "credit">("cash");
  const [paidAmountInput, setPaidAmountInput] = useState<number | "">("");
  const [selectedBankId, setSelectedBankId] = useState("");
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [invoiceNotes, setInvoiceNotes] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));

  // 7. FORM PROCESSING & NOTICES
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Refs for closing dropdowns when clicking outside
  const partSearchRef = useRef<HTMLDivElement>(null);
  const serviceSearchRef = useRef<HTMLDivElement>(null);
  const customerSearchRef = useRef<HTMLDivElement>(null);

  // Initial Data Load
  useEffect(() => {
    if (!open) return;
    setErrorMessage(null);
    loadAuxiliaryData();
  }, [open, activeWorkspaceId]);

  const loadAuxiliaryData = async () => {
    try {
      const [partsRes, srvRes, custRes, banks] = await Promise.all([
        getParts("all", "", 1, 100, activeWorkspaceId),
        getServices(true),
        getCustomers("", 1, 100, activeWorkspaceId),
        getBankAccounts(),
      ]);
      setCatalogParts(partsRes.parts || []);
      setCatalogServices(srvRes || []);
      setExistingCustomers(custRes.customers || []);
      setBankAccounts(banks || []);
      if (banks && banks.length > 0) {
        setSelectedBankId(banks[0].id);
      }
    } catch (err) {
      console.warn("Failed loading auxiliary data for direct invoice:", err);
    }
  };

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (partSearchRef.current && !partSearchRef.current.contains(event.target as Node)) {
        setPartDropdownOpen(false);
      }
      if (serviceSearchRef.current && !serviceSearchRef.current.contains(event.target as Node)) {
        setServiceDropdownOpen(false);
      }
      if (customerSearchRef.current && !customerSearchRef.current.contains(event.target as Node)) {
        setCustomerDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter existing customers
  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return existingCustomers.slice(0, 8);
    const q = customerSearchQuery.toLowerCase();
    return existingCustomers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.mobile && c.mobile.includes(q)) ||
          (c.company_name && c.company_name.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [existingCustomers, customerSearchQuery]);

  // Filter services catalog
  const filteredServices = useMemo(() => {
    if (!serviceSearchQuery.trim()) return catalogServices.slice(0, 10);
    const q = serviceSearchQuery.toLowerCase();
    return catalogServices
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.service_code && s.service_code.toLowerCase().includes(q)) ||
          (s.category && s.category.toLowerCase().includes(q)) ||
          (s.description && s.description.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [catalogServices, serviceSearchQuery]);

  // Filter parts catalog
  const filteredParts = useMemo(() => {
    if (!partSearchQuery.trim()) return catalogParts.slice(0, 10);
    const q = partSearchQuery.toLowerCase();
    return catalogParts
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.part_number && p.part_number.toLowerCase().includes(q)) ||
          (p.brand && p.brand.toLowerCase().includes(q))
      )
      .slice(0, 12);
  }, [catalogParts, partSearchQuery]);

  // --- Handlers: Customer ---
  const handleSelectExistingCustomer = (cust: Customer) => {
    setSelectedCustomerId(cust.id);
    setCustomerName(cust.name);
    setCustomerPhone(cust.mobile || "");
    setCompanyName(cust.company_name || "");
    setTrnNumber(cust.trn_number || "");
    setCustomerSearchQuery(cust.name);
    setCustomerDropdownOpen(false);
  };

  // --- Handlers: Services ---
  const handleAddCatalogService = (srv: Service) => {
    const existingIndex = selectedServices.findIndex((s) => s.service_id === srv.id);
    if (existingIndex >= 0) {
      // Increment quantity
      setSelectedServices((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      setSelectedServices((prev) => [
        ...prev,
        {
          id: "temp-srv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
          service_id: srv.id,
          name: srv.name,
          description: srv.description || srv.name,
          quantity: 1,
          unit_price: Number(srv.default_price) || 0,
          discount: 0,
          save_to_catalog: false,
        },
      ]);
    }
    setServiceSearchQuery("");
    setServiceDropdownOpen(false);
  };

  const handleOpenManualServiceDialog = () => {
    setManualDesc("");
    setManualQty(1);
    setManualRate("");
    setManualDisc(0);
    setManualSaveToCatalog(false);
    setManualServiceModalOpen(true);
  };

  const handleConfirmAddManualService = () => {
    if (!manualDesc.trim()) {
      setErrorMessage("Service description is required.");
      return;
    }
    const q = Number(manualQty) > 0 ? Number(manualQty) : 1;
    const r = Number(manualRate) >= 0 ? Number(manualRate) : 0;
    const d = Number(manualDisc) >= 0 ? Number(manualDisc) : 0;

    setSelectedServices((prev) => [
      ...prev,
      {
        id: "manual-srv-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
        service_id: null,
        name: manualDesc.trim(),
        description: manualDesc.trim(),
        quantity: q,
        unit_price: r,
        discount: d,
        save_to_catalog: manualSaveToCatalog,
      },
    ]);

    setManualServiceModalOpen(false);
  };

  const handleUpdateServiceField = (
    id: string,
    field: "quantity" | "unit_price" | "discount" | "description",
    val: any
  ) => {
    setSelectedServices((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        return {
          ...item,
          [field]: field === "description" ? val : Math.max(0, Number(val) || 0),
        };
      })
    );
  };

  const handleRemoveService = (id: string) => {
    setSelectedServices((prev) => prev.filter((s) => s.id !== id));
  };

  // --- Handlers: Spare Parts ---
  const handleAddCatalogPart = (part: Part) => {
    const available = Number(part.current_stock) || 0;
    if (available <= 0) {
      setErrorMessage(`Part "${part.name}" is currently OUT OF STOCK (0 available).`);
      return;
    }

    const existingIndex = selectedParts.findIndex((p) => p.part_id === part.id);
    if (existingIndex >= 0) {
      const currentQty = selectedParts[existingIndex].quantity;
      if (currentQty + 1 > available) {
        setErrorMessage(
          `Cannot add more than ${available} unit(s) of "${part.name}". Stock limit reached.`
        );
        return;
      }
      setSelectedParts((prev) =>
        prev.map((item, idx) =>
          idx === existingIndex ? { ...item, quantity: item.quantity + 1 } : item
        )
      );
    } else {
      setSelectedParts((prev) => [
        ...prev,
        {
          id: "temp-part-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
          part_id: part.id,
          part_name: part.name,
          part_number: part.part_number || null,
          brand: part.brand || null,
          available_stock: available,
          quantity: 1,
          unit_price: Number(part.selling_price) || 0,
          discount: 0,
          cost_price: Number(part.purchase_price) || 0,
        },
      ]);
    }
    setPartSearchQuery("");
    setPartDropdownOpen(false);
    setErrorMessage(null);
  };

  const handleUpdatePartField = (
    id: string,
    field: "quantity" | "unit_price" | "discount",
    val: number
  ) => {
    setSelectedParts((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === "quantity") {
          const clamped = Math.max(1, Math.min(item.available_stock, Number(val) || 1));
          return { ...item, quantity: clamped };
        }
        return { ...item, [field]: Math.max(0, Number(val) || 0) };
      })
    );
  };

  const handleRemovePart = (id: string) => {
    setSelectedParts((prev) => prev.filter((p) => p.id !== id));
  };

  // --- Financial Calculations ---
  const servicesSubtotal = useMemo(() => {
    if (invoiceTypeMode === "parts") return 0;
    return selectedServices.reduce((acc, s) => {
      const line = Math.max(0, s.quantity * s.unit_price - s.discount);
      return acc + line;
    }, 0);
  }, [selectedServices, invoiceTypeMode]);

  const partsSubtotal = useMemo(() => {
    if (invoiceTypeMode === "service") return 0;
    return selectedParts.reduce((acc, p) => {
      const line = Math.max(0, p.quantity * p.unit_price - p.discount);
      return acc + line;
    }, 0);
  }, [selectedParts, invoiceTypeMode]);

  const totalItemsSubtotal = servicesSubtotal + partsSubtotal;
  const overallDiscount = typeof discountAmount === "number" ? discountAmount : 0;
  const taxableSubtotal = Math.max(0, totalItemsSubtotal - overallDiscount);
  const vatAmount = Math.round(taxableSubtotal * 0.05 * 100) / 100;
  const grandTotal = Math.round((taxableSubtotal + vatAmount) * 100) / 100;

  const paidAmount =
    paymentStatus === "credit"
      ? 0
      : paymentStatus === "paid"
      ? grandTotal
      : typeof paidAmountInput === "number"
      ? paidAmountInput
      : 0;

  const balance = Math.max(0, grandTotal - paidAmount);

  // Reset entire form
  const handleResetForm = () => {
    setInvoiceTypeMode("mixed");
    setCustomerMode("walk_in");
    setCustomerName("Walk-in Customer");
    setCustomerPhone("");
    setCompanyName("");
    setTrnNumber("");
    setSelectedCustomerId("");
    setShowVehicleFields(false);
    setVehicleMake("");
    setVehicleModel("");
    setVehicleYear("");
    setVehiclePlate("");
    setVehicleVin("");
    setSelectedServices([]);
    setSelectedParts([]);
    setDiscountAmount("");
    setPaymentStatus("paid");
    setPaymentMethod("cash");
    setPaidAmountInput("");
    setInvoiceNotes("");
    setErrorMessage(null);
  };

  // --- Finalize Invoice Submission ---
  const handleFinalizeInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validate Items according to mode
    if (invoiceTypeMode === "service" && selectedServices.length === 0) {
      setErrorMessage("Direct Service Invoice must contain at least one service item.");
      return;
    }
    if (invoiceTypeMode === "parts" && selectedParts.length === 0) {
      setErrorMessage("Direct Spare Parts Invoice must contain at least one spare part.");
      return;
    }
    if (invoiceTypeMode === "mixed" && selectedServices.length === 0 && selectedParts.length === 0) {
      setErrorMessage("Direct Invoice must contain at least one service or spare part.");
      return;
    }

    // Customer validation
    if (customerMode === "existing" && !selectedCustomerId) {
      setErrorMessage("Please select a registered customer from the list.");
      return;
    }
    if (customerMode === "new" && !customerName.trim()) {
      setErrorMessage("Customer name is required.");
      return;
    }

    // Parts stock validation
    if (invoiceTypeMode !== "service") {
      for (const item of selectedParts) {
        if (item.quantity <= 0) {
          setErrorMessage(`Quantity for "${item.part_name}" must be greater than zero.`);
          return;
        }
        if (item.quantity > item.available_stock) {
          setErrorMessage(
            `Only ${item.available_stock} units are available in stock for "${item.part_name}". Cannot finalize sale exceeding stock.`
          );
          return;
        }
      }
    }

    setIsSubmitting(true);

    try {
      const payload: CreateDirectInvoicePayload = {
        invoice_type_mode: invoiceTypeMode,
        customer_type: customerMode,
        customer_id: customerMode === "existing" ? selectedCustomerId : undefined,
        customer_name: customerName.trim() || "Walk-in Customer",
        customer_phone: customerPhone.trim() || undefined,
        company_name: companyName.trim() || undefined,
        trn_number: trnNumber.trim() || undefined,

        // Optional vehicle
        vehicle_make: showVehicleFields && vehicleMake.trim() ? vehicleMake.trim() : undefined,
        vehicle_model: showVehicleFields && vehicleModel.trim() ? vehicleModel.trim() : undefined,
        vehicle_year: showVehicleFields && vehicleYear.trim() ? vehicleYear.trim() : undefined,
        vehicle_plate: showVehicleFields && vehiclePlate.trim() ? vehiclePlate.trim() : undefined,
        vehicle_vin: showVehicleFields && vehicleVin.trim() ? vehicleVin.trim() : undefined,

        // Services (only if not parts-only)
        services:
          invoiceTypeMode !== "parts"
            ? selectedServices.map((s) => ({
                service_id: s.service_id,
                description: s.description || s.name,
                quantity: s.quantity,
                unit_price: s.unit_price,
                discount: s.discount,
                save_to_catalog: s.save_to_catalog,
              }))
            : [],

        // Spare Parts (only if not service-only)
        parts:
          invoiceTypeMode !== "service"
            ? selectedParts.map((p) => ({
                part_id: p.part_id,
                part_name: p.part_name,
                part_number: p.part_number,
                quantity: p.quantity,
                unit_price: p.unit_price,
                discount: p.discount,
                cost_price: p.cost_price,
              }))
            : [],

        discount: overallDiscount,
        vat_rate: 5,

        payment_status: paymentStatus,
        payment_method: paymentMethod,
        bank_account_id: paymentMethod === "bank" ? selectedBankId : undefined,
        paid_amount: paidAmount,

        notes:
          invoiceNotes.trim() ||
          `Direct ${
            invoiceTypeMode === "service"
              ? "Service"
              : invoiceTypeMode === "parts"
              ? "Spare Parts"
              : "Service & Parts"
          } Invoice`,
        created_by: user?.full_name || "Owner",
        date: invoiceDate,
      };

      const createdInvoice = await createDirectInvoice(payload, activeWorkspaceId);
      handleResetForm();
      onOpenChange(false);
      onSuccess(createdInvoice);
    } catch (err: any) {
      console.error("Direct invoice error:", err);
      setErrorMessage(err.message || "Failed to finalize direct invoice.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col p-0 overflow-hidden bg-background text-foreground shadow-2xl border-border">
          {/* Top Modal Header */}
          <DialogHeader className="px-6 py-4 border-b border-border bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-sm shrink-0">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    Create Direct Invoice
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                      No Job Card Required
                    </span>
                  </DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                    Generate direct invoice for services, counter spare parts sales, or combined billing.
                  </DialogDescription>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] font-mono text-muted-foreground block">Invoice Date</span>
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  className="h-7 text-xs font-mono w-32 px-2 py-0"
                />
              </div>
            </div>
          </DialogHeader>

          {/* Scrollable Form Body */}
          <form onSubmit={handleFinalizeInvoice} className="flex-1 overflow-y-auto p-6 space-y-5">
            {/* Error Notification Banner */}
            {errorMessage && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl border border-red-200 bg-red-50 text-red-800 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 text-xs font-semibold animate-in fade-in">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
                <span className="flex-1">{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-red-600 hover:text-red-800 dark:text-red-400"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* ─── SECTION 1: INVOICE TYPE SELECTOR ─── */}
            <div className="rounded-2xl border border-border bg-card p-3.5 shadow-2xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div>
                  <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <Layers className="h-3.5 w-3.5 text-blue-600" /> Invoice Type *
                  </Label>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Select invoice mode to dynamically toggle item sections
                  </p>
                </div>
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-border">
                  <button
                    type="button"
                    onClick={() => setInvoiceTypeMode("service")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      invoiceTypeMode === "service"
                        ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Wrench className="h-3.5 w-3.5" /> Service
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceTypeMode("parts")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      invoiceTypeMode === "parts"
                        ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Package className="h-3.5 w-3.5" /> Spare Parts
                  </button>
                  <button
                    type="button"
                    onClick={() => setInvoiceTypeMode("mixed")}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                      invoiceTypeMode === "mixed"
                        ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Service + Spare Parts
                  </button>
                </div>
              </div>
            </div>

            {/* ─── SECTION 2: CUSTOMER INFORMATION ─── */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-3.5 shadow-2xs">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <User className="h-3.5 w-3.5 text-blue-600" /> Customer Information *
                </Label>
                {/* Customer Mode Tabs */}
                <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border border-border text-xs">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerMode("walk_in");
                      setCustomerName("Walk-in Customer");
                      setSelectedCustomerId("");
                    }}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      customerMode === "walk_in"
                        ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Walk-in Customer
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerMode("existing");
                      setCustomerName("");
                    }}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      customerMode === "existing"
                        ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Select Existing
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerMode("new");
                      setCustomerName("");
                      setSelectedCustomerId("");
                    }}
                    className={`px-3 py-1 rounded-md font-semibold transition-all ${
                      customerMode === "new"
                        ? "bg-white dark:bg-slate-700 text-blue-600 dark:text-white shadow-2xs"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    + Add New
                  </button>
                </div>
              </div>

              {/* Walk-in Mode */}
              {customerMode === "walk_in" && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Customer Name</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in Customer"
                      className="h-9 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Phone (Optional)</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+971 50 000 0000"
                      className="h-9 text-xs font-mono mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Company / TRN (Optional)</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="Company or Tax ID"
                      className="h-9 text-xs mt-1"
                    />
                  </div>
                </div>
              )}

              {/* Existing Customer Mode */}
              {customerMode === "existing" && (
                <div className="space-y-3 pt-1">
                  <div className="relative" ref={customerSearchRef}>
                    <Label className="text-[11px] text-muted-foreground">Search Existing Customer</Label>
                    <div className="relative mt-1">
                      <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                      <Input
                        value={customerSearchQuery}
                        onChange={(e) => {
                          setCustomerSearchQuery(e.target.value);
                          setCustomerDropdownOpen(true);
                        }}
                        onFocus={() => setCustomerDropdownOpen(true)}
                        placeholder="Type name, phone number, or company..."
                        className="h-9 pl-9 text-xs"
                      />
                    </div>

                    {customerDropdownOpen && filteredCustomers.length > 0 && (
                      <div className="absolute z-30 left-0 right-0 mt-1 max-h-48 overflow-y-auto bg-popover border border-border rounded-xl shadow-lg divide-y divide-border/40">
                        {filteredCustomers.map((cust) => (
                          <div
                            key={cust.id}
                            onClick={() => handleSelectExistingCustomer(cust)}
                            className="p-2.5 hover:bg-muted/60 cursor-pointer flex items-center justify-between text-xs"
                          >
                            <div>
                              <p className="font-semibold text-foreground">{cust.name}</p>
                              <p className="text-[11px] text-muted-foreground font-mono">
                                {cust.mobile || "No phone"} {cust.company_name ? `• ${cust.company_name}` : ""}
                              </p>
                            </div>
                            {cust.trn_number && (
                              <span className="text-[10px] font-mono bg-muted px-2 py-0.5 rounded text-muted-foreground">
                                TRN: {cust.trn_number}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedCustomerId && (
                    <div className="p-3 bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/40 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-blue-900 dark:text-blue-300">{customerName}</span>
                        <div className="text-[11px] text-muted-foreground font-mono mt-0.5 flex items-center gap-3">
                          {customerPhone && <span>Phone: {customerPhone}</span>}
                          {companyName && <span>Company: {companyName}</span>}
                          {trnNumber && <span>TRN: {trnNumber}</span>}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedCustomerId("");
                          setCustomerName("");
                          setCustomerPhone("");
                          setCompanyName("");
                          setTrnNumber("");
                          setCustomerSearchQuery("");
                        }}
                        className="h-7 text-xs text-muted-foreground hover:text-red-600"
                      >
                        Change
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* Add New Customer Mode */}
              {customerMode === "new" && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Customer Name *</Label>
                    <Input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="e.g. Tariq Mansoor"
                      className="h-9 text-xs mt-1"
                      required
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Mobile Phone</Label>
                    <Input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="+971 50 123 4567"
                      className="h-9 text-xs font-mono mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Company Name</Label>
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Al Dhafra Logistics"
                      className="h-9 text-xs mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">TRN (VAT Tax No)</Label>
                    <Input
                      value={trnNumber}
                      onChange={(e) => setTrnNumber(e.target.value)}
                      placeholder="100XXXXXXXXX003"
                      className="h-9 text-xs font-mono mt-1"
                    />
                  </div>
                </div>
              )}

              {/* Optional Vehicle Expandable Section */}
              <div className="pt-2 border-t border-border/60">
                <button
                  type="button"
                  onClick={() => setShowVehicleFields((prev) => !prev)}
                  className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1.5"
                >
                  <Car className="h-3.5 w-3.5" />
                  {showVehicleFields ? "Hide Vehicle Details" : "+ Attach Vehicle Details (Optional)"}
                  {showVehicleFields ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                </button>

                {showVehicleFields && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-2.5 p-3 rounded-xl bg-muted/40 border border-border/80">
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Make</Label>
                      <Input
                        value={vehicleMake}
                        onChange={(e) => setVehicleMake(e.target.value)}
                        placeholder="Toyota"
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Model</Label>
                      <Input
                        value={vehicleModel}
                        onChange={(e) => setVehicleModel(e.target.value)}
                        placeholder="Land Cruiser"
                        className="h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Year</Label>
                      <Input
                        value={vehicleYear}
                        onChange={(e) => setVehicleYear(e.target.value)}
                        placeholder="2023"
                        className="h-8 text-xs font-mono mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Plate No</Label>
                      <Input
                        value={vehiclePlate}
                        onChange={(e) => setVehiclePlate(e.target.value)}
                        placeholder="DXB A 12345"
                        className="h-8 text-xs font-mono mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground uppercase font-bold">Chassis / VIN</Label>
                      <Input
                        value={vehicleVin}
                        onChange={(e) => setVehicleVin(e.target.value)}
                        placeholder="JTE..."
                        className="h-8 text-xs font-mono mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* ─── SECTION 3: SERVICES SECTION (Shown if Service or Mixed) ─── */}
            {(invoiceTypeMode === "service" || invoiceTypeMode === "mixed") && (
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3.5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Wrench className="h-3.5 w-3.5 text-blue-600" /> Workshop Services
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Search catalog services or add custom manual services. Services do not touch inventory.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleOpenManualServiceDialog}
                      className="h-8 text-xs font-semibold rounded-xl border-border bg-background hover:bg-muted gap-1.5 shadow-2xs"
                    >
                      <Plus className="h-3.5 w-3.5 text-blue-600" /> + Add Service Manually
                    </Button>
                  </div>
                </div>

                {/* Service Catalog Search Input */}
                <div className="relative" ref={serviceSearchRef}>
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      value={serviceSearchQuery}
                      onChange={(e) => {
                        setServiceSearchQuery(e.target.value);
                        setServiceDropdownOpen(true);
                      }}
                      onFocus={() => setServiceDropdownOpen(true)}
                      placeholder="Search service catalog by name, category, or code..."
                      className="h-9 pl-9 text-xs"
                    />
                  </div>

                  {serviceDropdownOpen && filteredServices.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-popover border border-border rounded-xl shadow-xl divide-y divide-border/40">
                      {filteredServices.map((srv) => (
                        <div
                          key={srv.id}
                          onClick={() => handleAddCatalogService(srv)}
                          className="p-2.5 hover:bg-muted/60 cursor-pointer flex items-center justify-between text-xs"
                        >
                          <div className="min-w-0 pr-2">
                            <p className="font-semibold text-foreground truncate">{srv.name}</p>
                            <p className="text-[11px] text-muted-foreground truncate">
                              {srv.category} {srv.service_code ? `• ${srv.service_code}` : ""}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-bold font-mono text-foreground block">
                              {formatCurrency(srv.default_price || 0)}
                            </span>
                            <span className="text-[10px] text-blue-600 font-semibold">+ Add to invoice</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Selected Services Table */}
                {selectedServices.length > 0 ? (
                  <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-semibold text-muted-foreground">
                          <TableHead className="min-w-[200px]">Service Description</TableHead>
                          <TableHead className="w-16 text-center">Qty</TableHead>
                          <TableHead className="w-24 text-right">Rate (AED)</TableHead>
                          <TableHead className="w-20 text-right">Discount</TableHead>
                          <TableHead className="w-20 text-center">VAT (5%)</TableHead>
                          <TableHead className="w-28 text-right font-bold text-foreground">Amount (AED)</TableHead>
                          <TableHead className="w-12 text-center"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedServices.map((s) => {
                          const lineTotal = Math.max(0, s.quantity * s.unit_price - s.discount);
                          const lineVat = Math.round(lineTotal * 0.05 * 100) / 100;
                          return (
                            <TableRow key={s.id} className="h-11 border-b border-border/40">
                              <TableCell className="py-2">
                                <div className="font-semibold text-foreground leading-tight">{s.name}</div>
                                {s.save_to_catalog && (
                                  <span className="inline-block mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase">
                                    Saved to Catalog
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Input
                                  type="number"
                                  min="1"
                                  value={s.quantity}
                                  onChange={(e) =>
                                    handleUpdateServiceField(s.id, "quantity", e.target.value)
                                  }
                                  className="h-7 w-14 text-center font-mono text-xs mx-auto px-1"
                                />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={s.unit_price}
                                  onChange={(e) =>
                                    handleUpdateServiceField(s.id, "unit_price", e.target.value)
                                  }
                                  className="h-7 w-20 text-right font-mono text-xs ml-auto px-1.5"
                                />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={s.discount}
                                  onChange={(e) =>
                                    handleUpdateServiceField(s.id, "discount", e.target.value)
                                  }
                                  className="h-7 w-16 text-right font-mono text-xs ml-auto px-1.5"
                                />
                              </TableCell>
                              <TableCell className="py-2 text-center font-mono text-[11px] text-muted-foreground">
                                {formatCurrency(lineVat)}
                              </TableCell>
                              <TableCell className="py-2 text-right font-mono font-bold text-foreground">
                                {formatCurrency(lineTotal)}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveService(s.id)}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 rounded-lg"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-6 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground bg-slate-50/40 dark:bg-slate-900/20">
                    <Wrench className="h-5 w-5 mx-auto mb-1.5 text-slate-400" />
                    No services added yet. Search catalog above or click{" "}
                    <span className="font-semibold text-blue-600">+ Add Service Manually</span>.
                  </div>
                )}
              </div>
            )}

            {/* ─── SECTION 4: SPARE PARTS SECTION (Shown if Parts or Mixed) ─── */}
            {(invoiceTypeMode === "parts" || invoiceTypeMode === "mixed") && (
              <div className="rounded-2xl border border-border bg-card p-4 space-y-3.5 shadow-2xs">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5 text-blue-600" /> Spare Parts &amp; Materials
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Search inventory parts. Stock will be atomically deducted upon invoice finalization.
                    </p>
                  </div>
                </div>

                {/* Part Search Input */}
                <div className="relative" ref={partSearchRef}>
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground" />
                    <Input
                      value={partSearchQuery}
                      onChange={(e) => {
                        setPartSearchQuery(e.target.value);
                        setPartDropdownOpen(true);
                      }}
                      onFocus={() => setPartDropdownOpen(true)}
                      placeholder="Search spare parts catalog by name, part no, OEM, or brand..."
                      className="h-9 pl-9 text-xs"
                    />
                  </div>

                  {partDropdownOpen && filteredParts.length > 0 && (
                    <div className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-popover border border-border rounded-xl shadow-xl divide-y divide-border/40">
                      {filteredParts.map((part) => {
                        const stock = Number(part.current_stock) || 0;
                        const isOut = stock <= 0;
                        return (
                          <div
                            key={part.id}
                            onClick={() => !isOut && handleAddCatalogPart(part)}
                            className={`p-2.5 flex items-center justify-between text-xs ${
                              isOut
                                ? "opacity-50 cursor-not-allowed bg-muted/20"
                                : "hover:bg-muted/60 cursor-pointer"
                            }`}
                          >
                            <div className="min-w-0 pr-2">
                              <p className="font-semibold text-foreground truncate">{part.name}</p>
                              <p className="text-[11px] text-muted-foreground font-mono truncate">
                                {part.part_number ? `PN: ${part.part_number}` : ""} {part.brand ? `• ${part.brand}` : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border ${
                                  stock > 5
                                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                    : stock > 0
                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                    : "bg-red-50 text-red-700 border-red-200"
                                }`}
                              >
                                Stock: {stock}
                              </span>
                              <span className="font-bold font-mono text-foreground">
                                {formatCurrency(part.selling_price || 0)}
                              </span>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isOut}
                                className="h-6 text-[10px] px-2"
                              >
                                + Add
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Selected Parts Table */}
                {selectedParts.length > 0 ? (
                  <div className="border border-border/80 rounded-xl overflow-hidden shadow-2xs">
                    <Table className="text-xs">
                      <TableHeader>
                        <TableRow className="bg-slate-50/80 dark:bg-slate-800/50 text-[11px] font-semibold text-muted-foreground">
                          <TableHead className="min-w-[180px]">Spare Part Description</TableHead>
                          <TableHead className="w-24 text-center">In Stock</TableHead>
                          <TableHead className="w-16 text-center">Qty</TableHead>
                          <TableHead className="w-24 text-right">Unit Price (AED)</TableHead>
                          <TableHead className="w-20 text-right">Discount</TableHead>
                          <TableHead className="w-20 text-center">VAT (5%)</TableHead>
                          <TableHead className="w-28 text-right font-bold text-foreground">Amount (AED)</TableHead>
                          <TableHead className="w-12 text-center"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedParts.map((p) => {
                          const lineTotal = Math.max(0, p.quantity * p.unit_price - p.discount);
                          const lineVat = Math.round(lineTotal * 0.05 * 100) / 100;
                          return (
                            <TableRow key={p.id} className="h-11 border-b border-border/40">
                              <TableCell className="py-2">
                                <div className="font-semibold text-foreground leading-tight">{p.part_name}</div>
                                {p.part_number && (
                                  <div className="text-[10px] font-mono text-muted-foreground mt-0.5">
                                    PN: {p.part_number} {p.brand ? `• ${p.brand}` : ""}
                                  </div>
                                )}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <span className="inline-block font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                                  {p.available_stock}
                                </span>
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Input
                                  type="number"
                                  min="1"
                                  max={p.available_stock}
                                  value={p.quantity}
                                  onChange={(e) =>
                                    handleUpdatePartField(p.id, "quantity", Number(e.target.value))
                                  }
                                  className="h-7 w-14 text-center font-mono text-xs mx-auto px-1"
                                />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={p.unit_price}
                                  onChange={(e) =>
                                    handleUpdatePartField(p.id, "unit_price", Number(e.target.value))
                                  }
                                  className="h-7 w-20 text-right font-mono text-xs ml-auto px-1.5"
                                />
                              </TableCell>
                              <TableCell className="py-2 text-right">
                                <Input
                                  type="number"
                                  min="0"
                                  step="any"
                                  value={p.discount}
                                  onChange={(e) =>
                                    handleUpdatePartField(p.id, "discount", Number(e.target.value))
                                  }
                                  className="h-7 w-16 text-right font-mono text-xs ml-auto px-1.5"
                                />
                              </TableCell>
                              <TableCell className="py-2 text-center font-mono text-[11px] text-muted-foreground">
                                {formatCurrency(lineVat)}
                              </TableCell>
                              <TableCell className="py-2 text-right font-mono font-bold text-foreground">
                                {formatCurrency(lineTotal)}
                              </TableCell>
                              <TableCell className="py-2 text-center">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemovePart(p.id)}
                                  className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600 rounded-lg"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="py-6 text-center border border-dashed border-border rounded-xl text-xs text-muted-foreground bg-slate-50/40 dark:bg-slate-900/20">
                    <Package className="h-5 w-5 mx-auto mb-1.5 text-slate-400" />
                    No spare parts added yet. Search catalog above to select parts.
                  </div>
                )}
              </div>
            )}

            {/* ─── SECTION 5: TOTALS, SETTLEMENT & ACCOUNTING ─── */}
            <div className="rounded-2xl border border-border bg-card p-4 space-y-4 shadow-2xs">
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5 text-emerald-600" /> Payment Settlement &amp; Invoice Totals
              </Label>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: Payment Method & Terms */}
                <div className="space-y-3.5 text-xs">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">Payment Status</Label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setPaymentStatus("paid")}
                        className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                          paymentStatus === "paid"
                            ? "border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        Paid Full
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentStatus("partially_paid")}
                        className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                          paymentStatus === "partially_paid"
                            ? "border-amber-600 bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        Partially Paid
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentStatus("credit")}
                        className={`py-2 px-3 rounded-xl border font-bold text-xs transition-all ${
                          paymentStatus === "credit"
                            ? "border-rose-600 bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-300"
                            : "border-border text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        Credit (Unpaid)
                      </button>
                    </div>
                  </div>

                  {/* Payment Method Selector */}
                  {paymentStatus !== "credit" && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <div>
                        <Label className="text-[11px] text-muted-foreground">Payment Method</Label>
                        <div className="flex items-center gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("cash")}
                            className={`flex-1 py-1.5 px-3 rounded-lg border font-semibold text-xs ${
                              paymentMethod === "cash"
                                ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            Cash (Petty)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentMethod("bank")}
                            className={`flex-1 py-1.5 px-3 rounded-lg border font-semibold text-xs ${
                              paymentMethod === "bank"
                                ? "border-blue-600 bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                                : "border-border text-muted-foreground"
                            }`}
                          >
                            Bank Transfer
                          </button>
                        </div>
                      </div>

                      {paymentStatus === "partially_paid" && (
                        <div>
                          <Label className="text-[11px] text-muted-foreground">Amount Paid Now (AED) *</Label>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            max={grandTotal}
                            value={paidAmountInput}
                            onChange={(e) =>
                              setPaidAmountInput(e.target.value === "" ? "" : Number(e.target.value))
                            }
                            placeholder="0.00"
                            className="h-8 text-xs font-mono mt-1"
                            required
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {paymentMethod === "bank" && paymentStatus !== "credit" && bankAccounts.length > 0 && (
                    <div>
                      <Label className="text-[11px] text-muted-foreground">Deposit Bank Account</Label>
                      <select
                        value={selectedBankId}
                        onChange={(e) => setSelectedBankId(e.target.value)}
                        className="w-full h-8 px-2.5 text-xs rounded-lg border border-border bg-background text-foreground mt-1"
                      >
                        {bankAccounts.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.bank_name} ({b.account_name})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <Label className="text-[11px] text-muted-foreground">Invoice Notes (Optional)</Label>
                    <Input
                      value={invoiceNotes}
                      onChange={(e) => setInvoiceNotes(e.target.value)}
                      placeholder="e.g. Counter sale warranty 30 days"
                      className="h-8 text-xs mt-1"
                    />
                  </div>
                </div>

                {/* Right: Totals Breakdown */}
                <div className="bg-slate-50/80 dark:bg-slate-800/40 p-4 rounded-xl border border-border/80 space-y-2 text-xs">
                  {servicesSubtotal > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Service Total:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {formatCurrency(servicesSubtotal)}
                      </span>
                    </div>
                  )}

                  {partsSubtotal > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Spare Parts Total:</span>
                      <span className="font-mono font-semibold text-foreground">
                        {formatCurrency(partsSubtotal)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-muted-foreground pt-1 border-t border-border/40">
                    <span>Subtotal:</span>
                    <span className="font-mono font-semibold text-foreground">
                      {formatCurrency(totalItemsSubtotal)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-muted-foreground">
                    <span>Overall Discount:</span>
                    <div className="flex items-center gap-1 w-28">
                      <span className="text-muted-foreground">-</span>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        value={discountAmount}
                        onChange={(e) =>
                          setDiscountAmount(e.target.value === "" ? "" : Number(e.target.value))
                        }
                        placeholder="0.00"
                        className="h-7 text-right font-mono text-xs px-2"
                      />
                    </div>
                  </div>

                  <div className="flex justify-between text-muted-foreground">
                    <span>UAE VAT (5%):</span>
                    <span className="font-mono font-semibold text-foreground">{formatCurrency(vatAmount)}</span>
                  </div>

                  <div className="flex justify-between items-center text-sm font-bold pt-2 border-t border-border">
                    <span className="text-foreground">Grand Total:</span>
                    <span className="font-mono text-lg text-blue-600 dark:text-blue-400">
                      {formatCurrency(grandTotal)}
                    </span>
                  </div>

                  <div className="flex justify-between text-muted-foreground pt-1">
                    <span>Amount Paid:</span>
                    <span className="font-mono font-bold text-emerald-600">{formatCurrency(paidAmount)}</span>
                  </div>

                  <div className="flex justify-between font-bold pt-1 border-t border-border/40">
                    <span>Balance Due:</span>
                    <span
                      className={`font-mono ${
                        balance > 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-600"
                      }`}
                    >
                      {formatCurrency(balance)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </form>

          {/* Bottom Footer Actions */}
          <DialogFooter className="px-6 py-3.5 border-t border-border bg-slate-50/50 dark:bg-slate-900/50 flex items-center justify-between shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="h-9 text-xs"
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleResetForm}
                className="h-9 text-xs text-muted-foreground hover:text-foreground"
                disabled={isSubmitting}
              >
                Reset Form
              </Button>
              <Button
                type="button"
                onClick={handleFinalizeInvoice}
                disabled={isSubmitting || (selectedServices.length === 0 && selectedParts.length === 0)}
                className="h-9 px-5 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Finalizing Direct Invoice...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" /> Create &amp; Finalize Invoice
                  </>
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── MODAL: MANUAL SERVICE ENTRY ─── */}
      <Dialog open={manualServiceModalOpen} onOpenChange={setManualServiceModalOpen}>
        <DialogContent className="max-w-md p-5 bg-background border border-border shadow-xl rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-bold flex items-center gap-2">
              <Wrench className="h-4 w-4 text-blue-600" /> Add Custom Service Manually
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              Enter ad-hoc workshop service details for this invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2 text-xs">
            <div>
              <Label className="text-[11px] text-muted-foreground">Service Description *</Label>
              <Input
                value={manualDesc}
                onChange={(e) => setManualDesc(e.target.value)}
                placeholder="e.g. AC Gas Leak Diagnosis & Testing"
                className="h-9 text-xs mt-1"
                autoFocus
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[11px] text-muted-foreground">Quantity *</Label>
                <Input
                  type="number"
                  min="1"
                  value={manualQty}
                  onChange={(e) =>
                    setManualQty(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  className="h-9 text-xs font-mono mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Rate (AED) *</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={manualRate}
                  onChange={(e) =>
                    setManualRate(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="150"
                  className="h-9 text-xs font-mono mt-1"
                />
              </div>
              <div>
                <Label className="text-[11px] text-muted-foreground">Discount (AED)</Label>
                <Input
                  type="number"
                  min="0"
                  step="any"
                  value={manualDisc}
                  onChange={(e) =>
                    setManualDisc(e.target.value === "" ? "" : Number(e.target.value))
                  }
                  placeholder="0"
                  className="h-9 text-xs font-mono mt-1"
                />
              </div>
            </div>

            <div className="pt-2 border-t border-border flex items-start gap-2.5">
              <Checkbox
                id="saveToCat"
                checked={manualSaveToCatalog}
                onCheckedChange={(checked) => setManualSaveToCatalog(checked === true)}
                className="mt-0.5"
              />
              <div className="grid gap-0.5 leading-none">
                <label
                  htmlFor="saveToCat"
                  className="text-xs font-semibold cursor-pointer text-foreground"
                >
                  Save to Service Catalog
                </label>
                <p className="text-[10px] text-muted-foreground">
                  Permanently saves this service so it can be reused in future Job Cards &amp; Invoices.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setManualServiceModalOpen(false)}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmAddManualService}
              className="h-8 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white"
            >
              + Add to Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
