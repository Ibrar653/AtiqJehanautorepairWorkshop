import * as XLSX from "xlsx";
import type { JobCardWithRelations } from "@/types/database";
import { formatAmount, formatCurrency, formatDate } from "@/lib/utils";

// ─── HELPER: Filename Sanitizer ──────────────────────────────────────────────
export function sanitizeFileName(name: string): string {
  return String(name || "Document")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "_")
    .trim();
}

// ─── 1. EXPORT SINGLE JOB CARD TO EXCEL (.xlsx) ──────────────────────────────
export function exportJobCardToExcel(
  jobCard: JobCardWithRelations,
  workspaceTrn?: string
): void {
  const companyTrn = (
    (jobCard as any)?.workspace?.trn_number ||
    (jobCard as any)?.workspace?.trn ||
    workspaceTrn ||
    ""
  ).trim();

  const rawItems = jobCard.items || [];
  const serviceItems = rawItems
    .filter((it) => it.item_type === "service" || !it.item_type)
    .map((it) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const l = Number(it.labour_charge) || 0;
      const amount = Number(it.total_price) || q * p + l;
      return {
        id: it.id,
        title: it.description || "Service",
        unitPrice: p,
        labourCharge: l,
        amount,
      };
    });

  const sparePartItems = rawItems
    .filter((it) => it.item_type === "part")
    .map((it) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const amount = Number(it.total_price) || q * p;
      return {
        id: it.id,
        title: it.description || "Spare Part",
        quantity: q,
        unitPrice: p,
        amount,
      };
    });

  const servicesTotal = serviceItems.reduce((sum, s) => sum + s.amount, 0);
  const sparePartsTotal = sparePartItems.reduce((sum, p) => sum + p.amount, 0);
  const calculatedSubtotal = servicesTotal + sparePartsTotal;
  const subtotal = Number(jobCard.subtotal) || calculatedSubtotal;
  const discount = Number(jobCard.discount) || 0;
  const taxableAmount = Math.max(0, subtotal - discount);
  const vatRate =
    jobCard.vat_rate !== undefined &&
    jobCard.vat_rate !== null &&
    Number.isFinite(Number(jobCard.vat_rate))
      ? Number(jobCard.vat_rate)
      : 5;
  const vatAmount =
    Number(jobCard.vat_amount) ||
    Math.round(taxableAmount * (vatRate / 100) * 100) / 100;
  const grandTotal =
    Number(jobCard.total) ||
    Math.round((taxableAmount + vatAmount) * 100) / 100;

  const totalPaid =
    (jobCard as any).payments &&
    Array.isArray((jobCard as any).payments) &&
    (jobCard as any).payments.length > 0
      ? (jobCard as any).payments.reduce(
          (sum: number, p: any) => sum + (Number(p.amount) || 0),
          0
        )
      : Number((jobCard as any).paid) || 0;
  const pendingBalance = Math.max(
    0,
    (jobCard as any).balance !== undefined
      ? Number((jobCard as any).balance)
      : grandTotal - totalPaid
  );

  const invoiceNumber = jobCard.invoice_number
    ? String(jobCard.invoice_number)
    : (jobCard.job_card_number || "").replace(/^JC-/, "") || "1066";

  const paymentStatus =
    jobCard.payment_status ||
    (pendingBalance === 0 && grandTotal > 0
      ? "Paid"
      : totalPaid > 0
      ? "Partial"
      : "Pending");

  const vehicleMileage = jobCard.mileage_in
    ? `${jobCard.mileage_in.toLocaleString()} KM`
    : jobCard.vehicle?.mileage
    ? `${jobCard.vehicle.mileage.toLocaleString()} KM`
    : "—";

  // ── Sheet 1: Summary ──
  const summaryData: any[][] = [
    ["ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C."],
    ["AL DHAFRA REGION, MADINAT ZAYED, MZE16, ST 04"],
    ["CONTACT: +971-501233517 / +971-501517497"],
    companyTrn ? [`TRN: ${companyTrn}`] : ["TRN: Unregistered"],
    [],
    ["JOB CARD SUMMARY", ""],
    ["Job Card Number", jobCard.job_card_number || "—"],
    ["Tax Invoice Number", invoiceNumber],
    ["Order Date", formatDate(jobCard.date || jobCard.created_at)],
    ["Order Status", (jobCard.status || "new").toUpperCase()],
    ["Payment Status", paymentStatus],
    ["Assigned Mechanic", jobCard.assigned_mechanic || "—"],
    [],
    ["CUSTOMER DETAILS", ""],
    ["Customer Name", jobCard.customer?.name || "Cash Customer"],
    ["Company Name", jobCard.customer?.company_name || "Individual"],
    ["Phone / Mobile", jobCard.customer?.mobile || "—"],
    ["Customer TRN", jobCard.customer?.trn_number || "—"],
    ["Address / City", jobCard.customer?.address || "UAE"],
    [],
    ["VEHICLE DETAILS", ""],
    ["Make", jobCard.vehicle?.make || "—"],
    ["Model", jobCard.vehicle?.model || "—"],
    ["Year", jobCard.vehicle?.year || "—"],
    ["Color", jobCard.vehicle?.color || "—"],
    ["Registration / Plate", jobCard.vehicle?.registration_number || "—"],
    ["Chassis / VIN", jobCard.vehicle?.chassis_vin || "—"],
    ["Mileage", vehicleMileage],
    [],
    ["FINANCIAL BREAKDOWN", ""],
    ["Services Subtotal (AED)", servicesTotal],
    ["Spare Parts Subtotal (AED)", sparePartsTotal],
    ["Gross Subtotal (AED)", subtotal],
    ["Discount (AED)", discount],
    ["VAT Rate", `${vatRate}%`],
    ["VAT Amount (AED)", vatAmount],
    ["Total Amount (AED)", grandTotal],
    ["Advance / Paid (AED)", totalPaid],
    ["Pending Balance (AED)", pendingBalance],
    [],
    ["WORK DETAILS & NOTES", ""],
    ["Customer Complaint", jobCard.customer_complaint || "None specified"],
    ["Work Details", jobCard.work_details || "—"],
    ["General Notes", jobCard.notes || "—"],
  ];

  // ── Sheet 2: Services & Parts Items ──
  const itemsHeaders = [
    "S.No",
    "Item Type",
    "Description",
    "Quantity",
    "Unit Price (AED)",
    "Labour Charge (AED)",
    "Total Amount (AED)",
  ];

  const itemsRows: any[][] = [];
  let sNo = 1;

  serviceItems.forEach((s) => {
    itemsRows.push([
      sNo++,
      "Labor & Service",
      s.title,
      1,
      s.unitPrice,
      s.labourCharge,
      s.amount,
    ]);
  });

  sparePartItems.forEach((p) => {
    itemsRows.push([
      sNo++,
      "Spare Part",
      p.title,
      p.quantity,
      p.unitPrice,
      0,
      p.amount,
    ]);
  });

  itemsRows.push([]);
  itemsRows.push([
    "",
    "TOTAL",
    `Total Services: ${serviceItems.length} | Total Parts: ${sparePartItems.length}`,
    "",
    "",
    "",
    grandTotal,
  ]);

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  const wsItems = XLSX.utils.aoa_to_sheet([itemsHeaders, ...itemsRows]);

  wsSummary["!cols"] = [{ wch: 28 }, { wch: 45 }];
  wsItems["!cols"] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 40 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, "Job Card Summary");
  XLSX.utils.book_append_sheet(wb, wsItems, "Services & Parts Items");

  const cleanNum = sanitizeFileName(jobCard.job_card_number || "Draft");
  XLSX.writeFile(wb, `JobCard-${cleanNum}.xlsx`);
}

