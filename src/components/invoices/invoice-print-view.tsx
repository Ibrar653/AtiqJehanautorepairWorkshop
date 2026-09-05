"use client";

import type { Invoice, InvoiceItem, Payment } from "@/types/database";
import { formatAmount, formatCurrency, formatDate } from "@/lib/utils";

interface InvoicePrintViewProps {
  invoice: any;
}

export function InvoicePrintView({ invoice }: InvoicePrintViewProps) {
  if (!invoice) return null;

  const rawItems: any[] = invoice.items || [];

  // Separate actual services and spare parts
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
        amount: amount,
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
        amount: amount,
      };
    });

  const servicesTotal = serviceItems.reduce((sum, s) => sum + s.amount, 0);
  const sparePartsTotal = sparePartItems.reduce((sum, p) => sum + p.amount, 0);
  const subtotal = Number(invoice.subtotal) || servicesTotal + sparePartsTotal;
  const vatRate = invoice.vat_rate !== undefined && invoice.vat_rate !== null && Number.isFinite(Number(invoice.vat_rate))
    ? Number(invoice.vat_rate)
    : 5;
  const vatAmount = Number(invoice.vat_amount) || Math.round(subtotal * (vatRate / 100) * 100) / 100;
  const total = Number(invoice.total) || Math.round((subtotal + vatAmount) * 100) / 100;
  const paid = Number(invoice.paid) || 0;
  const balance = Number(invoice.balance) !== undefined ? Number(invoice.balance) : Math.max(0, total - paid);

  const payments: Payment[] = invoice.payments || [];

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

  const paymentColorHex = isVoid ? "#64748b" : isPaid ? "#16a34a" : isPartial ? "#d97706" : "#dc2626";

  const totalItemCount = serviceItems.length + sparePartItems.length;
  const isHighDensity = totalItemCount >= 10;
  const isMediumDensity = totalItemCount >= 6 && totalItemCount < 10;

  const rootTextClass = isHighDensity ? "text-[8px]" : isMediumDensity ? "text-[8.5px]" : "text-[9.5px]";
  const sectionGap = isHighDensity ? "mb-1.5" : isMediumDensity ? "mb-2" : "mb-2.5";

  return (
    <div
      className={`invoice-print print-only hidden print:block bg-white text-black leading-tight font-sans ${rootTextClass}`}
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
          .invoice-print {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            width: 100% !important;
            page-break-after: avoid !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            box-sizing: border-box !important;
          }
          .invoice-header {
            display: grid !important;
            grid-template-columns: 1.2fr 0.8fr 1fr !important;
            align-items: center !important;
            gap: 12px !important;
            margin: 0 !important;
          }
          .invoice-logo {
            width: 70px !important;
            max-height: 70px !important;
            height: auto !important;
            object-fit: contain !important;
            display: block !important;
            margin: 0 auto !important;
          }
          .invoice-signatures {
            display: block !important;
            visibility: visible !important;
            opacity: 1 !important;
            width: 100% !important;
            margin-top: 6px !important;
            padding-top: 4px !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .invoice-signatures-grid {
            display: grid !important;
            grid-template-columns: 1fr 1fr !important;
            gap: 28px !important;
            width: 100% !important;
          }
          .invoice-sig-box {
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            min-height: 70px !important;
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
          table, tr, td, th {
            page-break-inside: avoid !important;
          }
        }
      `}</style>

      {/* ─── Top Main Content Container ─── */}
      <div className="w-full space-y-2">
        {/* ─── Top 3-Column Header ─── */}
        <div className={`border-2 border-black p-2 ${sectionGap} bg-white invoice-header flex items-center justify-between`}>
          {/* Left Column: Workshop Details */}
          <div className="text-left leading-tight">
            <h1
              className="text-[12px] font-black uppercase tracking-tight leading-snug mb-1"
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

          {/* Center Column: Official Logo */}
          <div className="flex items-center justify-center px-2">
            <img
              src="/atiq-jehan-logo.png"
              alt="ATIQ JEHAN Auto Repair"
              className="invoice-logo"
              style={{ width: "70px", maxHeight: "70px", objectFit: "contain" }}
            />
          </div>

          {/* Right Column: TAX INVOICE Title & Invoice Number */}
          <div className="text-right flex flex-col items-end justify-center leading-tight">
            <h2
              className="text-base font-black tracking-widest uppercase mb-1"
              style={{ color: isVoid ? "#64748b" : "#dc2626" }}
            >
              {isVoid ? "VOIDED INVOICE" : "TAX INVOICE"}
            </h2>
            <div
              className="border-2 border-black px-3 py-1 font-bold text-[9.5px] whitespace-nowrap bg-white text-black mb-1"
            >
              INVOICE NO: <span className="font-mono font-black text-xs ml-1">{invoice.invoice_number}</span>
            </div>
            <div className="text-[8px] font-semibold text-gray-700">
              DATE: <span className="font-mono text-black font-bold">{formatDate(invoice.created_at || invoice.date)}</span>
            </div>
            {invoice.job_card && (
              <div className="text-[8px] font-semibold text-gray-700 mt-0.5">
                JOB CARD REF: <span className="font-mono text-black font-bold">{invoice.job_card.job_card_number || `#${invoice.job_card_id?.slice(-6)}`}</span>
              </div>
            )}
          </div>
        </div>

        {/* ─── Customer & Vehicle 50/50 Information Table ─── */}
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
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Customer:</td>
                <td className="px-2 py-0.5 font-bold text-black border-r border-black truncate">
                  {invoice.customer?.name || "Cash Customer"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Vehicle:</td>
                <td className="px-2 py-0.5 font-bold text-black truncate">
                  {invoice.vehicle?.make || "—"}
                </td>
              </tr>

              {/* Row 2: Company & Model */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Company:</td>
                <td className="px-2 py-0.5 text-black border-r border-black truncate">
                  {invoice.customer?.company_name || "Individual"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Model:</td>
                <td className="px-2 py-0.5 font-bold text-black truncate">
                  {invoice.vehicle?.model || "—"}
                </td>
              </tr>

              {/* Row 3: Customer TRN & Year (SEPARATE) */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Customer TRN:</td>
                <td className="px-2 py-0.5 font-mono text-black border-r border-black truncate">
                  {invoice.customer?.trn_number || "—"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Year:</td>
                <td className="px-2 py-0.5 font-mono text-black truncate">
                  {invoice.vehicle?.year || "—"}
                </td>
              </tr>

              {/* Row 4: Phone & Color (SEPARATE) */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Phone:</td>
                <td className="px-2 py-0.5 font-mono text-black border-r border-black truncate">
                  {invoice.customer?.mobile || "—"}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Color:</td>
                <td className="px-2 py-0.5 text-black truncate">
                  {invoice.vehicle?.color || "—"}
                </td>
              </tr>

              {/* Row 5: Invoice No & Chassis / VIN */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Invoice No:</td>
                <td className="px-2 py-0.5 font-mono font-bold text-black border-r border-black truncate">
                  {invoice.invoice_number}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Chassis / VIN:</td>
                <td className="px-2 py-0.5 font-mono text-[8px] text-black truncate">
                  {invoice.vehicle?.chassis_vin || "—"}
                </td>
              </tr>

              {/* Row 6: Job Card Ref & Registration */}
              <tr className="border-b border-gray-300">
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Job Card Ref:</td>
                <td className="px-2 py-0.5 font-mono text-black border-r border-black truncate">
                  {invoice.job_card?.job_card_number || (invoice.job_card_id ? `#${invoice.job_card_id.slice(-6)}` : "—")}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Registration:</td>
                <td className="px-2 py-0.5 font-mono font-bold text-black truncate">
                  {invoice.vehicle?.registration_number || "—"}
                </td>
              </tr>

              {/* Row 7: Payment Status & Mileage */}
              <tr>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Payment Status:</td>
                <td className="px-2 py-0.5 font-bold uppercase text-black border-r border-black truncate">
                  {paymentStatusText}
                </td>
                <td className="bg-gray-100 font-bold px-2 py-0.5 text-gray-800 border-r border-gray-300">Mileage:</td>
                <td className="px-2 py-0.5 font-mono text-black truncate">
                  {invoice.vehicle?.mileage ? `${invoice.vehicle.mileage.toLocaleString()} KM` : "—"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ─── 1. SERVICES SECTION (If any) ─── */}
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

        {/* ─── 2. SPARE PARTS SECTION (If any) ─── */}
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

        {/* ─── Financial Summary Table & Settlement Status ─── */}
        <div className={`border border-black ${sectionGap} overflow-hidden grid grid-cols-2`}>
          {/* Left Side: Payment Status & Transactions */}
          <div className="p-2.5 border-r border-black flex flex-col justify-start">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[8px] uppercase font-bold text-gray-700">PAYMENT STATUS:</span>
              <span
                className="px-2.5 py-0.5 rounded font-black text-[9.5px] uppercase border"
                style={{ color: paymentColorHex, borderColor: paymentColorHex }}
              >
                {paymentStatusText}
              </span>
            </div>

            {payments.length > 0 && (
              <div className="mt-1 mb-1">
                <span className="text-[7.5px] uppercase font-bold text-gray-700 block mb-0.5">PAYMENT TRANSACTIONS:</span>
                <table className="w-full text-[7.5px] border-collapse">
                  <tbody>
                    {payments.map((pm, pIdx) => (
                      <tr key={pm.id || pIdx} className="border-b border-gray-200">
                        <td className="py-0.5 font-mono text-gray-600">{formatDate(pm.payment_date || pm.created_at)}</td>
                        <td className="py-0.5 font-bold uppercase">{pm.payment_method}</td>
                        <td className="py-0.5 text-right font-mono font-bold text-emerald-700">{formatCurrency(pm.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ─── Terms & Conditions in Red ─── */}
            <div className="mt-1 pt-1 border-t border-gray-300" style={{ color: "#dc2626" }}>
              <p className="text-[7.5px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "#dc2626" }}>
                TERMS &amp; CONDITIONS:
              </p>
              <ol className="text-[6.5px] leading-[1.25] text-red-600 space-y-0.5 list-none pl-0" style={{ color: "#dc2626" }}>
                <li><span className="font-bold" style={{ color: "#dc2626" }}>1.</span> We are not responsible if warranties over on spare parts, vehicles Or Mechanical And Electrician Work.</li>
                <li><span className="font-bold" style={{ color: "#dc2626" }}>2.</span> We are not liable for any scratches, dents, or prior accidental damage.</li>
                <li><span className="font-bold" style={{ color: "#dc2626" }}>3.</span> Any additional work requested or required will be charged separately.</li>
                <li><span className="font-bold" style={{ color: "#dc2626" }}>4.</span> Please remove all personal items; we are not responsible for any loss or damage to items left in the car.</li>
                <li><span className="font-bold" style={{ color: "#dc2626" }}>5.</span> This quotation is only valid for the specific issues listed above.</li>
                <li><span className="font-bold" style={{ color: "#dc2626" }}>6.</span> The customer is responsible for providing all necessary repair parts.</li>
                <li><span className="font-bold" style={{ color: "#dc2626" }}>7.</span> If hidden issues are found during inspection, we will contact you for approval before starting extra work.</li>
                <li><span className="font-bold" style={{ color: "#dc2626" }}>8.</span> Kindly note that spare parts purchased-original or otherwise-are non-refundable and can only be exchanged.</li>
                <li><span className="font-bold" style={{ color: "#dc2626" }}>9.</span> The customer should first ensure that any spare part they purchase matches the vehicle’s specifications.</li>
              </ol>
            </div>
          </div>

          {/* Right Side: Financial Calculation Totals */}
          <table className="w-full text-right border-collapse text-[8.5px]">
            <tbody>
              <tr className="border-b border-gray-200">
                <td className="py-1 px-2.5 text-gray-600 font-semibold">Services Subtotal:</td>
                <td className="py-1 px-2.5 font-mono text-black">{formatCurrency(servicesTotal)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1 px-2.5 text-gray-600 font-semibold">Spare Parts Subtotal:</td>
                <td className="py-1 px-2.5 font-mono text-black">{formatCurrency(sparePartsTotal)}</td>
              </tr>
              <tr className="border-b border-gray-300 bg-gray-50">
                <td className="py-1 px-2.5 text-gray-800 font-bold">Gross Subtotal:</td>
                <td className="py-1 px-2.5 font-mono font-bold text-black">{formatCurrency(subtotal)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1 px-2.5 text-gray-600 font-semibold">VAT ({vatRate}%):</td>
                <td className="py-1 px-2.5 font-mono text-black">{formatCurrency(vatAmount)}</td>
              </tr>
              <tr className="border-b border-black bg-gray-100 text-[10.5px]">
                <td className="py-1.5 px-2.5 font-black text-black">TOTAL AMOUNT (INCL. VAT):</td>
                <td className="py-1.5 px-2.5 font-mono font-black text-black">{formatCurrency(total)}</td>
              </tr>
              <tr className="border-b border-gray-200">
                <td className="py-1 px-2.5 text-emerald-700 font-bold">Paid / Received:</td>
                <td className="py-1 px-2.5 font-mono font-bold text-emerald-700">{formatCurrency(paid)}</td>
              </tr>
              <tr className="bg-gray-50 text-[9.5px]">
                <td className="py-1 px-2.5 font-black text-rose-700">BALANCE OUTSTANDING:</td>
                <td className={`py-1 px-2.5 font-mono font-black ${balance > 0 ? "text-rose-700" : "text-emerald-700"}`}>
                  {formatCurrency(balance)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── OFFICIAL FOOTER / SIGNATURE SECTION ─── */}
      <div className="invoice-signatures w-full mt-2 pt-2 text-black">
        <div className="invoice-signatures-grid">
          {/* LEFT SIDE: ATIQ JEHAN AUTO REPAIR */}
          <div className="invoice-sig-box text-left flex flex-col justify-between" style={{ minHeight: "75px" }}>
            <div>
              <p className="font-bold text-[9px] text-black uppercase tracking-wider">
                ATIQ JEHAN AUTO REPAIR
              </p>
              <div className="flex items-center gap-3 my-1">
                {/* Official Round Blue Stamp */}
                <div className="flex-shrink-0">
                  <img
                    src="/print/company-stamp.png"
                    alt="Company Stamp"
                    className="company-stamp"
                    style={{ width: "65px", height: "auto", objectFit: "contain" }}
                  />
                </div>

                {/* Official Signature */}
                <div className="flex flex-col justify-end">
                  <img
                    src="/print/company-signature.png"
                    alt="Company Signature"
                    className="company-signature"
                    style={{ width: "100px", height: "auto", objectFit: "contain" }}
                  />
                </div>
              </div>
              <p className="text-[7.5px] text-gray-700 font-medium mt-0.5">
                Authorized Signature
              </p>
            </div>
            <div className="mt-auto pt-2">
              <div className="border-b border-black w-full" style={{ borderBottom: "1px solid #000000" }}></div>
            </div>
          </div>

          {/* RIGHT SIDE: CUSTOMER */}
          <div className="invoice-sig-box text-left flex flex-col justify-between" style={{ minHeight: "75px" }}>
            <div>
              <p className="font-bold text-[9px] text-black uppercase tracking-wider">
                CUSTOMER
              </p>
              <p className="text-[7.5px] text-gray-700 font-medium mt-0.5">
                Customer Signature
              </p>
            </div>
            <div className="mt-auto pt-2">
              <div className="border-b border-black w-full" style={{ borderBottom: "1px solid #000000" }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default InvoicePrintView;
