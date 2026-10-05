import { createClient } from "@supabase/supabase-js";

const url = "https://dnrrwcccclulidhyglub.supabase.co";
const key = "sb_publishable_lgbZ-w4vdGfniZabMwdAYw_FsPWcVx7";
const supabase = createClient(url, key);

function toDeterministicUuid(entityType, rawId, workspaceId = "c6b757e2-49da-41b4-b903-88bcfe8d90fa") {
  if (!rawId || typeof rawId !== "string" || !rawId.trim()) {
    return "00000000-0000-0000-0000-000000000000";
  }

  const str = rawId.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(str)) {
    return str.toLowerCase();
  }

  const seed = `${entityType}:${workspaceId}:${str}`;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57, h3 = 0x9e3779b9, h4 = 0x7b5d6f8a;
  for (let i = 0; i < seed.length; i++) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ (ch << 3), 1597334677);
    h3 = Math.imul(h3 ^ (ch << 5), 2246822507);
    h4 = Math.imul(h4 ^ (ch << 7), 3266489909);
  }

  const hex1 = ((h1 >>> 0).toString(16)).padStart(8, "0");
  const hex2 = ((h2 >>> 0).toString(16)).padStart(8, "0");
  const hex3 = ((h3 >>> 0).toString(16)).padStart(8, "0");
  const hex4 = ((h4 >>> 0).toString(16)).padStart(8, "0");

  const raw32 = (hex1 + hex2 + hex3 + hex4).slice(0, 32);

  const part1 = raw32.slice(0, 8);
  const part2 = raw32.slice(8, 12);
  const part3 = "4" + raw32.slice(13, 16);
  const part4 = "a" + raw32.slice(17, 20);
  const part5 = raw32.slice(20, 32);

  return `${part1}-${part2}-${part3}-${part4}-${part5}`.toLowerCase();
}

const targetWsId = "c6b757e2-49da-41b4-b903-88bcfe8d90fa";

async function main() {
  console.log("=================================================================");
  console.log("COMPREHENSIVE RUNTIME AUDIT & COLLISION CHECK");
  console.log("=================================================================");

  // 1. Destination UUIDs
  const canonicalVehUuid = toDeterministicUuid("vehicle", "veh-1726389000001", targetWsId);
  const jcUuids = {
    "1085": toDeterministicUuid("job_card", "jc-17281234001085", targetWsId),
    "1086": toDeterministicUuid("job_card", "jc-17281234001086", targetWsId),
    "1087": toDeterministicUuid("job_card", "jc-17281234001087", targetWsId),
    "1088": toDeterministicUuid("job_card", "jc-17281234001088", targetWsId),
  };

  const itemUuids = [
    toDeterministicUuid("jc_item", "item-1085-0", targetWsId),
    toDeterministicUuid("jc_item", "item-1085-1", targetWsId),
    toDeterministicUuid("jc_item", "item-1086-0", targetWsId),
    toDeterministicUuid("jc_item", "item-1086-1", targetWsId),
    toDeterministicUuid("jc_item", "item-1087-0", targetWsId),
    toDeterministicUuid("jc_item", "item-1088-0", targetWsId),
    toDeterministicUuid("jc_item", "item-1088-1", targetWsId),
  ];

  console.log("\nProposed Runtime Destination UUIDs:");
  console.log("  Canonical Vehicle:", canonicalVehUuid);
  console.log("  Job Cards:", jcUuids);
  console.log("  Job Card Items:", itemUuids);

  // 2. Customer row check
  const custUuid = "c823fb19-482a-4db5-b8a7-9b871c8901a2";
  const { data: custRow, error: custErr } = await supabase
    .from("customers")
    .select("id, name, workspace_id, is_deleted")
    .eq("id", custUuid)
    .maybeSingle();

  console.log("\nCustomer Verification (c823fb19-482a-4db5-b8a7-9b871c8901a2):");
  console.log("  Found:", custRow || "No row found (check RLS / session)", "Error:", custErr || "None");

  // 3. Vehicle collision check
  const { data: vehByUuid } = await supabase
    .from("vehicles")
    .select("id, make, model, registration_number, workspace_id")
    .eq("id", canonicalVehUuid);
  const { data: vehByReg } = await supabase
    .from("vehicles")
    .select("id, make, model, registration_number, workspace_id")
    .eq("workspace_id", targetWsId)
    .ilike("registration_number", "AD-12-40825");

  console.log("\nVehicle Collision Checks:");
  console.log("  Vehicle by Proposed UUID:", vehByUuid?.length ? vehByUuid : "ABSENT_SAFE_TO_INSERT");
  console.log("  Vehicle by Plate AD-12-40825:", vehByReg?.length ? vehByReg : "ABSENT_SAFE_TO_INSERT");

  // 4. Job Card collision checks
  const { data: jcByUuids } = await supabase
    .from("job_cards")
    .select("id, job_card_number, workspace_id")
    .in("id", Object.values(jcUuids));

  const { data: jcByNums } = await supabase
    .from("job_cards")
    .select("id, job_card_number, workspace_id")
    .eq("workspace_id", targetWsId)
    .in("job_card_number", ["1085", "1086", "1087", "1088"]);

  console.log("\nJob Card Collision Checks:");
  console.log("  Job Cards by Proposed UUIDs:", jcByUuids?.length ? jcByUuids : "ABSENT_SAFE_TO_INSERT");
  console.log("  Job Cards by Numbers 1085-1088:", jcByNums?.length ? jcByNums : "ABSENT_SAFE_TO_INSERT");

  // 5. Job Card Items collision check
  const { data: itemsByUuids } = await supabase
    .from("job_card_items")
    .select("id, job_card_id, description, workspace_id")
    .in("id", itemUuids);

  console.log("\nJob Card Items Collision Checks:");
  console.log("  Items by Proposed UUIDs:", itemsByUuids?.length ? itemsByUuids : "ABSENT_SAFE_TO_INSERT");

  // 6. Invoices reference check
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id, invoice_number, job_card_id, total, status, workspace_id")
    .eq("workspace_id", targetWsId);

  console.log("\nExisting Invoices check count:", invoices?.length || 0);
  const matchingInv = invoices?.filter(inv => Object.values(jcUuids).includes(inv.job_card_id));
  console.log("  Invoices linked to 1085-1088:", matchingInv?.length ? matchingInv : "None (JC #1087 'invoiced' is local flag)");
}

main().catch(console.error);
