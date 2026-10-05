import { createClient } from "@supabase/supabase-js";

const url = "https://dnrrwcccclulidhyglub.supabase.co";
const key = "sb_publishable_lgbZ-w4vdGfniZabMwdAYw_FsPWcVx7";

const supabase = createClient(url, key);

async function main() {
  console.log("==================================================");
  console.log("SUPABASE RAW VERIFICATION");
  console.log("==================================================");

  // 1. Workspaces
  const { data: workspaces, error: wsErr } = await supabase
    .from("workspaces")
    .select("id, name, slug, status, created_at");
  console.log("\n1. Workspaces in Supabase:", workspaces);
  if (wsErr) console.error("Workspace query error:", wsErr);

  // 2. Customers
  const { data: customers, error: custErr } = await supabase
    .from("customers")
    .select("id, name, phone, email, workspace_id, is_deleted");
  console.log(`\n2. Customers count: ${customers?.length}`);
  console.log("Customers sample:", customers?.slice(0, 10));

  // 3. Vehicles
  const { data: vehicles, error: vehErr } = await supabase
    .from("vehicles")
    .select("id, make, model, year, registration_number, chassis_vin, customer_id, workspace_id, is_deleted");
  console.log(`\n3. Vehicles count: ${vehicles?.length}`);
  console.log("Vehicles sample:", vehicles?.slice(0, 10));

  // 4. Job Cards
  const { data: jobCards, error: jcErr } = await supabase
    .from("job_cards")
    .select("id, job_card_number, customer_id, vehicle_id, status, total, paid, workspace_id, is_deleted");
  console.log(`\n4. Job Cards count: ${jobCards?.length}`);
  console.log("Job Cards:", jobCards);

  // 5. Job Card Items
  const { data: jcItems, error: itmErr } = await supabase
    .from("job_card_items")
    .select("id, job_card_id, item_type, description, quantity, unit_price, total_price, service_id, part_id, workspace_id");
  console.log(`\n5. Job Card Items count: ${jcItems?.length}`);
  console.log("Job Card Items sample:", jcItems?.slice(0, 10));
}

main().catch(console.error);
