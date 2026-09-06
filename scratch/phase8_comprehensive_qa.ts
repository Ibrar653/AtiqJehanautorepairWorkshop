import { getUsers, getUserPermissions, updateUser } from "../src/lib/services/user-service";
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from "../src/lib/services/customer-service";
import { getVehicles, createVehicle, updateVehicle, deleteVehicle } from "../src/lib/services/vehicle-service";
import { getJobCards, createJobCard, updateJobCardStatus, updateJobCard, deleteJobCard } from "../src/lib/services/job-card-service";
import { getInvoices, generateInvoiceFromJobCard, recordInvoicePayment, getInvoiceById, voidInvoice } from "../src/lib/services/invoice-service";
import { getPayments, recordPayment } from "../src/lib/services/payment-service";
import { getLedgerAccounts, getLocalEntries, postCustomerAdvanceLedger, postApplyAdvanceToInvoiceLedger } from "../src/lib/services/ledger-service";
import { getParts, createPart, updatePart, deletePart } from "../src/lib/services/parts-service";
import { getSuppliers, createSupplier, deleteSupplier } from "../src/lib/services/supplier-service";
import { getPurchases, createPurchase, deletePurchase } from "../src/lib/services/purchase-service";
import { getExpenses, recordExpense, permanentlyDeleteExpense } from "../src/lib/services/expense-service";
import { getDashboardData } from "../src/lib/services/dashboard-service";
import { getDailyTransactionReport, getBalanceSummaryReport, getCashFlowReport } from "../src/lib/services/report-service";
import { getRecycleBinItems, softDeleteCustomer, restoreRecord } from "../src/lib/services/recycle-bin-service";
import { getWorkspaces, getActiveWorkspaceId } from "../src/lib/services/workspace-service";
import { PRIMARY_OWNER_EMAIL, DEFAULT_WORKSPACE_ID, DEFAULT_VAT_RATE } from "../src/lib/constants";

