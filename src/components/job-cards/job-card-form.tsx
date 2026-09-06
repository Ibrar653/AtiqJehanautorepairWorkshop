"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  createJobCard,
  updateJobCard,
  getJobCardById,
  getNextInvoiceNumberAsync,
  getNextInvoiceNumber,
  isInvoiceNumberAvailable,
} from "@/lib/services/job-card-service";
import {
  getVehiclesByCustomer,
  createVehicle,
  checkDuplicateChassisVin,
  checkDuplicateRegistrationNumber,
} from "@/lib/services/vehicle-service";
import { getServices, createService } from "@/lib/services/service-catalog-service";
import { getParts } from "@/lib/services/parts-service";
import {
  uploadJobCardFile,
  addJobCardAttachment,
  getAttachmentsByJobCard,
} from "@/lib/services/document-service";
import { CustomerSearchSelect } from "@/components/shared/customer-search-select";
import type { CustomerWithMetrics } from "@/lib/services/customer-service";
import type { Service, Vehicle, Part, JobCardStatus, DocumentType, JobCardAttachment } from "@/types/database";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Save,
  ArrowLeft,
  Loader2,
  AlertCircle,
  Wrench,
  Package,
  Car,
  User,
  CheckCircle2,
  Hash,
  Clock,
  Printer,
  Paperclip,
  FileText,
  Image as ImageIcon,
  Sparkles,
  Upload,
} from "lucide-react";
import { formatCurrency, formatAmount } from "@/lib/utils";

export interface ServiceLineItem {
  id: string;
  service_id?: string | null;
  description: string;
  scope_details?: string;
  quantity: number;
  unit_price: number;
  labour_charge: number;
  total_price: number;
  save_to_catalog?: boolean;
}

export interface PartLineItem {
  id: string;
  part_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  cost_price?: number;
  available_stock?: number;
  total_price: number;
}

interface JobCardFormProps {
  jobCardId?: string;
}

