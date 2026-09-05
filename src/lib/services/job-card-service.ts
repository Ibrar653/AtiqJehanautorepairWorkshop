import { createClient } from "@/lib/supabase/client";
import type {
  JobCard,
  JobCardInsert,
  JobCardUpdate,
  JobCardWithRelations,
  JobCardStatus,
  Customer,
  Vehicle,
  JobCardItem,
  JobCardQueryOptions,
} from "@/types/database";
export type { JobCardQueryOptions };
import { getCustomerById, getLocalCustomers } from "./customer-service";
import { getVehicleById, getLocalVehicles } from "./vehicle-service";
import { getPartById, getLocalParts } from "./parts-service";
import { recordStockTransaction } from "./inventory-service";
import { getActiveWorkspaceId } from "./workspace-service";
import { DEFAULT_WORKSPACE_ID } from "@/lib/constants";

const LOCAL_JOB_CARDS_KEY = "atiq_local_job_cards";

// In-memory fallback
let inMemoryJobCards: JobCardWithRelations[] = [];

export function getLocalJobCards(workspaceId?: string): any[] {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let all: any[] = [];
  if (typeof window === "undefined") {
    all = inMemoryJobCards;
  } else {
    try {
      const raw = localStorage.getItem(LOCAL_JOB_CARDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) all = parsed;
      }
    } catch {}
    if (all.length === 0) all = inMemoryJobCards;
  }
  return all.filter(
    (j) => j.workspace_id === targetWsId || (!j.workspace_id && targetWsId === DEFAULT_WORKSPACE_ID)
  );
}

export function saveLocalJobCards(cards: any[], workspaceId?: string) {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  let allExisting: any[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(LOCAL_JOB_CARDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) allExisting = parsed;
      }
    } catch {}
  }
  if (allExisting.length === 0) allExisting = inMemoryJobCards;
  const others = allExisting.filter((j) => j.workspace_id && j.workspace_id !== targetWsId);
  const taggedCards = cards.map((c) => ({
    ...c,
    workspace_id: c.workspace_id || targetWsId,
  }));
  const merged = [...taggedCards, ...others];
  inMemoryJobCards = merged;
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(LOCAL_JOB_CARDS_KEY, JSON.stringify(merged));
    } catch (e) {
      console.error("Failed to save local job cards", e);
    }
  }
}

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs = 2000): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Job Card query timed out")), timeoutMs)
    ),
  ]);
}

/**
 * Get Next Auto-incrementing Invoice Number:
 * - ATIQ JEHAN starts at 1060
 * - Any new workspace starts at 1 (fresh sequence)
 */
export function getNextInvoiceNumber(workspaceId?: string): number {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const local = getLocalJobCards(targetWsId);
  const usedNumbers = new Set(local.map((j) => Number(j.invoice_number)).filter((n) => !isNaN(n)));

  let candidate = targetWsId === DEFAULT_WORKSPACE_ID ? 1060 : 1;
  while (usedNumbers.has(candidate)) {
    candidate++;
  }
  return candidate;
}

export async function getNextInvoiceNumberAsync(workspaceId?: string): Promise<number> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();
  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("job_cards")
        .select("invoice_number")
        .eq("workspace_id", targetWsId)
        .not("invoice_number", "is", null);

      if (error) throw error;
      const usedNumbers = new Set(
        (data || []).map((d: any) => Number(d.invoice_number)).filter((n: number) => !isNaN(n))
      );

      const local = getLocalJobCards(targetWsId);
      local.forEach((j) => {
        if (j.invoice_number) usedNumbers.add(Number(j.invoice_number));
      });

      let candidate = targetWsId === DEFAULT_WORKSPACE_ID ? 1060 : 1;
      while (usedNumbers.has(candidate)) {
        candidate++;
      }
      return candidate;
    };

    return await withTimeout(fetchWithTimeout(), 1500);
  } catch {
    return getNextInvoiceNumber(targetWsId);
  }
}

/**
 * Check if a custom invoice number is already in use
 */
