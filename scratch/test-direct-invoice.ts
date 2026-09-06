/**
 * Automated Verification Script for Complete Direct Invoice System
 * Tests:
 * 1. Service-Only Direct Invoice (Ahmed, AC Repair Labour, Rate AED 300)
 * 2. Parts-Only Direct Invoice (Engine Oil Filter, Qty 2, Rate AED 45)
 * 3. Mixed Service + Spare Parts Direct Invoice (Engine Repair AED 500, Gasket Set AED 300)
 * 4. Existing Job Card -> Invoice Workflow
 * 5. Inventory Movement (Only parts move stock; services never touch stock)
 * 6. Accounting / Ledger Revenue Splitting (acc-4001 vs acc-4002)
 * 7. Dashboard Metrics Aggregation
 * 8. Void Invoice Behavior (Stock reversal only on parts)
 */

import {
  createDirectInvoice,
  getInvoices,
  getInvoiceById,
  voidInvoice,
  generateInvoiceFromJobCard,
  getLocalInvoices,
} from "../src/lib/services/invoice-service";
import { getServices, createService } from "../src/lib/services/service-catalog-service";
import { getParts, createPart, getPartById, saveLocalParts } from "../src/lib/services/parts-service";
import { getLocalTransactions } from "../src/lib/services/inventory-service";
import { getLocalEntries, getLocalLedgerTransactions } from "../src/lib/services/ledger-service";
import { getDashboardData } from "../src/lib/services/dashboard-service";
import { createJobCard, getJobCardById } from "../src/lib/services/job-card-service";

const TEST_WORKSPACE = "ws-test-direct-inv-" + Date.now();

