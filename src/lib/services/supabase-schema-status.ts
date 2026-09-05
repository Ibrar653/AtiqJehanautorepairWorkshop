/**
 * Utility to track missing Supabase PostgREST tables.
 * When Supabase returns PGRST205 ("Could not find the table in the schema cache"),
 * this utility caches that state so subsequent calls don't spam the browser network
 * panel with duplicate 404 errors.
 */

const missingTables = new Set<string>();

export function isTableMissingInSupabase(tableName: string): boolean {
  return missingTables.has(tableName);
}

export function markTableMissingInSupabase(tableName: string, error?: any): void {
  const isSchemaCacheError =
    error?.code === "PGRST205" ||
    error?.code === "42P01" ||
    (typeof error?.message === "string" &&
      (error.message.includes("schema cache") || error.message.includes("does not exist")));

  if (isSchemaCacheError || error?.status === 404) {
    if (!missingTables.has(tableName)) {
      missingTables.add(tableName);
      if (process.env.NODE_ENV === "development") {
        console.info(
          `[Supabase] Table 'public.${tableName}' is not initialized in Supabase yet. Using local storage fallback. Run 'supabase/complete_schema_setup.sql' in your Supabase SQL Editor to initialize cloud tables.`
        );
      }
    }
  }
}

export function clearMissingTableStatus(tableName?: string): void {
  if (tableName) {
    missingTables.delete(tableName);
  } else {
    missingTables.clear();
  }
}