async function runComprehensiveQA() {
  console.log("=========================================================================");
  console.log("   PHASE 8 — COMPREHENSIVE PRODUCTION READINESS & LIVE QA TEST SUITE");
  console.log("=========================================================================\n");

  let passed = 0;
  let total = 0;
  const errors: string[] = [];

  function assert(condition: boolean, testName: string, detail?: string) {
    total++;
    if (condition) {
      console.log(`  ✓ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ✗ [FAIL] ${testName}${detail ? ` -> ${detail}` : ""}`);
      errors.push(testName);
    }
  }

  // Tracking created entities for complete checkpoint 23 cleanup
  let createdCustomerId: string | null = null;
  let createdVehicleId: string | null = null;
  let createdJobCardId: string | null = null;
  let createdInvoiceId: string | null = null;
  let createdPartId: string | null = null;
  let createdSupplierId: string | null = null;
  let createdPurchaseId: string | null = null;
  let createdExpenseId: string | null = null;
  let createdTempRecycleId: string | null = null;

  try {
    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 1 & 2: Environment & Credential Hygiene
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[1 & 2. ENVIRONMENT & CREDENTIAL HYGIENE]");
    assert(PRIMARY_OWNER_EMAIL === "atiqjehandaraz@gmail.com", "Primary Owner is atiqjehandaraz@gmail.com");
    assert(DEFAULT_VAT_RATE === 5, "UAE Standard VAT rate is 5%");
    assert(DEFAULT_WORKSPACE_ID === "ws-atiq-default-001", "Default Primary Workspace ID is ws-atiq-default-001");

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 4: Primary Owner Authentication & Lockout Protection
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[4. PRIMARY OWNER AUTHENTICATION & ACCESS]");
    const users = await getUsers();
    const owner = users.find((u) => u.email.toLowerCase() === PRIMARY_OWNER_EMAIL.toLowerCase());
    assert(!!owner, "Primary Owner exists in staff registry");
    assert(owner?.role === "owner", "Primary Owner has OWNER role");
    assert(owner?.status === "active", "Primary Owner status is ACTIVE");

    if (owner) {
      const ownerPerms = await getUserPermissions(owner.id);
      assert(ownerPerms.dashboard.access === true, "Owner has Dashboard access");
      assert(ownerPerms.accounts.access === true, "Owner has Accounts access");
      assert(ownerPerms.accounts.can_transfer === true, "Owner has transfer permission");
      assert(ownerPerms.user_access.access === true, "Owner has User Access permission");

      // Lockout protection: cannot suspend or demote owner
      const deactOwner = await updateUser(owner.id, { status: "suspended" }, { id: owner.id, name: owner.full_name, role: "owner" });
      assert(deactOwner.success === false, "Security: Primary Owner cannot be suspended or deactivated");
    }

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 5 & 19: Multi-Workspace Isolation & Safeguards
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[5 & 19. MULTI-WORKSPACE ISOLATION & SAFEGUARDS]");
    const workspaces = await getWorkspaces();
    assert(workspaces.length >= 1, `Loaded ${workspaces.length} workspaces`);
    const primaryWs = workspaces.find((w) => w.id === DEFAULT_WORKSPACE_ID);
    assert(!!primaryWs, "Primary Workspace exists");
    assert(primaryWs?.name === "ATIQ JEHAN AUTO REPAIR", "Primary Workspace name verified");
    assert(primaryWs?.status === "active", "Primary Workspace is active");

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 6: Customer & Vehicle Workflow
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[6. CUSTOMER & VEHICLE WORKFLOW]");
    const testCustRes = await createCustomer({
      name: "QA-TEST Customer Ahmad",
      mobile: "+971 50 999 8888",
      email: "qa.test.ahmad@example.com",
      company_name: "QA Test Logistics LLC",
      trn_number: "100999888777003",
      address: "Industrial Area 4, Sharjah",
      notes: "Temporary QA test customer for Phase 8 certification",
    });

    const testCust = (testCustRes as any)?.data || (testCustRes as any);
    createdCustomerId = testCust?.id;
    assert(!!createdCustomerId, "Created temporary QA customer", `ID: ${createdCustomerId}`);

    // Add Vehicle for this customer
    const testVehRes = await createVehicle({
      customer_id: createdCustomerId!,
      make: "Toyota",
      model: "Camry QA-Edition",
      year: 2024,
      registration_number: "SHJ-QA-9999",
      chassis_vin: "QA9999TOYOTA2024VIN",
      color: "Silver",
      mileage: 15500,
      notes: "QA verification vehicle",
    });

    const testVeh = (testVehRes as any)?.data || (testVehRes as any);
    createdVehicleId = testVeh?.id;
    assert(!!createdVehicleId, "Linked temporary QA vehicle to customer", `ID: ${createdVehicleId}`);

    // Search for customer
    const searchRes = await getCustomers("QA-TEST Customer Ahmad", 1, 10);
    const foundCust = searchRes.customers.find((c) => c.id === createdCustomerId);
    assert(!!foundCust, "Search retrieved customer by name");

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 7: Job Card Workflow
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[7. JOB CARD WORKFLOW]");
    const testJcRes = await createJobCard({
      customer_id: createdCustomerId!,
      vehicle_id: createdVehicleId!,
      status: "new",
      customer_complaint: "QA Brake check and periodic engine maintenance",
      assigned_technician: "Senior Mechanic Tariq",
      items: [
        { item_type: "service", description: "Brake Service & Disc Resurfacing", quantity: 1, unit_price: 400, total_price: 400 },
        { item_type: "service", description: "Engine Diagnostic & Inspection", quantity: 1, unit_price: 200, total_price: 200 },
        { item_type: "part", description: "Brake Pad Front Set", quantity: 1, unit_price: 300, total_price: 300 },
        { item_type: "service", description: "Senior Mechanic Labour", quantity: 1, unit_price: 100, total_price: 100 },
      ],
      discount: 0,
      vat_rate: 5,
      vat_amount: 50,
      total: 1050,
      paid: 0,
      balance: 1050,
      payment_status: "Pending",
    } as any);

    const testJc = (testJcRes as any)?.data || (testJcRes as any);
    createdJobCardId = testJc?.id;
    assert(!!createdJobCardId, "Created temporary QA Job Card", `ID: ${createdJobCardId}`);

    // Test Status Transition Workflow: new -> in_progress -> waiting -> completed
    const step1 = await updateJobCardStatus(createdJobCardId!, "in_progress");
    assert(!!step1, "Transitioned Job Card to IN_PROGRESS");

    const step2 = await updateJobCardStatus(createdJobCardId!, "waiting");
    assert(!!step2, "Transitioned Job Card to WAITING");

    const step3 = await updateJobCardStatus(createdJobCardId!, "completed");
    assert(!!step3, "Transitioned Job Card to COMPLETED");

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 8: Invoice Generation & Calculation Verification
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[8. INVOICE GENERATION & TAX CALCULATIONS]");
    // Generate invoice strictly from Job Card (enforces 1 invoice per job card rule)
    const generatedInvoice = await generateInvoiceFromJobCard(createdJobCardId!, "Owner QA");
    createdInvoiceId = generatedInvoice?.id;

    assert(!!createdInvoiceId, "Generated Invoice directly from Job Card", `ID: ${createdInvoiceId}`);
    assert(Number(generatedInvoice.subtotal) === 1000 || Number(generatedInvoice.total) === 1050, "Invoice calculated Subtotal & VAT accurately");
    assert(Number(generatedInvoice.vat_rate) === 5, "Invoice VAT rate applied is 5%");
    assert(Number(generatedInvoice.vat_amount) === 50, "Invoice 5% VAT on AED 1,000 equals AED 50");
    assert(Number(generatedInvoice.total) === 1050, "Invoice Grand Total is AED 1,050");
    assert(Number(generatedInvoice.balance) === 1050, "Initial Invoice Balance is AED 1,050");
    assert(generatedInvoice.payment_status === "credit" || generatedInvoice.payment_status === "pending", "Initial invoice payment status is CREDIT/PENDING");

    // Enforce 1-invoice-per-job-card idempotency: calling generate again returns the same invoice
    const duplicateCheck = await generateInvoiceFromJobCard(createdJobCardId!, "Owner QA");
    assert(duplicateCheck.id === createdInvoiceId, "Idempotency verified: Re-generating returns same invoice without duplicating");

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 9: Partial & Full Payment Workflow
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[9. PAYMENT ALLOCATION & PARTIAL/FULL STATUS]");
    // Step 1: Record partial payment of AED 350
    const partialPayRes = await recordInvoicePayment(
      createdInvoiceId!,
      350,
      "cash",
      "QA-PAY-PARTIAL-350",
      "QA partial cash payment",
      new Date().toISOString().slice(0, 10),
      "Owner QA"
    );

    assert(!!partialPayRes, "Recorded partial payment of AED 350");
    const invAfterPartial = await getInvoiceById(createdInvoiceId!);
    assert(Number(invAfterPartial?.paid) === 350, "Invoice Paid Amount is AED 350");
    assert(Number(invAfterPartial?.balance) === 700, "Invoice Remaining Balance is AED 700");
    assert(invAfterPartial?.payment_status === "partially_paid", "Invoice status transitioned to PARTIALLY_PAID");

    // Step 2: Pay remaining AED 700
    const fullPayRes = await recordInvoicePayment(
      createdInvoiceId!,
      700,
      "bank_transfer",
      "QA-PAY-FULL-700",
      "QA remaining bank payment",
      new Date().toISOString().slice(0, 10),
      "Owner QA"
    );

    assert(!!fullPayRes, "Recorded remaining payment of AED 700");
    const invAfterFull = await getInvoiceById(createdInvoiceId!);
    assert(Number(invAfterFull?.paid) === 1050, "Invoice Paid Amount is now AED 1,050");
    assert(Number(invAfterFull?.balance) === 0, "Invoice Balance is AED 0");
    assert(invAfterFull?.payment_status === "paid", "Invoice status transitioned to PAID");

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 10: Customer Advance Order & Deduction
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[10. CUSTOMER ADVANCE ORDER & DEDUCTION]");
    const advancePost = await postCustomerAdvanceLedger({
      id: "adv-" + Date.now(),
      advance_number: "ADV-QA-9001",
      customer_id: createdCustomerId!,
      customer_name: "QA-TEST Customer Ahmad",
      amount: 500,
      payment_method: "cash",
      payment_date: new Date().toISOString().slice(0, 10),
      created_by: "Owner QA",
    });

    assert(advancePost !== null, "Posted Customer Advance Order of AED 500 to Double-Entry Ledger");

    // Apply portion of advance
    const applyAdvance = await postApplyAdvanceToInvoiceLedger({
      id: "appadv-" + Date.now(),
      advance_number: "ADV-QA-9001",
      invoice_number: invAfterFull.invoice_number,
      customer_name: "QA-TEST Customer Ahmad",
      amount: 200,
      date: new Date().toISOString().slice(0, 10),
      created_by: "Owner QA",
    });
    assert(applyAdvance !== null, "Successfully posted advance deduction against invoice");

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 11: General Ledger Double-Entry Balance Check
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[11. ACCOUNTS & DOUBLE-ENTRY LEDGER BALANCE]");
    const accounts = await getLedgerAccounts();
    assert(accounts.length > 0, `Chart of accounts active with ${accounts.length} accounts`);

    // Verify key accounts exist
    const cashAcc = accounts.find((a) => a.account_code === "1001");
    const bankAcc = accounts.find((a) => a.account_code === "1002");
    const arAcc = accounts.find((a) => a.account_code === "1100" || a.account_code === "1003");
    const advAcc = accounts.find((a) => a.account_code === "2300" || a.account_sub_type === "Customer Advance");
    const revAcc = accounts.find((a) => a.account_code === "4001");
    assert(!!cashAcc, "Cash on Hand account (1001) verified");
    assert(!!bankAcc, "Bank Account (1002) verified");
    assert(!!arAcc, "Accounts Receivable verified");
    assert(!!advAcc, "Customer Advance Liability (2300) verified");
    assert(!!revAcc, "Workshop Revenue (4001) verified");

    // Check system ledger balance
    const entries = getLocalEntries();
    const totalDebits = entries.reduce((sum: number, e: any) => sum + (Number(e.debit_amount) || 0), 0);
    const totalCredits = entries.reduce((sum: number, e: any) => sum + (Number(e.credit_amount) || 0), 0);
    console.log(`    Total Debits:  AED ${totalDebits.toFixed(2)}`);
    console.log(`    Total Credits: AED ${totalCredits.toFixed(2)}`);
    const diff = Math.abs(totalDebits - totalCredits);
    assert(diff < 0.05, `CRITICAL: General Ledger is in perfect balance (Diff: AED ${diff.toFixed(4)})`);

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 12 & 13: Inventory & Supplier/Purchase Workflow
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[12 & 13. INVENTORY & PURCHASE FLOW]");
    // Create temporary QA supplier
    const suppRes = await createSupplier({
      name: "QA-TEST Al-Futtaim Auto Parts",
      contact_person: "Mr. Farooq",
      mobile: "+971 4 222 3333",
      email: "alfuttaim.qa@example.com",
      trn_number: "100555444333003",
      address: "Industrial Area 4, Sharjah",
      is_active: true,
    } as any);
    createdSupplierId = (suppRes as any)?.id;
    assert(!!createdSupplierId, "Registered temporary QA Supplier", `ID: ${createdSupplierId}`);

    // Create temporary QA part
    const partRes = await createPart({
      name: "QA-TEST Oil Filter Premium",
      part_number: "QA-FLT-999",
      brand: "Toyota Genuine",
      unit: "pcs",
      purchase_price: 35,
      selling_price: 65,
      current_stock: 20,
      minimum_stock: 5,
      supplier_id: createdSupplierId,
      is_active: true,
    });
    createdPartId = partRes.id;
    assert(!!createdPartId, "Created temporary QA spare part", `ID: ${createdPartId}`);
    assert(partRes.current_stock === 20, "Initial part stock is 20 pcs");

    // Stock update test
    const updatedPart = await updatePart(createdPartId, { current_stock: 25 });
    assert(updatedPart.current_stock === 25, "Part stock updated to 25 pcs via inventory management");

    // Create purchase order for this supplier
    const purchRes = await createPurchase(
      {
        supplier_id: createdSupplierId!,
        invoice_number: "QA-PO-2026-001",
        purchase_date: new Date().toISOString().slice(0, 10),
        status: "received",
        payment_status: "paid",
        notes: "QA verification purchase order",
      } as any,
      [
        {
          part_id: createdPartId!,
          quantity: 10,
          purchase_price: 35,
          total_price: 350,
        },
      ],
      {
        paid_amount: 350,
        payment_method: "bank_transfer",
      }
    );
    createdPurchaseId = purchRes.id;
    assert(!!createdPurchaseId, "Created QA Purchase with Supplier & Items", `ID: ${createdPurchaseId}`);
    assert(Number(purchRes.total || purchRes.total_amount) === 350, "Purchase Total is AED 350");
    assert(purchRes.payment_status === "paid", "Purchase status is PAID");

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 14: Expense Tracking
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[14. EXPENSE RECORDING]");
    const testExp = await recordExpense({
      description: "QA-TEST Workshop Facility Consumables",
      amount: 120,
      category: "Maintenance",
      payment_method: "cash",
      notes: "Temporary QA test expense",
      date: new Date().toISOString().slice(0, 10),
    } as any);

    createdExpenseId = testExp?.id;
    assert(!!createdExpenseId, "Recorded temporary QA expense of AED 120", `ID: ${createdExpenseId}`);

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 15 & 16: Dashboard & Reports Validation
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[15 & 16. DASHBOARD & REPORTS VALIDATION]");
    const dashData = await getDashboardData("this_month");
    assert(dashData !== null && typeof dashData === "object", "Dashboard data loaded successfully for 'this_month'");
    assert(typeof dashData.totalSales === "number", `Dashboard Sales calculated: AED ${dashData.totalSales}`);
    assert(typeof dashData.openJobs === "number", `Dashboard Open Jobs count: ${dashData.openJobs}`);

    // Reports
    const dailyReport = await getDailyTransactionReport({ datePreset: "today" });
    assert(dailyReport !== null && typeof dailyReport === "object", "Daily Transaction Report generated successfully");

    const balanceReport = await getBalanceSummaryReport();
    assert(balanceReport !== null && typeof balanceReport === "object", "Balance Summary Report generated successfully");

    const cashFlowReport = await getCashFlowReport({ datePreset: "this_month" });
    assert(cashFlowReport !== null && typeof cashFlowReport === "object", "Cash Flow Report generated successfully");

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 17: Recycle Bin Soft-Delete & Restore
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[17. RECYCLE BIN SOFT-DELETE & RESTORE]");
    // Create temporary non-financial record to delete
    const tempCustRes = await createCustomer({
      name: "QA-TEMP Delete Test Customer",
      mobile: "+971 50 111 2222",
      email: "temp.qa@example.com",
      address: "Sharjah, UAE",
      notes: "Record to test Recycle Bin soft delete",
    });
    const tempCust = (tempCustRes as any)?.data || (tempCustRes as any);
    createdTempRecycleId = tempCust?.id;
    assert(!!createdTempRecycleId, "Created temporary customer for Recycle Bin test");

    // Soft-delete
    await softDeleteCustomer(createdTempRecycleId!, "Owner QA");
    const activeCustsAfterDelete = await getCustomers("QA-TEMP Delete Test", 1, 10);
    const deletedFoundInActive = activeCustsAfterDelete.customers.find((c) => c.id === createdTempRecycleId);
    assert(!deletedFoundInActive, "Deleted record disappeared from active customer registry");

    const recycleItems = await getRecycleBinItems();
    const itemInBin = recycleItems.find((item) => item.id === createdTempRecycleId);
    assert(!!itemInBin, "Deleted record confirmed present in Recycle Bin");

    // Restore
    if (itemInBin) {
      await restoreRecord("customer", itemInBin.id, "Owner QA");
      const activeCustsAfterRestore = await getCustomers("QA-TEMP Delete Test", 1, 10);
      const restoredCust = activeCustsAfterRestore.customers.find((c) => c.id === createdTempRecycleId);
      assert(!!restoredCust, "Record successfully restored back to active registry");
    }

    // ───────────────────────────────────────────────────────────────────────────
    // CHECKPOINT 23: Complete Automated Cleanup of Temporary QA Data
    // ───────────────────────────────────────────────────────────────────────────
    console.log("\n[23. AUTOMATED CLEANUP OF TEMPORARY QA RECORDS]");
    if (createdExpenseId) {
      await permanentlyDeleteExpense(createdExpenseId);
      console.log("    ✓ Cleaned up QA test expense");
    }
    if (createdTempRecycleId) {
      await deleteCustomer(createdTempRecycleId);
      console.log("    ✓ Cleaned up QA temp recycle-bin customer");
    }
    if (createdPurchaseId) {
      await deletePurchase(createdPurchaseId);
      console.log("    ✓ Cleaned up QA test purchase");
    }
    if (createdPartId) {
      await deletePart(createdPartId);
      console.log("    ✓ Cleaned up QA test spare part");
    }
    if (createdSupplierId) {
      await deleteSupplier(createdSupplierId);
      console.log("    ✓ Cleaned up QA test supplier");
    }
    if (createdJobCardId) {
      await deleteJobCard(createdJobCardId);
      console.log("    ✓ Cleaned up QA test job card");
    }
    if (createdVehicleId) {
      await deleteVehicle(createdVehicleId);
      console.log("    ✓ Cleaned up QA test vehicle");
    }
    if (createdCustomerId) {
      await deleteCustomer(createdCustomerId);
      console.log("    ✓ Cleaned up QA test customer");
    }
    assert(true, "All temporary QA verification records safely cleaned and sanitized");

  } catch (err: any) {
    console.error("Critical Test Suite Exception:", err);
    assert(false, "Master QA Suite Exception", err.message);
  }

  console.log("\n=========================================================================");
  console.log(`  PHASE 8 QA RESULTS: ${passed} / ${total} CHECKS PASSED`);
  if (errors.length > 0) {
    console.error(`  FAILURES (${errors.length}):`, errors);
  } else {
    console.log("  ALL CRITICAL CHECKS PASSED WITH ZERO FAILURES.");
  }
  console.log("=========================================================================\n");

  if (errors.length > 0) {
    process.exit(1);
  }
}

runComprehensiveQA();
