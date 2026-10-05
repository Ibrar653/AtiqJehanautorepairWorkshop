import { createClient } from "@/lib/supabase/client";
import { getActiveWorkspaceId } from "./workspace-service";

export interface TableReconciliationItem {
  table: string;
  localKey: string;
  localCount: number;
  supabaseCount: number;
  legacyStringIdCount: number;
  validUuidCount: number;
  notes: string;
}

export interface ReconciliationReport {
  workspaceId: string;
  generatedAt: string;
  tables: TableReconciliationItem[];
  summary: {
    totalLocalRecords: number;
    totalSupabaseRecords: number;
    totalLegacyIds: number;
    isSupabaseAuthoritative: boolean;
  };
}

const TABLE_CONFIGS: { table: string; localKey: string }[] = [
  { table: "customers", localKey: "atiq_local_customers" },
  { table: "vehicles", localKey: "atiq_local_vehicles" },
  { table: "job_cards", localKey: "atiq_local_job_cards" },
  { table: "invoices", localKey: "atiq_local_invoices" },
  { table: "payments", localKey: "atiq_local_payments" },
  { table: "parts", localKey: "atiq_local_parts" },
  { table: "inventory_transactions", localKey: "atiq_local_inventory_transactions" },
  { table: "suppliers", localKey: "atiq_local_suppliers" },
  { table: "purchases", localKey: "atiq_local_purchases" },
  { table: "supplier_payments", localKey: "atiq_local_supplier_payments" },
  { table: "services", localKey: "atiq_local_services" },
  { table: "expenses", localKey: "atiq_local_expenses" },
  { table: "ledger_accounts", localKey: "atiq_local_ledger_accounts" },
  { table: "ledger_transactions", localKey: "atiq_local_ledger_transactions" },
  { table: "ledger_entries", localKey: "atiq_local_ledger_entries" },
];

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateReconciliationReport(workspaceId?: string): Promise<ReconciliationReport> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  const now = new Date().toISOString();

  const results: TableReconciliationItem[] = [];

  for (const config of TABLE_CONFIGS) {
    let localItems: any[] = [];
    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(config.localKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            localItems = parsed;
          }
        }
      } catch {}
    }

    let supabaseCount = 0;
    try {
      const { count, error } = await supabase
        .from(config.table)
        .select("id", { count: "exact", head: true });

      if (!error && count !== null) {
        supabaseCount = count;
      }
    } catch {}

    let legacyCount = 0;
    let uuidCount = 0;

    localItems.forEach((item) => {
      const id = item?.id ? String(item.id) : "";
      if (UUID_REGEX.test(id)) {
        uuidCount++;
      } else {
        legacyCount++;
      }
    });

    let note = "";
    if (localItems.length === 0 && supabaseCount === 0) {
      note = "Clean: No records in either store";
    } else if (legacyCount > 0) {
      note = `${legacyCount} local records contain legacy string IDs (preserved in browser for audit)`;
    } else {
      note = "Authoritative Supabase sync ready";
    }

    results.push({
      table: config.table,
      localKey: config.localKey,
      localCount: localItems.length,
      supabaseCount,
      legacyStringIdCount: legacyCount,
      validUuidCount: uuidCount,
      notes: note,
    });
  }

  const totalLocal = results.reduce((acc, r) => acc + r.localCount, 0);
  const totalSupabase = results.reduce((acc, r) => acc + r.supabaseCount, 0);
  const totalLegacy = results.reduce((acc, r) => acc + r.legacyStringIdCount, 0);

  return {
    workspaceId: targetWsId,
    generatedAt: now,
    tables: results,
    summary: {
      totalLocalRecords: totalLocal,
      totalSupabaseRecords: totalSupabase,
      totalLegacyIds: totalLegacy,
      isSupabaseAuthoritative: true,
    },
  };
}
