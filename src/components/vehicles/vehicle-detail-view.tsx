"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { getVehicleById, updateVehicle } from "@/lib/services/vehicle-service";
import { getDocumentsByVehicle, deleteUploadedJobCard } from "@/lib/services/document-service";
import { UploadJobCardDialog } from "@/components/job-cards/upload-job-card-dialog";
import { createClient } from "@/lib/supabase/client";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle, DialogDescription, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Car,
  Pencil,
  ClipboardList,
  Loader2,
  AlertCircle,
  CheckCircle2,
  User,
  FileText,
  CreditCard,
  Wrench,
  Cog,
  Calendar,
  Hash,
  Plus,
  Upload,
  Download,
  Trash2,
  Eye,
} from "lucide-react";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils";
import type { UploadedJobCardWithRelations } from "@/types/database";

interface VehicleDetailViewProps {
  id: string;
}

export function VehicleDetailView({ id }: VehicleDetailViewProps) {
  const [vehicle, setVehicle] = useState<any>(null);
  const [jobCards, setJobCards] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [servicesUsed, setServicesUsed] = useState<any[]>([]);
  const [partsUsed, setPartsUsed] = useState<any[]>([]);
  const [documents, setDocuments] = useState<UploadedJobCardWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Document Upload and Preview state
  const [uploadDocOpen, setUploadDocOpen] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<UploadedJobCardWithRelations | null>(null);

  // Edit Vehicle Modal State
  const [editOpen, setEditOpen] = useState(false);
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [chassisVin, setChassisVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [vData, docList] = await Promise.all([
        getVehicleById(id),
        getDocumentsByVehicle(id),
      ]);
      setVehicle(vData);
      setDocuments(docList || []);

      // Fetch vehicle history from Supabase
      const supabase = createClient();

      // 1. Previous Job Cards
      const { data: jcData } = await supabase
        .from("job_cards")
        .select("*, items:job_card_items(*)")
        .eq("vehicle_id", id)
        .order("date", { ascending: false });

      const jcs = jcData || [];
      setJobCards(jcs);

      // Extract services & parts used across job cards
      const allServices: any[] = [];
      const allParts: any[] = [];

      jcs.forEach((jc) => {
        (jc.items || []).forEach((it: any) => {
          if (it.item_type === "service") {
            allServices.push({ ...it, job_card_number: jc.job_card_number, date: jc.date });
          } else if (it.item_type === "part") {
            allParts.push({ ...it, job_card_number: jc.job_card_number, date: jc.date });
          }
        });
      });

      setServicesUsed(allServices);
      setPartsUsed(allParts);

      // 2. Previous Invoices
      const { data: invData } = await supabase
        .from("invoices")
        .select("*")
        .eq("vehicle_id", id)
        .order("created_at", { ascending: false });

      setInvoices(invData || []);

      // 3. Payment History
      const { data: payData } = await supabase
        .from("payments")
        .select("*, invoice:invoices(invoice_number)")
        .eq("customer_id", vData.customer_id)
        .order("payment_date", { ascending: false });

      setPayments(payData || []);
    } catch (err: any) {
      console.error(err);
      setToastMessage({ type: "error", text: err.message || "Failed to load vehicle history" });
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const openEditModal = () => {
    if (!vehicle) return;
    setMake(vehicle.make || "");
    setModel(vehicle.model || "");
    setYear(vehicle.year?.toString() || "");
    setColor(vehicle.color || "");
    setChassisVin(vehicle.chassis_vin || "");
    setMileage(vehicle.mileage?.toString() || "");
    setRegistrationNumber(vehicle.registration_number || "");
    setNotes(vehicle.notes || "");
    setEditOpen(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!make.trim() || !model.trim()) return;
    setSaving(true);

    try {
      await updateVehicle(id, {
        make: make.trim(),
        model: model.trim(),
        year: year ? parseInt(year) : null,
        color: color.trim() || null,
        chassis_vin: chassisVin.trim() || null,
        mileage: mileage ? parseInt(mileage) : null,
        registration_number: registrationNumber.trim() || null,
        notes: notes.trim() || null,
      });
      setToastMessage({ type: "success", text: "Vehicle details updated successfully." });
      setEditOpen(false);
      loadData();
    } catch (err: any) {
      setToastMessage({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <Loader2 className="h-8 w-8 mx-auto animate-spin mb-3 text-primary" />
        <p>Loading vehicle history...</p>
      </div>
    );
  }

  if (!vehicle) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-3" />
        <h3 className="text-lg font-medium text-foreground">Vehicle Not Found</h3>
        <p className="text-sm mt-1 mb-4">The requested vehicle record does not exist.</p>
        <Button render={<Link href="/vehicles" />}>Back to Vehicle Registry</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${vehicle.make} ${vehicle.model}`}
        description={`Registration Plate: ${vehicle.registration_number || "No Plate"} · Customer: ${vehicle.customer?.name || "Unknown"}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Vehicles", href: "/vehicles" },
          { label: `${vehicle.make} ${vehicle.model}` },
        ]}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={openEditModal}>
              <Pencil className="mr-2 h-4 w-4" /> Edit Specs
            </Button>
            {/* WORKFLOW BUTTON: Customer -> Vehicle -> Job Card */}
            <Button render={<Link href={`/job-cards/new?customer_id=${vehicle.customer_id}&vehicle_id=${id}`} />}>
              <ClipboardList className="mr-2 h-4 w-4" /> Create Job Card
            </Button>
          </div>
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

      {/* Vehicle Specification Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Owner Customer</p>
              <Link href={`/customers/${vehicle.customer_id}`} className="text-sm font-semibold hover:underline text-primary">
                {vehicle.customer?.name || "Unknown"}
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Hash className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Chassis / VIN</p>
              <p className="text-sm font-mono font-semibold">{vehicle.chassis_vin || "Not provided"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Year & Color</p>
              <p className="text-sm font-semibold">{vehicle.year || "N/A"} · {vehicle.color || "N/A"}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-primary/10 text-primary">
              <Car className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase">Odometer Mileage</p>
              <p className="text-sm font-semibold">{vehicle.mileage ? `${vehicle.mileage.toLocaleString()} KM` : "Not recorded"}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Structured History Tabs */}
      <Tabs defaultValue="job-cards" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="job-cards" className="flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4" /> Previous Job Cards ({jobCards.length})
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Uploaded Job Cards ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="services" className="flex items-center gap-1.5">
            <Wrench className="h-4 w-4" /> Previous Services ({servicesUsed.length})
          </TabsTrigger>
          <TabsTrigger value="parts" className="flex items-center gap-1.5">
            <Cog className="h-4 w-4" /> Spare Parts Used ({partsUsed.length})
          </TabsTrigger>
          <TabsTrigger value="invoices" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Previous Invoices ({invoices.length})
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-1.5">
            <CreditCard className="h-4 w-4" /> Payment History ({payments.length})
          </TabsTrigger>
        </TabsList>

        {/* 1. PREVIOUS JOB CARDS */}
        <TabsContent value="job-cards">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-primary" /> Previous Job Cards
              </CardTitle>
              <Button size="sm" render={<Link href={`/job-cards/new?customer_id=${vehicle.customer_id}&vehicle_id=${id}`} />}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Create Job Card
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {jobCards.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Job Card #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Customer Complaint</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jobCards.map((jc) => (
                      <TableRow key={jc.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-sm font-semibold">
                          <Link href={`/job-cards/${jc.id}`} className="hover:text-primary transition-colors">{jc.job_card_number}</Link>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(jc.date)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">{jc.customer_complaint || "—"}</TableCell>
                        <TableCell><StatusBadge status={jc.status} type="job_card" /></TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(jc.total)}</TableCell>
                        <TableCell className="text-right">
                          {jc.balance > 0 ? <span className="text-amber-500 font-semibold">{formatCurrency(jc.balance)}</span> : <span className="text-emerald-500">Paid</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium">No previous job cards recorded for this vehicle.</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">Start by creating the first service job card</p>
                  <Button size="sm" render={<Link href={`/job-cards/new?customer_id=${vehicle.customer_id}&vehicle_id=${id}`} />}>
                    <Plus className="mr-1 h-3.5 w-3.5" /> Create First Job Card
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. PREVIOUS SERVICES */}
        <TabsContent value="services">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4 text-primary" /> Previous Services Performed</CardTitle></CardHeader>
            <CardContent className="p-0">
              {servicesUsed.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Job Card #</TableHead>
                      <TableHead>Service Description</TableHead>
                      <TableHead className="text-right">Qty / Hours</TableHead>
                      <TableHead className="text-right">Rate</TableHead>
                      <TableHead className="text-right">Total Price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {servicesUsed.map((s, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/50">
                        <TableCell className="text-sm">{formatDate(s.date)}</TableCell>
                        <TableCell className="font-mono text-xs">{s.job_card_number}</TableCell>
                        <TableCell className="font-medium">{s.description}</TableCell>
                        <TableCell className="text-right">{s.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(s.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(s.total_price)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <Wrench className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm">No service history records found for this vehicle.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. SPARE PARTS USED */}
        <TabsContent value="parts">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Cog className="h-4 w-4 text-primary" /> Spare Parts Installed</CardTitle></CardHeader>
            <CardContent className="p-0">
              {partsUsed.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Job Card #</TableHead>
                      <TableHead>Part Item</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {partsUsed.map((p, idx) => (
                      <TableRow key={idx} className="hover:bg-muted/50">
                        <TableCell className="text-sm">{formatDate(p.date)}</TableCell>
                        <TableCell className="font-mono text-xs">{p.job_card_number}</TableCell>
                        <TableCell className="font-medium">{p.description}</TableCell>
                        <TableCell className="text-right">{p.quantity}</TableCell>
                        <TableCell className="text-right">{formatCurrency(p.unit_price)}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(p.total_price)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <Cog className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm">No spare part installations logged for this vehicle.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. PREVIOUS INVOICES */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><FileText className="h-4 w-4 text-primary" /> Invoices Issued</CardTitle></CardHeader>
            <CardContent className="p-0">
              {invoices.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Total Amount</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-sm font-semibold">{inv.invoice_number}</TableCell>
                        <TableCell className="text-sm">{formatDate(inv.created_at)}</TableCell>
                        <TableCell><StatusBadge status={inv.payment_status} type="payment" /></TableCell>
                        <TableCell className="text-right font-medium">{formatCurrency(inv.total)}</TableCell>
                        <TableCell className="text-right text-emerald-500">{formatCurrency(inv.paid)}</TableCell>
                        <TableCell className="text-right font-semibold text-amber-500">{formatCurrency(inv.balance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm">No invoices issued for this vehicle yet.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. PAYMENT HISTORY */}
        <TabsContent value="payments">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4 text-primary" /> Payment Transactions</CardTitle></CardHeader>
            <CardContent className="p-0">
              {payments.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Reference / Cheque #</TableHead>
                      <TableHead className="text-right">Amount Paid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((pay) => (
                      <TableRow key={pay.id} className="hover:bg-muted/50">
                        <TableCell className="text-sm">{formatDateTime(pay.payment_date)}</TableCell>
                        <TableCell className="font-mono text-xs">{pay.invoice?.invoice_number || "—"}</TableCell>
                        <TableCell className="uppercase text-xs font-semibold">{pay.payment_method}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{pay.reference_number || "—"}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-500">{formatCurrency(pay.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <div className="py-12 text-center text-muted-foreground">
                  <CreditCard className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm">No payment records found for this vehicle owner.</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. UPLOADED PAPER JOB CARDS & DOCUMENTS */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Uploaded Job Cards & Paper Documents
                </CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Historical paper repair orders, inspection reports, and scanned job cards for this vehicle
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setUploadDocOpen(true)} className="gap-1.5">
                <Upload className="h-3.5 w-3.5 text-primary" /> Upload Paper Job Card
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {documents.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[18%]">Job Card #</TableHead>
                      <TableHead className="w-[14%]">Date</TableHead>
                      <TableHead className="w-[20%]">Customer</TableHead>
                      <TableHead className="w-[26%]">Description / Scope</TableHead>
                      <TableHead className="w-[10%]">File Size</TableHead>
                      <TableHead className="w-[12%] text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
                      <TableRow key={doc.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono text-sm font-semibold">
                          <button
                            onClick={() => setPreviewDoc(doc)}
                            className="hover:text-primary transition-colors flex items-center gap-1.5 text-left"
                          >
                            <FileText className="h-4 w-4 text-primary shrink-0" />
                            <span>{doc.job_card_number}</span>
                          </button>
                        </TableCell>
                        <TableCell className="text-sm">{formatDate(doc.date || doc.created_at)}</TableCell>
                        <TableCell className="text-sm">{doc.customer?.name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <p className="line-clamp-2">{doc.description || "Archived physical repair order document."}</p>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {(doc.file_size / 1024 / 1024).toFixed(2)} MB
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
                              onClick={async () => {
                                if (!confirm("Delete this document record?")) return;
                                try {
                                  await deleteUploadedJobCard(doc.id);
                                  setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
                                  setToastMessage({ type: "success", text: "Document removed." });
                                } catch (err: any) {
                                  setToastMessage({ type: "error", text: err.message });
                                }
                              }}
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
                <div className="py-12 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm font-medium">No previous or paper job cards archived for this vehicle.</p>
                  <p className="text-xs text-muted-foreground mt-1 mb-4">
                    Archive physical repair orders or scanned inspection reports
                  </p>
                  <Button size="sm" variant="outline" onClick={() => setUploadDocOpen(true)}>
                    <Upload className="mr-1.5 h-3.5 w-3.5" /> Upload First Paper Job Card
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Edit Vehicle Specs Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogTitle>Edit Vehicle Specifications</DialogTitle>
          <form onSubmit={handleUpdate} className="space-y-4 mt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ed-make">Make <span className="text-destructive">*</span></Label>
                <Input id="ed-make" value={make} onChange={(e) => setMake(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ed-model">Model <span className="text-destructive">*</span></Label>
                <Input id="ed-model" value={model} onChange={(e) => setModel(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="ed-year">Year</Label>
                <Input id="ed-year" type="number" value={year} onChange={(e) => setYear(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ed-color">Color</Label>
                <Input id="ed-color" value={color} onChange={(e) => setColor(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ed-mileage">Mileage (KM)</Label>
                <Input id="ed-mileage" type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ed-reg">Registration Plate</Label>
                <Input id="ed-reg" value={registrationNumber} onChange={(e) => setRegistrationNumber(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ed-vin">Chassis / VIN</Label>
                <Input id="ed-vin" value={chassisVin} onChange={(e) => setChassisVin(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ed-vnotes">Vehicle Notes</Label>
              <Textarea id="ed-vnotes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Upload Paper Job Card Dialog */}
      <UploadJobCardDialog
        open={uploadDocOpen}
        onOpenChange={setUploadDocOpen}
        initialCustomerId={vehicle?.customer_id}
        initialVehicleId={id}
        onSuccess={() => {
          setToastMessage({ type: "success", text: "Paper Job Card archived successfully." });
          loadData();
        }}
      />

      {/* Document Preview Dialog */}
      {previewDoc && (
        <Dialog open={!!previewDoc} onOpenChange={() => setPreviewDoc(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogTitle className="flex items-center justify-between pr-6">
              <span>Job Card: {previewDoc.job_card_number}</span>
            </DialogTitle>
            <DialogDescription>
              Date: {formatDate(previewDoc.date)} {previewDoc.customer ? `• Customer: ${previewDoc.customer.name}` : ""}
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
    </div>
  );
}
