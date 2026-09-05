"use client";

import type { JobCardWithRelations } from "@/types/database";
import { formatAmount, formatCurrency, formatDate } from "@/lib/utils";

interface JobCardPrintViewProps {
  jobCard: JobCardWithRelations;
}

export function JobCardPrintView({ jobCard }: JobCardPrintViewProps) {
  if (!jobCard) return null;

  const rawItems = jobCard.items || [];

  // 1. Separate actual services and spare parts
  const serviceItems = rawItems
    .filter((it) => it.item_type === "service" || !it.item_type)
    .map((it) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const l = Number(it.labour_charge) || 0;
      const amount = Number(it.total_price) || (q * p + l);
      return {
        id: it.id,
        title: it.description || "Service",
        unitPrice: p,
        amount: amount,
      };
    });

  const sparePartItems = rawItems
    .filter((it) => it.item_type === "part")
    .map((it) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const amount = Number(it.total_price) || (q * p);
      return {
        id: it.id,
        title: it.description || "Spare Part",
        quantity: q,
        unitPrice: p,
        amount: amount,
      };
    });

  // Calculate totals
  const servicesTotal = serviceItems.reduce((sum, s) => sum + s.amount, 0);
  const sparePartsTotal = sparePartItems.reduce((sum, p) => sum + p.amount, 0);
  const calculatedSubtotal = servicesTotal + sparePartsTotal;
  const subtotal = Number(jobCard.subtotal) || calculatedSubtotal;
  const vatRate = jobCard.vat_rate !== undefined && jobCard.vat_rate !== null && Number.isFinite(Number(jobCard.vat_rate))
    ? Number(jobCard.vat_rate)
    : 5;
  const vatAmount = Number(jobCard.vat_amount) || Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const grandTotal = Number(jobCard.total) || Math.round((subtotal + vatAmount) * 100) / 100;

  // Invoice Number (starting from 1060 sequence)
  const invoiceNumber = jobCard.invoice_number
    ? String(jobCard.invoice_number)
    : (jobCard.job_card_number || "").replace(/^JC-/, "") || "1060";

  // Payment Status & Color Logic
  const paymentStatus = jobCard.payment_status || "Pending";
  const isPaid = /cash|bank\s*transfer|credit\s*card|paid/i.test(paymentStatus);
  const paymentColorHex = isPaid ? "#16a34a" : "#dc2626";
  const paymentBgHex = isPaid ? "#f0fdf4" : "#fef2f2";

  const vehicleMileage = jobCard.mileage_in
    ? `${jobCard.mileage_in.toLocaleString()} KM`
    : jobCard.vehicle?.mileage
    ? `${jobCard.vehicle.mileage.toLocaleString()} KM`
    : "—";

  // Dynamic density scaling based on item count
  const totalItemCount = serviceItems.length + sparePartItems.length;
  const isHighDensity = totalItemCount >= 10;
  const isMediumDensity = totalItemCount >= 6 && totalItemCount < 10;

  const rootTextClass = isHighDensity ? "text-[8px]" : isMediumDensity ? "text-[8.5px]" : "text-[9.5px]";
  const cellPadding = isHighDensity ? "py-0.5 px-1.5" : isMediumDensity ? "py-1 px-2" : "py-1.5 px-2.5";
  const sectionGap = isHighDensity ? "mb-1.5" : isMediumDensity ? "mb-2" : "mb-2.5";
  const termsTextClass = isHighDensity ? "text-[6.5px] leading-[1.15]" : isMediumDensity ? "text-[7px] leading-[1.2]" : "text-[7.5px] leading-[1.25]";

  return (
    <div
      className={`job-card-print print-only hidden print:block bg-white text-black leading-tight font-sans ${rootTextClass}`}
      style={{
        boxSizing: "border-box",
        width: "100%",
        maxWidth: "100%",
        margin: "0 auto",
      }}
    >
      <style jsx global>{`
        * {
          -webkit-print-color-adjust: exact !important;
          print-color-adjust: exact !important;
          color-adjust: exact !important;
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 6mm;
          }
          html, body {
            background: #fff !important;
            color: #000 !important;
            margin: 0 !important;
            padding: 0 !important;
            width: 100% !important;
            height: 100% !important;
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
          }
          .no-print, header, aside, nav, footer, button {
            display: none !important;
          }
          .print-only {
            display: block !important;
          }
          .job-card-print {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            width: 100% !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
          }
          .job-card-header {
            display: grid !important;
            grid-template-columns: 1.2fr 0.8fr 1fr !important;
            align-items: center !important;
            gap: 12px !important;
            margin: 0 !important;
          }
          .job-card-logo {
            width: 70px !important;
            max-height: 70px !important;
            height: auto !important;
            object-fit: contain !important;
            display: block !important;
            margin: 0 auto !important;
          }
          .job-card-signatures {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 100% !important;
            margin-top: 6px !important;
            padding-top: 4px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .signatures-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 28px !important;
            width: 100% !important;
          }
          .signature-box {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            min-height: 55px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .company-stamp {
            width: 70px !important;
            height: auto !important;
            object-fit: contain !important;
            display: block !important;
          }
          .company-signature {
            width: 110px !important;
            height: auto !important;
            object-fit: contain !important;
            display: block !important;
          }
          .print-red {
            color: #dc2626 !important;
          }
          .print-green {
            color: #16a34a !important;
          }
          .print-border-red {
            border-color: #dc2626 !important;
          }
          .print-border-green {
            border-color: #16a34a !important;
          }
          .print-border-black {
            border-color: #000000 !important;
          }
          .print-text-black {
            color: #000000 !important;
          }
          .print-bg-red {
            background-color: #fef2f2 !important;
          }
          .print-bg-green {
            background-color: #f0fdf4 !important;
          }
          table, tr, td, th {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* ─── Top Main Content Container ─── */}
      <div className="w-full space-y-2">
        {/* ─── Top Section: 3-Column Header ─── */}
        <div className={`border-2 border-black p-2 ${sectionGap} bg-white job-card-header`}>
          {/* Left Column: Workshop Details */}
          <div className="text-left leading-tight">
            <h1
              className="text-[12px] font-black uppercase tracking-tight leading-snug mb-1 print-red"
              style={{ color: "#dc2626" }}
            >
              ATIQ JEHAN AUTO REPAIR &amp;<br />USED SPARE PARTS L.L.C.
            </h1>
            <p className="text-[8px] font-semibold text-gray-800 uppercase tracking-tight">
              AL DHAFRA REGION, MADINAT ZAYED<br />MZE16, ST 04
            </p>
            <div className="text-[8px] font-bold text-black mt-1">
              <span className="font-semibold text-gray-700 mr-1">CONTACT:</span>
              <span className="font-mono text-black mr-2">+971-501233517</span>
              <span className="font-mono text-black">+971-501517497</span>
            </div>
            <p className="text-[7.5px] font-mono text-gray-700 mt-0.5">
              TRN: 100345678900003
            </p>
          </div>

          {/* Center Column: Official Logo ONLY */}
          <div className="flex items-center justify-center px-2">
            <img
              src="/atiq-jehan-logo.png"
              alt="ATIQ JEHAN Auto Repair"
              className="job-card-logo"
              style={{ width: "70px", maxHeight: "70px", objectFit: "contain" }}
            />
          </div>

          {/* Right Column: JOB CARD (RED) & Invoice Number (BLACK) */}
          <div className="text-right flex flex-col items-end justify-center leading-tight">
            <h2
              className="text-base font-black tracking-widest uppercase mb-1 print-red"
              style={{ color: "#dc2626" }}
            >
              JOB CARD
            </h2>
            <div
              className="border-2 border-black px-3 py-1 font-bold text-[9.5px] whitespace-nowrap bg-white text-black mb-1 print-border-black print-text-black"
              style={{ color: "#000000", borderColor: "#000000", backgroundColor: "#ffffff" }}
            >
              INVOICE NO: <span className="font-mono font-black text-xs ml-1 text-black print-text-black" style={{ color: "#000000" }}>{invoiceNumber}</span>
            </div>
            <div className="text-[8px] font-semibold text-gray-700">
              DATE: <span className="font-mono text-black font-bold">{formatDate(jobCard.date || jobCard.created_at)}</span>
            </div>
            <div className="text-[8px] font-semibold text-gray-700 mt-0.5">
              JOB CARD NO: <span className="font-mono text-black font-bold">{jobCard.job_card_number}</span>
            </div>
          </div>
        </div>

        {/* ─── Customer / Vehicle Information Table (Exact 50% / 50% Fixed Table) ─── */}
        <div className={`border border-black ${sectionGap} w-full overflow-hidden bg-white`}>
          <table className="w-full table-fixed border-collapse text-left" style={{ width: "100%", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "14%" }} />
              <col style={{ width: "36%" }} />
              <col style={{ width: "14%" }} />
              <col style={{ width: "36%" }} />
            </colgroup>
            <tbody>
              {/* Row 1: Customer Name & Vehicle (Make) */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Customer Name:</td>
                <td className="px-2 py-0.5 font-bold text-black border-r border-black truncate">
                  {jobCard.customer?.name || "Cash Customer"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Vehicle:</td>
                <td className="px-2 py-0.5 font-bold text-black truncate">
                  {jobCard.vehicle?.make || "—"}
                </td>
              </tr>

              {/* Row 2: Company & Model */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Company:</td>
                <td className="px-2 py-0.5 text-black border-r border-black truncate">
                  {jobCard.customer?.company_name || "Individual"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Model:</td>
                <td className="px-2 py-0.5 font-bold text-black truncate">
                  {jobCard.vehicle?.model || "—"}
                </td>
              </tr>

              {/* Row 3: TRN No & Year (SEPARATE) */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">TRN No:</td>
                <td className="px-2 py-0.5 font-mono text-black border-r border-black truncate">
                  {jobCard.customer?.trn_number || "—"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Year:</td>
                <td className="px-2 py-0.5 font-mono text-black truncate">
                  {jobCard.vehicle?.year || "—"}
                </td>
              </tr>

              {/* Row 4: Phone & Color (SEPARATE) */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Phone:</td>
                <td className="px-2 py-0.5 font-mono text-black border-r border-black truncate">
                  {jobCard.customer?.mobile || "—"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Color:</td>
                <td className="px-2 py-0.5 text-black truncate">
                  {jobCard.vehicle?.color || "—"}
                </td>
              </tr>

              {/* Row 5: Job Card No & Chassis / VIN */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Job Card No:</td>
                <td className="px-2 py-0.5 font-mono font-bold text-black border-r border-black truncate">
                  {jobCard.job_card_number || "—"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Chassis / VIN:</td>
                <td className="px-2 py-0.5 font-mono text-[8px] text-black truncate">
                  {jobCard.vehicle?.chassis_vin || "—"}
                </td>
              </tr>

              {/* Row 6: Invoice No & Registration */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Invoice No:</td>
                <td className="px-2 py-0.5 font-mono text-black border-r border-black truncate">
                  {invoiceNumber}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Registration:</td>
                <td className="px-2 py-0.5 font-mono font-bold text-black truncate">
                  {jobCard.vehicle?.registration_number || "—"}
                </td>
              </tr>

              {/* Row 7: Payment Status & Mileage */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Payment Status:</td>
                <td className="px-2 py-0.5 font-bold uppercase text-black border-r border-black truncate">
                  {paymentStatus}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Mileage:</td>
                <td className="px-2 py-0.5 font-mono text-black truncate">
                  {vehicleMileage}
                </td>
              </tr>

              {/* Row 8: Customer Address & Date */}
              <tr>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Address / City:</td>
                <td className="px-2 py-0.5 text-black border-r border-black truncate">
                  {jobCard.customer?.address || "UAE"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Date:</td>
                <td className="px-2 py-0.5 font-mono font-bold text-black truncate">
                  {formatDate(jobCard.date || jobCard.created_at)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── 1. SERVICES SECTION (Labor / Workmanship) ─── */}
        {serviceItems.length > 0 && (
          <div className={`border border-black ${sectionGap} overflow-hidden`}>
            <div className="bg-gray-800 text-white px-2.5 py-1 font-bold uppercase text-[8.5px] tracking-wider flex justify-between">
              <span>1. Labor &amp; Workshop Services</span>
              <span className="font-mono font-normal">Subtotal: {formatCurrency(servicesTotal)}</span>
            </div>
            <table className="w-full table-fixed border-collapse text-left" style={{ width: "100%", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "64%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-100 border-b border-black text-[8px] font-bold text-gray-700">
                  <th className="py-1 px-2 border-r border-gray-300 text-center">S.NO</th>
                  <th className="py-1 px-2.5 border-r border-gray-300">SERVICE DETAILS</th>
                  <th className="py-1 px-2 border-r border-gray-300 text-right">RATE (AED)</th>
                  <th className="py-1 px-2.5 text-right">AMOUNT (AED)</th>
                </tr>
              </thead>
              <tbody>
                {serviceItems.map((s, idx) => (
                  <tr key={s.id || idx} className="border-b border-gray-200 text-[8.5px]">
                    <td className="py-1 px-2 border-r border-gray-300 text-center font-mono">{idx + 1}</td>
                    <td className="py-1 px-2.5 border-r border-gray-300 font-medium">{s.title}</td>
                    <td className="py-1 px-2 border-r border-gray-300 text-right font-mono">{formatAmount(s.unitPrice)}</td>
                    <td className="py-1 px-2.5 text-right font-mono font-bold">{formatAmount(s.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── 2. SPARE PARTS SECTION ─── */}
        {sparePartItems.length > 0 && (
          <div className={`border border-black ${sectionGap} overflow-hidden`}>
            <div className="bg-gray-800 text-white px-2.5 py-1 font-bold uppercase text-[8.5px] tracking-wider flex justify-between">
              <span>2. Spare Parts &amp; Materials Used</span>
              <span className="font-mono font-normal">Subtotal: {formatCurrency(sparePartsTotal)}</span>
            </div>
            <table className="w-full table-fixed border-collapse text-left" style={{ width: "100%", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "6%" }} />
                <col style={{ width: "54%" }} />
                <col style={{ width: "10%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} />
              </colgroup>
              <thead>
                <tr className="bg-gray-100 border-b border-black text-[8px] font-bold text-gray-700">
                  <th className="py-1 px-2 border-r border-gray-300 text-center">S.NO</th>
                  <th className="py-1 px-2.5 border-r border-gray-300">PART / MATERIAL DESCRIPTION</th>
                  <th className="py-1 px-2 border-r border-gray-300 text-center">QTY</th>
                  <th className="py-1 px-2 border-r border-gray-300 text-right">UNIT PRICE</th>
                  <th className="py-1 px-2.5 text-right">TOTAL (AED)</th>
                </tr>
              </thead>
              <tbody>
                {sparePartItems.map((p, idx) => (
                  <tr key={p.id || idx} className="border-b border-gray-200 text-[8.5px]">
                    <td className="py-1 px-2 border-r border-gray-300 text-center font-mono">{idx + 1}</td>
                    <td className="py-1 px-2.5 border-r border-gray-300 font-medium">{p.title}</td>
                    <td className="py-1 px-2 border-r border-gray-300 text-center font-mono font-bold">{p.quantity}</td>
                    <td className="py-1 px-2 border-r border-gray-300 text-right font-mono">{formatAmount(p.unitPrice)}</td>
                    <td className="py-1 px-2.5 text-right font-mono font-bold">{formatAmount(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ─── 3. TOTALS & PAYMENT STATUS SECTION ─── */}
        <div className={`border border-black ${sectionGap} bg-white overflow-hidden`}>
          <div className="grid grid-cols-12">
            {/* Left: Prominent Conditional Payment Status Box */}
            <div className="col-span-6 p-2 flex flex-col justify-center border-r border-black bg-gray-50/60">
              <div className="flex items-center gap-2">
                <span className="font-black uppercase text-black text-[9px] tracking-wide">
                  Payment Status:
                </span>
                <span
                  className="font-black text-[10px] px-3 py-0.5 border uppercase tracking-wider rounded"
                  style={{
                    color: paymentColorHex,
                    borderColor: paymentColorHex,
                    backgroundColor: paymentBgHex,
                  }}
                >
                  {paymentStatus}
                </span>
              </div>
              {sparePartItems.length > 0 && (
                <div className="text-[8px] text-gray-600 mt-1 font-medium space-y-0.5">
                  <div>Services Total: <span className="font-mono font-bold text-black">{formatAmount(servicesTotal)} AED</span></div>
                  <div>Spare Parts Total: <span className="font-mono font-bold text-black">{formatAmount(sparePartsTotal)} AED</span></div>
                </div>
              )}
            </div>

            {/* Right: Subtotal, VAT, Grand Total */}
            <div className="col-span-6 text-[9px] divide-y divide-gray-300 font-medium">
              <div className="flex justify-between py-1 px-2.5 bg-gray-50">
                <span className="font-bold text-gray-800">Sub Total:</span>
                <span className="font-mono font-bold text-black">{formatAmount(subtotal)} AED</span>
              </div>
              <div className="flex justify-between py-1 px-2.5 bg-gray-50">
                <span className="font-bold text-gray-800">VAT ({vatRate}%):</span>
                <span className="font-mono font-bold text-black">{formatAmount(vatAmount)} AED</span>
              </div>
              <div
                className="flex justify-between py-1.5 px-2.5 font-black text-[11px] bg-gray-100 text-black border-t-2 border-black"
                style={{
                  color: "#000000",
                  backgroundColor: "#f3f4f6",
                  borderTop: "2px solid #000000",
                }}
              >
                <span className="uppercase tracking-wider font-black text-black">
                  TOTAL AMOUNT:
                </span>
                <span className="font-mono font-black text-black">
                  AED {formatAmount(grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ─── 4. TERMS & CONDITIONS (Heading & All Points in RED) ─── */}
        <div
          className={`border border-black p-2 ${sectionGap} bg-white ${termsTextClass}`}
        >
          <p
            className="font-black uppercase mb-1 text-[8px] tracking-wider print-red"
            style={{ color: "#dc2626" }}
          >
            TERMS &amp; CONDITIONS
          </p>
          <ol
            className="list-decimal pl-3.5 space-y-0.5 font-medium print-red"
            style={{ color: "#dc2626" }}
          >
            <li>We are not responsible if warranties over on spare parts, vehicles Or Mechanical And Electrician Work.</li>
            <li>We are not liable for any scratches, dents, or prior accidental damage.</li>
            <li>Any additional work requested or required will be charged separately.</li>
            <li>Please remove all personal items; we are not responsible for any loss or damage to items left in the car.</li>
            <li>This quotation is only valid for the specific issues listed above.</li>
            <li>The customer is responsible for providing all necessary repair parts.</li>
            <li>If hidden issues are found during inspection, we will contact you for approval before starting extra work.</li>
            <li>Kindly note that spare parts purchased-original or otherwise-are non-refundable and can only be exchanged.</li>
            <li>The customer should first ensure that any spare part they purchase matches the vehicle’s specifications.</li>
          </ol>
        </div>

      </div>

      {/* ─── 5. SIGNATURE SECTION (Two Equal Columns below Terms & Conditions) ─── */}
      <div className="job-card-signatures w-full mt-2 pt-2 text-black">
        <div className="signatures-grid">
          {/* LEFT SIDE: ATIQ JEHAN AUTO REPAIR */}
          <div className="signature-box text-left flex flex-col justify-between" style={{ minHeight: "55px" }}>
            <div>
              <p className="font-bold text-[9px] text-black uppercase tracking-wider">
                ATIQ JEHAN AUTO REPAIR
              </p>
              <p className="text-[7.5px] text-gray-700 font-medium mt-0.5">
                Authorized Signature
              </p>
            </div>
            <div className="mt-auto pt-3">
              <div className="border-b border-black w-full" style={{ borderBottom: "1px solid #000000" }}></div>
            </div>
          </div>

          {/* RIGHT SIDE: CUSTOMER */}
          <div className="signature-box text-left flex flex-col justify-between" style={{ minHeight: "55px" }}>
            <div>
              <p className="font-bold text-[9px] text-black uppercase tracking-wider">
                CUSTOMER
              </p>
              <p className="text-[7.5px] text-gray-700 font-medium mt-0.5">
                Customer Signature
              </p>
            </div>
            <div className="mt-auto pt-3">
              <div className="border-b border-black w-full" style={{ borderBottom: "1px solid #000000" }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default JobCardPrintView;
