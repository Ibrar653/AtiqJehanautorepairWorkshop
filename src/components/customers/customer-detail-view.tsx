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
  MapPin,
  Calendar,
  FileText,
  Upload,
  Download,
  Trash2,
  Paperclip,
  ShieldAlert,
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

  const openEditVehicle = (veh: Vehicle) => {
    setEditingVehicle(veh);
    setMake(veh.make || "");
    setModel(veh.model || "");
    setYear(veh.year ? String(veh.year) : "");
    setColor(veh.color || "");
    setChassisVin(veh.chassis_vin || "");
    setMileage(veh.mileage ? String(veh.mileage) : "");
    setRegistrationNumber(veh.registration_number || "");
    setVNotes(veh.notes || "");
    setVError(null);
    setVehicleModalOpen(true);
  };

  const openDeleteVehicle = (veh: Vehicle) => {
    setVehicleToDelete(veh);
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
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin mr-2 text-blue-600" />
        <span className="text-sm font-medium">Loading customer profile...</span>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="py-16 text-center text-slate-500">
        <AlertCircle className="h-12 w-12 mx-auto text-red-400 mb-3" />
        <h3 className="text-lg font-bold text-slate-900">Customer Not Found</h3>
        <p className="text-sm text-slate-500 mt-1">This record may have been moved to the Recycle Bin.</p>
        <Button render={<Link href="/customers" />} className="mt-4 bg-blue-600 hover:bg-blue-700 text-white">
          Return to Customers
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`p-3.5 rounded-lg border text-sm flex items-center justify-between ${
            toastMessage.type === "success"
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : "bg-red-50 text-red-800 border-red-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
            )}
            <span>{toastMessage.text}</span>
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
        description="Customer profile, registered vehicle fleet, and job cards"
      >
        <div className="flex items-center gap-2">
          {!isViewer && (
            <>
              <Button variant="outline" onClick={openEditCustomer} className="border-slate-300">
                <Pencil className="mr-1.5 h-4 w-4" /> Edit Profile
              </Button>
              <Button onClick={openAddVehicle} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20">
                <Plus className="mr-1.5 h-4 w-4" /> Add Vehicle
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      {/* Customer KPI / Contact Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Phone className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Phone Number</p>
              <p className="text-sm font-bold text-slate-900 font-mono">{customer.mobile || "Not provided"}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Email Address</p>
              <p className="text-sm font-bold text-slate-900 truncate max-w-[150px]">{customer.email || "Not provided"}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-blue-50 text-blue-600">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Customer Since</p>
              <p className="text-sm font-bold text-slate-900">{formatDate(customer.created_at)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-slate-200 shadow-sm bg-white">
          <CardContent className="pt-5 flex items-center gap-3">
            <div className={`p-3 rounded-xl ${customer.outstanding_balance > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
              <ClipboardList className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase">Outstanding Balance</p>
              <p className={`text-sm font-bold ${customer.outstanding_balance > 0 ? "text-amber-600" : "text-emerald-600"}`}>
                {formatCurrency(customer.outstanding_balance || 0)}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Address & Notes */}
      <Card className="border border-slate-200 shadow-sm bg-white">
        <CardContent className="pt-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Address / Location</span>
            <p className="font-medium text-slate-800 mt-1">{customer.address || "No address provided"}</p>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Company &amp; TRN Number</span>
            <div className="mt-1 space-y-1">
              {customer.company_name && (
                <p className="font-bold text-slate-900 text-xs">{customer.company_name}</p>
              )}
              {customer.trn_number ? (
                <p className="font-mono text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 inline-block">
                  TRN: {customer.trn_number}
                </p>
              ) : (
                <p className="text-slate-400 text-xs">No TRN registered</p>
              )}
            </div>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-500 uppercase">Customer Notes</span>
            <p className="font-medium text-slate-800 mt-1">{customer.notes || "No special notes recorded."}</p>
          </div>
        </CardContent>
      </Card>

      {/* PROFESSIONAL VEHICLES SECTION */}
      <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-4">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Car className="h-5 w-5 text-blue-600" />
              VEHICLES ({vehicles.length})
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Registered vehicle fleet belonging to {customer.name}
            </p>
          </div>
          {!isViewer && (
            <Button onClick={openAddVehicle} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
              <Plus className="mr-1.5 h-4 w-4" /> Add Another Vehicle
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {vehicles.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/40 hover:bg-slate-50/40">
                  <TableHead className="font-semibold text-slate-700">Vehicle / Car Name</TableHead>
                  <TableHead className="font-semibold text-slate-700">Make</TableHead>
                  <TableHead className="font-semibold text-slate-700">Model</TableHead>
                  <TableHead className="font-semibold text-slate-700">Year</TableHead>
                  <TableHead className="font-semibold text-slate-700">Reg Plate</TableHead>
                  <TableHead className="font-semibold text-slate-700">Chassis / VIN</TableHead>
                  <TableHead className="font-semibold text-slate-700">Mileage</TableHead>
                  <TableHead className="font-semibold text-slate-700">Color</TableHead>
                  <TableHead className="font-semibold text-slate-700">Added Date</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vehicles.map((v) => (
                  <TableRow key={v.id} className="hover:bg-slate-50/60 transition-colors">
                    <TableCell className="font-bold text-slate-900">
                      <Link href={`/vehicles/${v.id}`} className="hover:text-blue-600 hover:underline">
                        {v.make} {v.model}
                      </Link>
                    </TableCell>
                    <TableCell className="text-slate-700 text-xs">{v.make}</TableCell>
                    <TableCell className="text-slate-700 text-xs">{v.model}</TableCell>
                    <TableCell className="text-slate-700 text-xs">{v.year || "—"}</TableCell>
                    <TableCell className="font-bold text-blue-700 text-xs font-mono">{v.registration_number || "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-slate-700">{v.chassis_vin || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-700">{v.mileage ? `${v.mileage.toLocaleString()} KM` : "—"}</TableCell>
                    <TableCell className="text-xs text-slate-700">{v.color || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{formatDate(v.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          render={<Link href={`/vehicles/${v.id}`} />}
                          title="View Full Vehicle Details"
                          className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditVehicle(v)}
                            title="Edit Vehicle"
                            className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        {!isViewer && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteVehicle(v)}
                            title="Move to Recycle Bin"
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {!isViewer && (
                          <Button
                            variant="outline"
                            size="sm"
                            render={<Link href={`/job-cards/new?customer_id=${id}&vehicle_id=${v.id}`} />}
                            className="h-8 text-xs font-semibold border-slate-300 ml-1"
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
          ) : (
            <div className="py-12 text-center text-slate-500">
              <Car className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              <h4 className="text-base font-semibold text-slate-800">No vehicles registered for {customer.name}</h4>
              <p className="text-xs text-slate-500 mt-1 mb-4">Add a vehicle with chassis/VIN to create repair job cards</p>
              {!isViewer && (
                <Button size="sm" onClick={openAddVehicle} className="bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                  <Plus className="mr-1.5 h-4 w-4" /> Add Vehicle Now
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Uploaded Physical Job Cards / Paper Worksheets */}
      <Card className="border border-slate-200 shadow-sm bg-white overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 bg-slate-50/60 px-6 py-4">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Paperclip className="h-5 w-5 text-blue-600" />
              Scanned / Paper Job Cards ({documents.length})
            </CardTitle>
            <p className="text-xs text-slate-500 mt-0.5">
              Historical physical repair worksheets and scanned job card PDFs
            </p>
          </div>
          {!isViewer && (
            <Button size="sm" variant="outline" onClick={() => setUploadDocOpen(true)} className="border-slate-300">
              <Upload className="mr-1.5 h-4 w-4" /> Upload Document
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {documents.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50/40 hover:bg-slate-50/40">
                  <TableHead className="font-semibold text-slate-700">Document Type</TableHead>
                  <TableHead className="font-semibold text-slate-700">File Name</TableHead>
                  <TableHead className="font-semibold text-slate-700">Vehicle</TableHead>
                  <TableHead className="font-semibold text-slate-700">Job Card #</TableHead>
                  <TableHead className="font-semibold text-slate-700">Upload Date</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.map((doc) => (
                  <TableRow key={doc.id} className="hover:bg-slate-50/60 transition-colors">
                    <TableCell className="font-semibold text-xs text-slate-800">
                      {doc.document_type === "paper_job_card" ? "Paper Worksheet" : doc.document_type}
                    </TableCell>
                    <TableCell className="text-xs text-slate-700 font-mono">{doc.file_name}</TableCell>
                    <TableCell className="text-xs text-slate-700">
                      {doc.vehicle ? `${doc.vehicle.make} ${doc.vehicle.model}` : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-blue-700 font-semibold">{doc.job_card_number || "—"}</TableCell>
                    <TableCell className="text-xs text-slate-500">{formatDate(doc.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setPreviewDoc(doc)}
                          className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          render={<a href={doc.file_url} target="_blank" rel="noopener noreferrer" download />}
                          className="h-8 w-8 p-0 text-slate-600 hover:text-blue-600"
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {!isViewer && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteDoc(doc.id)}
                            className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-10 text-center text-slate-500">
              <FileText className="h-10 w-10 mx-auto text-slate-300 mb-2" />
              <p className="text-xs text-slate-500">No scanned worksheets uploaded yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Customer Profile Modal */}
      <Dialog open={editCustomerOpen} onOpenChange={setEditCustomerOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>Edit Customer Details</DialogTitle>
          <DialogDescription>Update contact information and preferences for {customer.name}</DialogDescription>
          <form onSubmit={handleSaveCustomer} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Full Name *</Label>
              <Input value={custName} onChange={(e) => setCustName(e.target.value)} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Mobile Number</Label>
                <Input value={custMobile} onChange={(e) => setCustMobile(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Email Address</Label>
                <Input type="email" value={custEmail} onChange={(e) => setCustEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Address / Location</Label>
              <Input value={custAddress} onChange={(e) => setCustAddress(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Company Name (Optional)</Label>
                <Input value={custCompany} onChange={(e) => setCustCompany(e.target.value)} placeholder="e.g. Al Dhafra Transport" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-blue-700">Company / Customer TRN No. (Optional)</Label>
                <Input value={custTrn} onChange={(e) => setCustTrn(e.target.value)} placeholder="e.g. 100123456789003" className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Notes</Label>
              <Textarea rows={2} value={custNotes} onChange={(e) => setCustNotes(e.target.value)} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditCustomerOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingCust} className="bg-blue-600 hover:bg-blue-700 text-white">
                {savingCust ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Add / Edit Vehicle Modal */}
      <Dialog open={vehicleModalOpen} onOpenChange={setVehicleModalOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle>{editingVehicle ? "Edit Vehicle Details" : `Add Vehicle for ${customer.name}`}</DialogTitle>
          <DialogDescription>
            {editingVehicle ? "Update vehicle specifications and chassis/VIN" : "Register another vehicle to this customer profile"}
          </DialogDescription>
          <form onSubmit={handleSaveVehicle} className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Make *</Label>
                <Input placeholder="e.g. Toyota" value={make} onChange={(e) => setMake(e.target.value)} required />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Model *</Label>
                <Input placeholder="e.g. Land Cruiser" value={model} onChange={(e) => setModel(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Year</Label>
                <Input type="number" placeholder="2023" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-slate-700">Color</Label>
                <Input placeholder="White Pearl" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Registration Plate</Label>
              <Input placeholder="AD-12345" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Chassis / VIN Number</Label>
              <Input placeholder="17-character VIN" value={chassisVin} onChange={(e) => setChassisVin(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Current Mileage (KM)</Label>
              <Input type="number" placeholder="45000" value={mileage} onChange={(e) => setMileage(e.target.value)} />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">Vehicle Notes</Label>
              <Textarea rows={2} placeholder="Engine size, trim, special modifications..." value={vNotes} onChange={(e) => setVNotes(e.target.value)} />
            </div>

            {vError && (
              <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{vError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setVehicleModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={savingVehicle} className="bg-blue-600 hover:bg-blue-700 text-white">
                {savingVehicle ? <Loader2 className="h-4 w-4 animate-spin" /> : editingVehicle ? "Update Vehicle" : "Add Vehicle"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Vehicle Confirmation Dialog */}
      <Dialog open={deleteVehicleOpen} onOpenChange={setDeleteVehicleOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <Trash2 className="h-5 w-5 text-red-600" />
            Move vehicle to Recycle Bin?
          </DialogTitle>
          <DialogDescription className="text-slate-600 space-y-2 pt-1">
            <p>
              Are you sure you want to move <strong>{vehicleToDelete?.make} {vehicleToDelete?.model} ({vehicleToDelete?.registration_number || "No Plate"})</strong> to the Recycle Bin?
            </p>
            <p className="text-xs text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
              ✓ Job cards, billing history, and customer relations remain safely preserved. The vehicle can be restored anytime from the Recycle Bin.
            </p>
          </DialogDescription>
          <DialogFooter className="gap-2 sm:gap-0 mt-4">
            <Button variant="outline" onClick={() => setDeleteVehicleOpen(false)} disabled={deletingVehicle}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmDeleteVehicle}
              disabled={deletingVehicle}
              className="bg-red-600 hover:bg-red-700 text-white font-semibold"
            >
              {deletingVehicle ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Moving...</>
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
          <DialogContent className="max-w-3xl">
            <DialogTitle>Scanned Document Preview</DialogTitle>
            <DialogDescription>{previewDoc.file_name} • Uploaded {formatDate(previewDoc.created_at)}</DialogDescription>
            <div className="mt-4 flex flex-col items-center justify-center border border-slate-200 rounded-lg p-2 bg-slate-50 max-h-[70vh] overflow-auto">
              {previewDoc.file_type.includes("pdf") ? (
                <iframe src={previewDoc.file_url} className="w-full h-[550px] rounded border" />
              ) : (
                <img src={previewDoc.file_url} alt="Uploaded worksheet preview" className="max-w-full max-h-[500px] object-contain rounded" />
              )}
            </div>
            <div className="flex justify-between items-center mt-4">
              <Button variant="outline" render={<a href={previewDoc.file_url} target="_blank" rel="noopener noreferrer" download />}>
                <Download className="mr-2 h-4 w-4" /> Download File
              </Button>
              <Button onClick={() => setPreviewDoc(null)}>Close Preview</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export default CustomerDetailView;