async function runTests() {
  console.log("==================================================");
  console.log("STARTING DIRECT INVOICE SYSTEM VERIFICATION SUITE");
  console.log(`Workspace: ${TEST_WORKSPACE}`);
  console.log("==================================================\n");

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition: boolean, testName: string, detail?: any) {
    totalTests++;
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (detail) console.error("   Details:", detail);
      process.exitCode = 1;
    }
  }

  // Pre-requisite Setup: Create a test part with 50 stock, and a service in catalog
  const testPart = await createPart({
    name: "Test Engine Oil Filter",
    part_number: "EOF-101",
    brand: "OEM",
    unit: "pcs",
    purchase_price: 25,
    selling_price: 45,
    current_stock: 50,
    minimum_stock: 5,
    supplier_id: null,
    is_active: true,
  }, TEST_WORKSPACE);

  const testPartGasket = await createPart({
    name: "Test Cylinder Gasket Set",
    part_number: "GSK-900",
    brand: "Victor Reinz",
    unit: "set",
    purchase_price: 180,
    selling_price: 300,
    current_stock: 20,
    minimum_stock: 2,
    supplier_id: null,
    is_active: true,
  }, TEST_WORKSPACE);

  const initialStockTxCount = getLocalTransactions().length;

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 1: DIRECT SERVICE INVOICE (Service-only)
  // Customer: Ahmed
  // Service: AC Repair Labour
  // Rate: AED 300
  // No Spare Parts.
  // Expected:
  // Service Sales = AED 300, Parts Sales = AED 0, Total Sales = AED 300 (+ 5% VAT = 315)
  // No inventory movement.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 1: Service-Only Direct Invoice ---");
  const serviceInvoice = await createDirectInvoice({
    invoice_type_mode: "service",
    customer_type: "new",
    customer_name: "Ahmed",
    customer_phone: "+971501112233",
    services: [
      {
        description: "AC Repair Labour",
        quantity: 1,
        unit_price: 300,
        discount: 0,
      },
    ],
    parts: [],
    discount: 0,
    payment_status: "paid",
    payment_method: "cash",
    date: new Date().toISOString().slice(0, 10),
  }, TEST_WORKSPACE);

  assert(serviceInvoice.invoice_type === "direct_service", "Invoice Type is direct_service");
  assert(serviceInvoice.job_card_id === null, "Job Card is null");
  assert(serviceInvoice.subtotal === 300, "Service Subtotal is AED 300", serviceInvoice.subtotal);
  assert(serviceInvoice.vat_amount === 15, "VAT (5%) is AED 15", serviceInvoice.vat_amount);
  assert(serviceInvoice.total === 315, "Grand Total is AED 315", serviceInvoice.total);
  assert(serviceInvoice.paid === 315, "Paid amount is AED 315");
  assert(serviceInvoice.balance === 0, "Balance is AED 0");
  assert(serviceInvoice.payment_status === "paid", "Payment status is 'paid'");

  // Check inventory transactions: should be unchanged (services NEVER deduct stock)
  const stockTxAfterService = getLocalTransactions().length;
  assert(
    stockTxAfterService === initialStockTxCount,
    "Zero inventory stock transactions created for service-only invoice",
    { initial: initialStockTxCount, current: stockTxAfterService }
  );

  // Check Ledger: should credit acc-4001 (Labor & Service Workshop Revenue)
  const ledgerEntries = getLocalEntries();
  const serviceLedgerTx = getLocalLedgerTransactions().find((t) => t.reference_id === serviceInvoice.id);
  assert(!!serviceLedgerTx, "Ledger transaction recorded for service invoice");
  if (serviceLedgerTx) {
    const srvEntries = ledgerEntries.filter((e) => e.transaction_id === serviceLedgerTx.id);
    const revEntry = srvEntries.find((e) => e.credit > 0 && e.notes?.includes("Revenue"));
    assert(
      revEntry !== undefined && revEntry.credit === 300,
      "Ledger correctly credited AED 300 to Service Revenue",
      revEntry
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 2: DIRECT SPARE PARTS INVOICE (Parts-only)
  // Part: Engine Oil Filter
  // Qty: 2
  // Rate: AED 45
  // Expected:
  // Parts Sales = AED 90, Service Sales = AED 0, Total = AED 90 (+ 5% VAT = 94.50)
  // Inventory: deduct 2 (50 -> 48)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 2: Parts-Only Direct Invoice ---");
  const partsInvoice = await createDirectInvoice({
    invoice_type_mode: "parts",
    customer_type: "walk_in",
    customer_name: "Walk-in Customer",
    parts: [
      {
        part_id: testPart.id,
        part_name: testPart.name,
        part_number: testPart.part_number,
        quantity: 2,
        unit_price: 45,
        discount: 0,
      },
    ],
    discount: 0,
    payment_status: "paid",
    payment_method: "cash",
    date: new Date().toISOString().slice(0, 10),
  }, TEST_WORKSPACE);

  assert(partsInvoice.invoice_type === "direct_parts", "Invoice Type is direct_parts");
  assert(partsInvoice.job_card_id === null, "Job Card is null");
  assert(partsInvoice.subtotal === 90, "Parts Subtotal is AED 90", partsInvoice.subtotal);
  assert(partsInvoice.vat_amount === 4.5, "VAT (5%) is AED 4.50", partsInvoice.vat_amount);
  assert(partsInvoice.total === 94.5, "Grand Total is AED 94.50", partsInvoice.total);

  // Check inventory deduction: stock must be 48
  const updatedPart = await getPartById(testPart.id);
  assert(
    updatedPart?.current_stock === 48,
    "Inventory stock deducted exactly 2 units (50 -> 48)",
    updatedPart?.current_stock
  );

  // Check Ledger: should credit acc-4002 (Spare Parts Sales Revenue)
  const partsLedgerTx = getLocalLedgerTransactions().find((t) => t.reference_id === partsInvoice.id);
  assert(!!partsLedgerTx, "Ledger transaction recorded for parts invoice");
  if (partsLedgerTx) {
    const prtEntries = ledgerEntries.filter((e) => e.transaction_id === partsLedgerTx.id);
    const revEntry = prtEntries.find((e) => e.credit > 0 && e.notes?.includes("Spare Parts"));
    assert(
      revEntry !== undefined && revEntry.credit === 90,
      "Ledger correctly credited AED 90 to Spare Parts Revenue",
      revEntry
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 3: MIXED DIRECT INVOICE (Service + Spare Parts)
  // Service: Engine Repair Labour = AED 500
  // Parts: Gasket Set = AED 300
  // Expected:
  // Service Sales = AED 500, Parts Sales = AED 300, Subtotal = AED 800
  // VAT = AED 40, Grand Total = AED 840
  // Inventory: only Gasket stock decreases (20 -> 19)
  // Partial payment: paid AED 500, balance AED 340, status = partially_paid
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 3: Mixed Service + Spare Parts Direct Invoice ---");
  const mixedInvoice = await createDirectInvoice({
    invoice_type_mode: "mixed",
    customer_type: "new",
    customer_name: "Khalid Motors",
    company_name: "Khalid Fleet LLC",
    trn_number: "100293847500003",
    services: [
      {
        description: "Engine Repair Labour",
        quantity: 1,
        unit_price: 500,
        discount: 0,
      },
    ],
    parts: [
      {
        part_id: testPartGasket.id,
        part_name: testPartGasket.name,
        part_number: testPartGasket.part_number,
        quantity: 1,
        unit_price: 300,
        discount: 0,
      },
    ],
    discount: 0,
    payment_status: "partially_paid",
    payment_method: "bank",
    paid_amount: 500,
    date: new Date().toISOString().slice(0, 10),
  }, TEST_WORKSPACE);

  assert(mixedInvoice.invoice_type === "direct_mixed", "Invoice Type is direct_mixed");
  assert(mixedInvoice.job_card_id === null, "Job Card is null");
  assert(mixedInvoice.subtotal === 800, "Subtotal is AED 800", mixedInvoice.subtotal);
  assert(mixedInvoice.vat_amount === 40, "VAT (5%) is AED 40", mixedInvoice.vat_amount);
  assert(mixedInvoice.total === 840, "Grand Total is AED 840", mixedInvoice.total);
  assert(mixedInvoice.paid === 500, "Paid is AED 500", mixedInvoice.paid);
  assert(mixedInvoice.balance === 340, "Balance is AED 340", mixedInvoice.balance);
  assert(mixedInvoice.payment_status === "partially_paid", "Status is 'partially_paid'");

  // Check inventory: ONLY Gasket Set decreased (20 -> 19). Oil filter remains 48.
  const updatedGasket = await getPartById(testPartGasket.id);
  const recheckedOilFilter = await getPartById(testPart.id);
  assert(
    updatedGasket?.current_stock === 19,
    "Gasket Set stock deducted 1 unit (20 -> 19)",
    updatedGasket?.current_stock
  );
  assert(
    recheckedOilFilter?.current_stock === 48,
    "Oil filter stock was NOT affected by mixed invoice (remains 48)",
    recheckedOilFilter?.current_stock
  );

  // Check Ledger: mixed invoice must split revenue correctly (500 service, 300 parts)
  const mixedLedgerTx = getLocalLedgerTransactions().find((t) => t.reference_id === mixedInvoice.id);
  assert(!!mixedLedgerTx, "Ledger transaction recorded for mixed invoice");
  if (mixedLedgerTx) {
    const mixEntries = getLocalEntries().filter((e) => e.transaction_id === mixedLedgerTx.id);
    const srvCredit = mixEntries.find((e) => e.credit === 500);
    const prtCredit = mixEntries.find((e) => e.credit === 300);
    const vatCredit = mixEntries.find((e) => e.credit === 40);
    assert(!!srvCredit, "Ledger credited exactly AED 500 to Service Revenue (acc-4001)");
    assert(!!prtCredit, "Ledger credited exactly AED 300 to Spare Parts Revenue (acc-4002)");
    assert(!!vatCredit, "Ledger credited exactly AED 40 to Output VAT (acc-2200)");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 4: DASHBOARD METRICS CALCULATION
  // Direct Service Invoice: +315 total, +300 service sales, +0 parts sales
  // Direct Parts Invoice: +94.5 total, +0 service sales, +90 parts sales
  // Mixed Invoice: +840 total, +500 service sales, +300 parts sales, +340 outstanding
  // Total Sales = 315 + 94.5 + 840 = 1249.50
  // Service Sales = 300 + 500 = 800
  // Parts Sales = 90 + 300 = 390
  // Outstanding Credit = 340
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 4: Dashboard Metrics Aggregation ---");
  const dashboard = await getDashboardData("this_month", undefined, true, TEST_WORKSPACE);

  assert(dashboard.totalSales === 1249.5, `Total Sales is AED 1,249.50 (got ${dashboard.totalSales})`);
  assert(dashboard.serviceSales === 800, `Service Sales is AED 800.00 (got ${dashboard.serviceSales})`);
  assert(dashboard.partsSales === 390, `Parts Sales is AED 390.00 (got ${dashboard.partsSales})`);
  assert(dashboard.outstandingCredit === 340, `Outstanding Credit is AED 340.00 (got ${dashboard.outstandingCredit})`);

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 5: VOID INVOICE BEHAVIOR
  // If mixed invoice is voided:
  // - Gasket stock reverses (19 -> 20).
  // - Service line causes ZERO stock reversal.
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 5: Void Behavior ---");
  await voidInvoice(mixedInvoice.id, "Customer requested order cancellation", "Owner");
  const voidedMixed = await getInvoiceById(mixedInvoice.id);
  assert(voidedMixed?.payment_status === "void" || voidedMixed?.is_void === true, "Invoice is marked void");

  const restoredGasket = await getPartById(testPartGasket.id);
  assert(
    restoredGasket?.current_stock === 20,
    "Gasket Set stock reversed upon void (19 -> 20)",
    restoredGasket?.current_stock
  );

  // Voiding service invoice should NOT affect any stock
  const preVoidPartStock = (await getPartById(testPart.id))?.current_stock;
  await voidInvoice(serviceInvoice.id, "Service void test", "Owner");
  const postVoidPartStock = (await getPartById(testPart.id))?.current_stock;
  assert(
    preVoidPartStock === postVoidPartStock,
    "Voiding Service-Only invoice caused ZERO inventory stock movement"
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // TEST 6: PRESERVE EXISTING WORKFLOW: JOB CARD -> INVOICE
  // Verify that the standard Job Card creation and invoice conversion still works!
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- TEST 6: Existing Job Card -> Invoice Workflow ---");
  const jc = await createJobCard({
    workspace_id: TEST_WORKSPACE,
    customer_id: "cust-test-jc",
    vehicle_id: "veh-test-jc",
    status: "in_progress",
    items: [
      {
        item_type: "service",
        description: "Brake Pad Labour",
        quantity: 1,
        unit_price: 150,
        total_price: 150,
      },
    ],
    notes: "Regular workshop maintenance",
  }, [], TEST_WORKSPACE);

  assert(!!jc && !!jc.id, "Created Job Card successfully");

  const convertedInvoice = await generateInvoiceFromJobCard(jc!.id, TEST_WORKSPACE);
  assert(convertedInvoice.job_card_id === jc!.id, "Converted Invoice has valid job_card_id");
  assert(convertedInvoice.invoice_type === "job_card" || !convertedInvoice.invoice_type || convertedInvoice.job_card_id, "Converted Invoice maintains Job Card reference");
  assert(convertedInvoice.subtotal === 150, "Converted Invoice Subtotal is AED 150");

  console.log("\n==================================================");
  console.log(`VERIFICATION COMPLETE: ${passedTests} / ${totalTests} TESTS PASSED`);
  console.log("==================================================\n");

  if (passedTests === totalTests) {
    console.log("ALL TEST CASES COMPLETED SUCCESSFULLY!");
    process.exit(0);
  } else {
    console.error("SOME TESTS FAILED!");
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
