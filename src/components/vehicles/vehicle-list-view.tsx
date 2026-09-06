"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getVehicles, createVehicle, updateVehicle } from "@/lib/services/vehicle-service";
import { CustomerSearchSelect } from "@/components/shared/customer-search-select";
import type { Vehicle } from "@/types/database";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Eye, Car, Loader2, Save, AlertCircle, CheckCircle2, ClipboardList, User, Hash, Calendar, MoreVertical, Trash2, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { CombinedCustomerVehicleModal } from "@/components/shared/combined-customer-vehicle-modal";
import { usePermissions } from "@/lib/context/auth-context";
import { softDeleteVehicle } from "@/lib/services/recycle-bin-service";
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

export function VehicleListView() {
  const { isViewer, canEdit } = usePermissions();
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [combinedModalOpen, setCombinedModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Bulk & Single Delete State
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [vehiclesToDelete, setVehiclesToDelete] = useState<any[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Form Fields
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [chassisVin, setChassisVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [notes, setNotes] = useState("");

  const loadVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getVehicles(query, page, 20);
      setVehicles(res.vehicles);
      setTotal(res.total);
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: "error", text: err.message || "Failed to load vehicles" });
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    loadVehicles();
  }, [loadVehicles]);

  const openCreateDialog = () => {
    setEditingVehicle(null);
    setCustomerId(null);
    setMake("");
    setModel("");
    setYear(new Date().getFullYear().toString());
    setColor("");
    setChassisVin("");
    setMileage("");
    setRegistrationNumber("");
    setNotes("");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (v: any) => {
    setEditingVehicle(v);
    setCustomerId(v.customer_id || null);
    setMake(v.make || "");
    setModel(v.model || "");
    setYear(v.year?.toString() || "");
    setColor(v.color || "");
    setChassisVin(v.chassis_vin || "");
    setMileage(v.mileage?.toString() || "");
    setRegistrationNumber(v.registration_number || "");
    setNotes(v.notes || "");
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) {
      setFormError("Please select a customer.");
      return;
    }
    if (!make.trim() || !model.trim()) {
      setFormError("Make and Model are required.");
      return;
    }

    setSaving(true);
    setFormError(null);

    const payload = {
      customer_id: customerId,
      make: make.trim(),
      model: model.trim(),
      year: year ? parseInt(year) : null,
      color: color.trim() || null,
      chassis_vin: chassisVin.trim() || null,
      mileage: mileage ? parseInt(mileage) : null,
      registration_number: registrationNumber.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      if (editingVehicle) {
        await updateVehicle(editingVehicle.id, payload);
        setToastMessage({ type: "success", text: `Vehicle "${make} ${model}" updated successfully.` });
      } else {
        await createVehicle(payload);
        setToastMessage({ type: "success", text: `New vehicle "${make} ${model}" registered.` });
      }
      setDialogOpen(false);
      loadVehicles();
    } catch (err: any) {
      setFormError(err.message || "Failed to save vehicle");
    } finally {
      setSaving(false);
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedVehicleIds(vehicles.map((v) => v.id));
    } else {
      setSelectedVehicleIds([]);
    }
  };

  const handleToggleSelectVehicle = (id: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openDeleteDialog = (v: any) => {
    setVehiclesToDelete([v]);
    setDeleteDialogOpen(true);
  };

  const handleRequestBulkDelete = () => {
    if (selectedVehicleIds.length === 0) return;
    const targets = vehicles.filter((v) => selectedVehicleIds.includes(v.id));
    setVehiclesToDelete(targets);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (vehiclesToDelete.length === 0) return;
    setDeleting(true);
    try {
      for (const v of vehiclesToDelete) {
        await softDeleteVehicle(v.id, "Owner");
      }
      const count = vehiclesToDelete.length;
      setToastMessage({
        type: "success",
        text: `${count} vehicle record${count > 1 ? "s" : ""} moved to Recycle Bin.`,
      });
      setSelectedVehicleIds([]);
      setDeleteDialogOpen(false);
      setVehiclesToDelete([]);
      loadVehicles();
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: "error", text: err.message || "Failed to delete vehicle" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vehicles"
        description="Vehicle registry, specifications, and service history"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Vehicles" }]}
        actions={
          !isViewer ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={openCreateDialog}>
                <Plus className="mr-1.5 h-4 w-4" /> Add Vehicle Only
              </Button>
              <Button onClick={() => setCombinedModalOpen(true)} className="gap-2 font-bold shadow-sm">
                <Plus className="h-4 w-4" /> + Add Customer &amp; Vehicle
              </Button>
            </div>
          ) : undefined
        }
      />

      {toastMessage && (
        <div
          className={`flex items-center justify-between p-4 rounded-lg border text-sm ${
            toastMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-500"
              : "bg-red-500/10 border-red-500/20 text-red-500"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-xs hover:underline">Dismiss</button>
        </div>
      )}

      {/* Top 4 KPI Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Vehicles</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">{total}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Car className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Linked Customers</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {vehicles.filter((v) => v.customer_id).length}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <User className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Unique Makes</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-purple-700 mt-0.5">
              {new Set(vehicles.map((v) => v.make).filter(Boolean)).size}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <Hash className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Active Fleet</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-0.5">
              {vehicles.length}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <ClipboardList className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Unified Search & Count Toolbar */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex-1 max-w-md">
          <SearchInput
            placeholder="Search by make, model, plate, or VIN..."
            onSearch={(q) => {
              setQuery(q);
              setPage(1);
            }}
            defaultValue={query}
            className="w-full"
          />
        </div>
        <div className="text-xs text-muted-foreground font-medium">
          Showing <span className="font-semibold font-mono text-foreground">{vehicles.length}</span> of <span className="font-semibold font-mono text-foreground">{total}</span> vehicles
        </div>
      </div>

      {/* Vehicles Table */}
      <div className="border border-slate-200/80 rounded-xl bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
            <p className="text-sm font-medium">Loading vehicles...</p>
          </div>
        ) : vehicles.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-10 bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80">
                  <TableHead className="w-[40px] pl-4">
                    <Checkbox
                      checked={
                        vehicles.length > 0 && selectedVehicleIds.length === vehicles.length
                          ? true
                          : selectedVehicleIds.length > 0
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all visible vehicles"
                    />
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Make / Model</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Year</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Registration Plate</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Customer Owner</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Chassis / VIN</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Mileage (KM)</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Vehicle Added Date</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right pr-4 w-[140px] whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {vehicles.map((v) => (
                  <TableRow
                    key={v.id}
                    className={`h-12 hover:bg-slate-50/70 transition-colors ${
                      selectedVehicleIds.includes(v.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <TableCell className="pl-4 py-2">
                      <Checkbox
                        checked={selectedVehicleIds.includes(v.id)}
                        onCheckedChange={() => handleToggleSelectVehicle(v.id)}
                        aria-label={`Select vehicle ${v.make} ${v.model}`}
                      />
                    </TableCell>
                    <TableCell className="font-semibold text-slate-900 py-2">
                      <Link href={`/vehicles/${v.id}`} className="hover:text-primary transition-colors">
                        {v.make} {v.model}
                      </Link>
                    </TableCell>
                    <TableCell className="py-2 font-mono tabular-nums">{v.year || "—"}</TableCell>
                    <TableCell className="font-bold text-primary py-2 font-mono tabular-nums">{v.registration_number || "—"}</TableCell>
                    <TableCell className="py-2">
                      {v.customer ? (
                        <Link href={`/customers/${v.customer_id}`} className="inline-flex items-center gap-1 hover:underline font-medium text-slate-800">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {v.customer.name}
                        </Link>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground font-semibold py-2">{v.chassis_vin || "—"}</TableCell>
                    <TableCell className="py-2 font-mono tabular-nums">{v.mileage ? `${v.mileage.toLocaleString()} km` : "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground py-2">{formatDate(v.created_at)}</TableCell>
                    <TableCell className="text-right pr-4 py-2 w-[140px] whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          render={<Link href={`/vehicles/${v.id}`} />}
                          title="View Details & History"
                          className="h-8 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 font-medium"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" /> View
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-44 text-xs">
                            <DropdownMenuLabel>Vehicle Actions</DropdownMenuLabel>
                            <DropdownMenuItem render={<Link href={`/vehicles/${v.id}`} />}>
                              <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" /> View History
                            </DropdownMenuItem>
                            {canEdit && (
                              <DropdownMenuItem onClick={() => openEditDialog(v)}>
                                <Pencil className="h-3.5 w-3.5 mr-2 text-slate-600" /> Edit Details
                              </DropdownMenuItem>
                            )}
                            {canEdit && (
                              <DropdownMenuItem render={<Link href={`/job-cards/new?customer_id=${v.customer_id}&vehicle_id=${v.id}`} />}>
                                <ClipboardList className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Open Job Card
                              </DropdownMenuItem>
                            )}
                            {!isViewer && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(v)}
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
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="py-12 px-4 text-center text-muted-foreground">
            <Car className="h-10 w-10 mx-auto text-slate-300 mb-2.5" />
            <h3 className="text-sm font-bold text-slate-900">No vehicles registered</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {query ? "No vehicle records match your search terms." : "Register workshop customer vehicles to link repair job cards."}
            </p>
            {!query && (
              <Button onClick={openCreateDialog} size="sm" className="mt-3.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold">
                <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Vehicle
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Vehicle Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogTitle>{editingVehicle ? "Edit Vehicle Details" : "Register New Vehicle"}</DialogTitle>
          <DialogDescription>
            {editingVehicle ? "Update vehicle parameters and owner" : "Search and select customer owner to link vehicle"}
          </DialogDescription>
          <form onSubmit={handleSave} className="space-y-4 mt-4">
            {/* Searchable Reusable Customer Selector Component */}
            <CustomerSearchSelect
              selectedCustomerId={customerId}
              onSelectCustomer={(c) => setCustomerId(c ? c.id : null)}
            />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="v-make">Make <span className="text-destructive">*</span></Label>
                <Input id="v-make" placeholder="Toyota, Nissan, BMW..." value={make} onChange={(e) => setMake(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-model">Model <span className="text-destructive">*</span></Label>
                <Input id="v-model" placeholder="Camry, Patrol, X5..." value={model} onChange={(e) => setModel(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="v-year">Year</Label>
                <Input id="v-year" type="number" placeholder="2024" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-color">Color</Label>
                <Input id="v-color" placeholder="White, Black..." value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-mileage">Mileage (KM)</Label>
                <Input id="v-mileage" type="number" placeholder="50000" value={mileage} onChange={(e) => setMileage(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="v-reg">Registration Plate</Label>
                <Input id="v-reg" placeholder="e.g. Dubai A-12345" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="v-vin">Chassis / VIN Number</Label>
                <Input id="v-vin" placeholder="17-digit Chassis / VIN" value={chassisVin} onChange={(e) => setChassisVin(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="v-notes">Vehicle Notes</Label>
              <Textarea id="v-notes" placeholder="Modification notes, engine size, special instructions..." rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Vehicle"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Combined Customer & Vehicle Entry Modal */}
      <CombinedCustomerVehicleModal
        open={combinedModalOpen}
        onOpenChange={setCombinedModalOpen}
        onSuccess={(cust, veh) => {
          setToastMessage({
            type: "success",
            text: `Customer "${cust.name}" and Vehicle "${veh.make} ${veh.model}" saved successfully.`,
          });
          loadVehicles();
        }}
      />

      {/* Sticky Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedVehicleIds.length}
        onDeleteSelected={handleRequestBulkDelete}
        onClearSelection={() => setSelectedVehicleIds([])}
        isDeleting={deleting}
      />

      {/* Confirmation & Safety Delete Dialog */}
      <RecordDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        recordType="Vehicle"
        recordTypePlural="Vehicles"
        recordCount={vehiclesToDelete.length}
        singleRecordIdentifier={vehiclesToDelete[0] ? `${vehiclesToDelete[0].make} ${vehiclesToDelete[0].model} (${vehiclesToDelete[0].registration_number || "No Plate"})` : undefined}
        onConfirmDelete={handleConfirmDelete}
        isDeleting={deleting}
      />
    </div>
  );
}
