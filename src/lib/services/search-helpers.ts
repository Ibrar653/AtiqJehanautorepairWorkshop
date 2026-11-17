import type { SupabaseClient } from "@supabase/supabase-js";
import {
  sanitizePostgrestValue,
  buildSeparatorTolerantPattern,
  buildFuzzyWildcardPatterns,
  isShortNumericQuery,
  scoreFieldMatch,
} from "./smart-search-engine";

export function sanitizePostgrestSearch(raw: string): string {
  return sanitizePostgrestValue(raw);
}

export function buildFuzzyLikePattern(term: string): string {
  return buildSeparatorTolerantPattern(term);
}

export function tokenizeSearchQuery(raw: string): string[] {
  const clean = sanitizePostgrestValue(raw);
  if (!clean) return [];
  return clean.split(/\s+/).filter(Boolean);
}

/**
 * Resolves customer IDs in the active workspace matching name, mobile, company_name, email, or TRN.
 * Supports exact, prefix, substring, separator-insensitive, and typo-tolerant fuzzy matching.
 */
export async function searchMatchingCustomerIds(
  supabase: SupabaseClient,
  workspaceId: string,
  search: string,
  limit = 150
): Promise<string[]> {
  const clean = sanitizePostgrestValue(search);
  if (!clean) return [];

  const tokens = tokenizeSearchQuery(clean);
  const fuzzyPatterns = tokens.length === 1 ? buildFuzzyWildcardPatterns(clean) : [];

  let q = supabase
    .from("customers")
    .select("id, name, mobile, company_name, email, trn_number")
    .eq("workspace_id", workspaceId)
    .eq("is_deleted", false);

  if (tokens.length > 1) {
    for (const token of tokens) {
      const pat = buildSeparatorTolerantPattern(token);
      q = q.or(
        `name.ilike.${pat},mobile.ilike.${pat},company_name.ilike.${pat},email.ilike.${pat},trn_number.ilike.${pat}`
      );
    }
  } else {
    const pat = buildSeparatorTolerantPattern(clean);
    const orClauses = [
      `name.ilike.${pat}`,
      `mobile.ilike.${pat}`,
      `company_name.ilike.${pat}`,
      `email.ilike.${pat}`,
      `trn_number.ilike.${pat}`,
    ];
    for (const fPat of fuzzyPatterns) {
      orClauses.push(`name.ilike.${fPat}`, `company_name.ilike.${fPat}`);
    }
    q = q.or(orClauses.join(","));
  }

  const { data, error } = await q.limit(limit);
  if (error) {
    throw new Error(`Customer search failed: ${error.message}`);
  }

  // Filter out false-positive wildcard candidates using strict similarity scoring
  return (data || [])
    .filter((row: any) => {
      const fields = [row.name, row.mobile, row.company_name, row.email, row.trn_number];
      return fields.some((val) => scoreFieldMatch(clean, val).tier !== "none");
    })
    .map((row: { id: string }) => row.id);
}

/**
 * Resolves vehicle IDs in the active workspace matching make, model, registration/plate number, or chassis/VIN.
 * Supports multi-word queries ("Toyota Land Cruiser"), separator-insensitive plates ("GSS23456" <-> "GSS-23456"),
 * and typo-tolerant fuzzy matches ("Toyta" -> "Toyota", "Corola" -> "Corolla", "GSS23457" -> "GSS-23456").
 */
export async function searchMatchingVehicleIds(
  supabase: SupabaseClient,
  workspaceId: string,
  search: string,
  limit = 150
): Promise<string[]> {
  const clean = sanitizePostgrestValue(search);
  if (!clean) return [];

  const tokens = tokenizeSearchQuery(clean);
  const fuzzyPatterns = tokens.length === 1 ? buildFuzzyWildcardPatterns(clean) : [];

  let q = supabase
    .from("vehicles")
    .select("id, make, model, registration_number, chassis_vin")
    .eq("workspace_id", workspaceId)
    .eq("is_deleted", false);

  if (tokens.length > 1) {
    for (const token of tokens) {
      const pat = buildSeparatorTolerantPattern(token);
      q = q.or(
        `make.ilike.${pat},model.ilike.${pat},registration_number.ilike.${pat},chassis_vin.ilike.${pat}`
      );
    }
  } else {
    const pat = buildSeparatorTolerantPattern(clean);
    const orClauses = [
      `make.ilike.${pat}`,
      `model.ilike.${pat}`,
      `registration_number.ilike.${pat}`,
      `chassis_vin.ilike.${pat}`,
    ];
    for (const fPat of fuzzyPatterns) {
      orClauses.push(
        `make.ilike.${fPat}`,
        `model.ilike.${fPat}`,
        `registration_number.ilike.${fPat}`
      );
    }
    q = q.or(orClauses.join(","));
  }

  const { data, error } = await q.limit(limit);
  if (error) {
    throw new Error(`Vehicle search failed: ${error.message}`);
  }

  return (data || [])
    .filter((row: any) => {
      const combined = `${row.make || ""} ${row.model || ""}`.trim();
      const fields = [row.make, row.model, combined, row.registration_number, row.chassis_vin];
      return fields.some((val) => scoreFieldMatch(clean, val).tier !== "none");
    })
    .map((row: { id: string }) => row.id);
}