export async function isInvoiceNumberAvailable(num: number, excludeJobCardId?: string): Promise<boolean> {
  if (!num || isNaN(num) || num <= 0) return false;
  const supabase = createClient();

  try {
    const fetchWithTimeout = async () => {
      let q = supabase
        .from("job_cards")
        .select("id, invoice_number")
        .eq("invoice_number", num);

      if (excludeJobCardId) {
        q = q.neq("id", excludeJobCardId);
      }

      const { data, error } = await q.limit(1);
      if (error) throw error;

      if (data && data.length > 0) return false;

      const local = getLocalJobCards();
      const localUsed = local.some((j) => Number(j.invoice_number) === num && j.id !== excludeJobCardId);
      return !localUsed;
    };

    return await withTimeout(fetchWithTimeout(), 1500);
  } catch {
    const local = getLocalJobCards();
    const exists = local.some((j) => Number(j.invoice_number) === num && j.id !== excludeJobCardId);
    return !exists;
  }
}

export async function getJobCards(
  options: JobCardQueryOptions = {},
  workspaceId?: string
): Promise<{ jobCards: JobCardWithRelations[]; total: number }> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  // Safe search normalization - NEVER call options.search.trim() without validating string type
  const search =
    typeof options?.search === "string"
      ? options.search.trim()
      : "";

  const status =
    typeof options?.status === "string" && options.status !== "all"
      ? options.status
      : undefined;

  const page = typeof options?.page === "number" && options.page > 0 ? options.page : 1;
  const limit = typeof options?.limit === "number" && options.limit > 0 ? options.limit : 20;
  const offset = (page - 1) * limit;

  const supabase = createClient();

  try {
    const fetchWithTimeout = async () => {
      let query = supabase
        .from("job_cards")
        .select(
          "id, invoice_number, payment_status, job_card_number, date, status, total, balance, customer_id, vehicle_id, customer_complaint, assigned_mechanic, workspace_id, is_deleted, created_at, customer:customers(id, name, mobile, email, company_name, trn_number, address), vehicle:vehicles(id, make, model, registration_number, chassis_vin, color, year, mileage), items:job_card_items(id, item_type, description, quantity, unit_price, cost_price, total_price)",
          { count: "exact" }
        )
        .eq("is_deleted", false)
        .eq("workspace_id", targetWsId);

      if (status) {
        query = query.eq("status", status);
      }

      if (options.assigned_mechanic) {
        query = query.ilike("assigned_mechanic", `%${options.assigned_mechanic}%`);
      }

      if (search) {
        const orClauses = [
          `job_card_number.ilike.%${search}%`,
          `assigned_mechanic.ilike.%${search}%`,
          `customer_complaint.ilike.%${search}%`,
        ];
        if (!isNaN(Number(search))) {
          orClauses.push(`invoice_number.eq.${Number(search)}`);
        }
        query = query.or(orClauses.join(","));
      }

      const { data, count, error } = await query
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      return { data: (data || []) as unknown as JobCardWithRelations[], count: count || 0 };
    };

    const result = await withTimeout(fetchWithTimeout(), 2000);
    return { jobCards: result.data, total: result.count };
  } catch (err: any) {
    console.warn("Using local job cards store fallback:", err.message || err);

    let list = getLocalJobCards(targetWsId).filter((jc) => !jc.is_deleted);

    if (status) {
      list = list.filter((jc) => jc.status === status);
    }

    if (options.assigned_mechanic) {
      const mech = options.assigned_mechanic.toLowerCase();
      list = list.filter((jc) => jc.assigned_mechanic && jc.assigned_mechanic.toLowerCase().includes(mech));
    }

    if (search) {
      const q = search.toLowerCase();
      const qNum = Number(q);
      list = list.filter(
        (jc) =>
          (jc.job_card_number && jc.job_card_number.toLowerCase().includes(q)) ||
          (jc.customer?.name && jc.customer.name.toLowerCase().includes(q)) ||
          (jc.customer?.mobile && jc.customer.mobile.toLowerCase().includes(q)) ||
          (jc.vehicle?.registration_number && jc.vehicle.registration_number.toLowerCase().includes(q)) ||
          (jc.vehicle?.chassis_vin && jc.vehicle.chassis_vin.toLowerCase().includes(q)) ||
          (jc.assigned_mechanic && jc.assigned_mechanic.toLowerCase().includes(q)) ||
          (!isNaN(qNum) && Number(jc.invoice_number) === qNum)
      );
    }

    list.sort((a, b) => new Date(b.date || b.created_at).getTime() - new Date(a.date || a.created_at).getTime());

    const total = list.length;
    const paginated = list.slice(offset, offset + limit);

    return { jobCards: paginated, total };
  }
}

