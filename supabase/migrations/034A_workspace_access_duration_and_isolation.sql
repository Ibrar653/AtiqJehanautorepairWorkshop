-- ==============================================================================
-- Migration 034A: Workspace Staff Isolation & Time-Limited Access
-- Description: Adds duration tracking, automatic expiry enforcement, and
--              RLS helper functions for time-limited workspace memberships.
-- Constraints: Wrapped in a single transaction (BEGIN ... COMMIT).
--              Zero modification to business tables (customers, invoices, etc).
--              Existing active memberships with NULL access_expires_at remain No Expiry.
-- ==============================================================================

BEGIN;

-- 1. Extend public.workspace_members with access timing columns
ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS access_starts_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS access_expires_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS access_duration VARCHAR(50) NULL DEFAULT 'no_expiry';

-- 2. Update status check constraint on workspace_members cleanly
ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_status_check;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_status_check
  CHECK (status IN ('pending', 'active', 'expired', 'suspended', 'rejected', 'removed'));

-- 3. High-performance lookup indexes for access validation and workspace scoping
CREATE INDEX IF NOT EXISTS idx_workspace_members_access_lookup
  ON public.workspace_members (workspace_id, user_id, status, access_expires_at);

CREATE INDEX IF NOT EXISTS idx_workspace_members_active_scope
  ON public.workspace_members (workspace_id, status);

-- 4. Update Helper 1: is_active_workspace_member (Migration 033 function upgraded with expiry check)
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

-- 5. Update Helper 2: is_active_workspace_owner (Migration 033 function upgraded with expiry check)
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
      AND status = 'active'
      AND is_workspace_owner = TRUE
      AND (
        access_expires_at IS NULL
        OR now() < access_expires_at
      )
  );
END;
$$;

-- 6. Create Helper 3: has_valid_workspace_access (Comprehensive Platform Admin + Active Membership Check)
CREATE OR REPLACE FUNCTION public.has_valid_workspace_access(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_platform_admin BOOLEAN := FALSE;
  v_has_active_membership BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL OR p_workspace_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- 1. Platform Admin retains global administrative access
  SELECT TRUE INTO v_is_platform_admin
  FROM public.platform_admins
  WHERE user_id = auth.uid()
    AND status = 'active'
  LIMIT 1;

  IF v_is_platform_admin IS TRUE THEN
    RETURN TRUE;
  END IF;

  -- 2. Normal member must hold an active, unexpired membership in the requested workspace
  SELECT TRUE INTO v_has_active_membership
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid()
    AND status = 'active'
    AND (
      access_expires_at IS NULL
      OR now() < access_expires_at
    )
  LIMIT 1;

  RETURN COALESCE(v_has_active_membership, FALSE);
END;
$$;

-- 7. Secure Function Permissions
REVOKE EXECUTE ON FUNCTION public.has_valid_workspace_access(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_valid_workspace_access(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_valid_workspace_access(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_active_workspace_member(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_workspace_member(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_workspace_member(UUID) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_active_workspace_owner(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_active_workspace_owner(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_active_workspace_owner(UUID) TO authenticated;

-- 8. Default existing active memberships without an expiry to No Expiry (NULL)
UPDATE public.workspace_members
SET access_expires_at = NULL,
    access_duration = 'no_expiry'
WHERE status = 'active'
  AND access_expires_at IS NULL;

COMMIT;
