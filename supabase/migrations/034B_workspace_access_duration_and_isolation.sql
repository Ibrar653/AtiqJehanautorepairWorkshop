-- ==============================================================================
-- Migration 034B: Workspace Access Duration, Membership Expiration & Strict Isolation
-- ATIQ JEHAN AUTO WORKSHOP MANAGEMENT SYSTEM
-- ==============================================================================

BEGIN;

-- 1. Add time-limited access columns to public.workspace_members
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS access_starts_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS access_duration VARCHAR(50) DEFAULT 'no_expiry';

-- 2. Cleanly replace the workspace_members_status_check constraint to include 'expired'
ALTER TABLE public.workspace_members 
  DROP CONSTRAINT IF EXISTS workspace_members_status_check;

ALTER TABLE public.workspace_members 
  ADD CONSTRAINT workspace_members_status_check 
  CHECK (
    status IN (
      'pending',
      'active',
      'expired',
      'suspended',
      'rejected',
      'removed'
    )
  );

-- 3. Safely backfill access_starts_at for EXISTING active memberships only
-- Pending memberships remain NULL until approved
UPDATE public.workspace_members
SET 
  access_starts_at = COALESCE(access_starts_at, joined_at, created_at, now()),
  access_duration = COALESCE(access_duration, 'no_expiry')
WHERE status = 'active' AND access_starts_at IS NULL;

-- 4. Ensure existing active memberships with NULL access_expires_at remain 'no_expiry'
UPDATE public.workspace_members
SET 
  access_duration = 'no_expiry'
WHERE status = 'active' AND access_expires_at IS NULL AND (access_duration IS NULL OR access_duration = '');

-- 5. High-performance composite indexes for real-time security & status checks
CREATE INDEX IF NOT EXISTS idx_workspace_members_access_lookup
  ON public.workspace_members(workspace_id, user_id, status, access_expires_at);

CREATE INDEX IF NOT EXISTS idx_workspace_members_active_lookup
  ON public.workspace_members(workspace_id, status);

CREATE INDEX IF NOT EXISTS idx_workspace_members_expiry
  ON public.workspace_members(access_expires_at)
  WHERE access_expires_at IS NOT NULL;

-- 6. UPGRADE MIGRATION 033 HELPER: is_active_workspace_member
-- Redefined with strict expiration checks: status = 'active' AND (access_expires_at IS NULL OR now() < access_expires_at)
CREATE OR REPLACE FUNCTION public.is_active_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_workspace_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND (
        access_expires_at IS NULL
        OR now() < access_expires_at
      )
  );
END;
$$;

-- 7. UPGRADE MIGRATION 033 HELPER: is_active_workspace_owner
-- Uses is_workspace_owner = true, status = 'active', and access unexpired
CREATE OR REPLACE FUNCTION public.is_active_workspace_owner(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR p_workspace_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND is_workspace_owner = true
      AND status = 'active'
      AND (
        access_expires_at IS NULL
        OR now() < access_expires_at
      )
  );
END;
$$;

-- 8. SECURITY HELPER: has_valid_workspace_access
-- Platform Admin: platform_admins.user_id = auth.uid() AND platform_admins.status = 'active'
-- Normal member: active, unexpired workspace member
CREATE OR REPLACE FUNCTION public.has_valid_workspace_access(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Platform Admin check
  IF EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = auth.uid()
      AND status = 'active'
  ) THEN
    RETURN TRUE;
  END IF;

  -- Active, unexpired workspace member check
  IF p_workspace_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = auth.uid()
      AND status = 'active'
      AND (
        access_expires_at IS NULL
        OR now() < access_expires_at
      )
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;

-- 9. FUNCTION PERMISSIONS: Lock down public/anon, grant only to authenticated
REVOKE EXECUTE ON FUNCTION public.is_active_workspace_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_workspace_member(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_workspace_member(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_active_workspace_owner(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_workspace_owner(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_workspace_owner(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_valid_workspace_access(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_valid_workspace_access(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_valid_workspace_access(UUID) TO authenticated;

COMMIT;
