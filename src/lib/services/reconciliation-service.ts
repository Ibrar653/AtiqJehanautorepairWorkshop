import { createClient } from "@/lib/supabase/client";
import { getActiveWorkspaceId } from "./workspace-service";
import {
  getLocalStorageDataSet,
  deduplicateBySourceId,
  toDeterministicUuid,
  LOCAL_DATA_KEYS,
  type MigrationDataSet,
} from "./data-migration-service";

export type RecordClassification = "MATCHED" | "LOCAL_ONLY" | "SUPABASE_ONLY" | "CONFLICT" | "BROKEN";

export interface EntityFieldDiff {
  field: string;
  localValue: any;
  supabaseValue: any;
}

export interface ReconciledRecord {
  id: string;
  sourceId: string;
  deterministicUuid: string;
  entityType: string;
  classification: RecordClassification;
  summary: string;
  localData?: any;
  supabaseData?: any;
  diffs?: EntityFieldDiff[];
  brokenReason?: string;
  parentInfo?: {
    parentId?: string;
    parentType?: string;
    parentExistsInSupabase: boolean;
    parentExistsInLocal: boolean;
    parentSummary?: string;
  };
}

export interface LocalJobCardPreview {
  id: string;
  sourceId: string;
  deterministicUuid: string;
  jobCardNumber: string;
  date: string;
  status: string;
  paymentStatus: string;
  total: number;
  paid: number;
  balance: number;
  customer: {
    sourceId: string;
    deterministicUuid: string;
    name: string;
    existsInSupabase: boolean;
    existsInLocal: boolean;
  };
  vehicle: {
    sourceId: string;
    deterministicUuid: string;
    label: string;
    existsInSupabase: boolean;
    existsInLocal: boolean;
  };
  itemCount: number;
  items: {
    sourceId: string;
    type: string;
    description: string;
    quantity: number;
    unitPrice: number;
    totalPrice: number;
    partOrServiceId?: string;
    referencedItemExists: boolean;
  }[];
  recoveryReadiness: "READY" | "REQUIRES_PARENT_IMPORT" | "BLOCKED_BROKEN";
  readinessReason: string;
  dependencyChain: string[];
}

export interface LocalVehiclePreview {
  id: string;
  sourceId: string;
  deterministicUuid: string;
  make: string;
  model: string;
  year?: number | null;
  registrationNumber?: string | null;
  chassisVin?: string | null;
  customer: {
    sourceId: string;
    deterministicUuid: string;
    name: string;
    existsInSupabase: boolean;
    existsInLocal: boolean;
  };
  recoveryReadiness: "READY" | "REQUIRES_CUSTOMER_IMPORT" | "BLOCKED_BROKEN";
  readinessReason: string;
}

export interface LocalInvoicePreview {
  id: string;
  sourceId: string;
  deterministicUuid: string;
  invoiceNumber: string;
  date?: string;
  total: number;
  paid: number;
  balance: number;
  paymentStatus: string;
  customerId: string;
  jobCardId?: string | null;
  vehicleId?: string | null;
  customerExistsInSupabase: boolean;
  jobCardExistsInSupabase: boolean;
  itemCount: number;
  recoveryReadiness: "READY" | "REQUIRES_PARENT_IMPORT" | "BLOCKED_BROKEN";
  readinessReason: string;
}

export interface LocalPaymentPreview {
  id: string;
  sourceId: string;
  deterministicUuid: string;
  amount: number;
  paymentMethod: string;
  paymentDate: string;
  referenceNumber?: string | null;
  invoiceId?: string | null;
  jobCardId?: string | null;
  customerId: string;
  invoiceExistsInSupabase: boolean;
  jobCardExistsInSupabase: boolean;
  customerExistsInSupabase: boolean;
  recoveryReadiness: "READY" | "REQUIRES_PARENT_IMPORT" | "BLOCKED_BROKEN";
  readinessReason: string;
}

export interface TableReconciliationDetail {
  entityType: string;
  table: string;
  label: string;
  localRawCount: number;
  localUniqueCount: number;
  localDuplicateCount: number;
  supabaseCount: number;
  matchedCount: number;
  localOnlyCount: number;
  supabaseOnlyCount: number;
  conflictCount: number;
  brokenCount: number;
  localOnlyRecords: ReconciledRecord[];
  conflicts: ReconciledRecord[];
  brokenRecords: ReconciledRecord[];
}

export interface DetailedReconciliationReport {
  workspaceId: string;
  generatedAt: string;
  summary: {
    totalLocalRaw: number;
    totalLocalUnique: number;
    totalSupabaseRecords: number;
    totalMatched: number;
    totalLocalOnly: number;
    totalSupabaseOnly: number;
    totalConflicts: number;
    totalBroken: number;
    isSupabaseAuthoritative: boolean;
  };
  tables: TableReconciliationDetail[];
  previews: {
    jobCards: LocalJobCardPreview[];
    vehicles: LocalVehiclePreview[];
    invoices: LocalInvoicePreview[];
    payments: LocalPaymentPreview[];
    customers: ReconciledRecord[];
    parts: ReconciledRecord[];
    inventoryTransactions: ReconciledRecord[];
    otherFinancial: ReconciledRecord[];
  };
}

