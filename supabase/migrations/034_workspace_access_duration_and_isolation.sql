-- ==============================================================================
-- Migration 034: Workspace Access Duration, Time-Limited Expiry & Staff Isolation
-- ==============================================================================

-- 1. Extend workspace_members with time-limited access and duration fields
DO $$
BEGIN
  -- Add access_starts_at column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'workspace_members' 
      AND column_name = 'access_starts_at'
  ) THEN
    ALTER TABLE public.workspace_members ADD COLUMN access_starts_at TIMESTAMPTZ NULL;
  END IF;

  -- Add access_expires_at column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'workspace_members' 
      AND column_name = 'access_expires_at'
  ) THEN
    ALTER TABLE public.workspace_members ADD COLUMN access_expires_at TIMESTAMPTZ NULL;
  END IF;

  -- Add expired_at column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'workspace_members' 
      AND column_name = 'expired_at'
  ) THEN
    ALTER TABLE public.workspace_members ADD COLUMN expired_at TIMESTAMPTZ NULL;
  END IF;

  -- Add access_duration column if not exists (for duration metadata e.g. '30d', '3m', '1y', 'custom', 'no_expiry')
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'workspace_members' 
      AND column_name = 'access_duration'
  ) THEN
    ALTER TABLE public.workspace_members ADD COLUMN access_duration TEXT NULL DEFAULT 'no_expiry';
  END IF;
END $$;

-- 2. Update status constraint on workspace_members to support 'expired' status safely
DO $$
BEGIN
  -- Drop existing check constraint if present
  ALTER TABLE public.workspace_members DROP CONSTRAINT IF EXISTS workspace_members_status_check;
  
  -- Add updated check constraint including 'expired'
  ALTER TABLE public.workspace_members ADD CONSTRAINT workspace_members_status_check 
    CHECK (status IN ('pending', 'active', 'invited', 'suspended', 'expired', 'rejected', 'removed'));
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 3. Create indexes for high-performance membership and expiry lookups
CREATE INDEX IF NOT EXISTS idx_workspace_members_expiry 
  ON public.workspace_members (workspace_id, user_id, status, access_expires_at);

CREATE INDEX IF NOT EXISTS idx_workspace_members_status 
  ON public.workspace_members (workspace_id, status);

-- 4. Server-Side Secure Helper: has_valid_workspace_access
-- Checks that the user is an active member whose duration has not expired.
CREATE OR REPLACE FUNCTION public.has_valid_workspace_access(p_workspace_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_is_platform_admin BOOLEAN;
  v_member_record RECORD;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if user is an active platform admin (platform admins have global administrative privileges)
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins
    WHERE user_id = v_user_id AND status = 'active'
  ) INTO v_is_platform_admin;

  IF v_is_platform_admin THEN
    RETURN TRUE;
  END IF;

  -- Verify active membership in the requested workspace with unexpired duration
  SELECT id, status, access_expires_at
  INTO v_member_record
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = v_user_id
    AND status = 'active'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- If access_expires_at is set, verify that current time is before expiry
  IF v_member_record.access_expires_at IS NOT NULL AND NOW() >= v_member_record.access_expires_at THEN
    -- Optionally update status to 'expired'
    UPDATE public.workspace_members
    SET status = 'expired',
        expired_at = NOW(),
        updated_at = NOW()
    WHERE id = v_member_record.id;

    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- 5. Set default access_expires_at = NULL for existing active memberships (No Expiry)
UPDATE public.workspace_members
SET access_expires_at = NULL,
    access_duration = 'no_expiry'
WHERE access_expires_at IS NULL AND status = 'active';

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.has_valid_workspace_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_valid_workspace_access(UUID) TO service_role;
