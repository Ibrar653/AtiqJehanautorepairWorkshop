"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import Link from "next/link";
import { getJobCards, deleteJobCard } from "@/lib/services/job-card-service";
import { getUploadedJobCards, deleteUploadedJobCard } from "@/lib/services/document-service";
import type { JobCardWithRelations, JobCardStatus, UploadedJobCardWithRelations } from "@/types/database";
import { UploadJobCardDialog } from "@/components/job-cards/upload-job-card-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { SearchInput } from "@/components/shared/search-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Plus,
  Eye,
  Pencil,
  ClipboardList,
  Loader2,
  AlertCircle,
  CheckCircle2,
  User,
  Car,
  Calendar,
  Wrench,
  Upload,
  FileText,
  Trash2,
  Printer,
  RefreshCw,
  MoreVertical,
  Download,
  Clock,
  Sparkles,
} from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
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

export function JobCardListView() {
  const { isViewer, canEdit, canDelete } = usePermissions();
  const [activeTab, setActiveTab] = useState<"all" | "digital" | "uploaded">("all");
  const [jobCards, setJobCards] = useState<JobCardWithRelations[]>([]);
  const [uploadedJobCards, setUploadedJobCards] = useState<UploadedJobCardWithRelations[]>([]);
  const [total, setTotal] = useState(0);
  const [uploadedTotal, setUploadedTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<JobCardStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UploadedJobCardWithRelations | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [jobCardsToDelete, setJobCardsToDelete] = useState<JobCardWithRelations[]>([]);
  const [isFinancialBlocked, setIsFinancialBlocked] = useState(false);
  const [financialBlockMessage, setFinancialBlockMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedJobCardIds, setSelectedJobCardIds] = useState<string[]>([]);

  const requestSeqRef = useRef(0);

  // Summary counts calculated from real data
  const counts = useMemo(() => {
    let newJobs = 0;
    let inProgress = 0;
    let waiting = 0;
    let completed = 0;
    jobCards.forEach((j) => {
      if (j.status === "new") newJobs++;
      else if (j.status === "in_progress") inProgress++;
      else if (j.status === "waiting") waiting++;
      else if (j.status === "completed") completed++;
    });
    return {
      newJobs,
      inProgress,
      waiting,
      completed,
      total,
    };
  }, [jobCards, total]);

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedJobCardIds(jobCards.map((jc) => jc.id));
    } else {
      setSelectedJobCardIds([]);
    }
  };

  const handleToggleSelectJobCard = (id: string) => {
    setSelectedJobCardIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const checkJobCardDeleteable = (jc: any) => {
    if (jc.invoice_number) {
      return {
        canDelete: false,
        reason: `Job Card #${jc.job_card_number} is linked to finalized Tax Invoice #${jc.invoice_number} and cannot be deleted directly. Please void or reverse the invoice first.`,
      };
    }
    const paid = Number(jc.paid) || 0;
    if (paid > 0) {
      return {
        canDelete: false,
        reason: `Job Card #${jc.job_card_number} has recorded customer payments of ${formatCurrency(paid)} and cannot be deleted directly.`,
      };
    }
    return { canDelete: true };
  };

  const openDeleteModal = (jc: JobCardWithRelations) => {
    const check = checkJobCardDeleteable(jc);
    setJobCardsToDelete([jc]);
    if (!check.canDelete) {
      setIsFinancialBlocked(true);
      setFinancialBlockMessage(check.reason || "This job card has financial transactions and cannot be deleted directly.");
    } else {
      setIsFinancialBlocked(false);
      setFinancialBlockMessage(null);
    }
    setDeleteConfirmOpen(true);
  };

  const handleRequestBulkDelete = () => {
    if (selectedJobCardIds.length === 0) return;
    const targets = jobCards.filter((jc) => selectedJobCardIds.includes(jc.id));
    const blocked = targets.find((jc) => !checkJobCardDeleteable(jc).canDelete);

    setJobCardsToDelete(targets);
    if (blocked) {
      setIsFinancialBlocked(true);
      setFinancialBlockMessage(
        `Job Card #${blocked.job_card_number} is linked to a finalized invoice or payments and cannot be deleted directly.`
      );
    } else {
      setIsFinancialBlocked(false);
      setFinancialBlockMessage(null);
    }
    setDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteJobCard = async () => {
    if (jobCardsToDelete.length === 0 || isFinancialBlocked) return;
    setDeleting(true);
    try {
      for (const jc of jobCardsToDelete) {
        await deleteJobCard(jc.id, true);
      }
      const count = jobCardsToDelete.length;
      setJobCards((prev) => prev.filter((jc) => !jobCardsToDelete.some((item) => item.id === jc.id)));
      setTotal((prev) => Math.max(0, prev - count));
      setToastMessage({
        type: "success",
        text: `${count} Job Card${count > 1 ? "s" : ""} moved to Recycle Bin.`,
      });
      setSelectedJobCardIds([]);
      setDeleteConfirmOpen(false);
      setJobCardsToDelete([]);
    } catch (err: any) {
      setToastMessage({
        type: "error",
        text: err.message || "Failed to delete job card",
      });
    } finally {
      setDeleting(false);
    }
  };

  const loadData = useCallback(async () => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setError(null);

    try {
      const cleanSearch = typeof query === "string" ? query.trim() : "";

      const [jcRes, upldRes] = await Promise.all([
        getJobCards({
          status: statusFilter,
          search: cleanSearch,
          page,
          limit: 50,
        }),
        getUploadedJobCards(cleanSearch, page, 50),
      ]);

      if (seq === requestSeqRef.current) {
        setJobCards(jcRes.jobCards || []);
        setTotal(jcRes.total || 0);
        setUploadedJobCards(upldRes.uploadedJobCards || []);
        setUploadedTotal(upldRes.total || 0);
      }
    } catch (err: any) {
      if (seq === requestSeqRef.current) {
        console.error("Job card list loading error:", err);
        setError(err.message || "Failed to load job cards");
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [statusFilter, query, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDeleteUploaded = async (id: string) => {
    if (!confirm("Are you sure you want to delete this uploaded job card record?")) return;
    try {
      await deleteUploadedJobCard(id);
      setUploadedJobCards((prev) => prev.filter((d) => d.id !== id));
      setToastMessage({ type: "success", text: "Uploaded job card removed." });
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message || "Failed to delete document" });
    }
  };

  const getStatusBadge = (st: JobCardStatus) => {
    switch (st) {
      case "new":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800">
            New
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800">
            In Progress
          </span>
        );
      case "waiting":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800">
            Waiting
          </span>
        );
      case "completed":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800">
            Completed
          </span>
        );
      case "cancelled":
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground border border-border">
            {st}
          </span>
        );
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
        title="Job Cards"
        description="Manage workshop repair jobs, services, parts and job progress."
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Job Cards" }]}
      >
        <div className="flex items-center gap-2.5">
          {!isViewer && (
            <>
              <Button
                variant="outline"
                onClick={() => setUploadModalOpen(true)}
                className="h-10 px-3.5 text-xs font-semibold rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700 shadow-2xs gap-1.5"
              >
                <Upload className="h-3.5 w-3.5 text-slate-500" />
                Upload Paper Job Card
              </Button>
              <Button
                render={<Link href="/job-cards/new" />}
                className="h-10 px-4 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-2xs gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Create Job Card
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      {/* Summary KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total / Open Jobs */}
        <div
          onClick={() => setStatusFilter("all")}
          className={`bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs cursor-pointer transition-all hover:border-blue-400/60 ${
            statusFilter === "all" ? "ring-2 ring-blue-600/30 border-blue-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Open Jobs</span>
            <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <ClipboardList className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-slate-900 font-mono mt-2">{total}</p>
          <p className="text-xs text-slate-500 mt-1">Total registered orders</p>
        </div>

        {/* In Progress */}
        <div
          onClick={() => setStatusFilter("in_progress")}
          className={`bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs cursor-pointer transition-all hover:border-amber-400/60 ${
            statusFilter === "in_progress" ? "ring-2 ring-amber-500/30 border-amber-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">In Progress</span>
            <div className="h-9 w-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-amber-600 font-mono mt-2">
            {counts.inProgress}
          </p>
          <p className="text-xs text-slate-500 mt-1">Currently on the lifts</p>
        </div>

        {/* Waiting / Pending */}
        <div
          onClick={() => setStatusFilter("waiting")}
          className={`bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs cursor-pointer transition-all hover:border-purple-400/60 ${
            statusFilter === "waiting" ? "ring-2 ring-purple-500/30 border-purple-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Waiting</span>
            <div className="h-9 w-9 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
              <AlertCircle className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-purple-600 font-mono mt-2">
            {counts.waiting}
          </p>
          <p className="text-xs text-slate-500 mt-1">Parts or approval pending</p>
        </div>

        {/* Completed */}
        <div
          onClick={() => setStatusFilter("completed")}
          className={`bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs cursor-pointer transition-all hover:border-emerald-400/60 ${
            statusFilter === "completed" ? "ring-2 ring-emerald-500/30 border-emerald-500" : ""
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Completed</span>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <p className="text-2xl font-bold tracking-tight text-emerald-600 font-mono mt-2">
            {counts.completed}
          </p>
          <p className="text-xs text-slate-500 mt-1">Ready for invoicing</p>
        </div>
      </div>

      {/* Main Mode Tabs & Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <Tabs
            value={activeTab}
            onValueChange={(val) => {
              setActiveTab(val as any);
              setPage(1);
            }}
          >
            <TabsList className="bg-slate-100/90 border border-slate-200/80 p-1 rounded-xl">
              <TabsTrigger value="all" className="text-xs px-3.5 py-1.5 font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs">
                All Records ({total + uploadedTotal})
              </TabsTrigger>
              <TabsTrigger value="digital" className="text-xs px-3.5 py-1.5 font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs">
                Digital Job Cards ({total})
              </TabsTrigger>
              <TabsTrigger value="uploaded" className="text-xs px-3.5 py-1.5 font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs">
                Uploaded Paper Cards ({uploadedTotal})
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab !== "uploaded" && (
            <Tabs
              value={statusFilter}
              onValueChange={(val) => {
                setStatusFilter(val as any);
                setPage(1);
              }}
            >
              <TabsList className="bg-slate-100/90 border border-slate-200/80 p-1 rounded-xl overflow-x-auto">
                <TabsTrigger value="all" className="text-xs px-2.5 py-1 font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs">All Statuses</TabsTrigger>
                <TabsTrigger value="new" className="text-xs px-2.5 py-1 font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs">New</TabsTrigger>
                <TabsTrigger value="in_progress" className="text-xs px-2.5 py-1 font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs">In Progress</TabsTrigger>
                <TabsTrigger value="waiting" className="text-xs px-2.5 py-1 font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs">Waiting</TabsTrigger>
                <TabsTrigger value="completed" className="text-xs px-2.5 py-1 font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs">Completed</TabsTrigger>
                <TabsTrigger value="cancelled" className="text-xs px-2.5 py-1 font-medium rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-2xs">Cancelled</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* Search Bar */}
        <div className="w-full">
          <SearchInput
            placeholder="Search by JC # (e.g. JC-1065), Customer Name, Mobile, Plate #, or Chassis/VIN..."
            onSearch={(q) => {
              const clean = typeof q === "string" ? q : "";
              setQuery(clean);
              setPage(1);
            }}
            defaultValue={query}
            className="w-full"
          />
        </div>
      </div>

      {/* Uploaded Job Cards Tab Content */}
      {activeTab === "uploaded" ? (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
          <div className="p-0">
            {error ? (
              <div className="py-16 text-center space-y-3">
                <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <p className="font-semibold text-slate-900 text-sm">{error}</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  The document archive service encountered an issue loading records.
                </p>
                <Button size="sm" variant="outline" onClick={loadData} className="gap-2 h-9 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : loading ? (
              <div className="py-20 text-center text-slate-500">
                <Loader2 className="h-7 w-7 mx-auto animate-spin mb-3 text-blue-600" />
                <p className="text-xs">Loading uploaded paper job cards...</p>
              </div>
            ) : uploadedJobCards.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                      <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[15%]">Job Card #</TableHead>
                      <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[12%]">Date</TableHead>
                      <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[20%]">Customer</TableHead>
                      <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[18%]">Vehicle / Plate</TableHead>
                      <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[20%]">Description / Scope</TableHead>
                      <TableHead className="text-right font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[15%] pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-slate-100">
                    {uploadedJobCards.map((doc) => (
                      <TableRow key={doc.id} className="h-12 hover:bg-slate-50/60 transition-colors border-b border-slate-100">
                        <TableCell className="font-bold text-slate-900 font-mono">
                          <button
                            onClick={() => setPreviewDoc(doc)}
                            className="hover:text-blue-600 transition-colors text-left flex items-center gap-1.5"
                          >
                            <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                            <span className="truncate text-blue-700 font-bold">{doc.job_card_number}</span>
                          </button>
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          {formatDate(doc.date || doc.created_at)}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 text-xs">
                          {doc.customer?.name}
                          {doc.customer?.mobile && (
                            <span className="block text-[11px] text-slate-500 font-normal font-mono">
                              {doc.customer.mobile}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-900">
                          <span className="font-semibold">{doc.vehicle ? `${doc.vehicle.make} ${doc.vehicle.model}` : "—"}</span>
                          {doc.vehicle?.registration_number && (
                            <span className="block text-[11px] font-mono text-blue-700 font-bold">
                              Plate: {doc.vehicle.registration_number}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500">
                          <p className="line-clamp-2">{doc.description || "Historical archived paper repair order."}</p>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setPreviewDoc(doc)}
                              className="h-8 px-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg gap-1"
                            >
                              <Eye className="h-3.5 w-3.5" /> View
                            </Button>
                            <a
                              href={doc.file_url}
                              download={doc.file_name}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-lg text-xs font-medium border border-slate-200 bg-white hover:bg-slate-50 h-8 px-2.5 gap-1 text-slate-700"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </a>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteUploaded(doc.id)}
                              className="h-8 w-8 p-0 text-slate-500 hover:text-rose-600 rounded-lg"
                              title="Delete Record"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="py-16 text-center text-slate-500 flex flex-col items-center justify-center px-4">
                <Upload className="h-10 w-10 mx-auto text-slate-300 stroke-1 mb-2" />
                <h3 className="text-sm font-semibold text-slate-900">No uploaded paper job cards</h3>
                <p className="text-xs text-slate-500 mt-1 mb-4 max-w-sm">
                  Archive old physical job cards, scanned PDF invoices, or photo receipts to preserve vehicle history.
                </p>
                <Button
                  onClick={() => setUploadModalOpen(true)}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl h-9 px-4 shadow-2xs"
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload First Paper Job Card
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Digital Job Cards or All Records Content */
        <div className="space-y-4">
          {/* Quick Notice Banner if in 'all' view with uploaded results */}
          {activeTab === "all" && uploadedJobCards.length > 0 && (
            <div className="p-3 px-4 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary shrink-0" />
                <span>
                  Found <strong className="font-semibold text-foreground">{uploadedJobCards.length}</strong> archived paper job card(s) matching your query.
                </span>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setActiveTab("uploaded")}
                className="h-7 text-xs font-medium border-primary/30 text-primary"
              >
                View Uploaded Cards →
              </Button>
            </div>
          )}

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
            <div className="p-0">
              {error ? (
                <div className="py-16 text-center space-y-3">
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <p className="font-semibold text-slate-900 text-sm">{error}</p>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto">
                    The job card service encountered an issue loading records.
                  </p>
                  <Button size="sm" variant="outline" onClick={loadData} className="gap-2 h-9 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              ) : loading ? (
                <div className="py-20 text-center text-slate-500">
                  <Loader2 className="h-7 w-7 mx-auto animate-spin mb-3 text-blue-600" />
                  <p className="text-xs">Loading repair job cards...</p>
                </div>
              ) : jobCards.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50/80 hover:bg-slate-50/80 border-b border-slate-200/80 h-11">
                        <TableHead className="w-[44px] pl-4">
                          <Checkbox
                            checked={
                              jobCards.length > 0 && selectedJobCardIds.length === jobCards.length
                                ? true
                                : selectedJobCardIds.length > 0
                                ? "indeterminate"
                                : false
                            }
                            onCheckedChange={handleSelectAll}
                            aria-label="Select all visible job cards"
                          />
                        </TableHead>
                        <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[14%]">Job Card #</TableHead>
                        <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[11%]">Date</TableHead>
                        <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[18%]">Customer Owner</TableHead>
                        <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[18%]">Vehicle &amp; Plate</TableHead>
                        <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[14%]">Chassis / VIN</TableHead>
                        <TableHead className="font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[11%]">Status</TableHead>
                        <TableHead className="text-right font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[12%]">Total (AED)</TableHead>
                        <TableHead className="text-right font-bold text-slate-500 text-[11px] uppercase tracking-wider w-[12%] pr-4">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-slate-100">
                      {jobCards.map((jc) => (
                        <TableRow
                          key={jc.id}
                          className={`h-12 hover:bg-slate-50/60 transition-colors border-b border-slate-100 ${
                            selectedJobCardIds.includes(jc.id) ? "bg-blue-50/40" : ""
                          }`}
                        >
                          <TableCell className="pl-4">
                            <Checkbox
                              checked={selectedJobCardIds.includes(jc.id)}
                              onCheckedChange={() => handleToggleSelectJobCard(jc.id)}
                              aria-label={`Select job card ${jc.job_card_number}`}
                            />
                          </TableCell>
                          <TableCell>
                            <Link href={`/job-cards/${jc.id}`} className="hover:text-blue-600 transition-colors block">
                              <span className="text-blue-700 font-bold font-mono text-sm block hover:underline">
                                {jc.job_card_number}
                              </span>
                              {jc.invoice_number && (
                                <span className="text-[10px] text-slate-400 font-mono font-medium block">
                                  Inv: #{jc.invoice_number}
                                </span>
                              )}
                            </Link>
                          </TableCell>
                          <TableCell className="text-xs text-slate-500">
                            {formatDate(jc.date || jc.created_at)}
                          </TableCell>
                          <TableCell>
                            {jc.customer ? (
                              <div>
                                <Link
                                  href={`/customers/${jc.customer_id}`}
                                  className="font-semibold text-slate-900 text-xs hover:text-blue-600 hover:underline transition-colors block"
                                >
                                  {jc.customer.name}
                                </Link>
                                {jc.customer.mobile && (
                                  <p className="text-[11px] font-mono text-slate-500">{jc.customer.mobile}</p>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-xs">
                            {jc.vehicle ? (
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {jc.vehicle.make} {jc.vehicle.model}
                                </p>
                                <p className="text-[11px] font-bold font-mono text-blue-700">
                                  {jc.vehicle.registration_number || "No Plate"}
                                </p>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-mono text-xs text-slate-500">
                            {jc.vehicle?.chassis_vin || "—"}
                          </TableCell>
                          <TableCell>
                            <div className="space-y-0.5">
                              {getStatusBadge(jc.status)}
                              <span className="block text-[10px] font-semibold text-slate-400 uppercase tracking-tight">
                                {jc.payment_status || "Pending"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="font-bold text-slate-900 text-right text-xs font-mono tabular-nums">
                            {formatCurrency(jc.total)}
                          </TableCell>
                          <TableCell className="text-right pr-4">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                render={<Link href={`/job-cards/${jc.id}`} />}
                                title="View Full Job Card"
                                className="h-8 px-2 text-xs font-semibold text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg"
                              >
                                <Eye className="h-3.5 w-3.5 mr-1" /> View
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                render={<Link href={`/job-cards/${jc.id}?print=true`} />}
                                title="Print A4 Job Card"
                                className="h-8 px-2 text-xs text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg"
                              >
                                <Printer className="h-3.5 w-3.5 mr-1" /> Print
                              </Button>

                              <DropdownMenu>
                                <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600/40">
                                  <MoreVertical className="h-3.5 w-3.5" />
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end" className="w-44 text-xs shadow-md border-slate-200 rounded-xl">
                                  <DropdownMenuLabel>Job Card Actions</DropdownMenuLabel>
                                  <DropdownMenuItem render={<Link href={`/job-cards/${jc.id}`} />}>
                                    <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" /> View Details
                                  </DropdownMenuItem>
                                  {canEdit && (
                                    <DropdownMenuItem render={<Link href={`/job-cards/${jc.id}/edit`} />}>
                                      <Pencil className="h-3.5 w-3.5 mr-2 text-slate-500" /> Edit Job Card
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuItem render={<Link href={`/job-cards/${jc.id}?print=true`} />}>
                                    <Printer className="h-3.5 w-3.5 mr-2 text-slate-500" /> Print A4 Sheet
                                  </DropdownMenuItem>
                                  {canDelete && (
                                    <>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem
                                        onClick={() => openDeleteModal(jc)}
                                        className="text-rose-600 hover:text-rose-700 font-semibold focus:text-rose-700"
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
                <div className="py-14 text-center text-slate-500 flex flex-col items-center justify-center px-4">
                  <ClipboardList className="h-10 w-10 mx-auto text-slate-300 stroke-1 mb-2" />
                  <h3 className="text-sm font-semibold text-slate-900">No job cards found</h3>
                  <p className="text-xs text-slate-500 mt-1 mb-4 max-w-sm">
                    {query || statusFilter !== "all"
                      ? "No repair orders match your current filter and search query."
                      : "Open a repair job card for a customer vehicle to start tracking services, parts and labour."}
                  </p>
                  <Button
                    render={<Link href="/job-cards/new" />}
                    className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl h-9 px-4 shadow-2xs"
                  >
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Create First Job Card
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <RecordDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        recordType="Job Card"
        recordTypePlural="Job Cards"
        recordCount={jobCardsToDelete.length}
        singleRecordIdentifier={jobCardsToDelete[0]?.job_card_number}
        onConfirmDelete={handleConfirmDeleteJobCard}
        isDeleting={deleting}
        isFinancialBlocked={isFinancialBlocked}
        financialBlockMessage={financialBlockMessage || undefined}
      />

      {/* Sticky Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedJobCardIds.length}
        onDeleteSelected={handleRequestBulkDelete}
        onClearSelection={() => setSelectedJobCardIds([])}
        isDeleting={deleting}
      />

      {/* Upload Existing Job Card Dialog */}
      <UploadJobCardDialog
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
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

export default JobCardListView;
