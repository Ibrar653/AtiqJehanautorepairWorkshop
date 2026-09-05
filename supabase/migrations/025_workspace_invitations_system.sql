-- ==============================================================================
-- Migration 025: Workspace Invitations & One-Time Activation System
-- ==============================================================================
-- Enables Primary Owner to create secondary workspaces, invite workspace owners/users
-- with granular module permissions, generate secure one-time activation codes,
-- and securely activate accounts with user-created passwords.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS workspace_invitations (
  id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  invited_user_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',
  token_hash TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  code_plain_preview TEXT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at TIMESTAMPTZ NOT NULL,
  invited_by TEXT NOT NULL,
  permissions JSONB NULL,
  data_scope TEXT NULL DEFAULT 'all',
  financial_visibility JSONB NULL,
  approval_limits JSONB NULL,
  accepted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Performance and lookup indexes
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_ws_id ON workspace_invitations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_email ON workspace_invitations(email);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_token_hash ON workspace_invitations(token_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_code_hash ON workspace_invitations(code_hash);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_status ON workspace_invitations(status);

-- Ensure workspace_members status includes 'pending'
DO $$
BEGIN
  ALTER TABLE workspace_members DROP CONSTRAINT IF EXISTS workspace_members_status_check;
  ALTER TABLE workspace_members ADD CONSTRAINT workspace_members_status_check CHECK (status IN ('active', 'invited', 'pending', 'suspended'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;
