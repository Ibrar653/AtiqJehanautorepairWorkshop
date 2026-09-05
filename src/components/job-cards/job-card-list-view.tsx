"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  Hash,
  Calendar,
  Wrench,
  Upload,
  FileText,
  Image as ImageIcon,
  Trash2,
  Printer,
  FileSpreadsheet,
  RefreshCw,
  MoreVertical,
  Download,
  X,
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
      // Ensure search query is strictly a normalized string
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
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">New</span>;
      case "in_progress":
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">In Progress</span>;
      case "waiting":
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-500 border border-purple-500/20">Waiting</span>;
      case "completed":
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">Completed</span>;
      case "cancelled":
        return <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/10 text-red-500 border border-red-500/20">Cancelled</span>;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Cards"
        description="Digital workshop repair orders and historical paper job card archive"
        breadcrumbs={[{ label: "Dashboard", href: "/" }, { label: "Job Cards" }]}
        actions={
          !isViewer ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setUploadModalOpen(true)} className="gap-2">
                <Upload className="h-4 w-4 text-primary" /> + Upload Existing Job Card
              </Button>
              <Button render={<Link href="/job-cards/new" />}>
                <Plus className="mr-2 h-4 w-4" /> Create Job Card
              </Button>
            </div>
          ) : undefined
        }
      />

      {toastMessage && (
        <div
          className={`flex items-center justify-between p-4 rounded-xl border text-sm ${
            toastMessage.type === "success"
              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
              : "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400"
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{toastMessage.text}</span>
          </div>
          <button onClick={() => setToastMessage(null)} className="text-xs hover:underline font-medium">
            Dismiss
          </button>
        </div>
      )}

      {/* Main Mode Tabs & Search Bar */}
      <div className="space-y-4">
        <Tabs
          value={activeTab}
          onValueChange={(val) => {
            setActiveTab(val as any);
            setPage(1);
          }}
        >
          <TabsList className="w-full justify-start overflow-x-auto">
            <TabsTrigger value="all">All Records ({total + uploadedTotal})</TabsTrigger>
            <TabsTrigger value="digital">Digital Job Cards ({total})</TabsTrigger>
            <TabsTrigger value="uploaded">Uploaded Paper Cards ({uploadedTotal})</TabsTrigger>
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
            <TabsList className="w-full justify-start overflow-x-auto bg-muted/40">
              <TabsTrigger value="all">All Statuses ({statusFilter === "all" ? total : "•"})</TabsTrigger>
              <TabsTrigger value="new">New</TabsTrigger>
              <TabsTrigger value="in_progress">In Progress</TabsTrigger>
              <TabsTrigger value="waiting">Waiting</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="cancelled">Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-5">
            <SearchInput
              placeholder="Search by JC # (e.g. JC-1129), Customer Name, Mobile, Plate #, or Chassis/VIN..."
              onSearch={(q) => {
                const clean = typeof q === "string" ? q : "";
                setQuery(clean);
                setPage(1);
              }}
              defaultValue={query}
              className="max-w-xl"
            />
          </CardContent>
        </Card>
      </div>

      {/* Uploaded Job Cards Tab Content */}
      {activeTab === "uploaded" ? (
        <Card className="shadow-sm">
          <CardContent className="p-0">
            {error ? (
              <div className="py-16 text-center space-y-3">
                <div className="p-3 bg-red-500/10 text-red-500 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                  <AlertCircle className="h-6 w-6" />
                </div>
                <p className="font-bold text-foreground text-sm">{error}</p>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  The document archive service encountered an issue loading records.
                </p>
                <Button size="sm" variant="outline" onClick={loadData} className="gap-2">
                  <RefreshCw className="h-3.5 w-3.5" /> Retry
                </Button>
              </div>
            ) : loading ? (
              <div className="py-20 text-center text-muted-foreground">
                <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
                <p>Loading uploaded paper job cards...</p>
              </div>
            ) : uploadedJobCards.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[15%]">Job Card #</TableHead>
                    <TableHead className="w-[12%]">Date</TableHead>
                    <TableHead className="w-[20%]">Customer</TableHead>
                    <TableHead className="w-[18%]">Vehicle / Plate</TableHead>
                    <TableHead className="w-[20%]">Description / Scope</TableHead>
                    <TableHead className="w-[15%] text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploadedJobCards.map((doc) => (
                    <TableRow key={doc.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="font-bold text-foreground font-mono">
                        <button
                          onClick={() => setPreviewDoc(doc)}
                          className="hover:text-primary transition-colors text-left flex items-center gap-1.5"
                        >
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="truncate">{doc.job_card_number}</span>
                        </button>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDate(doc.date || doc.created_at)}
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {doc.customer?.name}
                        {doc.customer?.mobile && (
                          <span className="block text-xs text-muted-foreground font-normal">
                            {doc.customer.mobile}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-foreground">
                        <span className="font-medium">{doc.vehicle ? `${doc.vehicle.make} ${doc.vehicle.model}` : "—"}</span>
                        {doc.vehicle?.registration_number && (
                          <span className="block text-xs font-mono text-muted-foreground">
                            Plate: {doc.vehicle.registration_number}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <p className="line-clamp-2">{doc.description || "Historical archived paper repair order."}</p>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setPreviewDoc(doc)}
                            className="h-8 px-2 text-xs gap-1"
                          >
                            <Eye className="h-3.5 w-3.5" /> View
                          </Button>
                          <a
                            href={doc.file_url}
                            download={doc.file_name}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center justify-center rounded-md text-xs font-medium border border-input bg-background hover:bg-accent h-8 px-2.5 gap-1 text-foreground"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUploaded(doc.id)}
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
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
            ) : (
              <div className="py-20 text-center text-muted-foreground">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                <h3 className="text-lg font-semibold text-foreground">No uploaded paper job cards</h3>
                <p className="text-sm mt-1 mb-5 max-w-sm mx-auto">
                  Archive old physical job cards, scanned PDF invoices, or photo receipts to preserve customer vehicle history.
                </p>
                <Button onClick={() => setUploadModalOpen(true)}>
                  <Upload className="mr-2 h-4 w-4" /> Upload First Paper Job Card
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        /* Digital Job Cards or All Records Content */
        <div className="space-y-6">
          {/* Uploaded Cards Quick Banner if in 'all' view with uploaded results */}
          {activeTab === "all" && uploadedJobCards.length > 0 && (
            <Card className="shadow-sm border-primary/20 bg-primary/5">
              <CardContent className="py-3 px-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs">
                  <FileText className="h-4 w-4 text-primary" />
                  <span>
                    Found <strong>{uploadedJobCards.length}</strong> archived paper job card(s) matching your query.
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setActiveTab("uploaded")}
                  className="h-7 text-xs"
                >
                  View Uploaded Cards →
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className="border border-border shadow-xs bg-card overflow-hidden rounded-[10px]">
            <CardContent className="p-0">
              {error ? (
                <div className="py-16 text-center space-y-3">
                  <div className="p-3 bg-red-500/10 text-red-500 rounded-full w-12 h-12 mx-auto flex items-center justify-center">
                    <AlertCircle className="h-6 w-6" />
                  </div>
                  <p className="font-semibold text-foreground text-sm">{error}</p>
                  <p className="text-caption text-muted-foreground max-w-sm mx-auto">
                    The job card service encountered an issue loading records.
                  </p>
                  <Button size="sm" variant="outline" onClick={loadData} className="gap-2 h-9 rounded-lg">
                    <RefreshCw className="h-3.5 w-3.5" /> Retry
                  </Button>
                </div>
              ) : loading ? (
                <div className="py-20 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
                  <p className="text-caption">Loading repair job cards...</p>
                </div>
              ) : jobCards.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/70 hover:bg-muted/70 border-b border-border h-11">
                      <TableHead className="w-[40px] pl-4">
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
                      <TableHead className="w-[14%] font-semibold text-foreground text-table-head">Invoice / JC #</TableHead>
                      <TableHead className="w-[11%] font-semibold text-foreground text-table-head">Date</TableHead>
                      <TableHead className="w-[18%] font-semibold text-foreground text-table-head">Customer Owner</TableHead>
                      <TableHead className="w-[18%] font-semibold text-foreground text-table-head">Vehicle & Plate</TableHead>
                      <TableHead className="w-[15%] font-semibold text-foreground text-table-head">Chassis / VIN</TableHead>
                      <TableHead className="w-[11%] font-semibold text-foreground text-table-head">Status & Payment</TableHead>
                      <TableHead className="w-[13%] text-right font-semibold text-foreground text-table-head">Total (AED)</TableHead>
                      <TableHead className="w-[10%] text-right pr-4 font-semibold text-foreground text-table-head">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y divide-border/60">
                    {jobCards.map((jc) => (
                      <TableRow
                        key={jc.id}
                        className={`h-11 hover:bg-muted/30 transition-colors border-b border-border/50 ${
                          selectedJobCardIds.includes(jc.id) ? "bg-primary/5" : ""
                        }`}
                      >
                        <TableCell className="pl-4">
                          <Checkbox
                            checked={selectedJobCardIds.includes(jc.id)}
                            onCheckedChange={() => handleToggleSelectJobCard(jc.id)}
                            aria-label={`Select job card ${jc.job_card_number}`}
                          />
                        </TableCell>
                        <TableCell className="font-bold text-foreground font-mono">
                          <Link href={`/job-cards/${jc.id}`} className="hover:text-primary transition-colors block">
                            <span className="text-blue-600 font-black text-sm block">#{jc.invoice_number || "1060"}</span>
                            <span className="text-[11px] text-muted-foreground font-normal block">{jc.job_card_number}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(jc.date || jc.created_at)}
                        </TableCell>
                        <TableCell>
                          {jc.customer ? (
                            <div>
                              <Link
                                href={`/customers/${jc.customer_id}`}
                                className="font-semibold text-foreground text-xs hover:underline flex items-center gap-1"
                              >
                                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                {jc.customer.name}
                              </Link>
                              {jc.customer.mobile && (
                                <p className="text-[11px] text-muted-foreground pl-4">{jc.customer.mobile}</p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {jc.vehicle ? (
                            <div>
                              <p className="font-semibold text-foreground">
                                {jc.vehicle.make} {jc.vehicle.model}
                              </p>
                              <p className="text-[11px] font-bold text-primary">
                                {jc.vehicle.registration_number || "No Plate"}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {jc.vehicle?.chassis_vin || "—"}
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            {getStatusBadge(jc.status)}
                            <span className="block text-[10px] font-semibold text-slate-600 uppercase tracking-tight">
                              {jc.payment_status || "Pending"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-black text-primary text-right text-sm">
                          {formatCurrency(jc.total)}
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              render={<Link href={`/job-cards/${jc.id}`} />}
                              title="View Full Job Card"
                              className="h-8 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" /> View
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              render={<Link href={`/job-cards/${jc.id}?print=true`} />}
                              title="Print A4 Job Card"
                              className="h-8 px-2 text-xs text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <Printer className="h-3.5 w-3.5 mr-1" /> Print
                            </Button>

                            <DropdownMenu>
                              <DropdownMenuTrigger className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none">
                                <MoreVertical className="h-3.5 w-3.5" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44 text-xs">
                                <DropdownMenuLabel>Job Card Actions</DropdownMenuLabel>
                                <DropdownMenuItem render={<Link href={`/job-cards/${jc.id}`} />}>
                                  <Eye className="h-3.5 w-3.5 mr-2 text-blue-600" /> View Details
                                </DropdownMenuItem>
                                {canEdit && (
                                  <DropdownMenuItem render={<Link href={`/job-cards/${jc.id}/edit`} />}>
                                    <Pencil className="h-3.5 w-3.5 mr-2 text-slate-600" /> Edit Job Card
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem render={<Link href={`/job-cards/${jc.id}?print=true`} />}>
                                  <Printer className="h-3.5 w-3.5 mr-2 text-slate-600" /> Print A4
                                </DropdownMenuItem>
                                {canDelete && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      onClick={() => openDeleteModal(jc)}
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
              ) : (
                <div className="py-20 text-center text-muted-foreground">
                  <ClipboardList className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
                  <h3 className="text-lg font-semibold text-foreground">No job cards found</h3>
                  <p className="text-sm mt-1 mb-5 max-w-sm mx-auto">
                    {query || statusFilter !== "all"
                      ? "No job card orders match your current filter and search query."
                      : "Open a repair job card for a customer vehicle to start tracking services and labour."}
                  </p>
                  <Button render={<Link href="/job-cards/new" />}>
                    <Plus className="mr-2 h-4 w-4" /> Create First Job Card
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Upload Job Card Dialog */}
      <UploadJobCardDialog
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        onSuccess={() => {
          setToastMessage({ type: "success", text: "Paper Job Card archived and linked successfully." });
          loadData();
        }}
      />

      {/* Preview Uploaded Document Dialog */}
      {previewDoc && (
        <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>Job Card: {previewDoc.job_card_number}</span>
            </DialogTitle>
            <DialogDescription>
              Customer: {previewDoc.customer?.name} {previewDoc.vehicle ? `• Vehicle: ${previewDoc.vehicle.make} ${previewDoc.vehicle.model} (${previewDoc.vehicle.registration_number || "No Plate"})` : ""} • Date: {formatDate(previewDoc.date)}
            </DialogDescription>
            {previewDoc.description && (
              <p className="text-xs text-muted-foreground mt-1 bg-muted/20 p-2.5 rounded-lg border">
                <strong>Description:</strong> {previewDoc.description}
              </p>
            )}
            <div className="mt-3 flex items-center justify-center p-4 bg-muted/10 rounded-lg min-h-[350px]">
              {previewDoc.file_type.includes("pdf") ? (
                <iframe src={previewDoc.file_url} className="w-full h-[500px] rounded border" title={previewDoc.job_card_number} />
              ) : (
                <img
                  src={previewDoc.file_url}
                  alt={previewDoc.job_card_number}
                  className="max-h-[500px] max-w-full rounded object-contain"
                />
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4 pt-2 border-t">
              <a
                href={previewDoc.file_url}
                download={previewDoc.file_name}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-lg text-sm font-medium h-9 px-4 bg-primary text-primary-foreground hover:bg-primary/90 gap-2"
              >
                <Download className="h-4 w-4" /> Download Document
              </a>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Floating Bulk Action Bar */}
      <BulkActionBar
        selectedCount={selectedJobCardIds.length}
        onClearSelection={() => setSelectedJobCardIds([])}
        onDeleteSelected={handleRequestBulkDelete}
        deleteLabel="Delete Selected"
        isDeleting={deleting}
      />

      {/* Unified Record Delete Confirmation Dialog */}
      <RecordDeleteDialog
        open={deleteConfirmOpen}
        onOpenChange={setDeleteConfirmOpen}
        recordType="Job Card"
        recordTypePlural="Job Cards"
        recordCount={jobCardsToDelete.length}
        singleRecordIdentifier={jobCardsToDelete[0]?.job_card_number}
        isFinancialBlocked={isFinancialBlocked}
        financialBlockMessage={financialBlockMessage || undefined}
        onConfirmDelete={handleConfirmDeleteJobCard}
        isDeleting={deleting}
      />
    </div>
  );
}

export default JobCardListView;
