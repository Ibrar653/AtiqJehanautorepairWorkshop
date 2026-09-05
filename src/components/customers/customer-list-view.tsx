"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getCustomers, createCustomer, updateCustomer, type CustomerWithMetrics } from "@/lib/services/customer-service";
import { softDeleteCustomer } from "@/lib/services/recycle-bin-service";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Pencil, Eye, Trash2, Users, Loader2, Save, AlertCircle, CheckCircle2, Car, ShieldAlert, MoreVertical, X } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { CombinedCustomerVehicleModal } from "@/components/shared/combined-customer-vehicle-modal";
import { usePermissions } from "@/lib/context/auth-context";
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

export function CustomerListView() {
  const { isViewer, canEdit, canDelete } = usePermissions();
  const [customers, setCustomers] = useState<CustomerWithMetrics[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  // Dialog State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [combinedModalOpen, setCombinedModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<CustomerWithMetrics[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);

  const [editingCustomer, setEditingCustomer] = useState<CustomerWithMetrics | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form Fields
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [trnNumber, setTrnNumber] = useState("");
  const [notes, setNotes] = useState("");

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getCustomers(query, page, 20);
      setCustomers(res.customers);
      setTotal(res.total);
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: "error", text: err.message || "Failed to load customers" });
    } finally {
      setLoading(false);
    }
  }, [query, page]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const openCreateDialog = () => {
    setEditingCustomer(null);
    setName("");
    setMobile("");
    setEmail("");
    setAddress("");
    setCompanyName("");
    setTrnNumber("");
    setNotes("");
    setFormError(null);
    setDialogOpen(true);
  };

  const openEditDialog = (customer: CustomerWithMetrics) => {
    setEditingCustomer(customer);
    setName(customer.name || "");
    setMobile(customer.mobile || "");
    setEmail(customer.email || "");
    setAddress(customer.address || "");
    setCompanyName(customer.company_name || "");
    setTrnNumber(customer.trn_number || "");
    setNotes(customer.notes || "");
    setFormError(null);
    setDialogOpen(true);
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedCustomerIds(customers.map((c) => c.id));
    } else {
      setSelectedCustomerIds([]);
    }
  };

  const handleToggleSelectCustomer = (id: string) => {
    setSelectedCustomerIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const openDeleteDialog = (customer: CustomerWithMetrics) => {
    setCustomerToDelete([customer]);
    setDeleteDialogOpen(true);
  };

  const handleRequestBulkDelete = () => {
    if (selectedCustomerIds.length === 0) return;
    const targets = customers.filter((c) => selectedCustomerIds.includes(c.id));
    setCustomerToDelete(targets);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (customerToDelete.length === 0) return;
    setDeleting(true);
    try {
      for (const cust of customerToDelete) {
        await softDeleteCustomer(cust.id, "Owner");
      }
      const count = customerToDelete.length;
      setToastMessage({
        type: "success",
        text: `${count} customer record${count > 1 ? "s" : ""} moved to Recycle Bin.`,
      });
      setSelectedCustomerIds([]);
      setDeleteDialogOpen(false);
      setCustomerToDelete([]);
      loadCustomers();
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: "error", text: err.message || "Failed to delete customer" });
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError("Customer name is required.");
      return;
    }
    setSaving(true);
    setFormError(null);

    const payload = {
      name: name.trim(),
      mobile: mobile.trim() || null,
      email: email.trim() || null,
      address: address.trim() || null,
      company_name: companyName.trim() || null,
      trn_number: trnNumber.trim() || null,
      notes: notes.trim() || null,
    };

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, payload);
        setToastMessage({ type: "success", text: "Customer details updated successfully" });
      } else {
        await createCustomer(payload);
        setToastMessage({ type: "success", text: "New customer registered successfully" });
      }
      setDialogOpen(false);
      loadCustomers();
    } catch (err: any) {
      setFormError(err.message || "Failed to save customer");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
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
        title="Customers & Vehicles"
        description="Comprehensive customer profiles, vehicle fleet, and service history"
      >
        <div className="flex items-center gap-2.5">
          {!isViewer && (
            <>
              <Button onClick={openCreateDialog} variant="outline" className="border-slate-300 font-semibold">
                <Plus className="mr-1.5 h-4 w-4 text-slate-700" />
                Add Customer Only
              </Button>
              <Button onClick={() => setCombinedModalOpen(true)} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md shadow-blue-600/20 font-semibold">
                <Plus className="mr-1.5 h-4 w-4" />
                Add Customer &amp; Vehicle
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="w-full sm:w-96">
          <SearchInput
            placeholder="Search by customer, phone, plate, VIN, make..."
            value={query}
            onChange={setQuery}
          />
        </div>
        <div className="text-xs text-muted-foreground self-end sm:self-center font-medium">
          Showing {customers.length} of {total} active customers
        </div>
      </div>

      {/* Main Customers & Vehicles Table */}
      <Card className="border border-border shadow-xs bg-card overflow-hidden rounded-[10px]">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin mr-2 text-primary" />
              <span className="text-sm font-medium">Loading customer records...</span>
            </div>
          ) : customers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/70 hover:bg-muted/70 border-b border-border h-11">
                  <TableHead className="w-[40px] pl-4">
                    <Checkbox
                      checked={
                        customers.length > 0 && selectedCustomerIds.length === customers.length
                          ? true
                          : selectedCustomerIds.length > 0
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all visible customers"
                    />
                  </TableHead>
                  <TableHead className="font-semibold text-foreground text-table-head">Customer Name</TableHead>
                  <TableHead className="font-semibold text-foreground text-table-head">Mobile / Phone</TableHead>
                  <TableHead className="font-semibold text-foreground text-table-head">Email Address</TableHead>
                  <TableHead className="font-semibold text-foreground text-table-head">Vehicles</TableHead>
                  <TableHead className="text-right font-semibold text-foreground text-table-head">Outstanding</TableHead>
                  <TableHead className="text-right font-semibold text-foreground text-table-head pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-border/60">
                {customers.map((c) => {
                  const balance = c.outstanding_balance || 0;
                  const vehicleSummary = c.vehicles_summary || "No Vehicles";

                  return (
                    <TableRow
                      key={c.id}
                      className={`h-11 hover:bg-muted/30 transition-colors border-b border-border/50 ${
                        selectedCustomerIds.includes(c.id) ? "bg-primary/5" : ""
                      }`}
                    >
                      <TableCell className="pl-4">
                        <Checkbox
                          checked={selectedCustomerIds.includes(c.id)}
                          onCheckedChange={() => handleToggleSelectCustomer(c.id)}
                          aria-label={`Select customer ${c.name}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-foreground text-table">
                        <Link href={`/customers/${c.id}`} className="hover:text-primary hover:underline">
                          {c.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-table">{c.mobile || "—"}</TableCell>
                      <TableCell className="text-muted-foreground text-table">{c.email || "—"}</TableCell>
                      <TableCell>
                        <Link
                          href={`/customers/${c.id}`}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-[6px] text-caption font-medium bg-primary/10 text-primary hover:bg-primary/15 transition-colors border border-primary/20 max-w-[220px] truncate"
                          title="Click to view customer vehicles"
                        >
                          <Car className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="truncate">{vehicleSummary}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-medium text-table tabular-nums">
                        {balance > 0 ? (
                          <span className="text-amber-600 dark:text-amber-400 font-semibold">{formatCurrency(balance)}</span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 font-normal">0.00 AED</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right pr-4">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<Link href={`/customers/${c.id}`} />}
                            title="View Customer & Vehicles"
                            className="h-8 px-2 text-xs text-primary hover:text-primary hover:bg-primary/10 rounded-lg"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" /> View
                          </Button>

                          <DropdownMenu>
                            <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40 text-xs shadow-md border-border">
                              <DropdownMenuLabel>Customer Actions</DropdownMenuLabel>
                              <DropdownMenuItem render={<Link href={`/customers/${c.id}`} />}>
                                <Eye className="h-3.5 w-3.5 mr-2 text-primary" /> View Profile
                              </DropdownMenuItem>
                              {canEdit && (
                                <DropdownMenuItem onClick={() => openEditDialog(c)}>
                                  <Pencil className="h-3.5 w-3.5 mr-2 text-muted-foreground" /> Edit Details
                                </DropdownMenuItem>
                              )}
                              {!isViewer && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openDeleteDialog(c)}
                                    className="text-destructive hover:text-destructive font-semibold focus:text-destructive"
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
          ) : (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/30 stroke-1 mb-2" />
              <h3 className="text-section font-semibold text-foreground">No active customers found</h3>
              <p className="text-caption text-muted-foreground mt-1">
                {query ? "No active records match your search criteria" : "Get started by adding your first customer"}
              </p>
              {!query && !isViewer && (
                <Button onClick={openCreateDialog} className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs h-9 text-xs rounded-lg font-medium">
                  <Plus className="mr-1.5 h-4 w-4" /> Add Customer
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / Edit Customer Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-card border border-border shadow-md rounded-[10px] p-6">
          <DialogTitle className="text-section font-semibold text-foreground">{editingCustomer ? "Edit Customer Profile" : "New Customer Registration"}</DialogTitle>
          <DialogDescription className="text-caption text-muted-foreground">
            {editingCustomer ? "Update customer details and contact info" : "Add a new customer to the workshop system"}
          </DialogDescription>
          <form onSubmit={handleSave} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name" className="text-xs font-semibold text-slate-700">Full Name <span className="text-destructive">*</span></Label>
              <Input
                id="cust-name"
                placeholder="e.g. Mohammed Al Mansoori"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-mobile" className="text-xs font-semibold text-slate-700">Mobile Number</Label>
                <Input
                  id="cust-mobile"
                  placeholder="+971 50 123 4567"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-email" className="text-xs font-semibold text-slate-700">Email Address</Label>
                <Input
                  id="cust-email"
                  type="email"
                  placeholder="customer@example.ae"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-address" className="text-xs font-semibold text-slate-700">Address / Location</Label>
              <Input
                id="cust-address"
                placeholder="e.g. Industrial Area, Abu Dhabi"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="cust-company" className="text-xs font-semibold text-slate-700">Company Name (Optional)</Label>
                <Input
                  id="cust-company"
                  placeholder="e.g. Al Dhafra Transport LLC"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-trn" className="text-xs font-semibold text-blue-700">Company / Customer TRN No. (Optional)</Label>
                <Input
                  id="cust-trn"
                  placeholder="e.g. 100123456789003"
                  value={trnNumber}
                  onChange={(e) => setTrnNumber(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-notes" className="text-xs font-semibold text-slate-700">Customer Notes</Label>
              <Textarea
                id="cust-notes"
                placeholder="Special preferences, corporate account details, VIP notes..."
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white">
                {saving ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="mr-2 h-4 w-4" /> {editingCustomer ? "Update Customer" : "Save Customer"}</>
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Modal */}
      <RecordDeleteDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        recordType="Customer"
        recordTypePlural="Customers"
        recordCount={customerToDelete.length}
        singleRecordIdentifier={customerToDelete[0]?.name}
        onConfirmDelete={handleConfirmDelete}
        isDeleting={deleting}
      />

      {/* Sticky Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedCustomerIds.length}
        onDeleteSelected={handleRequestBulkDelete}
        onClearSelection={() => setSelectedCustomerIds([])}
        isDeleting={deleting}
      />

      {/* Combined Customer & Vehicle Entry Modal */}
      <CombinedCustomerVehicleModal
        open={combinedModalOpen}
        onOpenChange={setCombinedModalOpen}
        onSuccess={(cust, veh) => {
          setToastMessage({
            type: "success",
            text: `Customer "${cust.name}" and Vehicle "${veh.make} ${veh.model}" saved successfully.`,
          });
          loadCustomers();
        }}
      />
    </div>
  );
}

export default CustomerListView;
