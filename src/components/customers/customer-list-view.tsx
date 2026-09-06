"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { getCustomers, createCustomer, updateCustomer, type CustomerWithMetrics } from "@/lib/services/customer-service";
import { softDeleteCustomer } from "@/lib/services/recycle-bin-service";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Pencil,
  Eye,
  Trash2,
  Users,
  Loader2,
  Save,
  AlertCircle,
  CheckCircle2,
  Car,
  MoreVertical,
  Building2,
  DollarSign,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
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

  // Real Metric Summaries
  const metrics = useMemo(() => {
    const totalBalance = customers.reduce((acc, c) => acc + (Number(c.outstanding_balance) || 0), 0);
    const totalVehicles = customers.reduce(
      (acc, c) => acc + (c.vehicles_count ?? (c.vehicles_summary ? c.vehicles_summary.split(",").length : 0)),
      0
    );
    const corporateCount = customers.filter((c) => !!c.company_name).length;
    return {
      totalCustomers: total,
      totalVehicles,
      totalBalance,
      corporateCount,
    };
  }, [customers, total]);

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
        title="Customers"
        description="Manage workshop customers, vehicles and service relationships."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Customers" }]}
      >
        <div className="flex items-center gap-2.5">
          {!isViewer && (
            <>
              <Button
                onClick={openCreateDialog}
                variant="outline"
                className="h-10 px-3.5 text-xs font-semibold rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5 text-slate-500" />
                Add Customer Only
              </Button>
              <Button
                onClick={() => setCombinedModalOpen(true)}
                className="h-10 px-4 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs gap-1.5 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Add Customer &amp; Vehicle
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Customers */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Customers</p>
            <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Users className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{total}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Active workshop accounts</p>
          </div>
        </div>

        {/* Registered Fleet */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Active Vehicles</p>
            <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Car className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{metrics.totalVehicles}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Linked customer vehicles</p>
          </div>
        </div>

        {/* Corporate Accounts */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Corporate Accounts</p>
            <div className="h-8 w-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className="text-2xl font-bold text-slate-900 font-mono tracking-tight">{metrics.corporateCount}</h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Companies with registered TRN</p>
          </div>
        </div>

        {/* Outstanding Receivables */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Outstanding Balance</p>
            <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3">
            <h3 className={`text-2xl font-bold font-mono tracking-tight ${metrics.totalBalance > 0 ? "text-amber-600" : "text-slate-900"}`}>
              {formatCurrency(metrics.totalBalance)}
            </h3>
            <p className="text-[11px] text-slate-400 font-medium mt-1">Total unpaid customer balance</p>
          </div>
        </div>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="w-full sm:w-96">
          <SearchInput
            placeholder="Search by customer name, phone, plate, VIN..."
            value={query}
            onChange={setQuery}
          />
        </div>
        <div className="text-xs text-slate-500 self-end sm:self-center font-medium bg-white px-3.5 py-2 rounded-xl border border-slate-200/90 shadow-2xs">
          Showing <span className="font-bold text-slate-900 font-mono">{customers.length}</span> of <span className="font-bold text-slate-900 font-mono">{total}</span> customers
        </div>
      </div>

      {/* Main Customers Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div>
          {loading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="h-7 w-7 animate-spin mr-2.5 text-blue-600" />
              <span className="text-xs font-medium">Loading customer records...</span>
            </div>
          ) : customers.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                    <TableHead className="w-[44px] pl-4">
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
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Customer</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Phone / Mobile</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Company / TRN</TableHead>
                    <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider">Vehicles</TableHead>
                    <TableHead className="text-right font-bold text-slate-500 text-[11px] uppercase tracking-wider">Outstanding</TableHead>
                    <TableHead className="text-center font-bold text-slate-500 text-[11px] uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-right font-bold text-slate-500 text-[11px] uppercase tracking-wider pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody className="divide-y divide-slate-100">
                  {customers.map((c) => {
                    const balance = Number(c.outstanding_balance) || 0;
                    const vehicleSummary = c.vehicles_summary || "No Vehicles";

                    return (
                      <TableRow
                        key={c.id}
                        className={`h-12 hover:bg-muted/40 transition-colors border-b border-border/50 ${
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
                        <TableCell>
                          <div>
                            <Link
                              href={`/customers/${c.id}`}
                              className="font-semibold text-foreground text-xs hover:text-primary hover:underline transition-colors block"
                            >
                              {c.name}
                            </Link>
                            {c.email && (
                              <span className="text-[11px] text-muted-foreground truncate block max-w-[200px]">
                                {c.email}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs font-mono font-medium text-foreground">
                            {c.mobile || "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {c.company_name ? (
                            <div>
                              <span className="text-xs font-medium text-foreground block truncate max-w-[160px]">
                                {c.company_name}
                              </span>
                              {c.trn_number && (
                                <span className="text-[10px] font-mono text-primary font-semibold">
                                  TRN: {c.trn_number}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/customers/${c.id}`}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted/60 text-foreground hover:bg-muted hover:text-primary transition-colors border border-border/60 max-w-[200px] truncate"
                            title="Click to view registered customer vehicles"
                          >
                            <Car className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="truncate">{vehicleSummary}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums">
                          {balance > 0 ? (
                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                              {formatCurrency(balance)}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              0.00 AED
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
                            Active
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              render={<Link href={`/customers/${c.id}`} />}
                              title="View Customer Profile"
                              className="h-8 px-2 text-xs font-semibold text-primary hover:text-primary hover:bg-primary/10 rounded-lg"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/40">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40 text-xs shadow-md border-border rounded-lg">
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
            </div>
          ) : (
            <div className="py-16 text-center text-muted-foreground flex flex-col items-center justify-center px-4">
              <Users className="h-10 w-10 mx-auto text-muted-foreground/30 stroke-1 mb-2" />
              <h3 className="text-sm font-semibold text-foreground">No customers found</h3>
              <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                {query ? "No customer records match your current search query." : "Get started by adding your first workshop customer."}
              </p>
              {!query && !isViewer && (
                <Button
                  onClick={openCreateDialog}
                  className="mt-4 bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs h-9 text-xs rounded-lg font-semibold"
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5" /> Add Customer
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md bg-card border border-border shadow-lg rounded-xl p-6">
          <DialogTitle className="text-base font-bold text-foreground">
            {editingCustomer ? "Edit Customer Details" : "New Customer Registration"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {editingCustomer ? "Update contact information and preferences" : "Register a customer to open service orders and job cards"}
          </DialogDescription>
          <form onSubmit={handleSave} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="cust-name" className="text-xs font-semibold text-foreground">
                Customer / Owner Name <span className="text-destructive">*</span>
              </Label>
              <Input
                id="cust-name"
                placeholder="e.g. Mohammed Al Mansoori"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-10 text-sm rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-mobile" className="text-xs font-semibold text-foreground">Mobile Number</Label>
                <Input
                  id="cust-mobile"
                  placeholder="+971 50 123 4567"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="h-10 text-sm rounded-lg font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-email" className="text-xs font-semibold text-foreground">Email Address</Label>
                <Input
                  id="cust-email"
                  type="email"
                  placeholder="customer@example.ae"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 text-sm rounded-lg"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-address" className="text-xs font-semibold text-foreground">Address / Emirate</Label>
              <Input
                id="cust-address"
                placeholder="e.g. Mussafah M-14, Abu Dhabi, UAE"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="h-10 text-sm rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cust-company" className="text-xs font-semibold text-foreground">Company Name (Optional)</Label>
                <Input
                  id="cust-company"
                  placeholder="e.g. Al Dhafra Transport LLC"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="h-10 text-sm rounded-lg"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cust-trn" className="text-xs font-semibold text-primary">TRN Number (Optional)</Label>
                <Input
                  id="cust-trn"
                  placeholder="e.g. 100123456789003"
                  value={trnNumber}
                  onChange={(e) => setTrnNumber(e.target.value)}
                  className="h-10 text-sm rounded-lg font-mono"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cust-notes" className="text-xs font-semibold text-foreground">Customer Notes</Label>
              <Textarea
                id="cust-notes"
                placeholder="Special preferences, corporate terms, fleet notes..."
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="text-xs rounded-lg"
              />
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
                className="h-9 px-4 text-xs font-medium rounded-lg"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={saving}
                className="h-9 px-4 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {saving ? (
                  <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Saving...</>
                ) : (
                  <><Save className="mr-1.5 h-3.5 w-3.5" /> {editingCustomer ? "Update Customer" : "Save Customer"}</>
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