// ─── 2. EXPORT SINGLE INVOICE TO EXCEL (.xlsx) ───────────────────────────────
export function exportInvoiceToExcel(
  invoice: any,
  workspaceTrn?: string
): void {
  const companyTrn = (
    invoice?.workspace?.trn_number ||
    invoice?.workspace?.trn ||
    workspaceTrn ||
    ""
  ).trim();

  const rawItems: any[] = invoice.items || [];
  const serviceItems = rawItems
    .filter((it) => it.item_type === "service" || !it.item_type)
    .map((it) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const amount = Number(it.total_price) || q * p;
      return {
        id: it.id,
        title: it.description || "Service",
        quantity: q,
        unitPrice: p,
        amount,
      };
    });

  const sparePartItems = rawItems
    .filter((it) => it.item_type === "part")
    .map((it) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const amount = Number(it.total_price) || q * p;
      return {
        id: it.id,
        title: it.description || "Spare Part",
        partNumber: it.part_number || "",
        quantity: q,
        unitPrice: p,
        amount,
      };
    });

  const servicesTotal = serviceItems.reduce((sum, s) => sum + s.amount, 0);
  const sparePartsTotal = sparePartItems.reduce((sum, p) => sum + p.amount, 0);
  const subtotal = Number(invoice.subtotal) || servicesTotal + sparePartsTotal;
  const vatRate =
    invoice.vat_rate !== undefined &&
    invoice.vat_rate !== null &&
    Number.isFinite(Number(invoice.vat_rate))
      ? Number(invoice.vat_rate)
      : 5;
  const vatAmount =
    Number(invoice.vat_amount) ||
    Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const total =
    Number(invoice.total) || Math.round((subtotal + vatAmount) * 100) / 100;
  const paid = Number(invoice.paid) || 0;
  const balance =
    Number(invoice.balance) !== undefined
      ? Number(invoice.balance)
      : Math.max(0, total - paid);

  const isPaid = balance === 0 && total > 0;
  const isPartial = paid > 0 && balance > 0;
  const isVoid = invoice.payment_status === "void" || invoice.is_void;

  const paymentStatusText = isVoid
    ? "VOIDED"
    : isPaid
    ? "PAID IN FULL"
    : isPartial
    ? "PARTIALLY PAID"
    : "CREDIT / UNPAID";

  const jobCardRef =
    invoice.job_card?.job_card_number ||
    (invoice.job_card_id ? `#${invoice.job_card_id.slice(-6)}` : "Direct Invoice");

  // ── Sheet 1: Invoice Summary ──
  const summaryData: any[][] = [
    ["ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C."],
    ["AL DHAFRA REGION, MADINAT ZAYED, MZE16, ST 04"],
    ["CONTACT: +971-501233517 / +971-501517497"],
    companyTrn ? [`TRN: ${companyTrn}`] : ["TRN: Unregistered"],
    [],
    ["TAX INVOICE SUMMARY", ""],
    ["Invoice Number", invoice.invoice_number || "—"],
    ["Job Card Reference", jobCardRef],
    ["Invoice Date", formatDate(invoice.created_at || invoice.date)],
    ["Invoice Type", invoice.invoice_type || "job_card"],
    ["Payment Status", paymentStatusText],
    [],
    ["CUSTOMER DETAILS", ""],
    ["Customer Name", invoice.customer?.name || invoice.customer_name || "Walk-in Customer"],
    ["Company Name", invoice.customer?.company_name || invoice.company_name || "—"],
    ["Phone / Mobile", invoice.customer?.mobile || invoice.customer?.phone || "—"],
    ["Customer TRN", invoice.customer?.trn_number || invoice.customer?.trn || "—"],
    ["Address / City", invoice.customer?.address || "UAE"],
    [],
    ["VEHICLE DETAILS", ""],
    [
      "Vehicle Make & Model",
      invoice.vehicle?.make
        ? `${invoice.vehicle.make} ${invoice.vehicle.model || ""}`.trim()
        : "Counter Sale (No Vehicle)",
    ],
    ["Registration / Plate", invoice.vehicle?.registration_number || "—"],
    ["Chassis / VIN", invoice.vehicle?.chassis_vin || "—"],
    ["Year", invoice.vehicle?.year || "—"],
    ["Color", invoice.vehicle?.color || "—"],
    ["Mileage", invoice.vehicle?.mileage ? `${invoice.vehicle.mileage.toLocaleString()} KM` : "—"],
    [],
    ["FINANCIAL TOTALS", ""],
    ["Services Subtotal (AED)", servicesTotal],
    ["Spare Parts Subtotal (AED)", sparePartsTotal],
    ["Gross Subtotal (AED)", subtotal],
    ["Discount (AED)", Number(invoice.discount) || 0],
    ["VAT Rate", `${vatRate}%`],
    ["VAT Amount (AED)", vatAmount],
    ["Total Amount (Incl. VAT) (AED)", total],
    ["Paid / Received (AED)", paid],
    ["Balance Outstanding (AED)", balance],
    [],
    ["NOTES & TERMS", ""],
    ["Notes", invoice.notes || "—"],
  ];

  // ── Sheet 2: Line Items ──
  const itemsHeaders = [
    "S.No",
    "Item Type",
    "Description",
    "Part Number",
    "Quantity",
    "Unit Price (AED)",
    "Total Amount (AED)",
  ];

  const itemsRows: any[][] = [];
  let sNo = 1;

  serviceItems.forEach((s) => {
    itemsRows.push([
      sNo++,
      "Labor & Service",
      s.title,
      "—",
      s.quantity,
      s.unitPrice,
      s.amount,
    ]);
  });

  sparePartItems.forEach((p) => {
    itemsRows.push([
      sNo++,
      "Spare Part",
      p.title,
      p.partNumber || "—",
      p.quantity,
      p.unitPrice,
      p.amount,
    ]);
  });

  itemsRows.push([]);
  itemsRows.push([
    "",
    "TOTAL",
    `Total Line Items: ${serviceItems.length + sparePartItems.length}`,
    "",
    "",
    "",
    total,
  ]);

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
  const wsItems = XLSX.utils.aoa_to_sheet([itemsHeaders, ...itemsRows]);

  wsSummary["!cols"] = [{ wch: 30 }, { wch: 45 }];
  wsItems["!cols"] = [
    { wch: 8 },
    { wch: 18 },
    { wch: 40 },
    { wch: 18 },
    { wch: 12 },
    { wch: 18 },
    { wch: 20 },
  ];

  XLSX.utils.book_append_sheet(wb, wsSummary, "Invoice Summary");
  XLSX.utils.book_append_sheet(wb, wsItems, "Invoice Items");

  const cleanNum = sanitizeFileName(String(invoice.invoice_number || "Draft"));
  XLSX.writeFile(wb, `Invoice-${cleanNum}.xlsx`);
}