/**
 * Resolves job card IDs in the active workspace matching job_card_number or invoice_number.
 */
export async function searchMatchingJobCardIdsForInvoice(
  supabase: SupabaseClient,
  workspaceId: string,
  search: string,
  limit = 150
): Promise<string[]> {
  const clean = sanitizePostgrestValue(search);
  if (!clean) return [];

  const pat = buildSeparatorTolerantPattern(clean);
  const orParts = [`job_card_number.ilike.${pat}`];
  if (!isNaN(Number(clean)) && clean !== "") {
    orParts.push(`invoice_number.eq.${Number(clean)}`);
  }

  const { data, error } = await supabase
    .from("job_cards")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_deleted", false)
    .or(orParts.join(","))
    .limit(limit);

  if (error) {
    throw new Error(`Job card reference search failed: ${error.message}`);
  }
  return (data || []).map((row: { id: string }) => row.id);
}

/**
 * Resolves job card IDs whose line-item descriptions match the search query.
 */
export async function searchJobCardIdsByItemDescription(
  supabase: SupabaseClient,
  search: string,
  limit = 150
): Promise<string[]> {
  const clean = sanitizePostgrestValue(search);
  if (!clean) return [];

  const pat = buildSeparatorTolerantPattern(clean);
  const { data, error } = await supabase
    .from("job_card_items")
    .select("job_card_id")
    .ilike("description", pat)
    .limit(limit);

  if (error) {
    console.warn("Job card item description search warning:", error.message);
    return [];
  }
  const unique = new Set<string>();
  for (const row of data || []) {
    if (row.job_card_id) unique.add(row.job_card_id);
  }
  return Array.from(unique);
}

/**
 * Resolves invoice IDs whose line-item descriptions match the search query.
 */
export async function searchInvoiceIdsByItemDescription(
  supabase: SupabaseClient,
  search: string,
  limit = 150
): Promise<string[]> {
  const clean = sanitizePostgrestValue(search);
  if (!clean) return [];

  const pat = buildSeparatorTolerantPattern(clean);
  const { data, error } = await supabase
    .from("invoice_items")
    .select("invoice_id")
    .ilike("description", pat)
    .limit(limit);

  if (error) {
    console.warn("Invoice item description search warning:", error.message);
    return [];
  }
  const unique = new Set<string>();
  for (const row of data || []) {
    if (row.invoice_id) unique.add(row.invoice_id);
  }
  return Array.from(unique);
}

/**
 * Resolves supplier IDs in the active workspace matching name, company_name, contact_person, phone, or TRN.
 */
export async function searchMatchingSupplierIds(
  supabase: SupabaseClient,
  workspaceId: string,
  search: string,
  limit = 150
): Promise<string[]> {
  const clean = sanitizePostgrestValue(search);
  if (!clean) return [];

  const pat = buildSeparatorTolerantPattern(clean);
  const { data, error } = await supabase
    .from("suppliers")
    .select("id")
    .eq("workspace_id", workspaceId)
    .or("is_deleted.is.null,is_deleted.eq.false")
    .or(
      `name.ilike.${pat},company_name.ilike.${pat},contact_person.ilike.${pat},phone.ilike.${pat},trn_number.ilike.${pat}`
    )
    .limit(limit);

  if (error) {
    throw new Error(`Supplier search failed: ${error.message}`);
  }
  return (data || []).map((row: { id: string }) => row.id);
}

export { isShortNumericQuery };