// ─── Entity Definitions ───────────────────────────────────────────────────────
interface EntityMeta {
  entityType: string;
  table: string;
  label: string;
  getArray: (ds: MigrationDataSet) => any[];
  getId: (item: any) => string;
  getSummary: (item: any) => string;
  checkConflict?: (local: any, cloud: any) => EntityFieldDiff[];
}

const ENTITY_METAS: EntityMeta[] = [
  {
    entityType: "customer",
    table: "customers",
    label: "Customers",
    getArray: (ds) => ds.customers,
    getId: (c) => c.id,
    getSummary: (c) => `${c.name || "Unnamed"} (${c.mobile || "No Mobile"})`,
    checkConflict: (local, cloud) => {
      const diffs: EntityFieldDiff[] = [];
      if (local.name && cloud.name && local.name.trim().toLowerCase() !== cloud.name.trim().toLowerCase()) {
        diffs.push({ field: "name", localValue: local.name, supabaseValue: cloud.name });
      }
      if (local.mobile && cloud.mobile && local.mobile.replace(/\D/g, "") !== cloud.mobile.replace(/\D/g, "")) {
        diffs.push({ field: "mobile", localValue: local.mobile, supabaseValue: cloud.mobile });
      }
      return diffs;
    },
  },
  {
    entityType: "vehicle",
    table: "vehicles",
    label: "Vehicles",
    getArray: (ds) => ds.vehicles,
    getId: (v) => v.id,
    getSummary: (v) => `${v.make || ""} ${v.model || ""} - Plate: ${v.registration_number || "None"}`,
    checkConflict: (local, cloud) => {
      const diffs: EntityFieldDiff[] = [];
      if (local.registration_number && cloud.registration_number && local.registration_number.trim() !== cloud.registration_number.trim()) {
        diffs.push({ field: "registration_number", localValue: local.registration_number, supabaseValue: cloud.registration_number });
      }
      return diffs;
    },
  },
  {
    entityType: "service",
    table: "services",
    label: "Services Catalog",
    getArray: (ds) => ds.services,
    getId: (s) => s.id,
    getSummary: (s) => `${s.name || "Service"} (${s.category || "General"}) - AED ${s.default_price || 0}`,
  },
  {
    entityType: "supplier",
    table: "suppliers",
    label: "Suppliers",
    getArray: (ds) => ds.suppliers,
    getId: (sup) => sup.id,
    getSummary: (sup) => `${sup.name || "Supplier"} (${sup.phone || "No Phone"})`,
  },
  {
    entityType: "part",
    table: "parts",
    label: "Spare Parts",
    getArray: (ds) => ds.parts,
    getId: (p) => p.id,
    getSummary: (p) => `${p.name || "Part"} [${p.part_number || "No #"}] Stock: ${p.current_stock || 0}`,
    checkConflict: (local, cloud) => {
      const diffs: EntityFieldDiff[] = [];
      if (Number(local.current_stock) !== Number(cloud.current_stock)) {
        diffs.push({ field: "current_stock", localValue: local.current_stock, supabaseValue: cloud.current_stock });
      }
      return diffs;
    },
  },
  {
    entityType: "inv_tx",
    table: "inventory_transactions",
    label: "Inventory Transactions",
    getArray: (ds) => ds.inventory_transactions,
    getId: (tx) => tx.id,
    getSummary: (tx) => `${tx.transaction_type || "tx"} Qty: ${tx.quantity || 0} (${tx.notes || ""})`,
  },
  {
    entityType: "job_card",
    table: "job_cards",
    label: "Job Cards",
    getArray: (ds) => ds.job_cards,
    getId: (jc) => jc.id,
    getSummary: (jc) => `JC #${jc.job_card_number || "Unknown"} | Date: ${jc.date || ""} | Status: ${jc.status || "new"} | AED ${jc.total || 0}`,
    checkConflict: (local, cloud) => {
      const diffs: EntityFieldDiff[] = [];
      if (local.status && cloud.status && local.status !== cloud.status) {
        diffs.push({ field: "status", localValue: local.status, supabaseValue: cloud.status });
      }
      if (Number(local.total || 0) !== Number(cloud.total || 0)) {
        diffs.push({ field: "total", localValue: local.total, supabaseValue: cloud.total });
      }
      if (Number(local.paid || 0) !== Number(cloud.paid || 0)) {
        diffs.push({ field: "paid", localValue: local.paid, supabaseValue: cloud.paid });
      }
      return diffs;
    },
  },
  {
    entityType: "jc_item",
    table: "job_card_items",
    label: "Job Card Items",
    getArray: (ds) => ds.job_card_items,
    getId: (it) => it.id,
    getSummary: (it) => `${it.description || "Item"} x${it.quantity || 1} @ AED ${it.unit_price || 0}`,
  },
  {
    entityType: "invoice",
    table: "invoices",
    label: "Invoices",
    getArray: (ds) => ds.invoices,
    getId: (inv) => inv.id,
    getSummary: (inv) => `Invoice #${inv.invoice_number || "Unknown"} | AED ${inv.total || 0} | Status: ${inv.payment_status || "credit"}`,
    checkConflict: (local, cloud) => {
      const diffs: EntityFieldDiff[] = [];
      if (Number(local.total || 0) !== Number(cloud.total || 0)) {
        diffs.push({ field: "total", localValue: local.total, supabaseValue: cloud.total });
      }
      if (Number(local.paid || 0) !== Number(cloud.paid || 0)) {
        diffs.push({ field: "paid", localValue: local.paid, supabaseValue: cloud.paid });
      }
      return diffs;
    },
  },
  {
    entityType: "inv_item",
    table: "invoice_items",
    label: "Invoice Items",
    getArray: (ds) => ds.invoice_items,
    getId: (it) => it.id,
    getSummary: (it) => `${it.description || "Item"} x${it.quantity || 1} @ AED ${it.unit_price || 0}`,
  },
  {
    entityType: "payment",
    table: "payments",
    label: "Payments",
    getArray: (ds) => ds.payments,
    getId: (p) => p.id,
    getSummary: (p) => `AED ${p.amount || 0} via ${p.payment_method || "cash"} on ${p.payment_date || ""}`,
  },
  {
    entityType: "purchase",
    table: "purchases",
    label: "Purchases",
    getArray: (ds) => ds.purchases,
    getId: (po) => po.id,
    getSummary: (po) => `PO #${po.purchase_invoice_number || po.id} | AED ${po.total || 0}`,
  },
  {
    entityType: "po_item",
    table: "purchase_items",
    label: "Purchase Items",
    getArray: (ds) => ds.purchase_items,
    getId: (it) => it.id,
    getSummary: (it) => `Purchase item x${it.quantity || 1} @ AED ${it.purchase_price || 0}`,
  },
  {
    entityType: "sup_pay",
    table: "supplier_payments",
    label: "Supplier Payments",
    getArray: (ds) => ds.supplier_payments,
    getId: (sp) => sp.id,
    getSummary: (sp) => `AED ${sp.amount || 0} via ${sp.payment_method || "cash"} on ${sp.payment_date || ""}`,
  },
  {
    entityType: "expense",
    table: "expenses",
    label: "Expenses",
    getArray: (ds) => ds.expenses,
    getId: (exp) => exp.id,
    getSummary: (exp) => `${exp.category || "Expense"} AED ${exp.amount || 0} on ${exp.expense_date || exp.date || ""}`,
  },
  {
    entityType: "worker",
    table: "workers",
    label: "Workers",
    getArray: (ds) => ds.workers,
    getId: (w) => w.id,
    getSummary: (w) => `${w.name || "Worker"} (${w.job_position || "Staff"})`,
  },
  {
    entityType: "bank_acc",
    table: "bank_accounts",
    label: "Bank Accounts",
    getArray: (ds) => ds.bank_accounts,
    getId: (b) => b.id,
    getSummary: (b) => `${b.bank_name || "Bank"} - ${b.account_name || "Account"}`,
  },
  {
    entityType: "ledger_acc",
    table: "ledger_accounts",
    label: "Ledger Accounts",
    getArray: (ds) => ds.ledger_accounts,
    getId: (a) => a.id,
    getSummary: (a) => `[${a.account_code || ""}] ${a.account_name || "Account"}`,
  },
  {
    entityType: "ledger_txn",
    table: "ledger_transactions",
    label: "Ledger Transactions",
    getArray: (ds) => ds.ledger_transactions,
    getId: (t) => t.id,
    getSummary: (t) => `${t.transaction_number || "TXN"} - ${t.description || ""}`,
  },
  {
    entityType: "ledger_entry",
    table: "ledger_entries",
    label: "Ledger Entries",
    getArray: (ds) => ds.ledger_entries,
    getId: (e) => e.id,
    getSummary: (e) => `Dr ${e.debit || 0} / Cr ${e.credit || 0}`,
  },
];

