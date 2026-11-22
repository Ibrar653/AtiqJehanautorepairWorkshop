-- ============================================================================
-- Migration 037: Multi-Model AI Agent Chat History & Audit Trail
-- NOTE: Non-destructive migration prepared for review and manual approval.
-- Do NOT run automatically against production without explicit approval.
-- Preserves full workspace isolation and Supabase Row-Level Security (RLS).
-- ============================================================================

-- 1. Workspace-scoped AI Conversations
CREATE TABLE IF NOT EXISTS ai_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Workshop Chat',
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'gemini')),
  model TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'ask' CHECK (mode IN ('ask', 'agent')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_ws_user
  ON ai_conversations (workspace_id, user_id, updated_at DESC);

-- 2. AI Conversation Messages (No API secrets stored)
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  tool_calls JSONB DEFAULT '[]'::jsonb,
  action_preview JSONB DEFAULT NULL,
  execution_log JSONB DEFAULT NULL,
  token_usage JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conv
  ON ai_messages (conversation_id, created_at ASC);

-- 3. AI Agent Action Execution Audit Log & Server-Side Idempotency Registry
CREATE TABLE IF NOT EXISTS ai_action_audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  conversation_id UUID REFERENCES ai_conversations(id) ON DELETE SET NULL,
  idempotency_key TEXT NOT NULL,
  action_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'partial')),
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_records JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_ws_created
  ON ai_action_audit_logs (workspace_id, created_at DESC);

-- 4. Enable Row-Level Security (RLS)
ALTER TABLE ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_action_audit_logs ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies: Users can only access their own records within active workspaces they belong to
DROP POLICY IF EXISTS ai_conversations_user_ws_policy ON ai_conversations;
CREATE POLICY ai_conversations_user_ws_policy ON ai_conversations
  FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_conversations.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_conversations.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS ai_messages_user_ws_policy ON ai_messages;
CREATE POLICY ai_messages_user_ws_policy ON ai_messages
  FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_messages.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_messages.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );

DROP POLICY IF EXISTS ai_action_audit_user_ws_policy ON ai_action_audit_logs;
CREATE POLICY ai_action_audit_user_ws_policy ON ai_action_audit_logs
  FOR ALL
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_action_audit_logs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  )
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.workspace_id = ai_action_audit_logs.workspace_id
        AND wm.user_id = auth.uid()
        AND wm.status = 'active'
    )
  );
