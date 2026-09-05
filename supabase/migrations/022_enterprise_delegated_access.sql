-- ==============================================================================
-- Migration 022: Enterprise Delegated Staff Access & Protected Actions
-- ==============================================================================

-- 1. Add can_approve and protected_actions to user_permissions
ALTER TABLE IF EXISTS user_permissions
  ADD COLUMN IF NOT EXISTS can_approve BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS protected_actions JSONB NOT NULL DEFAULT '{}'::jsonb;

-- 2. Ensure status column on users can store all enterprise statuses:
-- 'invited', 'active', 'suspended', 'disabled', 'expired'
ALTER TABLE IF EXISTS users
  ALTER COLUMN status SET DEFAULT 'invited';

-- Update any legacy is_active synchronization trigger if present
CREATE OR REPLACE FUNCTION sync_user_status_is_active()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'active' THEN
    NEW.is_active := true;
  ELSE
    NEW.is_active := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_status_is_active ON users;
CREATE TRIGGER trg_sync_user_status_is_active
  BEFORE INSERT OR UPDATE OF status ON users
  FOR EACH ROW
  EXECUTE FUNCTION sync_user_status_is_active();
