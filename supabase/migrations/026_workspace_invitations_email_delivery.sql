-- ==============================================================================
-- Migration 026: Workspace Invitations Email Delivery & Error Tracking
-- ==============================================================================
-- Adds 'sent' and 'failed' to invitation status check constraint.
-- Adds error_message and sent_at columns to track real Supabase Auth email delivery.
-- ==============================================================================

-- Drop old status check constraint and add updated one
DO $$
BEGIN
  ALTER TABLE workspace_invitations DROP CONSTRAINT IF EXISTS workspace_invitations_status_check;
  ALTER TABLE workspace_invitations ADD CONSTRAINT workspace_invitations_status_check 
    CHECK (status IN ('pending', 'sent', 'accepted', 'failed', 'expired', 'revoked'));
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Add error_message and sent_at columns if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_invitations' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE workspace_invitations ADD COLUMN error_message TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workspace_invitations' AND column_name = 'sent_at'
  ) THEN
    ALTER TABLE workspace_invitations ADD COLUMN sent_at TIMESTAMPTZ NULL;
  END IF;
END $$;