export async function getJobCardById(id: string, workspaceId?: string): Promise<JobCardWithRelations | null> {
  const targetWsId = workspaceId || getActiveWorkspaceId();
  const supabase = createClient();

  const normalizeJobCardItems = (rawItems: any[] = []): JobCardItem[] => {
    return rawItems.map((item) => {
      const q = Number(item.quantity) || 1;
      const p = Number(item.unit_price) || 0;
      const l = Number(item.labour_charge) || 0;
      const calcTotal = item.item_type === "service" ? (q * p + l) : (q * p);
      return {
        id: item.id || `item-${Math.random()}`,
        job_card_id: id,
        item_type: item.item_type || "service",
        service_id: item.service_id || null,
        part_id: item.part_id || null,
        description: item.description || "",
        quantity: q,
        unit_price: p,
        cost_price: Number(item.cost_price) || 0,
        labour_charge: l,
        total_price: Number(item.total_price) || calcTotal,
        created_at: item.created_at || new Date().toISOString(),
      };
    });
  };

  try {
    const fetchWithTimeout = async () => {
      const { data, error } = await supabase
        .from("job_cards")
        .select(
          "*, customer:customers(*), vehicle:vehicles(*), items:job_card_items(*)"
        )
        .eq("id", id)
        .eq("workspace_id", targetWsId)
        .single();

      if (error) throw error;
      if (data) {
        data.items = normalizeJobCardItems(data.items);
      }
      return data as JobCardWithRelations;
    };

    return await withTimeout(fetchWithTimeout(), 2000);
  } catch (err: any) {
    console.warn(`Reading job card ${id} from local fallback:`, err.message || err);
    const local = getLocalJobCards(targetWsId);
    const found = local.find((j) => j.id === id);

    if (found) {
      const allCustomers = getLocalCustomers(targetWsId);
      const allVehicles = getLocalVehicles();
      const realCust = allCustomers.find((c) => c.id === found.customer_id) || found.customer;
      const realVeh = allVehicles.find((v) => v.id === found.vehicle_id) || found.vehicle;

      return {
        ...found,
        customer: realCust,
        vehicle: realVeh,
        items: normalizeJobCardItems(found.items),
      } as JobCardWithRelations;
    }

    return null;
  }
}

export type JobCardItemInput = {
  id?: string;
  job_card_id?: string;
  item_type: "service" | "part";
  service_id?: string | null;
  part_id?: string | null;
  description: string;
  quantity?: number;
  unit_price?: number;
  cost_price?: number;
  labour_charge?: number;
  total_price?: number;
};