// ─── 3. BULK EXPORT JOB CARDS (Excel or CSV) ─────────────────────────────────
export function exportJobCardsBulk(
  jobCards: JobCardWithRelations[],
  format: "excel" | "csv",
  label = "JobCards"
): void {
  const headers = [
    "Job Card #",
    "Invoice #",
    "Date",
    "Status",
    "Payment Status",
    "Customer Name",
    "Customer Mobile",
    "Customer Company",
    "Customer TRN",
    "Vehicle Make & Model",
    "Plate Number",
    "Chassis / VIN",
    "Mileage",
    "Assigned Mechanic",
    "Subtotal (AED)",
    "Discount (AED)",
    "VAT Amount (AED)",
    "Total (AED)",
    "Paid (AED)",
    "Balance (AED)",
    "Customer Complaint",
  ];

  const rows = jobCards.map((jc) => {
    const invoiceNum = jc.invoice_number ? String(jc.invoice_number) : "";
    const vehicleStr = `${jc.vehicle?.make || ""} ${jc.vehicle?.model || ""}`.trim();
    const mileageStr = jc.mileage_in
      ? String(jc.mileage_in)
      : jc.vehicle?.mileage
      ? String(jc.vehicle.mileage)
      : "";

    return [
      jc.job_card_number || "",
      invoiceNum,
      formatDate(jc.date || jc.created_at),
      (jc.status || "new").toUpperCase(),
      jc.payment_status || "Pending",
      jc.customer?.name || "",
      jc.customer?.mobile || "",
      jc.customer?.company_name || "",
      jc.customer?.trn_number || "",
      vehicleStr,
      jc.vehicle?.registration_number || "",
      jc.vehicle?.chassis_vin || "",
      mileageStr,
      jc.assigned_mechanic || "",
      Number(jc.subtotal) || 0,
      Number(jc.discount) || 0,
      Number(jc.vat_amount) || 0,
      Number(jc.total) || 0,
      Number(jc.paid) || 0,
      Number(jc.balance) || 0,
      jc.customer_complaint || "",
    ];
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, "Job Cards");

  const timestamp = new Date().toISOString().slice(0, 10);
  const baseName = `${label}_${timestamp}`;

  if (format === "csv") {
    XLSX.writeFile(wb, `${baseName}.csv`, { bookType: "csv" });
  } else {
    XLSX.writeFile(wb, `${baseName}.xlsx`);
  }
}

// ─── 4. BULK EXPORT INVOICES (Excel or CSV) ──────────────────────────────────
export function exportInvoicesBulk(
  invoices: any[],
  format: "excel" | "csv",
  label = "Invoices"
): void {
  const headers = [
    "Invoice #",
    "Job Card Ref",
    "Invoice Date",
    "Invoice Type",
    "Payment Status",
    "Customer Name",
    "Customer Phone",
    "Customer Company",
    "Customer TRN",
    "Vehicle Make & Model",
    "Plate Number",
    "Chassis / VIN",
    "Mileage",
    "Subtotal (AED)",
    "Discount (AED)",
    "VAT Rate (%)",
    "VAT Amount (AED)",
    "Total (AED)",
    "Paid (AED)",
    "Balance (AED)",
    "Notes",
  ];

  const rows = invoices.map((inv) => {
    const jcRef =
      inv.job_card?.job_card_number ||
      (inv.job_card_id ? `#${inv.job_card_id.slice(-6)}` : "Direct Sale");
    const vehicleStr = `${inv.vehicle?.make || ""} ${inv.vehicle?.model || ""}`.trim();

    return [
      inv.invoice_number || "",
      jcRef,
      formatDate(inv.created_at || inv.date),
      inv.invoice_type || "job_card",
      inv.payment_status || "credit",
      inv.customer?.name || inv.customer_name || "",
      inv.customer?.mobile || inv.customer?.phone || "",
      inv.customer?.company_name || inv.company_name || "",
      inv.customer?.trn_number || inv.customer?.trn || "",
      vehicleStr,
      inv.vehicle?.registration_number || "",
      inv.vehicle?.chassis_vin || "",
      inv.vehicle?.mileage ? String(inv.vehicle.mileage) : "",
      Number(inv.subtotal) || 0,
      Number(inv.discount) || 0,
      Number(inv.vat_rate) || 5,
      Number(inv.vat_amount) || 0,
      Number(inv.total) || 0,
      Number(inv.paid) || 0,
      Number(inv.balance) || 0,
      inv.notes || "",
    ];
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 18 }));
  XLSX.utils.book_append_sheet(wb, ws, "Tax Invoices");

  const timestamp = new Date().toISOString().slice(0, 10);
  const baseName = `${label}_${timestamp}`;

  if (format === "csv") {
    XLSX.writeFile(wb, `${baseName}.csv`, { bookType: "csv" });
  } else {
    XLSX.writeFile(wb, `${baseName}.xlsx`);
  }
}
