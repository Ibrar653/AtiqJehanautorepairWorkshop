"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getServices,
  createService,
  updateService,
  toggleServiceStatus,
  deleteService,
  getServiceUsage,
  SERVICE_CATEGORIES,
} from "@/lib/services/service-catalog-service";
import type { Service, ServiceUsageRecord } from "@/types/database";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Wrench,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Clock,
  Tag,
  History,
  Check,
  PowerOff,
  Filter,
  Layers,
  MoreVertical,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
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

// Category badge styles (Professional White + Blue Workshop Palette)
const CATEGORY_STYLES: Record<string, { bg: string; text: string; border: string }> = {
  Engine: { bg: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800", text: "text-blue-700", border: "border-blue-200" },
  AC: { bg: "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-300 dark:border-cyan-800", text: "text-cyan-700", border: "border-cyan-200" },
  Brakes: { bg: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800", text: "text-rose-700", border: "border-rose-200" },
  Suspension: { bg: "bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800", text: "text-purple-700", border: "border-purple-200" },
  Electrical: { bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800", text: "text-amber-700", border: "border-amber-200" },
  Transmission: { bg: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800", text: "text-indigo-700", border: "border-indigo-200" },
  "General Maintenance": { bg: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700", text: "text-slate-700", border: "border-slate-300" },
  Other: { bg: "bg-zinc-100 text-zinc-700 border-zinc-300 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700", text: "text-zinc-700", border: "border-zinc-300" },
};

function getCategoryBadge(category?: string | null) {
  const cat = category || "General Maintenance";
  const style = CATEGORY_STYLES[cat] || CATEGORY_STYLES["Other"];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-[6px] text-[11px] font-semibold border ${style.bg}`}
    >
      <Tag className="h-3 w-3 shrink-0" />
      {cat}
    </span>
  );
}

export function ServiceListView() {
  const { canDelete, isOwner } = usePermissions();
  const isOwnerOrAdmin = isOwner || canDelete;

  const [services, setServices] = useState<Service[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(true);

  // Dialog State: Create / Edit
  const [formDialogOpen, setFormDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Dialog State: View Usage
  const [usageDialogOpen, setUsageDialogOpen] = useState(false);
  const [selectedServiceForUsage, setSelectedServiceForUsage] = useState<Service | null>(null);
  const [usageRecords, setUsageRecords] = useState<ServiceUsageRecord[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(false);

  // Selection & Bulk Delete State
  const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [servicesToDelete, setServicesToDelete] = useState<Service[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Toast Notification
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Form Field States
  const [formName, setFormName] = useState("");
  const [formCategory, setFormCategory] = useState("General Maintenance");
  const [customCategory, setCustomCategory] = useState("");
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [formDescription, setFormDescription] = useState("");
  const [formPrice, setFormPrice] = useState("100");
  const [formEstimatedTime, setFormEstimatedTime] = useState("45 mins");
  const [formActive, setFormActive] = useState(true);

  const loadServices = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getServices(false);
      setServices(data);
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: "error", text: err.message || "Failed to load services catalog" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  // Available unique categories
  const availableCategories = useMemo(() => {
    const set = new Set<string>(SERVICE_CATEGORIES);
    services.forEach((s) => {
      if (s.category && s.category.trim()) set.add(s.category.trim());
    });
    return Array.from(set);
  }, [services]);

  // Filtered Services based on search, category, status
  const filteredServices = useMemo(() => {
    return services.filter((s) => {
      // Status filter
      if (statusFilter === "active" && !s.is_active) return false;
      if (statusFilter === "inactive" && s.is_active) return false;

      // Category filter
      if (selectedCategory !== "all" && s.category?.toLowerCase() !== selectedCategory.toLowerCase()) {
        return false;
      }

      // Search query (debounced)
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchesName = s.name.toLowerCase().includes(q);
        const matchesCat = s.category ? s.category.toLowerCase().includes(q) : false;
        const matchesDesc = s.description ? s.description.toLowerCase().includes(q) : false;
        return matchesName || matchesCat || matchesDesc;
      }

      return true;
    });
  }, [services, searchQuery, selectedCategory, statusFilter]);

  // Open Create Dialog
  const openCreateDialog = () => {
    setEditingService(null);
    setFormName("");
    setFormCategory("General Maintenance");
    setCustomCategory("");
    setIsCustomCategory(false);
    setFormDescription("");
    setFormPrice("150");
    setFormEstimatedTime("45 mins");
    setFormActive(true);
    setFormError(null);
    setFormDialogOpen(true);
  };

  // Open Edit Dialog
  const openEditDialog = (service: Service) => {
    setEditingService(service);
    setFormName(service.name);

    const cat = service.category || "General Maintenance";
    if (SERVICE_CATEGORIES.includes(cat as any)) {
      setFormCategory(cat);
      setIsCustomCategory(false);
      setCustomCategory("");
    } else {
      setFormCategory("custom");
      setIsCustomCategory(true);
      setCustomCategory(cat);
    }

    setFormDescription(service.description || "");
    setFormPrice(service.default_price.toString());
    setFormEstimatedTime(service.estimated_time || "45 mins");
    setFormActive(service.is_active);
    setFormError(null);
    setFormDialogOpen(true);
  };

  // Open View Usage Dialog
  const openUsageDialog = async (service: Service) => {
    setSelectedServiceForUsage(service);
    setUsageDialogOpen(true);
    setLoadingUsage(true);
    try {
      const records = await getServiceUsage(service.id, service.name);
      setUsageRecords(records);
    } catch (err) {
      console.error("Failed to load service usage", err);
      setUsageRecords([]);
    } finally {
      setLoadingUsage(false);
    }
  };

  // Checkbox handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedServiceIds(filteredServices.map((s) => s.id));
    } else {
      setSelectedServiceIds([]);
    }
  };

  const handleToggleSelectService = (id: string) => {
    setSelectedServiceIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // Open Delete Dialog
  const openDeleteDialog = (service: Service) => {
    setServicesToDelete([service]);
    setDeleteModalOpen(true);
  };

  const handleRequestBulkDelete = () => {
    if (selectedServiceIds.length === 0) return;
    const targets = services.filter((s) => selectedServiceIds.includes(s.id));
    setServicesToDelete(targets);
    setDeleteModalOpen(true);
  };

  // Confirm Delete
  const handleConfirmDelete = async () => {
    if (servicesToDelete.length === 0) return;
    setDeleting(true);
    let deactivatedCount = 0;
    let deletedCount = 0;
    try {
      for (const s of servicesToDelete) {
        const res = await deleteService(s.id, s.name);
        if (res.deactivated) {
          deactivatedCount++;
        } else {
          deletedCount++;
        }
      }

      if (deactivatedCount > 0 && deletedCount === 0) {
        setToastMessage({
          type: "success",
          text: `${deactivatedCount} service${deactivatedCount > 1 ? "s" : ""} had active Job Card history and were safely deactivated to protect repair records.`,
        });
      } else if (deactivatedCount > 0 && deletedCount > 0) {
        setToastMessage({
          type: "success",
          text: `${deletedCount} service${deletedCount > 1 ? "s" : ""} deleted, and ${deactivatedCount} deactivated due to existing history.`,
        });
      } else {
        setToastMessage({
          type: "success",
          text: `${deletedCount} service${deletedCount > 1 ? "s" : ""} deleted successfully.`,
        });
      }

      setDeleteModalOpen(false);
      setServicesToDelete([]);
      setSelectedServiceIds([]);
      await loadServices();
    } catch (err: any) {
      setToastMessage({
        type: "error",
        text: err.message || "Failed to delete service(s)",
      });
    } finally {
      setDeleting(false);
    }
  };

  // Handle Form Submission (Create or Update)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("Service name is required.");
      return;
    }

    const price = parseFloat(formPrice);
    if (isNaN(price) || price < 0) {
      setFormError("Please enter a valid default price.");
      return;
    }

    const finalCategory = isCustomCategory
      ? customCategory.trim() || "General Maintenance"
      : formCategory;

    setSaving(true);
    setFormError(null);

    try {
      if (editingService) {
        await updateService(editingService.id, {
          name: formName.trim(),
          category: finalCategory,
          description: formDescription.trim() || null,
          default_price: price,
          estimated_time: formEstimatedTime.trim() || "45 mins",
          is_active: formActive,
        });
        setToastMessage({ type: "success", text: `Service "${formName}" updated successfully.` });
      } else {
        await createService({
          name: formName.trim(),
          category: finalCategory,
          description: formDescription.trim() || null,
          default_price: price,
          estimated_time: formEstimatedTime.trim() || "45 mins",
          is_active: formActive,
        });
        setToastMessage({ type: "success", text: `New service "${formName}" added to catalog.` });
      }

      setFormDialogOpen(false);
      await loadServices();
    } catch (err: any) {
      setFormError(err.message || "Failed to save service");
    } finally {
      setSaving(false);
    }
  };

  // Handle Status Toggle (Activate / Deactivate)
  const handleToggleStatus = async (service: Service) => {
    try {
      await toggleServiceStatus(service.id, service.is_active);
      setToastMessage({
        type: "success",
        text: `Service "${service.name}" is now ${!service.is_active ? "Active" : "Inactive"}.`,
      });
      await loadServices();
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to update status" });
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Services Catalog"
        description="Manage workshop service catalog rates, estimated labour times, and job card usage"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Services" }]}
        actions={
          <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700 text-white shadow-sm font-semibold">
            <Plus className="mr-2 h-4 w-4" /> Add Service
          </Button>
        }
      />

      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-sm transition-all animate-in fade-in duration-200 ${
            toastMessage.type === "success"
              ? "bg-blue-50 border-blue-200 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300"
              : "bg-rose-50 border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-300"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
            )}
            <span className="font-medium">{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-xs opacity-70 hover:opacity-100 underline ml-4 font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Services</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-slate-900 mt-0.5">{services.length}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">Active Services</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-emerald-700 mt-0.5">
              {services.filter((s) => s.is_active).length}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-purple-700 uppercase tracking-wider">Categories</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-purple-700 mt-0.5">
              {availableCategories.length}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <Layers className="w-4 h-4" />
          </div>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-3.5 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold text-amber-700 uppercase tracking-wider">Total Job Usage</p>
            <p className="text-2xl font-bold font-mono tabular-nums text-amber-700 mt-0.5">
              {services.reduce((acc, s) => acc + (s.usage_count || 0), 0)}
            </p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <History className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Search & Category Filter Card */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-center justify-between">
          {/* Search Input */}
          <div className="w-full md:max-w-md">
            <SearchInput
              placeholder="Search services by name or category..."
              onSearch={setSearchQuery}
              defaultValue={searchQuery}
              className="w-full"
            />
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1.5 self-start md:self-auto shrink-0">
            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
              <Filter className="h-3.5 w-3.5 text-blue-600" /> Status:
            </span>
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  statusFilter === "all"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                All ({services.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("active")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  statusFilter === "active"
                    ? "bg-white text-blue-600 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Active ({services.filter((s) => s.is_active).length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("inactive")}
                className={`px-3 py-1 rounded-md font-semibold transition-all ${
                  statusFilter === "inactive"
                    ? "bg-white text-slate-700 shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Inactive ({services.filter((s) => !s.is_active).length})
              </button>
            </div>
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap pt-2.5 border-t border-slate-100">
          <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
            <Layers className="h-3.5 w-3.5 text-blue-600" /> Category:
          </span>
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${
              selectedCategory === "all"
                ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
            }`}
          >
            All Categories
          </button>
          {availableCategories.map((cat) => {
            const count = services.filter((s) => s.category?.toLowerCase() === cat.toLowerCase()).length;
            const isSelected = selectedCategory.toLowerCase() === cat.toLowerCase();
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(isSelected ? "all" : cat)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                  isSelected
                    ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span>{cat}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold font-mono ${
                    isSelected
                      ? "bg-white/20 text-white"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Services Table */}
      <div className="border border-slate-200/80 rounded-xl bg-white shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-blue-600" />
            <p className="font-medium text-sm">Loading services catalog...</p>
          </div>
        ) : filteredServices.length > 0 ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="h-10 bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80">
                  <TableHead className="w-[40px] pl-4">
                    <Checkbox
                      checked={
                        filteredServices.length > 0 && selectedServiceIds.length === filteredServices.length
                          ? true
                          : selectedServiceIds.length > 0
                          ? "indeterminate"
                          : false
                      }
                      onCheckedChange={handleSelectAll}
                      aria-label="Select all visible services"
                    />
                  </TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Service Name</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Category</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right">Default Price</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">Estimated Time</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-center">Times Used</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-center">Status</TableHead>
                  <TableHead className="text-[11px] font-semibold uppercase tracking-wider text-slate-600 text-right pr-4 w-[140px] whitespace-nowrap">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-slate-100">
                {filteredServices.map((service) => (
                  <TableRow
                    key={service.id}
                    className={`h-12 hover:bg-slate-50/70 transition-colors ${
                      selectedServiceIds.includes(service.id) ? "bg-blue-50/40 dark:bg-blue-950/20" : ""
                    } ${!service.is_active ? "opacity-60 bg-slate-50/40" : ""}`}
                  >
                    <TableCell className="pl-4 py-2">
                      <Checkbox
                        checked={selectedServiceIds.includes(service.id)}
                        onCheckedChange={() => handleToggleSelectService(service.id)}
                        aria-label={`Select ${service.name}`}
                      />
                    </TableCell>
                    {/* Service Name & Short Description */}
                    <TableCell className="font-semibold text-foreground py-2">
                      <div className="flex items-center gap-2.5">
                        <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100 shrink-0">
                          <Wrench className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm leading-tight">
                            {service.name}
                          </p>
                          {service.description ? (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1 font-normal">
                              {service.description}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    </TableCell>

                    {/* Category */}
                    <TableCell className="py-2">
                      {getCategoryBadge(service.category)}
                    </TableCell>

                    {/* Default Price */}
                    <TableCell className="text-right py-2">
                      <span className="font-bold font-mono text-sm text-slate-900 tabular-nums">
                        {formatCurrency(service.default_price)}
                      </span>
                    </TableCell>

                    {/* Estimated Time */}
                    <TableCell className="py-2">
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                        <Clock className="h-3.5 w-3.5 text-slate-400" />
                        {service.estimated_time || "45 mins"}
                      </span>
                    </TableCell>

                    {/* Times Used in Job Cards */}
                    <TableCell className="text-center py-2">
                      <button
                        type="button"
                        onClick={() => openUsageDialog(service)}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold font-mono tabular-nums bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 transition-colors"
                        title="Click to view Job Cards using this service"
                      >
                        <History className="h-3 w-3 text-blue-600" />
                        <span>{service.usage_count || 0} Jobs</span>
                      </button>
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center py-2">
                      {service.is_active ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          <PowerOff className="h-3 w-3" /> Inactive
                        </span>
                      )}
                    </TableCell>

                    {/* Actions */}
                    <TableCell className="text-right pr-4 py-2 w-[140px] whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-600 hover:text-blue-600 hover:bg-blue-50"
                          onClick={() => openEditDialog(service)}
                          title="Edit Service"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>

                        <DropdownMenu>
                          <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 focus:outline-none">
                            <MoreVertical className="h-3.5 w-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-48 text-xs">
                            <DropdownMenuLabel>Service Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => openEditDialog(service)}>
                              <Pencil className="h-3.5 w-3.5 mr-2 text-slate-600" /> Edit Service
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openUsageDialog(service)}>
                              <History className="h-3.5 w-3.5 mr-2 text-blue-600" /> View Job Card History
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleStatus(service)}>
                              {service.is_active ? (
                                <>
                                  <PowerOff className="h-3.5 w-3.5 mr-2 text-amber-600" /> Deactivate
                                </>
                              ) : (
                                <>
                                  <Check className="h-3.5 w-3.5 mr-2 text-emerald-600" /> Activate
                                </>
                              )}
                            </DropdownMenuItem>
                            {isOwnerOrAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => openDeleteDialog(service)}
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
          <div className="py-12 px-4 text-center text-muted-foreground space-y-2.5">
            <Wrench className="h-10 w-10 mx-auto text-slate-300 mb-1" />
            <p className="text-sm font-bold text-slate-900">No services found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchQuery || selectedCategory !== "all" || statusFilter !== "all"
                ? "No services match your active search or filter criteria."
                : "Start by adding workshop labour, routine maintenance, and repair jobs."}
            </p>
            <Button onClick={openCreateDialog} size="sm" className="mt-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Add First Service
            </Button>
          </div>
        )}
      </div>

      {/* Unified Record Delete Confirmation Dialog */}
      <RecordDeleteDialog
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        recordType="Service"
        recordTypePlural="Services"
        recordCount={servicesToDelete.length}
        singleRecordIdentifier={servicesToDelete[0]?.name}
        onConfirmDelete={handleConfirmDelete}
        isDeleting={deleting}
      />

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedServiceIds.length}
        onClearSelection={() => setSelectedServiceIds([])}
        onDeleteSelected={handleRequestBulkDelete}
        deleteLabel="Delete Selected"
        isDeleting={deleting}
      />

      {/* ─── Create / Edit Service Dialog ─── */}
      <Dialog open={formDialogOpen} onOpenChange={setFormDialogOpen}>
        <DialogContent className="sm:max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                <Wrench className="h-5 w-5 text-blue-600" />
                {editingService ? "Edit Service" : "Add New Workshop Service"}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                {editingService
                  ? "Update standard workshop billing rates and estimated repair times."
                  : "Add a predefined workshop service to your catalog."}
              </DialogDescription>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>{formError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              {/* Service Name */}
              <div>
                <Label htmlFor="srv-name" className="text-xs font-bold text-foreground">
                  Service Name <span className="text-rose-500">*</span>
                </Label>
                <Input
                  id="srv-name"
                  placeholder="e.g. Engine Oil Change, Brake Pad Replacement"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="mt-1 font-medium"
                  required
                />
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="srv-category" className="text-xs font-bold text-foreground">
                  Category <span className="text-rose-500">*</span>
                </Label>
                <div className="mt-1 space-y-2">
                  <select
                    id="srv-category"
                    value={isCustomCategory ? "custom" : formCategory}
                    onChange={(e) => {
                      if (e.target.value === "custom") {
                        setIsCustomCategory(true);
                      } else {
                        setIsCustomCategory(false);
                        setFormCategory(e.target.value);
                      }
                    }}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm font-medium focus:outline-none focus:ring-1 focus:ring-blue-600"
                  >
                    {SERVICE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="custom">+ Add Custom Category...</option>
                  </select>

                  {isCustomCategory && (
                    <Input
                      placeholder="Type custom category name (e.g. Detailing, Alignment)..."
                      value={customCategory}
                      onChange={(e) => setCustomCategory(e.target.value)}
                      className="text-xs font-medium"
                      autoFocus
                    />
                  )}
                </div>
              </div>

              {/* Default Price & Estimated Time */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="srv-price" className="text-xs font-bold text-foreground">
                    Default Price (AED) <span className="text-rose-500">*</span>
                  </Label>
                  <div className="relative mt-1">
                    <span className="absolute left-2.5 top-2 text-xs font-bold text-blue-600">
                      AED
                    </span>
                    <Input
                      id="srv-price"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="0.00"
                      value={formPrice}
                      onChange={(e) => setFormPrice(e.target.value)}
                      className="pl-12 font-mono font-bold text-xs"
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="srv-est-time" className="text-xs font-bold text-foreground">
                    Estimated Time
                  </Label>
                  <div className="relative mt-1">
                    <Clock className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <Input
                      id="srv-est-time"
                      placeholder="e.g. 45 mins, 1.5 hrs"
                      value={formEstimatedTime}
                      onChange={(e) => setFormEstimatedTime(e.target.value)}
                      className="pl-8 text-xs font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Short Description */}
              <div>
                <Label htmlFor="srv-desc" className="text-xs font-bold text-foreground">
                  Short Description <span className="text-muted-foreground font-normal">(Optional)</span>
                </Label>
                <Textarea
                  id="srv-desc"
                  placeholder="Summary of labor and inspection scope..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={2}
                  className="mt-1 text-xs"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg border bg-slate-50/50 dark:bg-slate-800/30">
                <div>
                  <p className="font-bold text-foreground text-xs">Service Status</p>
                  <p className="text-[11px] text-muted-foreground">
                    Active services appear in Job Card selection lists
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
                ) : editingService ? (
                  "Save Changes"
                ) : (
                  "Add Service"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ─── View Service Usage Dialog ─── */}
      <Dialog open={usageDialogOpen} onOpenChange={setUsageDialogOpen}>
        <DialogContent className="sm:max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          {selectedServiceForUsage && (
            <div className="space-y-4">
              <div>
                <DialogTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                  <History className="h-5 w-5 text-blue-600" />
                  Job Card Usage: {selectedServiceForUsage.name}
                </DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground mt-1 flex items-center gap-3">
                  <span>Category: <strong>{selectedServiceForUsage.category || "General"}</strong></span>
                  <span>•</span>
                  <span>Default Price: <strong>{formatCurrency(selectedServiceForUsage.default_price)}</strong></span>
                  <span>•</span>
                  <span>Estimated Time: <strong>{selectedServiceForUsage.estimated_time || "45 mins"}</strong></span>
                </DialogDescription>
              </div>

              {/* Summary Pill */}
              <div className="p-3 rounded-xl border bg-blue-50/70 border-blue-200 dark:bg-blue-950/40 dark:border-blue-900 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-blue-600" />
                  <span className="font-bold text-blue-900 dark:text-blue-200">
                    Used in {usageRecords.length} Job Card{usageRecords.length === 1 ? "" : "s"}
                  </span>
                </div>
                <span className="text-[11px] text-blue-700 dark:text-blue-300">
                  {selectedServiceForUsage.is_active ? "Active in Catalog" : "Inactive (Historical)"}
                </span>
              </div>

              {/* Usage List */}
              <div className="max-h-72 overflow-y-auto border rounded-xl">
                {loadingUsage ? (
                  <div className="py-12 text-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 mx-auto animate-spin text-blue-600 mb-2" />
                    <p className="text-xs">Loading Job Card records...</p>
                  </div>
                ) : usageRecords.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-800 text-[11px]">
                        <TableHead>Job Card #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Vehicle &amp; Plate</TableHead>
                        <TableHead className="text-right pr-3">Rate Charged</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="text-xs divide-y">
                      {usageRecords.map((rec, idx) => (
                        <TableRow key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                          <TableCell className="font-mono font-bold text-blue-600">
                            {rec.job_card_number}
                          </TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatDate(rec.date)}
                          </TableCell>
                          <TableCell className="font-medium text-foreground">
                            {rec.customer_name}
                          </TableCell>
                          <TableCell>
                            <span className="font-semibold text-foreground">{rec.vehicle_make_model}</span>
                            {rec.registration_number !== "—" && (
                              <span className="font-mono text-[10px] text-muted-foreground ml-1.5 bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">
                                {rec.registration_number}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-foreground pr-3">
                            {formatCurrency(rec.unit_price)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <div className="py-10 text-center text-muted-foreground space-y-1 text-xs">
                    <p className="font-semibold text-foreground">No Job Card records found</p>
                    <p className="text-muted-foreground">This service has not been added to any saved Job Cards yet.</p>
                  </div>
                )}
              </div>

              <DialogFooter className="flex justify-end pt-2">
                <Button size="sm" onClick={() => setUsageDialogOpen(false)}>
                  Close
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ServiceListView;