/**
 * Generates an exact, record-level reconciliation and safe recovery preview
 * without writing, modifying, or deleting any database or localStorage record.
 */
export async function generateDetailedReconciliationReport(
  workspaceId?: string
): Promise<DetailedReconciliationReport> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  // 1. Resolve exact workspace UUID from Supabase (NEVER transform with hash)
  let exactWorkspaceId = targetWsId;
  try {
    const { data: wsDirect } = await supabase
      .from("workspaces")
      .select("id, name, business_name, status")
      .eq("id", targetWsId)
      .maybeSingle();

    if (wsDirect) {
      exactWorkspaceId = wsDirect.id;
    } else {
      const { data: memberRows } = await supabase
        .from("workspace_members")
        .select("workspace_id, role, status, workspace:workspaces(id, name, business_name, status)")
        .eq("status", "active")
        .limit(1);

      if (memberRows && memberRows.length > 0 && memberRows[0].workspace) {
        exactWorkspaceId = (memberRows[0].workspace as any).id;
      }
    }
  } catch {}

  // 2. Fetch local storage data set
  const localDataSet = getLocalStorageDataSet(exactWorkspaceId);

  // 3. Concurrently fetch all Supabase cloud records for the 20 tables
  const cloudDataMap: Record<string, any[]> = {};
  await Promise.all(
    ENTITY_METAS.map(async (meta) => {
      try {
        let query = supabase.from(meta.table).select("*");
        if (exactWorkspaceId) {
          query = query.eq("workspace_id", exactWorkspaceId);
        }
        const { data, error } = await query;
        if (error) {
          console.warn(`Could not load cloud table ${meta.table}:`, error.message);
          const { data: allData } = await supabase.from(meta.table).select("*");
          cloudDataMap[meta.table] = allData || [];
        } else {
          cloudDataMap[meta.table] = data || [];
        }
      } catch (err) {
        console.error(`Error querying Supabase table ${meta.table}:`, err);
        cloudDataMap[meta.table] = [];
      }
    })
  );

  // 4. Build index maps of Supabase records by ID & deterministic UUID
  const supabaseIdMap: Record<string, Map<string, any>> = {};
  ENTITY_METAS.forEach((meta) => {
    const map = new Map<string, any>();
    const rows = cloudDataMap[meta.table] || [];
    rows.forEach((r) => {
      if (r?.id) {
        map.set(String(r.id).toLowerCase(), r);
      }
    });
    supabaseIdMap[meta.entityType] = map;
  });

  // 5. Build local unique entities index for foreign key cross-referencing
  const localUniqueMap: Record<string, Map<string, any>> = {};
  const localDeterministicMap: Record<string, Map<string, any>> = {};

  ENTITY_METAS.forEach((meta) => {
    const rawList = meta.getArray(localDataSet);
    const dedup = deduplicateBySourceId(rawList, meta.label);
    const idMap = new Map<string, any>();
    const detMap = new Map<string, any>();

    dedup.unique.forEach((item, idx) => {
      const sourceId = meta.getId(item) || `${meta.entityType}-${idx}`;
      const detUuid = toDeterministicUuid(meta.entityType, sourceId, exactWorkspaceId);
      idMap.set(String(sourceId).toLowerCase(), item);
      detMap.set(detUuid.toLowerCase(), item);
    });

    localUniqueMap[meta.entityType] = idMap;
    localDeterministicMap[meta.entityType] = detMap;
  });

  // Helper to check parent existence in Supabase or Local
  const checkParentRef = (
    parentEntityType: string,
    rawParentId: string | null | undefined
  ) => {
    if (!rawParentId) return { existsInSupabase: false, existsInLocal: false, targetUuid: "" };
    const cleanId = String(rawParentId).trim();
    const detUuid = toDeterministicUuid(parentEntityType, cleanId, exactWorkspaceId).toLowerCase();
    const cleanLower = cleanId.toLowerCase();

    const existsInSupabase =
      (supabaseIdMap[parentEntityType]?.has(cleanLower) ||
        supabaseIdMap[parentEntityType]?.has(detUuid)) ?? false;

    const existsInLocal =
      (localUniqueMap[parentEntityType]?.has(cleanLower) ||
        localDeterministicMap[parentEntityType]?.has(detUuid)) ?? false;

    return {
      existsInSupabase,
      existsInLocal,
      targetUuid: existsInSupabase
        ? (supabaseIdMap[parentEntityType]?.get(cleanLower)?.id ||
          supabaseIdMap[parentEntityType]?.get(detUuid)?.id ||
          detUuid)
        : detUuid,
    };
  };

  // 6. Reconcile each entity table
  const tableDetails: TableReconciliationDetail[] = [];
  const allLocalOnlyJobCards: LocalJobCardPreview[] = [];
  const allLocalOnlyVehicles: LocalVehiclePreview[] = [];
  const allLocalOnlyInvoices: LocalInvoicePreview[] = [];
  const allLocalOnlyPayments: LocalPaymentPreview[] = [];
  const allLocalOnlyCustomers: ReconciledRecord[] = [];
  const allLocalOnlyParts: ReconciledRecord[] = [];
  const allLocalOnlyInvTx: ReconciledRecord[] = [];
  const allOtherFinancial: ReconciledRecord[] = [];

  let totalLocalRaw = 0;
  let totalLocalUnique = 0;
  let totalSupabaseRecords = 0;
  let totalMatched = 0;
  let totalLocalOnly = 0;
  let totalSupabaseOnly = 0;
  let totalConflicts = 0;
  let totalBroken = 0;

  for (const meta of ENTITY_METAS) {
    const rawList = meta.getArray(localDataSet);
    const dedup = deduplicateBySourceId(rawList, meta.label);
    const cloudRows = cloudDataMap[meta.table] || [];

    totalLocalRaw += rawList.length;
    totalLocalUnique += dedup.unique.length;
    totalSupabaseRecords += cloudRows.length;

    const matchedRecords: ReconciledRecord[] = [];
    const localOnlyRecords: ReconciledRecord[] = [];
    const conflicts: ReconciledRecord[] = [];
    const brokenRecords: ReconciledRecord[] = [];
    const matchedCloudIds = new Set<string>();

    dedup.unique.forEach((item, idx) => {
      const sourceId = meta.getId(item) || `${meta.entityType}-${idx}`;
      const detUuid = toDeterministicUuid(meta.entityType, sourceId, exactWorkspaceId).toLowerCase();
      const rawLower = String(sourceId).toLowerCase();

      // Check if item exists in Supabase
      const cloudMatch =
        supabaseIdMap[meta.entityType]?.get(detUuid) ||
        supabaseIdMap[meta.entityType]?.get(rawLower);

      if (cloudMatch) {
        matchedCloudIds.add(String(cloudMatch.id).toLowerCase());
        const diffs = meta.checkConflict ? meta.checkConflict(item, cloudMatch) : [];

        if (diffs.length > 0) {
          const rec: ReconciledRecord = {
            id: cloudMatch.id,
            sourceId,
            deterministicUuid: detUuid,
            entityType: meta.entityType,
            classification: "CONFLICT",
            summary: meta.getSummary(item),
            localData: item,
            supabaseData: cloudMatch,
            diffs,
          };
          conflicts.push(rec);
          totalConflicts++;
        } else {
          matchedRecords.push({
            id: cloudMatch.id,
            sourceId,
            deterministicUuid: detUuid,
            entityType: meta.entityType,
            classification: "MATCHED",
            summary: meta.getSummary(item),
            localData: item,
            supabaseData: cloudMatch,
          });
          totalMatched++;
        }
      } else {
        // Not in Supabase -> Check parent relationships to classify LOCAL_ONLY vs BROKEN
        let isBroken = false;
        let brokenReason = "";

        if (meta.entityType === "vehicle") {
          const custRef = checkParentRef("customer", item.customer_id);
          if (!custRef.existsInSupabase && !custRef.existsInLocal) {
            isBroken = true;
            brokenReason = `Parent customer [${item.customer_id}] not found in Supabase or local cache`;
          }
        } else if (meta.entityType === "job_card") {
          const custRef = checkParentRef("customer", item.customer_id);
          const vehRef = checkParentRef("vehicle", item.vehicle_id);
          if (!custRef.existsInSupabase && !custRef.existsInLocal) {
            isBroken = true;
            brokenReason = `Referenced customer [${item.customer_id}] does not exist`;
          } else if (!vehRef.existsInSupabase && !vehRef.existsInLocal) {
            isBroken = true;
            brokenReason = `Referenced vehicle [${item.vehicle_id}] does not exist`;
          }
        } else if (meta.entityType === "jc_item") {
          const jcRef = checkParentRef("job_card", item.job_card_id);
          if (!jcRef.existsInSupabase && !jcRef.existsInLocal) {
            isBroken = true;
            brokenReason = `Parent job card [${item.job_card_id}] does not exist`;
          }
        } else if (meta.entityType === "invoice") {
          const custRef = checkParentRef("customer", item.customer_id);
          if (!custRef.existsInSupabase && !custRef.existsInLocal) {
            isBroken = true;
            brokenReason = `Referenced customer [${item.customer_id}] does not exist`;
          }
        } else if (meta.entityType === "inv_item") {
          const invRef = checkParentRef("invoice", item.invoice_id);
          if (!invRef.existsInSupabase && !invRef.existsInLocal) {
            isBroken = true;
            brokenReason = `Parent invoice [${item.invoice_id}] does not exist`;
          }
        } else if (meta.entityType === "payment") {
          const custRef = checkParentRef("customer", item.customer_id);
          if (!custRef.existsInSupabase && !custRef.existsInLocal) {
            isBroken = true;
            brokenReason = `Customer [${item.customer_id}] does not exist`;
          }
        } else if (meta.entityType === "inv_tx") {
          const partRef = checkParentRef("part", item.part_id);
          if (!partRef.existsInSupabase && !partRef.existsInLocal) {
            isBroken = true;
            brokenReason = `Part [${item.part_id}] does not exist`;
          }
        }

        const rec: ReconciledRecord = {
          id: detUuid,
          sourceId,
          deterministicUuid: detUuid,
          entityType: meta.entityType,
          classification: isBroken ? "BROKEN" : "LOCAL_ONLY",
          summary: meta.getSummary(item),
          localData: item,
          brokenReason: isBroken ? brokenReason : undefined,
        };

        if (isBroken) {
          brokenRecords.push(rec);
          totalBroken++;
        } else {
          localOnlyRecords.push(rec);
          totalLocalOnly++;
        }

        // Add to specific entity preview arrays
        if (meta.entityType === "customer") {
          allLocalOnlyCustomers.push(rec);
        } else if (meta.entityType === "part") {
          allLocalOnlyParts.push(rec);
        } else if (meta.entityType === "inv_tx") {
          allLocalOnlyInvTx.push(rec);
        } else if (["expense", "purchase", "supplier_payments", "ledger_accounts", "ledger_transactions", "ledger_entries"].includes(meta.entityType)) {
          allOtherFinancial.push(rec);
        }
      }
    });

    // Cloud records with no local counterpart = SUPABASE_ONLY
    const supabaseOnlyCount = cloudRows.filter(
      (r) => !matchedCloudIds.has(String(r.id).toLowerCase())
    ).length;
    totalSupabaseOnly += supabaseOnlyCount;

    tableDetails.push({
      entityType: meta.entityType,
      table: meta.table,
      label: meta.label,
      localRawCount: rawList.length,
      localUniqueCount: dedup.unique.length,
      localDuplicateCount: dedup.duplicateCount,
      supabaseCount: cloudRows.length,
      matchedCount: matchedRecords.length,
      localOnlyCount: localOnlyRecords.length,
      supabaseOnlyCount,
      conflictCount: conflicts.length,
      brokenCount: brokenRecords.length,
      localOnlyRecords,
      conflicts,
      brokenRecords,
    });
  }

  // 7. Construct Rich Previews for Local-Only Job Cards
  const localJcDetail = tableDetails.find((t) => t.entityType === "job_card");
  if (localJcDetail) {
    localJcDetail.localOnlyRecords.forEach((rec) => {
      const jc = rec.localData;
      const custRef = checkParentRef("customer", jc.customer_id);
      const vehRef = checkParentRef("vehicle", jc.vehicle_id);

      // Resolve customer display
      let custName = "Unknown Customer";
      if (custRef.existsInSupabase) {
        const cRow = supabaseIdMap.customer?.get(custRef.targetUuid) || supabaseIdMap.customer?.get(String(jc.customer_id).toLowerCase());
        if (cRow) custName = cRow.name;
      } else if (custRef.existsInLocal) {
        const cLocal = localUniqueMap.customer?.get(String(jc.customer_id).toLowerCase());
        if (cLocal) custName = cLocal.name;
      }

      // Resolve vehicle display
      let vehLabel = "Unknown Vehicle";
      if (vehRef.existsInSupabase) {
        const vRow = supabaseIdMap.vehicle?.get(vehRef.targetUuid) || supabaseIdMap.vehicle?.get(String(jc.vehicle_id).toLowerCase());
        if (vRow) vehLabel = `${vRow.make || ""} ${vRow.model || ""} (${vRow.registration_number || "No Plate"})`;
      } else if (vehRef.existsInLocal) {
        const vLocal = localUniqueMap.vehicle?.get(String(jc.vehicle_id).toLowerCase());
        if (vLocal) vehLabel = `${vLocal.make || ""} ${vLocal.model || ""} (${vLocal.registration_number || "No Plate"})`;
      }

      // Extract line items
      const rawItems = Array.isArray(jc.items)
        ? jc.items
        : localDataSet.job_card_items.filter((it: any) => it.job_card_id === jc.id);

      const itemsPreview = rawItems.map((it: any, idx: number) => {
        const itemId = it.id || `${jc.id}-item-${idx}`;
        const refId = it.service_id || it.part_id;
        let refExists = true;
        if (it.service_id) {
          const sRef = checkParentRef("service", it.service_id);
          refExists = sRef.existsInSupabase || sRef.existsInLocal;
        } else if (it.part_id) {
          const pRef = checkParentRef("part", it.part_id);
          refExists = pRef.existsInSupabase || pRef.existsInLocal;
        }

        return {
          sourceId: String(itemId),
          type: it.item_type || "service",
          description: it.description || "Item",
          quantity: Number(it.quantity) || 1,
          unitPrice: Number(it.unit_price) || 0,
          totalPrice: Number(it.total_price) || 0,
          partOrServiceId: refId ? String(refId) : undefined,
          referencedItemExists: refExists,
        };
      });

      // Readiness evaluation
      let readiness: "READY" | "REQUIRES_PARENT_IMPORT" | "BLOCKED_BROKEN" = "READY";
      let readinessReason = "Ready for Cloud Recovery";

      if (!custRef.existsInSupabase && !custRef.existsInLocal) {
        readiness = "BLOCKED_BROKEN";
        readinessReason = "Customer missing from both database and local cache";
      } else if (!vehRef.existsInSupabase && !vehRef.existsInLocal) {
        readiness = "BLOCKED_BROKEN";
        readinessReason = "Vehicle missing from both database and local cache";
      } else if (!custRef.existsInSupabase || !vehRef.existsInSupabase) {
        readiness = "REQUIRES_PARENT_IMPORT";
        const missingParents: string[] = [];
        if (!custRef.existsInSupabase) missingParents.push("Customer");
        if (!vehRef.existsInSupabase) missingParents.push("Vehicle");
        readinessReason = `Requires preceding import of: ${missingParents.join(" & ")}`;
      }

      // Build dependency chain
      const chain = [
        custRef.existsInSupabase ? `Customer [Supabase: ${custName}]` : `Customer [Local: ${custName}]`,
        vehRef.existsInSupabase ? `Vehicle [Supabase: ${vehLabel}]` : `Vehicle [Local: ${vehLabel}]`,
        `Job Card #${jc.job_card_number || jc.id} (${itemsPreview.length} items)`,
      ];

      // Check linked local invoice/payments
      const linkedInvoices = localDataSet.invoices.filter((inv: any) => inv.job_card_id === jc.id);
      if (linkedInvoices.length > 0) {
        linkedInvoices.forEach((inv: any) => {
          chain.push(`Invoice #${inv.invoice_number || inv.id}`);
        });
      }

      const linkedPayments = localDataSet.payments.filter((p: any) => p.job_card_id === jc.id);
      if (linkedPayments.length > 0) {
        chain.push(`${linkedPayments.length} Payment(s) (AED ${linkedPayments.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0)})`);
      }

      allLocalOnlyJobCards.push({
        id: rec.deterministicUuid,
        sourceId: rec.sourceId,
        deterministicUuid: rec.deterministicUuid,
        jobCardNumber: String(jc.job_card_number || "1066"),
        date: jc.date || "",
        status: jc.status || "new",
        paymentStatus: jc.payment_status || "Pending",
        total: Number(jc.total) || 0,
        paid: Number(jc.paid) || 0,
        balance: Number(jc.balance) || 0,
        customer: {
          sourceId: String(jc.customer_id),
          deterministicUuid: custRef.targetUuid,
          name: custName,
          existsInSupabase: custRef.existsInSupabase,
          existsInLocal: custRef.existsInLocal,
        },
        vehicle: {
          sourceId: String(jc.vehicle_id),
          deterministicUuid: vehRef.targetUuid,
          label: vehLabel,
          existsInSupabase: vehRef.existsInSupabase,
          existsInLocal: vehRef.existsInLocal,
        },
        itemCount: itemsPreview.length,
        items: itemsPreview,
        recoveryReadiness: readiness,
        readinessReason,
        dependencyChain: chain,
      });
    });
  }

  // 8. Construct Previews for Local-Only Vehicles
  const localVehDetail = tableDetails.find((t) => t.entityType === "vehicle");
  if (localVehDetail) {
    localVehDetail.localOnlyRecords.forEach((rec) => {
      const v = rec.localData;
      const custRef = checkParentRef("customer", v.customer_id);

      let custName = "Unknown Customer";
      if (custRef.existsInSupabase) {
        const cRow = supabaseIdMap.customer?.get(custRef.targetUuid) || supabaseIdMap.customer?.get(String(v.customer_id).toLowerCase());
        if (cRow) custName = cRow.name;
      } else if (custRef.existsInLocal) {
        const cLocal = localUniqueMap.customer?.get(String(v.customer_id).toLowerCase());
        if (cLocal) custName = cLocal.name;
      }

      let readiness: "READY" | "REQUIRES_CUSTOMER_IMPORT" | "BLOCKED_BROKEN" = "READY";
      let readinessReason = "Ready for Cloud Recovery (Customer exists in Supabase)";

      if (!custRef.existsInSupabase && !custRef.existsInLocal) {
        readiness = "BLOCKED_BROKEN";
        readinessReason = "Parent customer missing from all stores";
      } else if (!custRef.existsInSupabase) {
        readiness = "REQUIRES_CUSTOMER_IMPORT";
        readinessReason = "Requires preceding Customer recovery";
      }

      allLocalOnlyVehicles.push({
        id: rec.deterministicUuid,
        sourceId: rec.sourceId,
        deterministicUuid: rec.deterministicUuid,
        make: v.make || "Unknown",
        model: v.model || "Vehicle",
        year: v.year ? Number(v.year) : null,
        registrationNumber: v.registration_number || null,
        chassisVin: v.chassis_vin || null,
        customer: {
          sourceId: String(v.customer_id),
          deterministicUuid: custRef.targetUuid,
          name: custName,
          existsInSupabase: custRef.existsInSupabase,
          existsInLocal: custRef.existsInLocal,
        },
        recoveryReadiness: readiness,
        readinessReason,
      });
    });
  }

  // 9. Construct Previews for Local-Only Invoices
  const localInvDetail = tableDetails.find((t) => t.entityType === "invoice");
  if (localInvDetail) {
    localInvDetail.localOnlyRecords.forEach((rec) => {
      const inv = rec.localData;
      const custRef = checkParentRef("customer", inv.customer_id);
      const jcRef = checkParentRef("job_card", inv.job_card_id);

      let readiness: "READY" | "REQUIRES_PARENT_IMPORT" | "BLOCKED_BROKEN" = "READY";
      let readinessReason = "Ready for Cloud Recovery";

      if (!custRef.existsInSupabase && !custRef.existsInLocal) {
        readiness = "BLOCKED_BROKEN";
        readinessReason = "Customer missing";
      } else if (!custRef.existsInSupabase || (inv.job_card_id && !jcRef.existsInSupabase)) {
        readiness = "REQUIRES_PARENT_IMPORT";
        readinessReason = "Requires preceding Customer / Job Card recovery";
      }

      const rawItems = Array.isArray(inv.items)
        ? inv.items
        : localDataSet.invoice_items.filter((it: any) => it.invoice_id === inv.id);

      allLocalOnlyInvoices.push({
        id: rec.deterministicUuid,
        sourceId: rec.sourceId,
        deterministicUuid: rec.deterministicUuid,
        invoiceNumber: String(inv.invoice_number || "1066"),
        date: inv.created_at?.slice(0, 10),
        total: Number(inv.total) || 0,
        paid: Number(inv.paid) || 0,
        balance: Number(inv.balance) || 0,
        paymentStatus: inv.payment_status || "credit",
        customerId: String(inv.customer_id),
        jobCardId: inv.job_card_id ? String(inv.job_card_id) : null,
        vehicleId: inv.vehicle_id ? String(inv.vehicle_id) : null,
        customerExistsInSupabase: custRef.existsInSupabase,
        jobCardExistsInSupabase: jcRef.existsInSupabase,
        itemCount: rawItems.length,
        recoveryReadiness: readiness,
        readinessReason,
      });
    });
  }

  // 10. Construct Previews for Local-Only Payments
  const localPayDetail = tableDetails.find((t) => t.entityType === "payment");
  if (localPayDetail) {
    localPayDetail.localOnlyRecords.forEach((rec) => {
      const p = rec.localData;
      const custRef = checkParentRef("customer", p.customer_id);
      const invRef = checkParentRef("invoice", p.invoice_id);
      const jcRef = checkParentRef("job_card", p.job_card_id);

      let readiness: "READY" | "REQUIRES_PARENT_IMPORT" | "BLOCKED_BROKEN" = "READY";
      let readinessReason = "Ready for Cloud Recovery";

      if (!custRef.existsInSupabase && !custRef.existsInLocal) {
        readiness = "BLOCKED_BROKEN";
        readinessReason = "Customer missing";
      } else if (!custRef.existsInSupabase || (p.invoice_id && !invRef.existsInSupabase) || (p.job_card_id && !jcRef.existsInSupabase)) {
        readiness = "REQUIRES_PARENT_IMPORT";
        readinessReason = "Requires preceding Customer / Invoice / Job Card recovery";
      }

      allLocalOnlyPayments.push({
        id: rec.deterministicUuid,
        sourceId: rec.sourceId,
        deterministicUuid: rec.deterministicUuid,
        amount: Number(p.amount) || 0,
        paymentMethod: p.payment_method || "cash",
        paymentDate: p.payment_date || "",
        referenceNumber: p.reference_number || null,
        invoiceId: p.invoice_id ? String(p.invoice_id) : null,
        jobCardId: p.job_card_id ? String(p.job_card_id) : null,
        customerId: String(p.customer_id),
        customerExistsInSupabase: custRef.existsInSupabase,
        invoiceExistsInSupabase: invRef.existsInSupabase,
        jobCardExistsInSupabase: jcRef.existsInSupabase,
        recoveryReadiness: readiness,
        readinessReason,
      });
    });
  }

  return {
    workspaceId: targetWsId,
    generatedAt: now,
    summary: {
      totalLocalRaw,
      totalLocalUnique,
      totalSupabaseRecords,
      totalMatched,
      totalLocalOnly,
      totalSupabaseOnly,
      totalConflicts,
      totalBroken,
      isSupabaseAuthoritative: true,
    },
    tables: tableDetails,
    previews: {
      jobCards: allLocalOnlyJobCards,
      vehicles: allLocalOnlyVehicles,
      invoices: allLocalOnlyInvoices,
      payments: allLocalOnlyPayments,
      customers: allLocalOnlyCustomers,
      parts: allLocalOnlyParts,
      inventoryTransactions: allLocalOnlyInvTx,
      otherFinancial: allOtherFinancial,
    },
  };
}

