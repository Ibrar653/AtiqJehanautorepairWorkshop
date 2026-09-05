-- ==============================================================================
-- Migration 028: Workspace User Access Governance & Safe Offboarding
-- ==============================================================================
-- 1. Adds removed_by to workspace_members.
-- 2. Adds deleted_at and deleted_by to users for safe account deactivation.
-- 3. Updates get_auth_user_workspaces() to strictly require status = 'active'
--    for workspace memberships and exclude archived workspaces.
-- ==============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_members' AND column_name = 'removed_by'
  ) THEN
    ALTER TABLE workspace_members ADD COLUMN removed_by TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'deleted_at'
  ) THEN
    ALTER TABLE users ADD COLUMN deleted_at TIMESTAMPTZ NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'deleted_by'
  ) THEN
    ALTER TABLE users ADD COLUMN deleted_by TEXT NULL;
  END IF;
END $$;

-- Update get_auth_user_workspaces() to strictly exclude removed memberships
CREATE OR REPLACE FUNCTION get_auth_user_workspaces()
RETURNS TABLE (allowed_workspace_id TEXT) AS $$
BEGIN
  -- Primary platform owner sees all active/unarchived workspaces
  IF (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com' THEN
    RETURN QUERY 
    SELECT id FROM workspaces 
    WHERE status != 'archived';
  ELSE
    -- Other users only see workspaces where their membership is ACTIVE and workspace is ACTIVE
    RETURN QUERY 
    SELECT wm.workspace_id 
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE (
      wm.user_id = auth.uid()::text 
      OR wm.user_id = (auth.jwt() ->> 'email')
    )
    AND wm.status = 'active'
    AND w.status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
