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
        <div className="flex items-center gap-2">
          {!isViewer && (
            <>
              <Button
                variant="outline"
                onClick={openEditCustomer}
                className="h-9 px-3.5 text-xs font-semibold rounded-lg border-border hover:bg-muted/50"
              >
                <Pencil className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Edit Profile
              </Button>
              <Button
                onClick={openAddVehicle}
                variant="outline"
                className="h-9 px-3.5 text-xs font-semibold rounded-lg border-border hover:bg-muted/50"
              >
                <Plus className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Add Vehicle
              </Button>
              <Button
                render={<Link href={`/job-cards/new?customer_id=${id}`} />}
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
              >
                <Wrench className="mr-1.5 h-3.5 w-3.5" /> Create Job Card
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      {/* Customer KPI / Contact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Phone */}
        <Card className="border border-border/80 shadow-xs bg-card rounded-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Phone Number</p>
              <p className="text-base font-bold text-foreground font-mono mt-1">{customer.mobile || "—"}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Primary customer contact</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Phone className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Email */}
        <Card className="border border-border/80 shadow-xs bg-card rounded-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Email Address</p>
              <p className="text-sm font-semibold text-foreground truncate max-w-[160px] mt-1">{customer.email || "—"}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Electronic communications</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <Mail className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Customer Since */}
        <Card className="border border-border/80 shadow-xs bg-card rounded-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Customer Since</p>
              <p className="text-sm font-bold text-foreground mt-1">{formatDate(customer.created_at)}</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Registration date</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 flex items-center justify-center shrink-0">
              <Calendar className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* Outstanding Balance */}
        <Card className="border border-border/80 shadow-xs bg-card rounded-xl">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Outstanding Balance</p>
              <p className={`text-base font-bold font-mono mt-1 ${customer.outstanding_balance > 0 ? "text-amber-600 dark:text-amber-400" : "text-foreground"}`}>
                {formatCurrency(customer.outstanding_balance || 0)}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Unsettled invoices</p>
            </div>
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
              customer.outstanding_balance > 0
                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400"
            }`}>
              <DollarSign className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Address & Company Card */}
      <Card className="border border-border/80 shadow-xs bg-card rounded-xl">
        <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-6 text-xs">
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Address / Emirate</span>
            <p className="font-medium text-foreground text-xs mt-1.5 leading-relaxed">{customer.address || "No address recorded on profile"}</p>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Company &amp; Tax Info</span>
            <div className="mt-1.5 space-y-1">
              {customer.company_name ? (
                <p className="font-semibold text-foreground text-xs">{customer.company_name}</p>
              ) : (
                <p className="text-muted-foreground text-xs">Individual Account (No Company)</p>
              )}
              {customer.trn_number ? (
                <p className="font-mono text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20 inline-block">
                  TRN: {customer.trn_number}
                </p>
              ) : (
                <p className="text-muted-foreground text-[11px]">No TRN registered</p>
              )}
            </div>
          </div>
          <div>
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Customer Notes</span>
            <p className="font-medium text-foreground text-xs mt-1.5 leading-relaxed">{customer.notes || "No special account notes recorded."}</p>
          </div>
        </CardContent>
      </Card>

      {/* VEHICLES SECTION */}
      <Card className="border border-border/80 shadow-xs bg-card overflow-hidden rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-muted/40 px-6 py-3.5">
          <div>
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Car className="h-4 w-4 text-primary" />
              Registered Vehicles ({vehicles.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
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
        </CardHeader>
        <CardContent className="p-0">
          {vehicles.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border h-11">
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Vehicle</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Year</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Plate Number</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Chassis / VIN</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Mileage</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Color</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Added Date</TableHead>
                    <TableHead className="text-right font-semibold text-foreground text-xs uppercase tracking-wider pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {vehicles.map((v) => (
                    <TableRow key={v.id} className="h-12 hover:bg-muted/40 transition-colors border-b border-border/50">
                      <TableCell className="font-bold text-foreground text-xs">
                        <Link href={`/vehicles/${v.id}`} className="hover:text-primary hover:underline transition-colors flex items-center gap-1.5">
                          <Car className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span>{v.make} {v.model}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground font-mono">{v.year || "—"}</TableCell>
                      <TableCell className="font-bold text-primary text-xs font-mono">
                        {v.registration_number || "—"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{v.chassis_vin || "—"}</TableCell>
                      <TableCell className="text-xs text-foreground font-mono">
                        {v.mileage ? `${v.mileage.toLocaleString()} KM` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{v.color || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(v.created_at)}</TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<Link href={`/vehicles/${v.id}`} />}
                            title="View Vehicle"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary rounded-lg"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditVehicle(v)}
                              title="Edit Vehicle"
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground rounded-lg"
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
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600 rounded-lg"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {!isViewer && (
                            <Button
                              variant="outline"
                              size="sm"
                              render={<Link href={`/job-cards/new?customer_id=${id}&vehicle_id=${v.id}`} />}
                              className="h-8 px-2.5 text-xs font-semibold rounded-lg border-border ml-1"
                            >
                              <ClipboardList className="mr-1 h-3.5 w-3.5 text-primary" /> Job Card
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
            <div className="py-12 text-center text-muted-foreground flex flex-col items-center justify-center px-4">
              <Car className="h-10 w-10 mx-auto text-muted-foreground/30 stroke-1 mb-2" />
              <h4 className="text-sm font-semibold text-foreground">No vehicles registered for {customer.name}</h4>
              <p className="text-xs text-muted-foreground mt-1 mb-4">Add a vehicle with plate number and chassis/VIN to create repair orders</p>
              {!isViewer && (
                <Button
                  size="sm"
                  onClick={openAddVehicle}
                  className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs rounded-lg h-9"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Vehicle Now
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploaded Physical Job Cards / Scanned Worksheets */}
      <Card className="border border-border/80 shadow-xs bg-card overflow-hidden rounded-xl">
        <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-muted/40 px-6 py-3.5">
          <div>
            <CardTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <Paperclip className="h-4 w-4 text-primary" />
              Scanned / Paper Job Cards ({documents.length})
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Archived physical repair worksheets and scanned job card PDFs
            </p>
          </div>
          {!isViewer && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUploadDocOpen(true)}
              className="h-8 px-3 text-xs font-semibold rounded-lg border-border"
            >
              <Upload className="mr-1.5 h-3.5 w-3.5 text-muted-foreground" /> Upload Document
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {documents.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border h-11">
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Document Type</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">File Name</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Vehicle</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Job Card #</TableHead>
                    <TableHead className="font-semibold text-foreground text-xs uppercase tracking-wider">Upload Date</TableHead>
                    <TableHead className="text-right font-semibold text-foreground text-xs uppercase tracking-wider pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-border/60">
                  {documents.map((doc) => (
                    <TableRow key={doc.id} className="h-12 hover:bg-muted/40 transition-colors border-b border-border/50">
                      <TableCell className="font-semibold text-xs text-foreground">
                        {doc.document_type === "paper_job_card" ? "Paper Worksheet" : doc.document_type}
                      </TableCell>
                      <TableCell className="text-xs text-foreground font-mono">{doc.file_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {doc.vehicle ? `${doc.vehicle.make} ${doc.vehicle.model}` : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-primary font-mono font-semibold">{doc.job_card_number || "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(doc.created_at)}</TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setPreviewDoc(doc)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary rounded-lg"
                            title="Preview Document"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<a href={doc.file_url} target="_blank" rel="noopener noreferrer" download />}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-primary rounded-lg"
                            title="Download File"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                          {!isViewer && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteDoc(doc.id)}
                              className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-600 rounded-lg"
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
            <div className="py-10 text-center text-muted-foreground flex flex-col items-center justify-center">
              <FileText className="h-8 w-8 mx-auto text-muted-foreground/30 stroke-1 mb-2" />
              <p className="text-xs text-muted-foreground">No scanned worksheets or paper job cards uploaded yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

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
