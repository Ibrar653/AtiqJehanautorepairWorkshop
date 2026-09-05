import { getInvoices } from "../src/lib/services/invoice-service";
import { getPayments } from "../src/lib/services/payment-service";

async function main() {
  const invRes = await getInvoices();
  console.log("Total Invoices:", invRes.total);
  const pendingInvs = invRes.invoices.filter((inv: any) => {
    const bal = Number(inv.balance) || 0;
    const st = (inv.payment_status || "").toLowerCase();
    return bal > 0 || st === "unpaid" || st === "credit" || st === "partially_paid" || st === "pending";
  });
  console.log("Pending Invoices:", pendingInvs.length);
  if (pendingInvs.length > 0) {
    console.log("Sample pending invoice:", {
      id: pendingInvs[0].id,
      number: pendingInvs[0].invoice_number,
      total: pendingInvs[0].total,
      paid: pendingInvs[0].paid,
      balance: pendingInvs[0].balance,
      status: pendingInvs[0].payment_status,
      customer: pendingInvs[0].customer?.name,
      vehicle: pendingInvs[0].vehicle?.make + " " + pendingInvs[0].vehicle?.model,
    });
  }

  const payRes = await getPayments(1, 10);
  console.log("Total Payments:", payRes.total);
  if (payRes.payments.length > 0) {
    console.log("Sample payment:", payRes.payments[0]);
  }
}

main().catch(console.error);
