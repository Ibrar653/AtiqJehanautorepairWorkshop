-- Migration 029: Link Ibrar Workspace & Supabase Auth User
-- Ensures the existing ibrar workspace is properly registered and user 081056bf-d01c-49da-8e55-7684bd043c1e is linked as active workspace_owner.

-- 1. Ensure the existing ibrar workspace exists in public.workspaces
INSERT INTO public.workspaces (
  id,
  name,
  business_name,
  owner_user_id,
  owner_name,
  owner_email,
  phone,
  address,
  country,
  currency,
  status,
  users_count,
  created_at,
  updated_at
) VALUES (
  'ws-ibrar-mtl907qk',
  'ibrar',
  'ibrar',
  '081056bf-d01c-49da-8e55-7684bd043c1e',
  'Ibrar Ahmad',
  'ibrarahmad0987a@gmail.com',
  NULL,
  'Abu dhabi',
  'United Arab Emirates',
  'AED',
  'active',
  1,
  '2026-09-03T08:13:34.124Z',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = 'ibrar',
  business_name = 'ibrar',
  owner_user_id = '081056bf-d01c-49da-8e55-7684bd043c1e',
  owner_email = 'ibrarahmad0987a@gmail.com',
  status = 'active',
  updated_at = NOW();

-- 2. Ensure public.users has the corresponding record for this user
INSERT INTO public.users (
  id,
  name,
  email,
  role,
  is_active,
  status,
  created_at,
  updated_at
) VALUES (
  '081056bf-d01c-49da-8e55-7684bd043c1e',
  'Ibrar Ahmad',
  'ibrarahmad0987a@gmail.com',
  'workspace_owner',
  true,
  'active',
  '2026-09-03T08:13:34.124Z',
  NOW()
) ON CONFLICT (id) DO UPDATE SET
  name = 'Ibrar Ahmad',
  email = 'ibrarahmad0987a@gmail.com',
  role = 'workspace_owner',
  is_active = true,
  status = 'active',
  updated_at = NOW();

-- 3. Link the user to the ibrar workspace in public.workspace_members as active workspace_owner
INSERT INTO public.workspace_members (
  id,
  workspace_id,
  user_id,
  role,
  status,
  is_workspace_owner,
  joined_at,
  updated_at
) VALUES (
  'wm-ibrar-mtl907qk-owner',
  'ws-ibrar-mtl907qk',
  '081056bf-d01c-49da-8e55-7684bd043c1e',
  'workspace_owner',
  'active',
  true,
  '2026-09-03T08:13:34.124Z',
  NOW()
) ON CONFLICT (workspace_id, user_id) DO UPDATE SET
  role = 'workspace_owner',
  status = 'active',
  is_workspace_owner = true,
  updated_at = NOW();

-- 4. Audit log entry for governance
INSERT INTO public.workspace_audit_logs (
  id,
  workspace_id,
  action,
  user_id,
  user_name,
  details,
  created_at
) VALUES (
  gen_random_uuid(),
  'ws-ibrar-mtl907qk',
  'MEMBER_ROLE_CHANGED',
  '081056bf-d01c-49da-8e55-7684bd043c1e',
  'Ibrar Ahmad',
  'Linked Supabase Auth user 081056bf-d01c-49da-8e55-7684bd043c1e as active workspace_owner of ibrar workspace',
  NOW()
);
