import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

// Read .env.local manually
const envPath = path.resolve(".env.local");
let url = "";
let key = "";

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_URL=")) {
      url = trimmed.split("=")[1].trim();
    } else if (trimmed.startsWith("NEXT_PUBLIC_SUPABASE_ANON_KEY=")) {
      key = trimmed.split("=")[1].trim();
    }
  }
}

const supabase = createClient(url, key);

async function checkTables() {
  const tables = [
    "workspaces",
    "workspace_members",
    "platform_admins",
    "customers",
    "vehicles",
    "job_cards",
    "job_card_items",
    "invoices",
    "invoice_items",
    "payments",
    "parts",
    "inventory_transactions",
    "suppliers",
    "purchases",
    "purchase_items",
    "services",
    "expenses",
    "ledger_accounts"
  ];

  console.log("Checking Supabase tables using public API...");
  for (const table of tables) {
    const { data, error } = await supabase.from(table).select("*").limit(1);
    if (error) {
      console.log(`❌ Table '${table}': ERROR (${error.code}) - ${error.message}`);
    } else {
      console.log(`✅ Table '${table}': EXISTS (${data?.length ?? 0} rows found)`);
    }
  }
}

checkTables().catch(console.error);
