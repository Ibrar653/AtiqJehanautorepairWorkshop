import { createClient, SupabaseClient } from "@supabase/supabase-js";

const DEFAULT_SUPABASE_URL = "https://dnrrwcccclulidhyglub.supabase.co";
export const ADMIN_AUTH_CONFIG_ERROR =
  "Server admin authentication is not configured. Add SUPABASE_SECRET_KEY to the server environment.";

/**
 * Check if the server-only Supabase admin secret key is configured.
 * Reads SUPABASE_SECRET_KEY (primary) or SUPABASE_SERVICE_ROLE_KEY (legacy fallback).
 */
export function isServerAdminConfigured(): boolean {
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(secretKey && secretKey.trim());
}

/**
 * Returns a dedicated, server-only Supabase client with elevated administrative privileges.
 *
 * CRITICAL SECURITY RULES:
 * - Use ONLY inside trusted server routes and server actions.
 * - NEVER import or execute in browser/client components.
 * - NEVER expose SUPABASE_SECRET_KEY via NEXT_PUBLIC_*, API responses, logs, or error messages.
 */
export function getAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secretKey || !secretKey.trim()) {
    throw new Error(ADMIN_AUTH_CONFIG_ERROR);
  }

  return createClient(supabaseUrl, secretKey.trim(), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