/**
 * Backward compatibility helper for legacy report readers
 */
export async function generateReconciliationReport(workspaceId?: string) {
  const detailed = await generateDetailedReconciliationReport(workspaceId);
  return {
    workspaceId: detailed.workspaceId,
    generatedAt: detailed.generatedAt,
    tables: detailed.tables.map((t) => ({
      table: t.table,
      localKey: LOCAL_DATA_KEYS[t.table.toUpperCase() as keyof typeof LOCAL_DATA_KEYS] || `atiq_local_${t.table}`,
      localCount: t.localRawCount,
      supabaseCount: t.supabaseCount,
      legacyStringIdCount: t.localOnlyCount + t.brokenCount,
      validUuidCount: t.matchedCount,
      notes: t.localOnlyCount > 0
        ? `${t.localOnlyCount} local-only records identified (${t.matchedCount} matched in Supabase)`
        : `Synchronized: ${t.matchedCount} matched, ${t.supabaseOnlyCount} cloud-only`,
    })),
    summary: {
      totalLocalRecords: detailed.summary.totalLocalRaw,
      totalSupabaseRecords: detailed.summary.totalSupabaseRecords,
      totalLegacyIds: detailed.summary.totalLocalOnly + detailed.summary.totalBroken,
      isSupabaseAuthoritative: true,
    },
  };
}