export async function createJobCard(
  payload: JobCardInsert & { items?: JobCardItemInput[] },
  itemsInput: JobCardItemInput[] = [],
  workspaceId?: string
) {
  const targetWsId = payload.workspace_id || workspaceId || getActiveWorkspaceId();
  const items = Array.isArray(itemsInput) && itemsInput.length > 0
    ? itemsInput
    : (Array.isArray(payload?.items) ? payload.items : []);

  const supabase = createClient();
  const assignedInvoiceNumber = payload.invoice_number || getNextInvoiceNumber(targetWsId);
  const finalPayload = {
    ...payload,
    workspace_id: targetWsId,
    invoice_number: assignedInvoiceNumber,
    invoice_number_mode: payload.invoice_number_mode || "auto",
    payment_status: payload.payment_status || "Pending",
  };

  // 1. Stock Validation & Cost Snapshot
  for (const it of items) {
    if ((it.item_type === "part" || (it as any).item_type === "spare_part") && it.part_id) {
      const part = await getPartById(it.part_id);
      const reqQty = Number(it.quantity) || 1;
      if (part) {
        if (part.current_stock < reqQty) {
          throw new Error(
            `Insufficient stock for "${part.name}". Available stock is ${part.current_stock}, requested ${reqQty}.`
          );
        }
        if (it.cost_price === undefined) {
          it.cost_price = Number(part.purchase_price) || 0;
        }
      }
    }
  }

  const jobCardId = "jc-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7);

  try {
    // 2. Insert job card
    const { data: jobCard, error: jcError } = await withTimeout<any>(
      supabase
        .from("job_cards")
        .insert({
          ...finalPayload,
          id: jobCardId,
          is_deleted: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single(),
      2000
    );

    if (jcError) throw jcError;

    // 3. Insert items & process inventory transactions
    if (items && items.length > 0) {
      const itemsPayload = items.map((it) => {
        const itemType = ((it.item_type as string) === "spare_part" ? "part" : it.item_type) as any;
        return {
          job_card_id: jobCard.id,
          item_type: itemType,
          service_id: it.service_id || null,
          part_id: it.part_id || null,
          description: it.description,
          quantity: it.quantity || 1,
          unit_price: it.unit_price || 0,
          cost_price: it.cost_price || 0,
          labour_charge: it.labour_charge || 0,
          total_price: it.total_price || 0,
        };
      });

      const { error: itemsError } = await withTimeout(
        supabase.from("job_card_items").insert(itemsPayload),
        2000
      );

      if (itemsError) throw itemsError;
    }

    // 4. Record stock usage transactions for parts
    if (payload.status !== "cancelled") {
      for (const it of items) {
        if ((it.item_type === "part" || (it.item_type as string) === "spare_part") && it.part_id) {
          const qty = Number(it.quantity) || 1;
          if (qty > 0) {
            try {
              await recordStockTransaction({
                partId: it.part_id,
                transactionType: "job_card_usage",
                quantityChange: -qty,
                unitCost: it.cost_price,
                referenceType: "job_card",
                referenceId: jobCard.id,
                notes: `Job Card #${assignedInvoiceNumber}`,
              });
            } catch (stkErr) {
              console.error("Stock transaction error on JC create:", stkErr);
            }
          }
        }
      }
    }

    const createdRecord = await getJobCardById(jobCard.id);
    return createdRecord;
  } catch (err: any) {
    console.warn("Creating job card in local fallback store:", err.message || err);

    const todayStr = (payload.date || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
    const local = getLocalJobCards(targetWsId);
    const countToday = local.filter((j) => (j.date || "").replace(/-/g, "") === todayStr).length + 1;
    const jcNumber = payload.job_card_number || `JC-${todayStr}-${String(countToday).padStart(3, "0")}`;

    const allCustomers = getLocalCustomers(targetWsId);
    const allVehicles = getLocalVehicles();
    const realCust = allCustomers.find((c) => c.id === payload.customer_id) || null;
    const realVeh = allVehicles.find((v) => v.id === payload.vehicle_id) || null;

    let serviceTotal = 0;
    let labourTotal = 0;
    let partsTotal = 0;

    const itemRecords = (items || []).map((it) => {
      const q = Number(it.quantity) || 1;
      const p = Number(it.unit_price) || 0;
      const l = Number(it.labour_charge) || 0;
      const cost = Number(it.cost_price) || 0;
      const itemType = ((it.item_type as string) === "spare_part" ? "part" : it.item_type) as any;
      const lineTotal = itemType === "service" ? (q * p + l) : (q * p);

      if (itemType === "service") {
        serviceTotal += (q * p);
        labourTotal += l;
      } else if (itemType === "part") {
        partsTotal += (q * p);
      }

      return {
        id: "item-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
        job_card_id: jobCardId,
        item_type: itemType,
        service_id: it.service_id || null,
        part_id: it.part_id || null,
        description: it.description,
        quantity: q,
        unit_price: p,
        cost_price: cost,
        labour_charge: l,
        total_price: lineTotal,
        created_at: new Date().toISOString(),
      };
    });

    const subtotal = serviceTotal + labourTotal + partsTotal;
    const discount = Number(payload.discount) || 0;
    const vatRate = payload.vat_rate !== undefined && payload.vat_rate !== null && Number.isFinite(Number(payload.vat_rate))
      ? Number(payload.vat_rate)
      : 5;
    const taxable = Math.max(0, subtotal - discount);
    const vatAmount = Math.round(taxable * vatRate) / 100;
    const total = taxable + vatAmount;

    const newJobCard: any = {
      id: jobCardId,
      workspace_id: targetWsId,
      job_card_number: jcNumber,
      invoice_number: assignedInvoiceNumber,
      invoice_number_mode: payload.invoice_number_mode || "auto",
      payment_status: payload.payment_status || "Pending",
      date: payload.date || new Date().toISOString().slice(0, 10),
      customer_id: payload.customer_id,
      vehicle_id: payload.vehicle_id,
      mileage_in: payload.mileage_in || null,
      customer_complaint: payload.customer_complaint || null,
      work_details: payload.work_details || null,
      discount,
      subtotal,
      vat_rate: vatRate,
      vat_amount: vatAmount,
      total,
      paid: 0,
      balance: total,
      status: payload.status || "new",
      assigned_mechanic: payload.assigned_mechanic || null,
      notes: payload.notes || null,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      customer: realCust,
      vehicle: realVeh,
      items: itemRecords,
    };

    // Deduct stock in local inventory ledger
    if (payload.status !== "cancelled") {
      for (const it of items) {
        if ((it.item_type === "part" || (it.item_type as string) === "spare_part") && it.part_id) {
          const qty = Number(it.quantity) || 1;
          if (qty > 0) {
            await recordStockTransaction({
              partId: it.part_id,
              transactionType: "job_card_usage",
              quantityChange: -qty,
              unitCost: it.cost_price,
              referenceType: "job_card",
              referenceId: jobCardId,
              notes: `Job Card #${assignedInvoiceNumber}`,
            });
          }
        }
      }
    }

    local.unshift(newJobCard);
    saveLocalJobCards(local, targetWsId);

    return newJobCard as JobCardWithRelations;
  }
}

export async function updateJobCard(
  id: string,
  payload: JobCardUpdate,
  items?: JobCardItemInput[]
) {
  const supabase = createClient();

  const existingRecord = await getJobCardById(id);
  if (!existingRecord) {
    throw new Error(`Job Card #${id} not found.`);
  }

  const wasCancelled = existingRecord.status === "cancelled" || !!existingRecord.is_deleted;
  const willBeCancelled = payload.status === "cancelled" || payload.is_deleted === true;
  const invoiceNum = existingRecord.invoice_number || existingRecord.job_card_number || id;

  // 1. Calculate previously allocated parts usage
  const oldPartQtyMap = new Map<string, number>();
  if (!wasCancelled && existingRecord.items) {
    existingRecord.items.forEach((it) => {
      if ((it.item_type === "part" || (it.item_type as string) === "spare_part") && it.part_id) {
        const prev = oldPartQtyMap.get(it.part_id) || 0;
        oldPartQtyMap.set(it.part_id, prev + (Number(it.quantity) || 1));
      }
    });
  }

  // 2. Calculate new parts requirement
  const newPartQtyMap = new Map<string, number>();
  const effectiveItems = items !== undefined ? items : (existingRecord.items || []);

  if (!willBeCancelled && effectiveItems) {
    for (const it of effectiveItems) {
      if ((it.item_type === "part" || (it.item_type as string) === "spare_part") && it.part_id) {
        const prev = newPartQtyMap.get(it.part_id) || 0;
        newPartQtyMap.set(it.part_id, prev + (Number(it.quantity) || 1));

        if (it.cost_price === undefined) {
          const part = await getPartById(it.part_id);
          it.cost_price = part ? Number(part.purchase_price) || 0 : 0;
        }
      }
    }
  }

  // 3. Validate stock availability on positive deltas
  const allPartIds = new Set([...oldPartQtyMap.keys(), ...newPartQtyMap.keys()]);
  for (const partId of allPartIds) {
    const oldQty = oldPartQtyMap.get(partId) || 0;
    const newQty = newPartQtyMap.get(partId) || 0;
    const delta = newQty - oldQty;

    if (delta > 0) {
      const part = await getPartById(partId);
      if (part && part.current_stock < delta) {
        throw new Error(
          `Insufficient stock for "${part.name}". Available stock is ${part.current_stock}, requested additional ${delta} unit(s).`
        );
      }
    }
  }

  // 4. Apply inventory stock delta adjustments
  for (const partId of allPartIds) {
    const oldQty = oldPartQtyMap.get(partId) || 0;
    const newQty = newPartQtyMap.get(partId) || 0;
    const delta = newQty - oldQty;

    if (delta > 0) {
      // Additional units used
      const part = await getPartById(partId);
      const unitCost = part ? Number(part.purchase_price) || 0 : undefined;
      await recordStockTransaction({
        partId,
        transactionType: "job_card_usage",
        quantityChange: -delta,
        unitCost,
        referenceType: "job_card",
        referenceId: id,
        notes: `Job Card #${invoiceNum} (Used +${delta} unit(s))`,
      });
    } else if (delta < 0) {
      // Units returned / reduced / cancelled
      const part = await getPartById(partId);
      const unitCost = part ? Number(part.purchase_price) || 0 : undefined;
      const returnedQty = Math.abs(delta);
      await recordStockTransaction({
        partId,
        transactionType: willBeCancelled ? "job_card_reversal" : "return",
        quantityChange: returnedQty,
        unitCost,
        referenceType: "job_card",
        referenceId: id,
        notes: willBeCancelled
          ? `Job Card #${invoiceNum} Cancelled (Returned ${returnedQty} unit(s))`
          : `Job Card #${invoiceNum} (Returned ${returnedQty} unit(s))`,
      });
    }
  }

  try {
    // 5. Update job card header in Supabase
    const { data: updatedHeader, error: jcError } = await withTimeout<any>(
      supabase
        .from("job_cards")
        .update({
          ...payload,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select()
        .single(),
      2000
    );

    if (jcError) throw jcError;

    // 6. Update items in Supabase if items array was provided
    if (items) {
      await withTimeout<any>(
        supabase.from("job_card_items").delete().eq("job_card_id", id),
        2000
      );

      if (items.length > 0) {
        const itemsWithJcId = items.map((it) => {
          const itemType = ((it.item_type as string) === "spare_part" ? "part" : it.item_type) as any;
          return {
            job_card_id: id,
            item_type: itemType,
            service_id: it.service_id || null,
            part_id: it.part_id || null,
            description: it.description,
            quantity: it.quantity || 1,
            unit_price: it.unit_price || 0,
            cost_price: it.cost_price || 0,
            labour_charge: it.labour_charge || 0,
            total_price: it.total_price || 0,
          };
        });

        await withTimeout<any>(
          supabase.from("job_card_items").insert(itemsWithJcId),
          2000
        );
      }
    }

    return await getJobCardById(id);
  } catch (err: any) {
    console.warn(`Updating job card ${id} in local fallback store:`, err.message || err);

    let local = getLocalJobCards();
    const idx = local.findIndex((jc) => jc.id === id);

    if (idx !== -1) {
      const existing = local[idx];
      let subtotal = existing.subtotal;
      let itemRecords = existing.items;

      if (items) {
        let sTotal = 0;
        let lTotal = 0;
        let pTotal = 0;

        itemRecords = items.map((it) => {
          const q = Number(it.quantity) || 1;
          const p = Number(it.unit_price) || 0;
          const l = Number(it.labour_charge) || 0;
          const cost = Number(it.cost_price) || 0;
          const itemType = ((it.item_type as string) === "spare_part" ? "part" : it.item_type) as any;
          const lineTotal = itemType === "service" ? (q * p + l) : (q * p);

          if (itemType === "service") {
            sTotal += (q * p);
            lTotal += l;
          } else if (itemType === "part") {
            pTotal += (q * p);
          }

          return {
            id: it.id || "item-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
            job_card_id: id,
            item_type: itemType,
            service_id: it.service_id || null,
            part_id: it.part_id || null,
            description: it.description,
            quantity: q,
            unit_price: p,
            cost_price: cost,
            labour_charge: l,
            total_price: lineTotal,
            created_at: new Date().toISOString(),
          };
        });

        subtotal = sTotal + lTotal + pTotal;
      }

      const allCustomers = getLocalCustomers();
      const allVehicles = getLocalVehicles();
      const updatedCustId = payload.customer_id !== undefined ? payload.customer_id : existing.customer_id;
      const updatedVehId = payload.vehicle_id !== undefined ? payload.vehicle_id : existing.vehicle_id;
      const realCust = allCustomers.find((c) => c.id === updatedCustId) || existing.customer || null;
      const realVeh = allVehicles.find((v) => v.id === updatedVehId) || existing.vehicle || null;

      const discount = payload.discount !== undefined ? Number(payload.discount) : existing.discount;
      const vatRate = payload.vat_rate !== undefined ? Number(payload.vat_rate) : existing.vat_rate;
      const taxable = Math.max(0, subtotal - discount);
      const vatAmount = Math.round(taxable * vatRate) / 100;
      const total = taxable + vatAmount;

      const preservedInvoiceNumber = existing.invoice_number || getNextInvoiceNumber();
      const updatedPaymentStatus = payload.payment_status !== undefined ? payload.payment_status : (existing.payment_status || "Pending");

      local[idx] = {
        ...existing,
        ...payload,
        invoice_number: preservedInvoiceNumber,
        payment_status: updatedPaymentStatus,
        customer_id: updatedCustId,
        vehicle_id: updatedVehId,
        customer: realCust,
        vehicle: realVeh,
        subtotal,
        discount,
        vat_rate: vatRate,
        vat_amount: vatAmount,
        total,
        balance: total - (existing.paid || 0),
        items: itemRecords,
        updated_at: new Date().toISOString(),
      };

      saveLocalJobCards(local);
      return local[idx] as JobCardWithRelations;
    }
    throw err;
  }
}

export async function updateJobCardStatus(id: string, status: JobCardStatus) {
  return updateJobCard(id, { status });
}

export async function deleteJobCard(id: string, softDelete = true) {
  const supabase = createClient();

  // Return parts back to inventory on cancellation / deletion
  try {
    const existing = await getJobCardById(id);
    if (existing && existing.items && existing.status !== "cancelled" && !existing.is_deleted) {
      for (const it of existing.items) {
        if ((it.item_type === "part" || (it.item_type as string) === "spare_part") && it.part_id) {
          const q = Number(it.quantity) || 0;
          if (q > 0) {
            await recordStockTransaction({
              partId: it.part_id,
              transactionType: "job_card_reversal",
              quantityChange: q,
              referenceType: "job_card",
              referenceId: id,
              notes: `Job Card Void/Delete (Returned ${q} unit(s))`,
            });
          }
        }
      }
    }
  } catch (err) {
    console.warn("Returning parts notice on delete:", err);
  }

  try {
    if (softDelete) {
      const { error } = await supabase
        .from("job_cards")
        .update({
          is_deleted: true,
          deleted_at: new Date().toISOString(),
          status: "cancelled",
        })
        .eq("id", id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("job_cards").delete().eq("id", id);
      if (error) throw error;
    }
    return true;
  } catch (err: any) {
    console.warn("Deleting/voiding job card in local store fallback:", err.message || err);
    let local = getLocalJobCards();
    if (softDelete) {
      local = local.map((jc) =>
        jc.id === id
          ? {
              ...jc,
              is_deleted: true,
              deleted_at: new Date().toISOString(),
              status: "cancelled",
            }
          : jc
      );
    } else {
      local = local.filter((jc) => jc.id !== id);
    }
    saveLocalJobCards(local);
    return true;
  }
}
