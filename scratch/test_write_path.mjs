import { createClient } from "@supabase/supabase-js";

const url = "https://dnrrwcccclulidhyglub.supabase.co";
const key = "sb_publishable_lgbZ-w4vdGfniZabMwdAYw_FsPWcVx7";
const supabase = createClient(url, key);

async function main() {
  console.log("=================================================================");
  console.log("TESTING WRITE PATH WITH DIFFERENT WORKSPACE IDs");
  console.log("=================================================================");

  // 1. Test inserting customer with 'ws-atiq-default-001'
  console.log("\n[Test 1: Insert with 'ws-atiq-default-001']");
  const { data: d1, error: e1 } = await supabase.from("customers").insert({
    name: "Test Customer Legacy WS",
    mobile: "0501234567",
    workspace_id: "ws-atiq-default-001",
  }).select();
  console.log("Result with 'ws-atiq-default-001':", { data: d1, error: e1 });

  // 2. Test inserting customer with 'ibrar'
  console.log("\n[Test 2: Insert with 'ibrar']");
  const { data: d2, error: e2 } = await supabase.from("customers").insert({
    name: "Test Customer Slug WS",
    mobile: "0501234568",
    workspace_id: "ibrar",
  }).select();
  console.log("Result with 'ibrar':", { data: d2, error: e2 });

  // 3. Test inserting customer with exact workspace UUID 'c6b757e2-49da-41b4-b903-88bcfe8d90fa'
  console.log("\n[Test 3: Insert with 'c6b757e2-49da-41b4-b903-88bcfe8d90fa']");
  const { data: d3, error: e3 } = await supabase.from("customers").insert({
    name: "Test Customer Real UUID",
    mobile: "0509999999",
    workspace_id: "c6b757e2-49da-41b4-b903-88bcfe8d90fa",
  }).select();
  console.log("Result with real UUID (unauthenticated anon):", { data: d3, error: e3 });

  // 4. Query public.workspaces to see all workspaces
  const { data: wsList, error: wsErr } = await supabase.from("workspaces").select("*");
  console.log("\nPublic workspaces:", wsList, "Error:", wsErr);
}

main().catch(console.error);