export function JobCardForm({ jobCardId }: JobCardFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(!!jobCardId);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Customer & Vehicle state
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithMetrics | null>(null);
  const [customerVehicles, setCustomerVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>("");
  const [loadingVehicles, setLoadingVehicles] = useState(false);

  // Inline Add Vehicle Modal state
  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [vehMake, setVehMake] = useState("");
  const [vehModel, setVehModel] = useState("");
  const [vehYear, setVehYear] = useState("");
  const [vehColor, setVehColor] = useState("");
  const [vehPlate, setVehPlate] = useState("");
  const [vehVin, setVehVin] = useState("");
  const [vehMileage, setVehMileage] = useState("");
  const [vehNotes, setVehNotes] = useState("");
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [duplicateVinVehicle, setDuplicateVinVehicle] = useState<any | null>(null);
  const [duplicatePlateVehicle, setDuplicatePlateVehicle] = useState<any | null>(null);
  const [allowDuplicatePlate, setAllowDuplicatePlate] = useState(false);
  const [checkingVin, setCheckingVin] = useState(false);
  const [checkingPlate, setCheckingPlate] = useState(false);

  // Debounced check for duplicate Chassis/VIN
  useEffect(() => {
    if (!vehVin.trim() || vehVin.trim().length < 5 || !addVehicleOpen) {
      setDuplicateVinVehicle(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingVin(true);
      try {
        const dup = await checkDuplicateChassisVin(vehVin.trim());
        setDuplicateVinVehicle(dup);
      } catch (e) {
        console.error("VIN check error:", e);
      } finally {
        setCheckingVin(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [vehVin, addVehicleOpen]);

  // Debounced check for duplicate Plate/Registration Number
  useEffect(() => {
    if (!vehPlate.trim() || vehPlate.trim().length < 2 || !addVehicleOpen) {
      setDuplicatePlateVehicle(null);
      return;
    }

    const timer = setTimeout(async () => {
      setCheckingPlate(true);
      try {
        const dup = await checkDuplicateRegistrationNumber(vehPlate.trim());
        setDuplicatePlateVehicle(dup);
      } catch (e) {
        console.error("Plate check error:", e);
      } finally {
        setCheckingPlate(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [vehPlate, addVehicleOpen]);

  // Job Card Main Fields
  const [jobCardNumber, setJobCardNumber] = useState<string>("");
  const [invoiceNumberMode, setInvoiceNumberMode] = useState<"auto" | "manual">("auto");
  const [invoiceNumber, setInvoiceNumber] = useState<string>("");
  const [nextAutoInvoiceNumber, setNextAutoInvoiceNumber] = useState<number>(1060);
  const [invoiceNumberError, setInvoiceNumberError] = useState<string | null>(null);
  const [checkingInvoiceNum, setCheckingInvoiceNum] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mileageIn, setMileageIn] = useState<string>("");
  const [customerComplaint, setCustomerComplaint] = useState("");
  const [workDetails, setWorkDetails] = useState("");
  const [assignedMechanic, setAssignedMechanic] = useState("");
  const [status, setStatus] = useState<JobCardStatus>("new");
  const [paymentStatus, setPaymentStatus] = useState<string>("Pending");
  const [notes, setNotes] = useState("");

  // Attachments State
  const [attachmentsList, setAttachmentsList] = useState<{
    id: string;
    file: File;
    document_type: DocumentType;
    description: string;
  }[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<JobCardAttachment[]>([]);
  const [printAfterSave, setPrintAfterSave] = useState(false);

  // Catalogs
  const [serviceCatalog, setServiceCatalog] = useState<Service[]>([]);
  const [partsCatalog, setPartsCatalog] = useState<Part[]>([]);

  // Line items
  const [serviceItems, setServiceItems] = useState<ServiceLineItem[]>([
    {
      id: "srv-init-1",
      description: "Periodic Engine Oil & Filter Change",
      scope_details: "Drain engine oil, replace OEM oil filter, top up 5W-40 full synthetic.",
      quantity: 1,
      unit_price: 250,
      labour_charge: 50,
      total_price: 300,
      save_to_catalog: false,
    },
  ]);
  const [partItems, setPartItems] = useState<PartLineItem[]>([]);

  // Financial Calculations State
  const [discount, setDiscount] = useState<string>("0");
  const [vatRate, setVatRate] = useState<string>("5");

  // Inline Add Service Modal
  const [newServiceModalOpen, setNewServiceModalOpen] = useState(false);
  const [newSrvName, setNewSrvName] = useState("");
  const [newSrvCode, setNewSrvCode] = useState("");
  const [newSrvCategory, setNewSrvCategory] = useState("General Maintenance");
  const [newSrvPrice, setNewSrvPrice] = useState("");
  const [newSrvDesc, setNewSrvDesc] = useState("");
  const [savingNewSrv, setSavingNewSrv] = useState(false);

  // Grouped services by category for clean dropdown selection
  const groupedServices = useMemo(() => {
    const map: Record<string, Service[]> = {};
    serviceCatalog.forEach((s) => {
      const cat = s.category || "General Maintenance";
      if (!map[cat]) map[cat] = [];
      map[cat].push(s);
    });
    return map;
  }, [serviceCatalog]);

  // Fetch next sequential invoice number on create
  useEffect(() => {
    if (!jobCardId) {
      getNextInvoiceNumberAsync()
        .then((num) => setNextAutoInvoiceNumber(num))
        .catch(console.error);
    }
  }, [jobCardId]);

  // Debounced check for manual Invoice Number uniqueness
  useEffect(() => {
    if (invoiceNumberMode !== "manual" || !invoiceNumber.trim()) {
      setInvoiceNumberError(null);
      return;
    }
    const num = Number(invoiceNumber.trim());
    if (isNaN(num) || num <= 0) {
      setInvoiceNumberError("Please enter a valid numeric invoice number.");
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingInvoiceNum(true);
      try {
        const available = await isInvoiceNumberAvailable(num, jobCardId);
        if (!available) {
          setInvoiceNumberError("This Invoice Number already exists.");
        } else {
          setInvoiceNumberError(null);
        }
      } catch (e) {
        console.error("Invoice number check error:", e);
      } finally {
        setCheckingInvoiceNum(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [invoiceNumber, invoiceNumberMode, jobCardId]);

  // Load Catalogs on Mount
  useEffect(() => {
    getServices(true).then(setServiceCatalog).catch(console.error);
    getParts("all", "", 1, 100)
      .then((res) => setPartsCatalog(res.parts))
      .catch(console.error);
  }, []);

  const targetVehicleIdRef = useRef<string | null>(null);
  const initialPartsAllocatedRef = useRef<Map<string, number>>(new Map());

  // Pre-fill query params for customer_id and vehicle_id if passed
  useEffect(() => {
    const initVehId = searchParams.get("vehicle_id");
    if (initVehId) {
      targetVehicleIdRef.current = initVehId;
      setSelectedVehicleId(initVehId);
    }
  }, [searchParams]);

  // Load Customer Vehicles when customer changes
  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerVehicles([]);
      setSelectedVehicleId("");
      return;
    }

    setLoadingVehicles(true);
    getVehiclesByCustomer(selectedCustomer.id)
      .then((vehList) => {
        setCustomerVehicles(vehList);
        const wantedId = targetVehicleIdRef.current || selectedVehicleId || searchParams.get("vehicle_id");
        if (wantedId && vehList.some((v) => v.id === wantedId)) {
          setSelectedVehicleId(wantedId);
          const v = vehList.find((x) => x.id === wantedId);
          if (v?.mileage && !mileageIn) setMileageIn(v.mileage.toString());
        } else if (vehList.length > 0 && !selectedVehicleId) {
          setSelectedVehicleId(vehList[0].id);
          if (vehList[0].mileage && !mileageIn) {
            setMileageIn(vehList[0].mileage.toString());
          }
        }
      })
      .catch(console.error)
      .finally(() => {
        setLoadingVehicles(false);
      });
  }, [selectedCustomer]);

  // Load Existing Job Card for Edit
  useEffect(() => {
    if (!jobCardId) return;

    setLoading(true);
    getJobCardById(jobCardId)
      .then((jc) => {
        if (!jc) {
          setFormError("Job Card not found.");
          return;
        }

        setJobCardNumber(jc.job_card_number);
        if (jc.invoice_number) {
          setInvoiceNumber(String(jc.invoice_number));
        }
        setInvoiceNumberMode((jc as any).invoice_number_mode || (jc.invoice_number ? "manual" : "auto"));
        if (jc.vat_rate !== undefined && jc.vat_rate !== null) {
          setVatRate(String(jc.vat_rate));
        }
        setDate(jc.date || new Date().toISOString().slice(0, 10));
        targetVehicleIdRef.current = jc.vehicle_id;
        setSelectedCustomer(jc.customer as any);
        setSelectedVehicleId(jc.vehicle_id);
        setMileageIn(jc.mileage_in ? jc.mileage_in.toString() : "");
        setCustomerComplaint(jc.customer_complaint || "");
        setWorkDetails(jc.work_details || "");
        setAssignedMechanic(jc.assigned_mechanic || "");
        setStatus(jc.status);
        setPaymentStatus((jc as any).payment_status || "Pending");
        setNotes(jc.notes || "");
        setDiscount(jc.discount !== undefined ? jc.discount.toString() : "0");

        // Load attachments if any
        getAttachmentsByJobCard(jobCardId).then(setExistingAttachments).catch(console.error);

        // Parse items
        if (jc.items && jc.items.length > 0) {
          const srvs: ServiceLineItem[] = [];
          const prts: PartLineItem[] = [];
          const initAllocMap = new Map<string, number>();

          jc.items.forEach((it) => {
            if (it.item_type === "service") {
              const qty = Number(it.quantity) || 1;
              const unitPrice = Number(it.unit_price) || 0;
              const total = Number(it.total_price) || (qty * unitPrice);
              const labour = it.labour_charge !== undefined
                ? Number(it.labour_charge)
                : Math.max(0, Math.round((total - (qty * unitPrice)) * 100) / 100);

              srvs.push({
                id: it.id,
                service_id: it.service_id,
                description: it.description,
                scope_details: it.description,
                quantity: qty,
                unit_price: unitPrice,
                labour_charge: labour,
                total_price: total,
                save_to_catalog: false,
              });
            } else if (it.item_type === "part") {
              const qty = Number(it.quantity) || 1;
              const unitPrice = Number(it.unit_price) || 0;
              const costPrice = Number(it.cost_price) || 0;
              if (it.part_id) {
                const prev = initAllocMap.get(it.part_id) || 0;
                initAllocMap.set(it.part_id, prev + qty);
              }
              prts.push({
                id: it.id,
                part_id: it.part_id,
                description: it.description,
                quantity: qty,
                unit_price: unitPrice,
                cost_price: costPrice,
                total_price: Number(it.total_price) || (qty * unitPrice),
              });
            }
          });

          initialPartsAllocatedRef.current = initAllocMap;
          if (srvs.length > 0) setServiceItems(srvs);
          setPartItems(prts);
        }
      })
      .catch((err) => setFormError(err.message))
      .finally(() => setLoading(false));
  }, [jobCardId]);

  // Handle selected vehicle details
  const activeVehicle = customerVehicles.find((v) => v.id === selectedVehicleId);

  // When active vehicle changes, auto-fill mileage if mileageIn is empty
  const handleVehicleChange = (vehId: string) => {
    setSelectedVehicleId(vehId);
    const found = customerVehicles.find((v) => v.id === vehId);
    if (found?.mileage) {
      setMileageIn(found.mileage.toString());
    }
  };

  // Dynamic Financial Calculations
  const serviceTotal = serviceItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  );
  const labourTotal = serviceItems.reduce(
    (sum, item) => sum + (Number(item.labour_charge) || 0),
    0
  );
  const partsTotal = partItems.reduce(
    (sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_price) || 0),
    0
  );

  const subtotal = Math.round((serviceTotal + labourTotal + partsTotal) * 100) / 100;
  const numDiscount = Math.max(0, parseFloat(discount) || 0);
  const taxableAmount = Math.max(0, subtotal - numDiscount);
  const numVatRate = Math.max(0, parseFloat(vatRate) || 0);
  const vatAmount = Math.round(taxableAmount * numVatRate) / 100;
  const grandTotal = Math.round((taxableAmount + vatAmount) * 100) / 100;

  // Job / Service Line Management
  const addJobLine = () => {
    setServiceItems([
      ...serviceItems,
      {
        id: "job-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        service_id: null,
        description: "",
        scope_details: "",
        quantity: 1,
        unit_price: 150,
        labour_charge: 0,
        total_price: 150,
        save_to_catalog: false,
      },
    ]);
  };

  const addPredefinedServiceLine = () => {
    setServiceItems([
      ...serviceItems,
      {
        id: "srv-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        service_id: serviceCatalog.length > 0 ? serviceCatalog[0].id : null,
        description: serviceCatalog.length > 0 ? serviceCatalog[0].name : "",
        scope_details: "",
        quantity: 1,
        unit_price: serviceCatalog.length > 0 ? serviceCatalog[0].default_price : 100,
        labour_charge: 0,
        total_price: serviceCatalog.length > 0 ? serviceCatalog[0].default_price : 100,
        save_to_catalog: false,
      },
    ]);
  };

  const removeServiceLine = (id: string) => {
    setServiceItems(serviceItems.filter((it) => it.id !== id));
  };

  const updateServiceLine = (id: string, field: keyof ServiceLineItem, value: any) => {
    setServiceItems(
      serviceItems.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };

        if (field === "service_id") {
          if (value) {
            const cat = serviceCatalog.find((s) => s.id === value);
            if (cat) {
              updated.description = cat.name;
              updated.scope_details = cat.description || "";
              updated.unit_price = cat.default_price;
            }
          }
        }

        const q = Number(updated.quantity) || 0;
        const p = Number(updated.unit_price) || 0;
        const l = Number(updated.labour_charge) || 0;
        updated.total_price = Math.round((q * p + l) * 100) / 100;

        return updated;
      })
    );
  };

  // Attachment Management
  const handleAttachmentAdd = (e: React.ChangeEvent<HTMLInputElement>, docType: DocumentType = "vehicle_photo") => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newEntries = Array.from(files).map((f) => ({
      id: "att-pending-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
      file: f,
      document_type: docType,
      description: "",
    }));

    setAttachmentsList((prev) => [...prev, ...newEntries]);
    e.target.value = "";
  };

  const handleAttachmentRemove = (id: string) => {
    setAttachmentsList((prev) => prev.filter((a) => a.id !== id));
  };

  // Spare Parts Line Management
  const addPartLine = () => {
    setPartItems([
      ...partItems,
      {
        id: "prt-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        description: "",
        quantity: 1,
        unit_price: 50,
        total_price: 50,
      },
    ]);
  };

  const removePartLine = (id: string) => {
    setPartItems(partItems.filter((it) => it.id !== id));
  };

  const updatePartLine = (id: string, field: keyof PartLineItem, value: any) => {
    setPartItems(
      partItems.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item, [field]: value };

        if (field === "part_id") {
          if (value) {
            const cat = partsCatalog.find((p) => p.id === value);
            if (cat) {
              updated.description = cat.part_number ? `${cat.name} (Part #${cat.part_number})` : cat.name;
              updated.unit_price = cat.selling_price;
              updated.cost_price = cat.purchase_price;
              updated.available_stock = cat.current_stock;
            }
          } else {
            updated.available_stock = undefined;
            updated.cost_price = 0;
          }
        }

        const q = Number(updated.quantity) || 0;
        const p = Number(updated.unit_price) || 0;
        updated.total_price = Math.round(q * p * 100) / 100;
        return updated;
      })
    );
  };

  const openAddVehicleModal = () => {
    setVehMake("");
    setVehModel("");
    setVehYear(new Date().getFullYear().toString());
    setVehColor("");
    setVehPlate("");
    setVehVin("");
    setVehMileage(mileageIn || "");
    setVehNotes("");
    setVehicleError(null);
    setDuplicateVinVehicle(null);
    setDuplicatePlateVehicle(null);
    setAllowDuplicatePlate(false);
    setAddVehicleOpen(true);
  };

  // Inline Quick Save Vehicle
  const handleSaveInlineVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) {
      setVehicleError("Please select a customer owner first.");
      return;
    }
    if (!vehMake.trim() || !vehModel.trim()) {
      setVehicleError("Vehicle Make and Model are required.");
      return;
    }

    // 1. Strict Duplicate Chassis / VIN Check
    if (vehVin.trim()) {
      setCheckingVin(true);
      const dupVin = await checkDuplicateChassisVin(vehVin.trim());
      setCheckingVin(false);
      if (dupVin) {
        setDuplicateVinVehicle(dupVin);
        setVehicleError(
          `Chassis / VIN "${vehVin.trim()}" already exists for vehicle "${dupVin.make} ${dupVin.model}" (Plate: ${dupVin.registration_number || "N/A"}). Chassis / VIN numbers must be unique.`
        );
        return;
      }
    }

    // 2. Duplicate Registration Plate Warning
    if (vehPlate.trim() && !allowDuplicatePlate) {
      setCheckingPlate(true);
      const dupPlate = await checkDuplicateRegistrationNumber(vehPlate.trim());
      setCheckingPlate(false);
      if (dupPlate) {
        setDuplicatePlateVehicle(dupPlate);
        return; // Pause to let user review warning and confirm
      }
    }

    setSavingVehicle(true);
    setVehicleError(null);

    try {
      const created = await createVehicle({
        customer_id: selectedCustomer.id,
        make: vehMake.trim(),
        model: vehModel.trim(),
        year: vehYear ? parseInt(vehYear) : null,
        color: vehColor.trim() || null,
        registration_number: vehPlate.trim() || null,
        chassis_vin: vehVin.trim() || null,
        mileage: vehMileage ? parseInt(vehMileage) : null,
        notes: vehNotes.trim() || null,
      });

      // Update customer vehicles state and select the new vehicle
      setCustomerVehicles((prev) => [created, ...prev.filter((v) => v.id !== created.id)]);
      setSelectedVehicleId(created.id);
      if (created.mileage && !mileageIn) {
        setMileageIn(created.mileage.toString());
      }
      setAddVehicleOpen(false);
      setDuplicateVinVehicle(null);
      setDuplicatePlateVehicle(null);
      setAllowDuplicatePlate(false);

      // Reset form
      setVehMake("");
      setVehModel("");
      setVehYear("");
      setVehColor("");
      setVehPlate("");
      setVehVin("");
      setVehMileage("");
      setVehNotes("");
    } catch (err: any) {
      setVehicleError(err.message || "Failed to register vehicle");
    } finally {
      setSavingVehicle(false);
    }
  };

  // Save new service to catalog inline
  const handleSaveInlineService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSrvName.trim()) return;
    setSavingNewSrv(true);
    try {
      const created = await createService({
        name: newSrvName.trim(),
        service_code: newSrvCode.trim() || null,
        category: newSrvCategory.trim() || "General Maintenance",
        description: newSrvDesc.trim() || null,
        default_price: parseFloat(newSrvPrice) || 0,
        is_active: true,
      });

      setServiceCatalog([created, ...serviceCatalog]);
      // Add directly to service items
      setServiceItems([
        ...serviceItems,
        {
          id: "srv-" + Date.now(),
          service_id: created.id,
          description: created.name,
          scope_details: created.description || "",
          quantity: 1,
          unit_price: created.default_price,
          labour_charge: 0,
          total_price: created.default_price,
        },
      ]);
      setNewServiceModalOpen(false);
      setNewSrvName("");
      setNewSrvCode("");
      setNewSrvCategory("General Maintenance");
      setNewSrvPrice("");
      setNewSrvDesc("");
    } catch (err: any) {
      alert(err.message || "Failed to create service");
    } finally {
      setSavingNewSrv(false);
    }
  };

  // Submit Job Card Form
  const handleSubmit = async (e: React.FormEvent, shouldPrint = false) => {
    e.preventDefault();

    if (!selectedCustomer) {
      setFormError("Please search and select a customer owner.");
      return;
    }

    if (!selectedVehicleId) {
      setFormError("Please select a vehicle for this customer.");
      return;
    }

    if (serviceItems.length === 0 && partItems.length === 0) {
      setFormError("Please add at least one service or spare part line to the job card.");
      return;
    }

    // Validate inventory stock availability
    for (const p of partItems) {
      if (p.part_id) {
        const cat = partsCatalog.find((x) => x.id === p.part_id);
        if (cat) {
          const currentlyInStock = Number(cat.current_stock) || 0;
          const alreadyAllocated = initialPartsAllocatedRef.current.get(p.part_id) || 0;
          const maxAllowed = currentlyInStock + alreadyAllocated;
          const reqQty = Number(p.quantity) || 1;
          if (reqQty > maxAllowed) {
            setFormError(
              `Insufficient stock for "${p.description || cat.name}". Only ${currentlyInStock} units are available.`
            );
            return;
          }
        }
      }
    }

    setSaving(true);
    setFormError(null);

    // Auto-save manual services marked with "save_to_catalog"
    for (const s of serviceItems) {
      if (s.save_to_catalog && !s.service_id && s.description.trim()) {
        try {
          await createService({
            name: s.description.trim(),
            description: s.scope_details?.trim() || null,
            default_price: Number(s.unit_price) || 0,
            is_active: true,
          });
        } catch (catErr) {
          console.warn("Auto-saving manual service to catalog note:", catErr);
        }
      }
    }

    // Manual Invoice Number validation
    if (invoiceNumberMode === "manual") {
      const cleanNum = invoiceNumber.trim();
      if (!cleanNum) {
        setFormError("Please enter an Invoice Number or switch to Auto mode.");
        setSaving(false);
        return;
      }
      const numVal = parseInt(cleanNum, 10);
      if (isNaN(numVal) || numVal <= 0) {
        setFormError("Invoice number must be a valid positive integer.");
        setSaving(false);
        return;
      }
      try {
        const available = await isInvoiceNumberAvailable(numVal, jobCardId);
        if (!available) {
          setFormError(`Invoice Number ${numVal} is already in use. Please choose another.`);
          setSaving(false);
          return;
        }
      } catch (err: any) {
        console.warn("Invoice number availability check note:", err);
      }
    }

    const payload: any = {
      customer_id: selectedCustomer.id,
      vehicle_id: selectedVehicleId,
      invoice_number_mode: invoiceNumberMode,
      invoice_number: invoiceNumberMode === "manual" && invoiceNumber.trim() ? parseInt(invoiceNumber.trim(), 10) : undefined,
      date,
      mileage_in: mileageIn ? parseInt(mileageIn, 10) : null,
      customer_complaint: customerComplaint.trim() || null,
      work_details: workDetails.trim() || null,
      assigned_mechanic: assignedMechanic.trim() || null,
      status,
      payment_status: paymentStatus,
      notes: notes.trim() || null,
      subtotal,
      discount: numDiscount,
      vat_rate: numVatRate,
      vat_amount: vatAmount,
      total: grandTotal,
      paid: 0,
      balance: grandTotal,
    };

    // Combine service & part items
    const allItems: any[] = [
      ...serviceItems.map((s) => ({
        item_type: "service" as const,
        service_id: s.service_id || null,
        description: s.scope_details && s.scope_details !== s.description
          ? `${s.description.trim()} — ${s.scope_details.trim()}`
          : s.description.trim() || "Service",
        quantity: Number(s.quantity) || 1,
        unit_price: Number(s.unit_price) || 0,
        labour_charge: Number(s.labour_charge) || 0,
        total_price: s.total_price,
      })),
      ...partItems.map((p) => ({
        item_type: "part" as const,
        part_id: p.part_id || null,
        description: p.description.trim() || "Spare Part",
        quantity: Number(p.quantity) || 1,
        unit_price: Number(p.unit_price) || 0,
        cost_price: p.cost_price !== undefined ? Number(p.cost_price) : undefined,
        total_price: p.total_price,
      })),
    ];

    try {
      let targetJcId = jobCardId;

      if (jobCardId) {
        const updated = await updateJobCard(jobCardId, payload, allItems);
        targetJcId = updated?.id || jobCardId;
      } else {
        const created = await createJobCard(payload, allItems);
        targetJcId = created?.id;
      }

      // Upload any new attachments
      if (targetJcId && attachmentsList.length > 0) {
        for (const att of attachmentsList) {
          try {
            const uploaded = await uploadJobCardFile(att.file, "job-card-attachments");
            await addJobCardAttachment(targetJcId, {
              document_type: att.document_type,
              file_url: uploaded.fileUrl,
              file_name: uploaded.fileName,
              file_type: uploaded.fileType,
              file_size: uploaded.fileSize,
              description: att.description || null,
            });
          } catch (attErr) {
            console.error("Failed to upload attachment:", attErr);
          }
        }
      }

      if (targetJcId) {
        if (shouldPrint) {
          router.push(`/job-cards/${targetJcId}?print=true`);
        } else {
          router.push(`/job-cards/${targetJcId}`);
        }
      } else {
        router.push("/job-cards");
      }
    } catch (err: any) {
      setFormError(err.message || "Failed to save job card");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
        <p>Loading job card details...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <PageHeader
        title={jobCardId ? `Edit Job Card ${jobCardNumber ? `(${jobCardNumber})` : ""}` : "Create New Job Card"}
        description={
          jobCardId
            ? "Modify job card parameters, services, parts, and labour charges"
            : "Open a new workshop repair order and service sheet for a customer vehicle"
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Job Cards", href: "/job-cards" },
          { label: jobCardId ? "Edit Job Card" : "New Job Card" },
        ]}
        actions={
          <Button variant="outline" render={<Link href={jobCardId ? `/job-cards/${jobCardId}` : "/job-cards"} />}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Cancel
          </Button>
        }
      />

      {formError && (
        <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-sm text-destructive flex items-center gap-2">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Step 1: Customer & Vehicle Selection */}
        <Card className="rounded-xl border border-border/80 shadow-xs bg-card overflow-visible relative z-20">
          <CardHeader className="py-3.5 px-6 border-b border-border bg-muted/30">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <User className="h-4 w-4 text-primary" /> 1. Customer &amp; Vehicle Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 pt-4 overflow-visible">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 overflow-visible">
              {/* Unified Customer & Vehicle Search Component */}
              <CustomerSearchSelect
                selectedCustomerId={selectedCustomer?.id}
                selectedVehicleId={selectedVehicleId}
                onSelectCustomer={(c, v) => {
                  setSelectedCustomer(c);
                  if (v) {
                    setSelectedVehicleId(v.id);
                    if (v.mileage && !mileageIn) {
                      setMileageIn(v.mileage.toString());
                    }
                  }
                }}
              />

              {/* Vehicle Selection Dropdown */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>
                    Vehicle <span className="text-destructive">*</span>
                  </Label>
                  {selectedCustomer && (
                    <button
                      type="button"
                      onClick={openAddVehicleModal}
                      className="text-xs text-primary font-medium hover:underline flex items-center gap-1 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add New Vehicle
                    </button>
                  )}
                </div>

                {selectedCustomer ? (
                  loadingVehicles ? (
                    <div className="h-10 flex items-center gap-2 text-xs text-muted-foreground px-3 border rounded-lg bg-muted/20">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Loading customer vehicles...
                    </div>
                  ) : customerVehicles.length > 0 ? (
                    <select
                      value={selectedVehicleId}
                      onChange={(e) => handleVehicleChange(e.target.value)}
                      className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                      required
                    >
                      <option value="">Select one of {selectedCustomer.name}'s vehicles...</option>
                      {customerVehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.make} {v.model} {v.year ? `(${v.year})` : ""} — Plate: {v.registration_number || "No Plate"} | VIN: {v.chassis_vin || "N/A"}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center justify-between">
                      <span>No vehicles registered for <span className="font-semibold">{selectedCustomer.name}</span> yet.</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={openAddVehicleModal}
                        className="h-7 text-xs bg-background hover:bg-muted"
                      >
                        <Plus className="mr-1 h-3 w-3" /> Register First Vehicle
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="h-10 flex items-center text-xs text-muted-foreground px-3 border rounded-lg bg-muted/30">
                    Search and select a customer owner first
                  </div>
                )}
              </div>
            </div>

            {/* Selected Customer Information & TRN Card */}
            {selectedCustomer && (
              <div className="p-4 rounded-xl border bg-muted/40 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Customer Name
                  </span>
                  <p className="font-bold text-sm text-foreground mt-0.5">{selectedCustomer.name}</p>
                  {selectedCustomer.company_name && (
                    <p className="text-muted-foreground text-[11px] font-medium">{selectedCustomer.company_name}</p>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Phone / Contact
                  </span>
                  <p className="font-mono font-semibold text-foreground mt-0.5">
                    {selectedCustomer.mobile || "Not provided"}
                  </p>
                  {selectedCustomer.email && (
                    <p className="text-muted-foreground text-[11px] truncate">{selectedCustomer.email}</p>
                  )}
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Company / Customer TRN No.
                  </span>
                  <p className="mt-0.5">
                    {selectedCustomer.trn_number ? (
                      <span className="font-mono font-bold text-blue-700 bg-blue-50 dark:bg-blue-950/50 dark:text-blue-300 px-2 py-0.5 rounded border border-blue-200 dark:border-blue-800 inline-block text-xs">
                        TRN: {selectedCustomer.trn_number}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs italic">N/A (No TRN)</span>
                    )}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Customer Address
                  </span>
                  <p className="font-medium text-foreground mt-0.5 truncate">
                    {selectedCustomer.address || "No address on file"}
                  </p>
                </div>
              </div>
            )}

            {/* Selected Vehicle Information Specification Card */}
            {activeVehicle && (
              <div className="p-4 rounded-xl border bg-muted/40 grid grid-cols-2 md:grid-cols-6 gap-4 text-xs">
                <div className="md:col-span-2">
                  <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Vehicle
                  </span>
                  <p className="font-bold text-sm text-foreground mt-0.5">
                    {activeVehicle.make} {activeVehicle.model}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Year
                  </span>
                  <p className="font-bold text-sm text-foreground mt-0.5 font-mono">
                    {activeVehicle.year || "N/A"}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Color
                  </span>
                  <p className="font-bold text-sm text-foreground mt-0.5">
                    {activeVehicle.color || "N/A"}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Registration No
                  </span>
                  <p className="font-bold text-sm text-primary mt-0.5 font-mono">
                    {activeVehicle.registration_number || "N/A"}
                  </p>
                </div>
                <div>
                  <span className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wider">
                    Chassis / VIN
                  </span>
                  <p className="font-mono font-semibold text-foreground mt-0.5 break-all">
                    {activeVehicle.chassis_vin || "N/A"}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 2: Job Card Details & Assignment */}
        <Card className="rounded-xl border border-border/80 shadow-xs bg-card">
          <CardHeader className="py-3.5 px-6 border-b border-border bg-muted/30">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Wrench className="h-4 w-4 text-primary" /> 2. Job Card Details &amp; Mechanic Assignment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            {/* Invoice Number Mode Selection (Automatic / Manual) */}
            <div className="p-4 rounded-xl border bg-primary/5 border-primary/20 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <Label className="text-xs font-bold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Hash className="h-4 w-4 text-primary" /> Invoice Number Mode
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Choose whether to generate sequential invoice numbers or enter a custom invoice number.
                  </p>
                </div>
                {!jobCardId ? (
                  <div className="flex items-center gap-4 bg-background p-1.5 rounded-lg border shadow-sm">
                    <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-foreground">
                      <input
                        type="radio"
                        name="inv-mode"
                        checked={invoiceNumberMode === "auto"}
                        onChange={() => {
                          setInvoiceNumberMode("auto");
                          setInvoiceNumberError(null);
                        }}
                        className="text-primary"
                      />
                      <span>(•) Automatic</span>
                    </label>
                    <label className="flex items-center gap-1.5 text-xs font-semibold cursor-pointer text-foreground">
                      <input
                        type="radio"
                        name="inv-mode"
                        checked={invoiceNumberMode === "manual"}
                        onChange={() => setInvoiceNumberMode("manual")}
                        className="text-primary"
                      />
                      <span>( ) Manual</span>
                    </label>
                  </div>
                ) : (
                  <div className="text-xs font-mono font-bold bg-muted px-2.5 py-1 rounded border text-black dark:text-white">
                    Invoice No: <span className="text-black dark:text-white font-black">{invoiceNumber || "Auto-assigned"}</span>
                  </div>
                )}
              </div>

              {invoiceNumberMode === "auto" && !jobCardId && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 bg-background/60 p-2.5 rounded-lg border border-border/50">
                  <span className="font-semibold text-foreground">Next Sequential Invoice Number:</span>
                  <span className="font-mono font-bold text-black dark:text-white bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700">
                    {nextAutoInvoiceNumber}
                  </span>
                  <span className="text-[11px] italic text-muted-foreground">(Starts from 1060 and skips manual numbers)</span>
                </div>
              )}

              {invoiceNumberMode === "manual" && !jobCardId && (
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center gap-3">
                    <div className="relative max-w-xs flex-1">
                      <Input
                        type="number"
                        placeholder="e.g. 1450"
                        value={invoiceNumber}
                        onChange={(e) => setInvoiceNumber(e.target.value)}
                        className={`h-9 font-mono font-bold text-sm bg-background ${
                          invoiceNumberError ? "border-destructive focus-visible:ring-destructive" : ""
                        }`}
                      />
                      {checkingInvoiceNum && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-primary" />
                      )}
                    </div>
                    {invoiceNumber && !checkingInvoiceNum && !invoiceNumberError && (
                      <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-4 w-4" /> Available
                      </span>
                    )}
                  </div>
                  {invoiceNumberError && (
                    <p className="text-xs text-destructive font-medium flex items-center gap-1 mt-1">
                      <AlertCircle className="h-3.5 w-3.5 shrink-0" /> {invoiceNumberError}
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jc-date">Order Date <span className="text-destructive">*</span></Label>
                <Input id="jc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="jc-mileage">Current Mileage (KM)</Label>
                <Input
                  id="jc-mileage"
                  type="number"
                  placeholder={activeVehicle?.mileage ? activeVehicle.mileage.toString() : "e.g. 55000"}
                  value={mileageIn}
                  onChange={(e) => setMileageIn(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="jc-mechanic">Assigned Mechanic / Tech</Label>
                <Input
                  id="jc-mechanic"
                  placeholder="e.g. Mohammed Imran"
                  value={assignedMechanic}
                  onChange={(e) => setAssignedMechanic(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="jc-status">Job Status</Label>
                <select
                  id="jc-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as JobCardStatus)}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                >
                  <option value="new">New</option>
                  <option value="in_progress">In Progress</option>
                  <option value="waiting">Waiting (Parts / Approval)</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="jc-payment-status">Payment Status</Label>
                <select
                  id="jc-payment-status"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring font-medium"
                >
                  <option value="Pending">Pending</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Credit Card">Credit Card</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="jc-complaint">Customer Complaint / Reported Issue</Label>
                <Textarea
                  id="jc-complaint"
                  placeholder="e.g. Engine noise during acceleration, AC blowing warm air, brake squeal..."
                  rows={3}
                  value={customerComplaint}
                  onChange={(e) => setCustomerComplaint(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="jc-notes">Workshop Notes & Observations</Label>
                <Textarea
                  id="jc-notes"
                  placeholder="Internal inspection notes, recommendations, supervisor comments..."
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {/* Free-Text Work Details / Technician Notes */}
            <div className="space-y-2 pt-2 border-t">
              <Label htmlFor="jc-work-details" className="text-sm font-bold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-primary" /> Work Details / Technician Notes
              </Label>
              <Textarea
                id="jc-work-details"
                placeholder="Enter complete technician findings, diagnostic results, and step-by-step repair details (e.g. Checked front suspension. Left lower arm bush damaged. Replaced bush, checked alignment and road tested vehicle.)"
                rows={4}
                value={workDetails}
                onChange={(e) => setWorkDetails(e.target.value)}
                className="font-mono text-xs leading-relaxed"
              />
              <p className="text-[11px] text-muted-foreground">
                This detailed repair summary is unconstrained and will be printed cleanly on the official A4 Job Card sheet.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Step 3: Job / Services Table */}
        <Card className="rounded-xl border border-border/80 shadow-xs bg-card overflow-hidden">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 py-3.5 px-6 border-b border-border bg-muted/30">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Wrench className="h-4 w-4 text-primary" /> 3. Job / Service Table ({serviceItems.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Add repair jobs, labor operations, and services. Up to 9 rows will fit cleanly onto a single A4 print sheet.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setNewServiceModalOpen(true)}>
                + Add to Catalog
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={addPredefinedServiceLine}>
                + Select Saved Service
              </Button>
              <Button type="button" size="sm" onClick={addJobLine} className="bg-primary hover:bg-primary/90 shadow-sm font-medium">
                <Plus className="mr-1 h-3.5 w-3.5" /> + Manual Job
              </Button>
            </div>
          </CardHeader>

          {/* One-Page Print Safety Warning */}
          {serviceItems.length + partItems.length > 9 && (
            <div className="m-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span className="font-medium">
                This Job Card contains too much content for a readable single-page A4 print.
              </span>
            </div>
          )}

          <CardContent className="p-0">
            {serviceItems.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[5%] text-center">S.No</TableHead>
                      <TableHead className="w-[28%]">Job / Service Title</TableHead>
                      <TableHead className="w-[32%]">Detailed Description / Scope</TableHead>
                      <TableHead className="w-[12%]">Unit Price</TableHead>
                      <TableHead className="w-[13%] text-right">Amount</TableHead>
                      <TableHead className="w-[10%] text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serviceItems.map((item, idx) => (
                      <TableRow key={item.id} className="align-top">
                        <TableCell className="text-center font-bold text-muted-foreground pt-3">
                          {idx + 1}
                        </TableCell>
                        <TableCell className="space-y-1.5">
                          <Input
                            placeholder="e.g. Front Suspension Repair"
                            value={item.description}
                            onChange={(e) => updateServiceLine(item.id, "description", e.target.value)}
                            className="h-8 text-xs font-semibold"
                            required
                          />
                          <div className="flex items-center gap-2">
                            <select
                              value={item.service_id || ""}
                              onChange={(e) => updateServiceLine(item.id, "service_id", e.target.value)}
                              className="flex h-7 w-full rounded border border-input bg-muted/40 px-2 py-0.5 text-[11px] shadow-sm font-medium"
                            >
                              <option value="">Manual Entry (Custom Job)</option>
                              {(Object.entries(groupedServices) as [string, Service[]][]).map(([category, items]) => (
                                <optgroup key={category} label={category}>
                                  {items.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.service_code ? `[${s.service_code}] ` : ""}{s.name} ({formatAmount(s.default_price)})
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Textarea
                            placeholder="e.g. Replace front lower arm bush, inspect suspension and road test vehicle."
                            value={item.scope_details || ""}
                            onChange={(e) => updateServiceLine(item.id, "scope_details", e.target.value)}
                            rows={2}
                            className="text-xs resize-none"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateServiceLine(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                            className="h-8 text-xs font-mono"
                          />
                        </TableCell>
                        <TableCell className="text-right font-bold text-foreground text-sm pt-3 font-mono">
                          {formatAmount(item.total_price)}
                        </TableCell>
                        <TableCell className="text-center pt-2 space-y-1.5">
                          {!item.service_id && (
                            <label
                              className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground cursor-pointer hover:text-foreground"
                              title="Save this job/service to services catalog for future use"
                            >
                              <input
                                type="checkbox"
                                checked={!!item.save_to_catalog}
                                onChange={(e) => updateServiceLine(item.id, "save_to_catalog", e.target.checked)}
                                className="rounded text-primary h-3.5 w-3.5"
                              />
                              <span>Save for future use</span>
                            </label>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeServiceLine(item.id)}
                            className="text-muted-foreground hover:text-destructive h-7 w-7 p-0 mx-auto"
                            title="Remove Job"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No jobs added. Click <strong>"+ Manual Job"</strong> to add repair rows.
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 4: Spare Parts Section */}
        <Card className="rounded-xl border border-border/80 shadow-xs bg-card overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between py-3.5 px-6 border-b border-border bg-muted/30">
            <div>
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
                <Package className="h-4 w-4 text-primary" /> 4. Spare Parts ({partItems.length})
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Amount is automatically calculated: Quantity × Unit Price
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={addPartLine}>
              <Plus className="mr-1 h-3.5 w-3.5" /> Add Spare Part Line
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {partItems.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[5%] text-center">S.No</TableHead>
                    <TableHead className="w-[28%]">Inventory Part</TableHead>
                    <TableHead className="w-[32%]">Description / Part #</TableHead>
                    <TableHead className="w-[10%]">Qty</TableHead>
                    <TableHead className="w-[12%]">Unit Price</TableHead>
                    <TableHead className="w-[13%] text-right">Amount</TableHead>
                    <TableHead className="w-[5%] text-center">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partItems.map((item, idx) => (
                    <TableRow key={item.id}>
                      <TableCell className="text-center font-bold text-muted-foreground pt-3">
                        {idx + 1}
                      </TableCell>
                      <TableCell>
                        <select
                          value={item.part_id || ""}
                          onChange={(e) => updatePartLine(item.id, "part_id", e.target.value)}
                          className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-xs shadow-sm font-medium"
                        >
                          <option value="">Custom Spare Part</option>
                          {partsCatalog.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} {p.part_number ? `(#${p.part_number})` : ""} — {formatAmount(p.selling_price)} (Stock: {p.current_stock})
                            </option>
                          ))}
                        </select>
                        {item.part_id && item.available_stock !== undefined && (
                          <div className="mt-1 flex items-center justify-between text-[10px]">
                            <span className="text-muted-foreground">Available Stock:</span>
                            <span
                              className={`font-bold font-mono px-1.5 py-0.2 rounded ${
                                item.quantity > item.available_stock
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-950/50"
                                  : item.available_stock <= 5
                                  ? "bg-amber-100 text-amber-700 dark:bg-amber-950/50"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50"
                              }`}
                            >
                              {item.available_stock} units
                            </span>
                          </div>
                        )}
                        {item.part_id && item.available_stock !== undefined && item.quantity > item.available_stock && (
                          <p className="text-[10px] text-destructive font-medium mt-0.5 flex items-center gap-1">
                            <AlertCircle className="h-3 w-3 shrink-0" /> Insufficient stock ({item.available_stock} available)
                          </p>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          placeholder="Spare part name or OEM code"
                          value={item.description}
                          onChange={(e) => updatePartLine(item.id, "description", e.target.value)}
                          className="h-9 text-xs"
                          required
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(e) => updatePartLine(item.id, "quantity", parseFloat(e.target.value) || 0)}
                          className="h-9 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="0.01"
                          value={item.unit_price}
                          onChange={(e) => updatePartLine(item.id, "unit_price", parseFloat(e.target.value) || 0)}
                          className="h-9 text-xs font-mono"
                        />
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground text-sm font-mono pt-3">
                        {formatAmount(item.total_price)}
                      </TableCell>
                      <TableCell className="text-center pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removePartLine(item.id)}
                          className="text-muted-foreground hover:text-destructive h-7 w-7 p-0 mx-auto"
                          title="Remove Part"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="py-8 text-center text-xs text-muted-foreground">
                No spare parts added to this job card yet. Click <strong>"+ Add Spare Part Line"</strong> if replacement parts are required (supports 1 to 15+ items).
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 5: Attachments & Documents Section */}
        <Card className="rounded-xl border border-border/80 shadow-xs bg-card">
          <CardHeader className="py-3.5 px-6 border-b border-border bg-muted/30">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Paperclip className="h-4 w-4 text-primary" /> 5. Attachments &amp; Documentation ({attachmentsList.length + existingAttachments.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Attach vehicle damage photos, paper inspection reports, supplier part invoices, or old paper scan files.
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-lg hover:border-primary/50 cursor-pointer bg-muted/20 text-center">
                <ImageIcon className="h-5 w-5 text-primary mb-1" />
                <span className="text-xs font-semibold">Vehicle Photos</span>
                <span className="text-[10px] text-muted-foreground">Before/after repair</span>
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleAttachmentAdd(e, "vehicle_photo")}
                  className="hidden"
                />
              </label>

              <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-lg hover:border-primary/50 cursor-pointer bg-muted/20 text-center">
                <FileText className="h-5 w-5 text-primary mb-1" />
                <span className="text-xs font-semibold">Inspection Scan</span>
                <span className="text-[10px] text-muted-foreground">PDF / Diagnostics report</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => handleAttachmentAdd(e, "inspection_photo")}
                  className="hidden"
                />
              </label>

              <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-lg hover:border-primary/50 cursor-pointer bg-muted/20 text-center">
                <FileText className="h-5 w-5 text-primary mb-1" />
                <span className="text-xs font-semibold">Supplier Invoices</span>
                <span className="text-[10px] text-muted-foreground">Parts purchase proof</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => handleAttachmentAdd(e, "supplier_document")}
                  className="hidden"
                />
              </label>

              <label className="flex flex-col items-center justify-center p-3 border-2 border-dashed rounded-lg hover:border-primary/50 cursor-pointer bg-muted/20 text-center">
                <Paperclip className="h-5 w-5 text-primary mb-1" />
                <span className="text-xs font-semibold">Other Documents</span>
                <span className="text-[10px] text-muted-foreground">Custom scans/files</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*"
                  onChange={(e) => handleAttachmentAdd(e, "other")}
                  className="hidden"
                />
              </label>
            </div>

            {/* Pending Attachments List */}
            {attachmentsList.length > 0 && (
              <div className="space-y-2 pt-2">
                <p className="text-xs font-semibold text-foreground">New Files to Upload on Save:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {attachmentsList.map((att) => (
                    <div key={att.id} className="flex items-center justify-between p-2.5 rounded-lg border bg-background text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{att.file.name}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {(att.file.size / 1024 / 1024).toFixed(2)} MB • {att.document_type.replace("_", " ")}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleAttachmentRemove(att.id)}
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 6: Financial Summary & Actions */}
        <Card className="rounded-xl border border-border/80 shadow-xs bg-card">
          <CardHeader className="py-3.5 px-6 border-b border-border bg-muted/30">
            <CardTitle className="text-sm font-bold flex items-center justify-between text-foreground">
              <span className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-primary" /> 6. Financial Summary &amp; Payment Status
              </span>
              <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2.5 py-1 rounded-full border border-primary/20">
                Total: AED {grandTotal.toFixed(2)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-xl bg-muted/30 border">
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Services Total</span>
                <p className="text-base font-bold text-foreground font-mono">
                  AED {(serviceTotal + labourTotal).toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">{serviceItems.length} service item(s)</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Spare Parts Total</span>
                <p className="text-base font-bold text-foreground font-mono">
                  AED {partsTotal.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">{partItems.length} spare part line(s)</p>
              </div>

              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase">Sub Total</span>
                <p className="text-base font-bold text-foreground font-mono">
                  AED {subtotal.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground">Before discount &amp; VAT</p>
              </div>

              <div className="space-y-1 bg-muted/50 p-2.5 rounded-lg border border-slate-300 dark:border-slate-700">
                <span className="text-xs font-bold text-foreground uppercase">Total Amount</span>
                <p className="text-xl font-black text-foreground font-mono">
                  AED {grandTotal.toFixed(2)}
                </p>
                <p className="text-[10px] text-muted-foreground font-medium">Sub Total - Discount + VAT</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
              <div className="space-y-1.5">
                <Label htmlFor="fc-discount" className="text-xs font-semibold">
                  Discount (AED)
                </Label>
                <Input
                  id="fc-discount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="h-9 font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fc-vat-rate" className="text-xs font-semibold">
                    VAT Rate (%)
                  </Label>
                  <span className="text-[11px] font-mono text-muted-foreground">
                    VAT: AED {vatAmount.toFixed(2)}
                  </span>
                </div>
                <Input
                  id="fc-vat-rate"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  placeholder="5"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                  className="h-9 font-mono font-bold"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="fc-payment-status" className="text-xs font-semibold">
                    Payment Status
                  </Label>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-bold border ${
                      /cash|bank\s*transfer|credit\s*card|paid/i.test(paymentStatus)
                        ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-800"
                        : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800"
                    }`}
                  >
                    {paymentStatus}
                  </span>
                </div>
                <select
                  id="fc-payment-status"
                  value={paymentStatus}
                  onChange={(e) => setPaymentStatus(e.target.value)}
                  className={`flex h-9 w-full rounded-lg border px-3 py-1 text-sm shadow-sm font-bold ${
                    /cash|bank\s*transfer|credit\s*card|paid/i.test(paymentStatus)
                      ? "border-green-500 bg-green-50/50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                      : "border-red-500 bg-red-50/50 text-red-700 dark:bg-red-950/30 dark:text-red-300"
                  }`}
                >
                  <option value="Pending">Pending</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Credit Card">Credit Card</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Signatures Section */}
        <Card className="rounded-xl border border-border/80 shadow-xs bg-card">
          <CardHeader className="py-3.5 px-6 border-b border-border bg-muted/30">
            <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center justify-between text-foreground">
              <span>SIGNATURES</span>
              <span className="text-[11px] font-normal text-muted-foreground">Authorized Workshop &amp; Customer Manual Signature Area</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* LEFT: ATIQ JEHAN AUTO REPAIR */}
              <div className="p-4 rounded-xl border bg-muted/10 flex flex-col justify-between min-h-[110px]">
                <div>
                  <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                    ATIQ JEHAN AUTO REPAIR
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                    Authorized Signature
                  </p>
                </div>
                <div className="pt-8">
                  <div className="border-b-2 border-dashed border-muted-foreground/40 w-full"></div>
                </div>
              </div>

              {/* RIGHT: CUSTOMER */}
              <div className="p-4 rounded-xl border bg-muted/10 flex flex-col justify-between min-h-[110px]">
                <div>
                  <p className="font-bold text-xs uppercase tracking-wider text-foreground">
                    CUSTOMER
                  </p>
                  <p className="text-[11px] text-muted-foreground font-medium mt-0.5">
                    Customer Signature
                  </p>
                </div>
                <div className="pt-8">
                  <div className="border-b-2 border-dashed border-muted-foreground/40 w-full"></div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Form Action Buttons */}
        <div className="flex flex-wrap justify-end items-center gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            render={<Link href={jobCardId ? `/job-cards/${jobCardId}` : "/job-cards"} />}
            disabled={saving}
            className="h-10 px-4 text-xs font-semibold rounded-lg border-border"
          >
            <ArrowLeft className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Cancel
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saving}
            size="lg"
            onClick={(e) => handleSubmit(e, true)}
            className="h-10 px-4 text-xs font-semibold rounded-lg border-border gap-1.5"
          >
            <Printer className="h-3.5 w-3.5 text-muted-foreground" /> Save &amp; Print
          </Button>
          <Button
            type="submit"
            disabled={saving}
            size="lg"
            onClick={(e) => handleSubmit(e, false)}
            className="h-10 px-6 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs min-w-[160px] gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving Job Card...
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> {jobCardId ? "Update Job Card" : "Save Job Card"}
              </>
            )}
          </Button>
        </div>
      </form>

      {/* Inline Quick Add Vehicle Modal */}
      <Dialog open={addVehicleOpen} onOpenChange={setAddVehicleOpen}>
        <DialogContent className="sm:max-w-xl bg-card border border-border shadow-xl rounded-xl p-6">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Car className="h-4 w-4 text-primary" /> Register New Vehicle
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Add a vehicle for <span className="font-semibold text-foreground">{selectedCustomer?.name}</span>. It will be saved into the Vehicles database and selected for this Job Card.
          </DialogDescription>
          
          <form onSubmit={handleSaveInlineVehicle} className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="v-make">Make / Manufacturer <span className="text-destructive">*</span></Label>
                <Input
                  id="v-make"
                  placeholder="e.g. Toyota / Nissan / BMW"
                  value={vehMake}
                  onChange={(e) => setVehMake(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-model">Model <span className="text-destructive">*</span></Label>
                <Input
                  id="v-model"
                  placeholder="e.g. Land Cruiser / Patrol / X5"
                  value={vehModel}
                  onChange={(e) => setVehModel(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="v-plate">Plate / Registration #</Label>
                  {checkingPlate && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <Input
                  id="v-plate"
                  placeholder="e.g. Dubai A-12345"
                  value={vehPlate}
                  onChange={(e) => {
                    setVehPlate(e.target.value);
                    setDuplicatePlateVehicle(null);
                    setAllowDuplicatePlate(false);
                  }}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="v-vin">Chassis / VIN</Label>
                  {checkingVin && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                </div>
                <Input
                  id="v-vin"
                  placeholder="17-digit Chassis / VIN #"
                  value={vehVin}
                  onChange={(e) => {
                    setVehVin(e.target.value);
                    setDuplicateVinVehicle(null);
                  }}
                />
              </div>
            </div>

            {/* Strict Duplicate VIN Error Banner */}
            {duplicateVinVehicle && (
              <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs space-y-1.5">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Duplicate Chassis / VIN Number!</p>
                    <p className="mt-0.5">
                      Chassis / VIN <span className="font-mono font-bold">{vehVin}</span> is already registered for vehicle: <span className="font-semibold">{duplicateVinVehicle.make} {duplicateVinVehicle.model}</span> (Plate: {duplicateVinVehicle.registration_number || "N/A"}).
                    </p>
                    <p className="text-[11px] opacity-80 mt-1">VIN numbers must be unique across all vehicles in the workshop.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Duplicate Plate Warning Banner */}
            {duplicatePlateVehicle && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs space-y-2">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-sm">Registration Plate Already Exists</p>
                    <p className="mt-0.5">
                      Plate <span className="font-bold">{vehPlate}</span> is already assigned to <span className="font-semibold">{duplicatePlateVehicle.make} {duplicatePlateVehicle.model}</span>
                      {duplicatePlateVehicle.customer?.name ? ` (Owner: ${duplicatePlateVehicle.customer.name})` : ""}.
                    </p>
                  </div>
                </div>
                <label className="flex items-center gap-2 pt-1 border-t border-amber-500/20 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={allowDuplicatePlate}
                    onChange={(e) => setAllowDuplicatePlate(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-amber-400 text-amber-600 focus:ring-amber-500"
                  />
                  <span className="font-medium text-xs">Acknowledge duplicate plate and proceed with this vehicle</span>
                </label>
              </div>
            )}

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="v-year">Year</Label>
                <Input
                  id="v-year"
                  type="number"
                  placeholder="2024"
                  value={vehYear}
                  onChange={(e) => setVehYear(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-color">Color</Label>
                <Input
                  id="v-color"
                  placeholder="e.g. White / Black"
                  value={vehColor}
                  onChange={(e) => setVehColor(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-mileage">Mileage (KM)</Label>
                <Input
                  id="v-mileage"
                  type="number"
                  placeholder="e.g. 45000"
                  value={vehMileage}
                  onChange={(e) => setVehMileage(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="v-notes">Vehicle Notes</Label>
              <Textarea
                id="v-notes"
                placeholder="Condition notes, existing body damage, engine specifications..."
                rows={2}
                value={vehNotes}
                onChange={(e) => setVehNotes(e.target.value)}
              />
            </div>

            {vehicleError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{vehicleError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => setAddVehicleOpen(false)} disabled={savingVehicle}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingVehicle || !!duplicateVinVehicle || (!!duplicatePlateVehicle && !allowDuplicatePlate)}
              >
                {savingVehicle ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving Vehicle...
                  </>
                ) : (
                  <>
                    <Save className="mr-2 h-4 w-4" /> Save & Select Vehicle
                  </>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Inline Add New Service Modal */}
      <Dialog open={newServiceModalOpen} onOpenChange={setNewServiceModalOpen}>
        <DialogContent className="sm:max-w-md bg-card border border-border shadow-xl rounded-xl p-6">
          <DialogTitle className="text-base font-bold text-foreground">Add New Service to Catalog</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">Create a service and add it directly to this job card</DialogDescription>
          <form onSubmit={handleSaveInlineService} className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="ns-name">Service Name <span className="text-destructive">*</span></Label>
              <Input
                id="ns-name"
                placeholder="e.g. Gearbox Oil Change"
                value={newSrvName}
                onChange={(e) => setNewSrvName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ns-code">Service Code (Optional)</Label>
                <Input
                  id="ns-code"
                  placeholder="e.g. TRN-02"
                  value={newSrvCode}
                  onChange={(e) => setNewSrvCode(e.target.value)}
                  className="font-mono uppercase text-xs"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="ns-category">Category</Label>
                <select
                  id="ns-category"
                  value={newSrvCategory}
                  onChange={(e) => setNewSrvCategory(e.target.value)}
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm font-medium"
                >
                  <option value="General Maintenance">General Maintenance</option>
                  <option value="Engine">Engine</option>
                  <option value="AC">AC</option>
                  <option value="Brakes">Brakes</option>
                  <option value="Suspension">Suspension</option>
                  <option value="Electrical">Electrical</option>
                  <option value="Transmission">Transmission</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ns-price">Default Price (AED) <span className="text-destructive">*</span></Label>
              <Input
                id="ns-price"
                type="number"
                step="0.01"
                placeholder="200.00"
                value={newSrvPrice}
                onChange={(e) => setNewSrvPrice(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="ns-desc">Description</Label>
              <Textarea
                id="ns-desc"
                placeholder="Scope of service..."
                rows={2}
                value={newSrvDesc}
                onChange={(e) => setNewSrvDesc(e.target.value)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setNewServiceModalOpen(false)} disabled={savingNewSrv}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingNewSrv}>
                {savingNewSrv ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Add Service"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default JobCardForm;
