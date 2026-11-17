import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Sanitizes a user search string for safe inclusion inside PostgREST `.or(...)` filter expressions.
 * Strips commas and parentheses which are PostgREST filter syntax delimiters.
 */
export function sanitizePostgrestSearch(raw: string): string {
  return raw.replace(/[,()]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Builds a case-insensitive PostgREST ILIKE pattern that treats spaces and hyphens
 * flexibly (e.g. "AD-12345" or "AD 12345" -> "%AD%12345%").
 */
export function buildFuzzyLikePattern(term: string): string {
  const clean = sanitizePostgrestSearch(term);
  if (!clean) return "%";
  return `%${clean.replace(/[\s\-]+/g, "%")}%`;
}

/**
 * Splits a search query into individual non-empty tokens for multi-word matching
 * (e.g. "Toyota Land Cruiser" -> ["Toyota", "Land", "Cruiser"]).
 */
export function tokenizeSearchQuery(raw: string): string[] {
  const clean = sanitizePostgrestSearch(raw);
  if (!clean) return [];
  return clean.split(/\s+/).filter(Boolean);
}

/**
 * Resolves customer IDs in the active workspace matching name, mobile, company_name, email, or TRN.
 */
export async function searchMatchingCustomerIds(
  supabase: SupabaseClient,
  workspaceId: string,
  search: string,
  limit = 150
): Promise<string[]> {
  const clean = sanitizePostgrestSearch(search);
  if (!clean) return [];

  const tokens = tokenizeSearchQuery(clean);
  let q = supabase
    .from("customers")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_deleted", false);

  for (const token of tokens) {
    const pat = buildFuzzyLikePattern(token);
    q = q.or(
      `name.ilike.${pat},mobile.ilike.${pat},company_name.ilike.${pat},email.ilike.${pat},trn_number.ilike.${pat}`
    );
  }

  const { data, error } = await q.limit(limit);
  if (error) {
    throw new Error(`Customer search failed: ${error.message}`);
  }
  return (data || []).map((row: { id: string }) => row.id);
}

/**
 * Resolves vehicle IDs in the active workspace matching make, model, registration/plate number, or chassis/VIN.
 * Supports multi-word queries like "Toyota Land Cruiser" and plate formats with/without hyphens or spaces.
 */
export async function searchMatchingVehicleIds(
  supabase: SupabaseClient,
  workspaceId: string,
  search: string,
  limit = 150
): Promise<string[]> {
  const clean = sanitizePostgrestSearch(search);
  if (!clean) return [];

  const tokens = tokenizeSearchQuery(clean);
  let q = supabase
    .from("vehicles")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("is_deleted", false);

  for (const token of tokens) {
    const pat = buildFuzzyLikePattern(token);
    q = q.or(
      `make.ilike.${pat},model.ilike.${pat},registration_number.ilike.${pat},chassis_vin.ilike.${pat}`
    );
  }

  const { data, error } = await q.limit(limit);
  if (error) {
    throw new Error(`Vehicle search failed: ${error.message}`);
  }
  return (data || []).map((row: { id: string }) => row.id);
}

/**
 * Resolves job card IDs in the active workspace matching job_card_number, invoice_number,
 * or line-item descriptions (useful when linking invoices to job card searches).
 */
export async function searchMatchingJobCardIdsForInvoice(
  supabase: SupabaseClient,
  workspaceId: string,
  search: string,
  limit = 150
): Promise<string[]> {
  const clean = sanitizePostgrestSearch(search);
  if (!clean) return [];

  const pat = buildFuzzyLikePattern(clean);
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
  const clean = sanitizePostgrestSearch(search);
  if (!clean) return [];

  const pat = buildFuzzyLikePattern(clean);
  const { data, error } = await supabase
    .from("job_card_items")
    .select("job_card_id")
    .ilike("description", pat)
    .limit(limit);

  if (error) {
    // Non-fatal if item search fails; return empty
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
  const clean = sanitizePostgrestSearch(search);
  if (!clean) return [];

  const pat = buildFuzzyLikePattern(clean);
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
  const clean = sanitizePostgrestSearch(search);
  if (!clean) return [];

  const pat = buildFuzzyLikePattern(clean);
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
