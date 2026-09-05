-- ==============================================================================
-- Migration 027: Enterprise Multi-Workspace Governance & Second Owner Architecture
-- ==============================================================================
-- 1. Updates workspace_members to support 'removed' status, is_workspace_owner flag,
--    and removed_at timestamp for safe offboarding without data loss.
-- 2. Creates workspace_audit_logs table to track full lifecycle audit history.
-- 3. Updates get_auth_user_workspaces() to filter out suspended/archived workspaces.
-- ==============================================================================

-- 1. Update workspace_members status constraint and add columns
DO $$
BEGIN
  ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_status_check;
  ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_status_check 
    CHECK (status IN ('active', 'invited', 'pending', 'suspended', 'removed'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_members' AND column_name = 'is_workspace_owner'
  ) THEN
    ALTER TABLE workspace_members ADD COLUMN is_workspace_owner BOOLEAN DEFAULT false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_members' AND column_name = 'removed_at'
  ) THEN
    ALTER TABLE workspace_members ADD COLUMN removed_at TIMESTAMPTZ NULL;
  END IF;
END $$;

-- 2. Create Workspace Audit Logs Table
CREATE TABLE IF NOT EXISTS workspace_audit_logs (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by TEXT NOT NULL,
  target_user TEXT NULL,
  details JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_ws_id ON workspace_audit_logs(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_audit_logs_created_at ON workspace_audit_logs(created_at);

-- 3. Update get_auth_user_workspaces()
CREATE OR REPLACE FUNCTION get_auth_user_workspaces()
RETURNS TABLE (allowed_workspace_id TEXT) AS $$
BEGIN
  -- Primary platform owner sees all active workspaces
  IF (auth.jwt() ->> 'email') = 'atiqjehandaraz@gmail.com' THEN
    RETURN QUERY 
    SELECT id FROM workspaces 
    WHERE status != 'archived';
  ELSE
    -- Delegated owners and staff only see workspaces where their membership is active AND the workspace is active
    RETURN QUERY
    SELECT wm.workspace_id
    FROM workspace_members wm
    JOIN workspaces w ON w.id = wm.workspace_id
    WHERE (wm.user_id = auth.uid()::text OR wm.user_id = auth.jwt() ->> 'email')
      AND wm.status = 'active'
      AND w.status = 'active';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
