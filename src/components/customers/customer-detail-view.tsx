"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getCustomerById, updateCustomer } from "@/lib/services/customer-service";
import { getVehiclesByCustomer, createVehicle, updateVehicle } from "@/lib/services/vehicle-service";
import { softDeleteVehicle } from "@/lib/services/recycle-bin-service";
import { getDocumentsByCustomer, deleteUploadedJobCard } from "@/lib/services/document-service";
import { UploadJobCardDialog } from "@/components/job-cards/upload-job-card-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Car,
  Plus,
  Pencil,
  Eye,
  ClipboardList,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Phone,
  Mail,
  Calendar,
  FileText,
  Upload,
  Download,
  Trash2,
  Paperclip,
  Building2,
  DollarSign,
  ArrowLeft,
  Wrench,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Vehicle, UploadedJobCardWithRelations } from "@/types/database";
import { usePermissions } from "@/lib/context/auth-context";

interface CustomerDetailViewProps {
  id: string;
}

export function CustomerDetailView({ id }: CustomerDetailViewProps) {
  const { isViewer, canEdit } = usePermissions();
  const [customer, setCustomer] = useState<any>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [documents, setDocuments] = useState<UploadedJobCardWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Document Upload and Preview state
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UploadedJobCardWithRelations | null>(null);

  // Edit Customer Modal State
  const [editCustomerOpen, setEditCustomerOpen] = useState(false);
  const [custName, setCustName] = useState("");
  const [custMobile, setCustMobile] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [custAddress, setCustAddress] = useState("");
  const [custCompany, setCustCompany] = useState("");
  const [custTrn, setCustTrn] = useState("");
  const [custNotes, setCustNotes] = useState("");
  const [savingCust, setSavingCust] = useState(false);

  // Add / Edit Vehicle Modal State
  const [vehicleModalOpen, setVehicleModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [chassisVin, setChassisVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [vNotes, setVNotes] = useState("");
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [vError, setVError] = useState<string | null>(null);

  // Delete Vehicle State
  const [deleteVehicleOpen, setDeleteVehicleOpen] = useState(false);
  const [vehicleToDelete, setVehicleToDelete] = useState<Vehicle | null>(null);
  const [deletingVehicle, setDeletingVehicle] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [custData, vList, docList] = await Promise.all([
        getCustomerById(id),
        getVehiclesByCustomer(id),
        getDocumentsByCustomer(id),
      ]);
      setCustomer(custData);
      setVehicles((vList || []).filter((v) => !v.is_deleted));
      setDocuments(docList || []);
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: "error", text: err.message || "Failed to load customer details" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteDoc = async (docId: string) => {
    if (!confirm("Are you sure you want to delete this document record?")) return;
    try {
      await deleteUploadedJobCard(docId);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      setToastMessage({ type: "success", text: "Document removed." });
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message });
    }
  };

  const openEditCustomer = () => {
    if (!customer) return;
    setCustName(customer.name || "");
    setCustMobile(customer.mobile || "");
    setCustEmail(customer.email || "");
    setCustAddress(customer.address || "");
    setCustCompany(customer.company_name || "");
    setCustTrn(customer.trn_number || "");
    setCustNotes(customer.notes || "");
    setEditCustomerOpen(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCust(true);
    try {
      await updateCustomer(id, {
        name: custName.trim(),
        mobile: custMobile.trim() || null,
        email: custEmail.trim() || null,
        address: custAddress.trim() || null,
        company_name: custCompany.trim() || null,
        trn_number: custTrn.trim() || null,
        notes: custNotes.trim() || null,
      });
      setToastMessage({ type: "success", text: "Customer details updated successfully." });
      setEditCustomerOpen(false);
      loadData();
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to update customer" });
    } finally {
      setSavingCust(false);
    }
  };

  const openAddVehicle = () => {
    setEditingVehicle(null);
    setMake("");
    setModel("");
    setYear("");
    setColor("");
    setChassisVin("");
    setMileage("");
    setRegistrationNumber("");
    setVNotes("");
    setVError(null);
    setVehicleModalOpen(true);
  };

  const openEditVehicle = (v: Vehicle) => {
    setEditingVehicle(v);
    setMake(v.make || "");
    setModel(v.model || "");
    setYear(v.year ? v.year.toString() : "");
    setColor(v.color || "");
    setChassisVin(v.chassis_vin || "");
    setMileage(v.mileage ? v.mileage.toString() : "");
    setRegistrationNumber(v.registration_number || "");
    setVNotes(v.notes || "");
    setVError(null);
    setVehicleModalOpen(true);
  };

  const openDeleteVehicle = (v: Vehicle) => {
    setVehicleToDelete(v);
    setDeleteVehicleOpen(true);
  };

  const handleConfirmDeleteVehicle = async () => {
    if (!vehicleToDelete) return;
    setDeletingVehicle(true);
    try {
      await softDeleteVehicle(vehicleToDelete.id, "Owner");
      setToastMessage({
        type: "success",
        text: `Vehicle "${vehicleToDelete.make} ${vehicleToDelete.model}" moved to Recycle Bin.`,
      });
      setDeleteVehicleOpen(false);
      setVehicleToDelete(null);
      loadData();
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to move vehicle to Recycle Bin" });
    } finally {
      setDeletingVehicle(false);
    }
  };

  const handleSaveVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!make.trim() || !model.trim()) {
      setVError("Make and Model are required.");
      return;
    }
    setSavingVehicle(true);
    setVError(null);

    const payload = {
      customer_id: id,
      make: make.trim(),
      model: model.trim(),
      year: year ? parseInt(year, 10) : null,
      color: color.trim() || null,
      chassis_vin: chassisVin.trim() || null,
      mileage: mileage ? parseInt(mileage, 10) : null,
      registration_number: registrationNumber.trim() || null,
      notes: vNotes.trim() || null,
    };

    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, payload);
        setToastMessage({ type: "success", text: "Vehicle specifications updated successfully." });
      } else {
        await createVehicle(payload);
        setToastMessage({ type: "success", text: "New vehicle registered successfully." });
      }
      setVehicleModalOpen(false);
      loadData();
    } catch (err: any) {
      setVError(err.message || "Failed to save vehicle details.");
    } finally {
      setSavingVehicle(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin mr-2.5 text-primary" />
        <span className="text-xs font-medium">Loading customer profile...</span>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        <AlertCircle className="h-10 w-10 mx-auto text-rose-500 mb-3" />
        <h3 className="text-base font-bold text-foreground">Customer Not Found</h3>
        <p className="text-xs text-muted-foreground mt-1">This record may have been removed or moved to the Recycle Bin.</p>
        <Button render={<Link href="/customers" />} className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg">
          <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> Return to Customers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-xl border text-sm flex items-center justify-between transition-all ${
            toastMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-800"
              : "bg-rose-50 text-rose-800 border-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-800"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
            )}
            <span className="font-medium">{toastMessage.text}</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setToastMessage(null)}
            className="h-6 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title={customer.name}
        description="Customer profile, registered vehicle fleet, and service history"
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Customers", href: "/customers" },
          { label: customer.name },
        ]}
      >
        <div className="flex items-center gap-2.5">
          {!isViewer && (
            <>
              <Button
                variant="outline"
                onClick={openEditCustomer}
                className="h-10 px-3.5 text-xs font-semibold rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs gap-1.5"
              >
                <Pencil className="h-3.5 w-3.5 text-slate-500" /> Edit Profile
              </Button>
              <Button
                onClick={openAddVehicle}
                variant="outline"
                className="h-10 px-3.5 text-xs font-semibold rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5 text-slate-500" /> Add Vehicle
              </Button>
              <Button
                render={<Link href={`/job-cards/new?customer_id=${id}`} />}
                className="h-10 px-4 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs gap-1.5 transition-colors"
              >
                <Wrench className="h-4 w-4" /> Create Job Card
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      {/* Customer KPI / Contact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Phone */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Phone Number</p>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Phone className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-lg font-bold text-slate-900 font-mono tracking-tight">{customer.mobile || "—"}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Primary customer contact</p>
          </div>
        </div>

        {/* Email */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Email Address</p>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Mail className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-sm font-bold text-slate-900 truncate max-w-[180px]">{customer.email || "—"}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Electronic communications</p>
          </div>
        </div>

        {/* Customer Since */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer Since</p>
            <div className="h-8 w-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-sm font-bold text-slate-900">{formatDate(customer.created_at)}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Registration date</p>
          </div>
        </div>

        {/* Outstanding Balance */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Balance</p>
            <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
              Number(customer.outstanding_balance) > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
            }`}>
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className={`text-xl font-bold font-mono tracking-tight ${Number(customer.outstanding_balance) > 0 ? "text-red-600" : "text-slate-900"}`}>
              {formatCurrency(customer.outstanding_balance || 0)}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Unsettled invoices</p>
          </div>
        </div>
      </div>

      {/* Customer Address & Company Card */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
        <div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Address / Emirate</span>
          <p className="font-semibold text-slate-800 text-xs mt-1.5 leading-relaxed">{customer.address || "No address recorded on profile"}</p>
        </div>
        <div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company &amp; Tax Info</span>
          <div className="mt-1.5 space-y-1">
            {customer.company_name ? (
              <p className="font-bold text-slate-900 text-xs">{customer.company_name}</p>
            ) : (
              <p className="text-slate-500 text-xs">Individual Account (No Company)</p>
            )}
            {customer.trn_number ? (
              <p className="font-mono text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-200 inline-block">
                TRN: {customer.trn_number}
              </p>
            ) : (
              <p className="text-slate-400 text-[11px]">No TRN registered</p>
            )}
          </div>
        </div>
        <div>
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Customer Notes</span>
          <p className="font-medium text-slate-600 text-xs mt-1.5 leading-relaxed">{customer.notes || "No special account notes recorded."}</p>
        </div>
      </div>

      {/* VEHICLES SECTION */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Car className="h-4 w-4 text-blue-600" />
              Registered Vehicles ({vehicles.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Active vehicle fleet associated with {customer.name}
            </p>
          </div>
          {!isViewer && (
            <Button
              onClick={openAddVehicle}
              size="sm"
              className="h-8 px-3 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Vehicle
            </Button>
          )}
        </div>
        <div className="p-0">
          {vehicles.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Vehicle</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Year</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Plate Number</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Chassis / VIN</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Mileage</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Color</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Added Date</TableHead>
                    <TableHead className="text-right font-bold text-slate-500 text-[11px] uppercase tracking-wider pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {vehicles.map((v) => (
                    <TableRow key={v.id} className="h-12 hover:bg-slate-50/60 transition-colors border-b border-slate-100">
                      <TableCell className="font-semibold text-slate-900 text-xs">
                        <Link href={`/vehicles/${v.id}`} className="hover:text-blue-600 transition-colors flex items-center gap-1.5">
                          <Car className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                          <span>{v.make} {v.model}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-slate-500 font-mono">{v.year || "—"}</TableCell>
                      <TableCell className="font-bold text-blue-700 text-xs font-mono">
                        {v.registration_number || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-slate-500">{v.chassis_vin || "—"}</TableCell>
                      <TableCell className="text-xs text-slate-700 font-mono">
                        {v.mileage ? `${v.mileage.toLocaleString()} KM` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-500">{v.color || "—"}</TableCell>
                      <TableCell className="text-xs text-slate-500">{formatDate(v.created_at)}</TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<Link href={`/vehicles/${v.id}`} />}
                            title="View Vehicle"
                            className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 rounded-lg"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditVehicle(v)}
                              title="Edit Vehicle"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 rounded-lg"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!isViewer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openDeleteVehicle(v)}
                              title="Move to Recycle Bin"
                              className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600 rounded-lg"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!isViewer && (
                            <Button
                              variant="outline"
                              size="sm"
                              render={<Link href={`/job-cards/new?customer_id=${id}&vehicle_id=${v.id}`} />}
                              className="h-8 px-2.5 text-xs font-semibold rounded-lg border-slate-200 bg-white hover:bg-slate-50 text-slate-700 ml-1"
                            >
                              <ClipboardList className="mr-1 h-3.5 w-3.5 text-blue-600" /> Job Card
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-12 text-center text-slate-500 flex flex-col items-center justify-center px-4">
              <Car className="h-10 w-10 mx-auto text-slate-300 stroke-1 mb-2" />
              <h4 className="text-sm font-semibold text-slate-900">No vehicles registered for {customer.name}</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4">Add a vehicle with plate number and chassis/VIN to create repair orders</p>
              {!isViewer && (
                <Button
                  size="sm"
                  onClick={openAddVehicle}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs rounded-xl h-9 px-4 shadow-2xs"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Vehicle Now
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Uploaded Physical Job Cards / Scanned Worksheets */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-blue-600" />
              Scanned / Paper Job Cards ({documents.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Archived physical repair worksheets and scanned job card PDFs
            </p>
          </div>
          {!isViewer && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUploadDocOpen(true)}
              className="h-9 px-3.5 text-xs font-semibold rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs gap-1.5"
            >
              <Upload className="h-3.5 w-3.5 text-slate-500" /> Upload Document
            </Button>
          )}
        </div>
        <div>
          {documents.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Document Type</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">File Name</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Vehicle</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Job Card #</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Upload Date</TableHead>
                    <TableHead className="text-right font-bold text-slate-500 text-[11px] uppercase tracking-wider pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {documents.map((doc) => (
                    <TableRow key={doc.id} className="h-12 hover:bg-slate-50/60 transition-colors border-b border-slate-100">
                      <TableCell className="font-semibold text-xs text-slate-900">
                        {doc.document_type === "paper_job_card" ? "Paper Worksheet" : doc.document_type}
                      </TableCell>
                      <TableCell className="text-xs text-slate-900 font-mono">{doc.file_name}</TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {doc.vehicle ? `${doc.vehicle.make} ${doc.vehicle.model}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-blue-700 font-mono font-semibold">{doc.job_card_number || "—"}</TableCell>
                      <TableCell className="text-xs text-slate-500">{formatDate(doc.created_at)}</TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewDoc(doc)}
                            className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 rounded-lg"
                            title="Preview Document"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<a href={doc.file_url} target="_blank" rel="noopener noreferrer" download />}
                            className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 rounded-lg"
                            title="Download File"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {!isViewer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600 rounded-lg"
                              title="Delete Record"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-10 text-center text-slate-500 flex flex-col items-center justify-center">
              <FileText className="h-8 w-8 mx-auto text-slate-300 stroke-1 mb-2" />
              <p className="text-xs text-slate-500">No scanned worksheets or paper job cards uploaded yet.</p>
            </div>
          )}
        </div>
      </div>

      {/* Edit Customer Profile Modal */}
      <Dialog open={editCustomerOpen} onOpenChange={setEditCustomerOpen}>
        <DialogContent className="max-w-md bg-card border border-border shadow-lg rounded-xl p-6">
          <DialogTitle className="text-base font-bold text-foreground">Edit Customer Details</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Update contact information and preferences for {customer.name}
          </DialogDescription>
          <form onSubmit={handleSaveCustomer} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Full Name <span className="text-destructive">*</span></Label>
              <Input
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                required
                className="h-10 text-sm rounded-lg"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Mobile Number</Label>
                <Input
                  value={custMobile}
                  onChange={(e) => setCustMobile(e.target.value)}
                  className="h-10 text-sm rounded-lg font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Email Address</Label>
                <Input
                  type="email"
                  value={custEmail}
                  onChange={(e) => setCustEmail(e.target.value)}
                  className="h-10 text-sm rounded-lg"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Address / Location</Label>
              <Input
                value={custAddress}
                onChange={(e) => setCustAddress(e.target.value)}
                className="h-10 text-sm rounded-lg"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Company Name (Optional)</Label>
                <Input
                  value={custCompany}
                  onChange={(e) => setCustCompany(e.target.value)}
                  placeholder="e.g. Al Dhafra Transport"
                  className="h-10 text-sm rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-primary">TRN Number (Optional)</Label>
                <Input
                  value={custTrn}
                  onChange={(e) => setCustTrn(e.target.value)}
                  placeholder="e.g. 100123456789003"
                  className="h-10 text-sm rounded-lg font-mono"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Customer Notes</Label>
              <Textarea
                rows={2}
                value={custNotes}
                onChange={(e) => setCustNotes(e.target.value)}
                className="text-xs rounded-lg"
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditCustomerOpen(false)}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingCust}
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {savingCust ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Vehicle Modal */}
      <Dialog open={vehicleModalOpen} onOpenChange={setVehicleModalOpen}>
        <DialogContent className="max-w-md bg-card border border-border shadow-lg rounded-xl p-6">
          <DialogTitle className="text-base font-bold text-foreground">
            {editingVehicle ? "Edit Vehicle Details" : `Add Vehicle for ${customer.name}`}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {editingVehicle ? "Update vehicle specifications and chassis/VIN" : "Register another vehicle to this customer profile"}
          </DialogDescription>
          <form onSubmit={handleSaveVehicle} className="space-y-3 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Make <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Toyota"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  required
                  className="h-10 text-sm rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Model <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. Land Cruiser"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                  className="h-10 text-sm rounded-lg"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Year</Label>
                <Input
                  type="number"
                  placeholder="2024"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="h-10 text-sm rounded-lg font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-foreground">Color</Label>
                <Input
                  placeholder="White Pearl"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 text-sm rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Registration Plate</Label>
              <Input
                placeholder="AD-12345"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                className="h-10 text-sm rounded-lg font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Chassis / VIN Number</Label>
              <Input
                placeholder="17-character VIN"
                value={chassisVin}
                onChange={(e) => setChassisVin(e.target.value)}
                className="h-10 text-sm rounded-lg font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Current Mileage (KM)</Label>
              <Input
                type="number"
                placeholder="45000"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                className="h-10 text-sm rounded-lg font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-foreground">Vehicle Notes</Label>
              <Textarea
                rows={2}
                placeholder="Engine size, trim, special modifications..."
                value={vNotes}
                onChange={(e) => setVNotes(e.target.value)}
                className="text-xs rounded-lg"
              />
            </div>

            {vError && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{vError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setVehicleModalOpen(false)}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={savingVehicle}
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {savingVehicle ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...</>
                ) : editingVehicle ? (
                  "Update Vehicle"
                ) : (
                  "Add Vehicle"
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Vehicle Confirmation Dialog */}
      <Dialog open={deleteVehicleOpen} onOpenChange={setDeleteVehicleOpen}>
        <DialogContent className="max-w-md bg-card border border-border shadow-lg rounded-xl p-6">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
            <Trash2 className="h-4 w-4 text-rose-600" />
            Move vehicle to Recycle Bin?
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground space-y-2 pt-1">
            <p>
              Are you sure you want to move <strong className="text-foreground">{vehicleToDelete?.make} {vehicleToDelete?.model} ({vehicleToDelete?.registration_number || "No Plate"})</strong> to the Recycle Bin?
            </p>
            <p className="text-[11px] text-muted-foreground bg-muted/40 p-2.5 rounded-lg border border-border/60">
              ✓ Existing job cards and billing history remain preserved. The vehicle can be restored anytime from the Recycle Bin.
            </p>
          </DialogDescription>
          <DialogFooter className="gap-2 sm:gap-0 mt-4 border-t pt-3">
            <Button
              variant="outline"
              onClick={() => setDeleteVehicleOpen(false)}
              disabled={deletingVehicle}
              className="h-9 px-4 text-xs font-medium rounded-lg"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDeleteVehicle}
              disabled={deletingVehicle}
              className="h-9 px-4 text-xs font-semibold rounded-lg bg-rose-600 hover:bg-rose-700 text-white"
            >
              {deletingVehicle ? (
                <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Moving...</>
              ) : (
                "Move to Recycle Bin"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Upload Modal */}
      <UploadJobCardDialog
        open={uploadDocOpen}
        onOpenChange={setUploadDocOpen}
        customerId={id}
        onUploadComplete={() => {
          setToastMessage({ type: "success", text: "Paper Job Card uploaded successfully." });
          loadData();
        }}
      />

      {/* Document Preview Modal */}
      {previewDoc && (
        <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="max-w-3xl bg-card border border-border shadow-xl rounded-xl p-6">
            <DialogTitle className="text-base font-bold text-foreground">Scanned Document Preview</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {previewDoc.file_name} • Uploaded {formatDate(previewDoc.created_at)}
            </DialogDescription>
            <div className="mt-4 flex flex-col items-center justify-center border border-border rounded-xl p-2 bg-muted/20 max-h-[70vh] overflow-auto">
              {previewDoc.file_type.includes("pdf") ? (
                <iframe src={previewDoc.file_url} className="w-full h-[550px] rounded-lg border" />
              ) : (
                <img src={previewDoc.file_url} alt="Uploaded worksheet preview" className="max-w-full max-h-[500px] object-contain rounded-lg" />
              )}
            </div>
            <div className="flex justify-between items-center mt-4 pt-3 border-t">
              <Button
                variant="outline"
                render={<a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer" download />}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download File
              </Button>
              <Button
                onClick={() => setPreviewDoc(null)}
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                Close Preview
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default CustomerDetailView;
