import type {
  JobCardStatus,
  PaymentMethod,
  PaymentStatus,
  PurchasePaymentStatus,
  UserRole,
  ItemType,
  AppModule,
  UserModulePermission,
  HierarchyLevel,
  ProtectionRiskLevel,
  DataAccessScope,
  FinancialVisibilitySettings,
  UserApprovalLimits,
} from '@/types/database';

// ─── Application Constants ──────────────────────────────────────────────────

export const APP_NAME = 'ATIQ JEHAN';
export const COMPANY_FULL_NAME = 'ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.';
export const PRIMARY_OWNER_EMAIL = 'atiqjehandaraz@gmail.com';
export const DEFAULT_VAT_RATE = 5; // UAE standard VAT
export const CURRENCY = 'AED';

// ─── Multi-Workspace Constants ──────────────────────────────────────────────
export const DEFAULT_WORKSPACE_ID = 'ws-atiq-default-001';
export const DEFAULT_WORKSPACE_NAME = 'ATIQ JEHAN AUTO REPAIR';
export const DEFAULT_WORKSPACE_BUSINESS_NAME = 'ATIQ JEHAN AUTO REPAIR & USED SPARE PARTS L.L.C.';
export const WORKSPACE_STORAGE_KEY = 'atiq_active_workspace_id';

// ─── Job Card Statuses ──────────────────────────────────────────────────────

export const JOB_CARD_STATUSES: { value: JobCardStatus; label: string; color: string }[] = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'waiting', label: 'Waiting', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400' },
  { value: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
];

// ─── Payment Methods ────────────────────────────────────────────────────────

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank Transfer' },
  { value: 'credit', label: 'Credit / Outstanding' },
];

// ─── Payment Statuses ───────────────────────────────────────────────────────

export const PAYMENT_STATUSES: { value: PaymentStatus; label: string; color: string }[] = [
  { value: 'paid', label: 'Paid', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'partially_paid', label: 'Partially Paid', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'credit', label: 'Credit', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
];

// ─── Purchase Payment Statuses ──────────────────────────────────────────────

export const PURCHASE_PAYMENT_STATUSES: { value: PurchasePaymentStatus; label: string; color: string }[] = [
  { value: 'paid', label: 'Paid', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' },
  { value: 'partially_paid', label: 'Partially Paid', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  { value: 'unpaid', label: 'Unpaid', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
];

// ─── User Roles ─────────────────────────────────────────────────────────────

export const USER_ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: 'owner', label: 'Owner', description: 'Full system ownership, financial controls, and user administration' },
  { value: 'admin', label: 'Admin', description: 'Full administrative access to all modules' },
  { value: 'manager', label: 'Manager', description: 'Full operational control over workshop workflow without Owner access' },
  { value: 'receptionist', label: 'Receptionist', description: 'Customer check-in, vehicle records, job cards, and invoices' },
  { value: 'mechanic', label: 'Mechanic', description: 'View assigned job cards and update repair work status' },
  { value: 'storekeeper', label: 'Storekeeper', description: 'Spare parts, inventory stock, suppliers, and purchase orders' },
  { value: 'accountant', label: 'Accountant', description: 'Invoices, payments, expenses, ledger accounts, and reports' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to explicitly permitted modules' },
  { value: 'custom', label: 'Custom', description: 'Manually customized module and action permissions' },
];

export const STAFF_USER_ROLES: { value: UserRole; label: string; description: string }[] = [
  { value: 'manager', label: 'Manager', description: 'Full operational control over workshop workflow without Owner access' },
  { value: 'receptionist', label: 'Receptionist', description: 'Customer intake, job cards, services, invoices, and payments' },
  { value: 'mechanic', label: 'Mechanic', description: 'Assigned job cards inspection, repair notes, and progress updates' },
  { value: 'storekeeper', label: 'Storekeeper', description: 'Spare parts, inventory stock, suppliers, and purchase orders' },
  { value: 'accountant', label: 'Accountant', description: 'Invoices, payments, expenses, ledger accounts, and financial reports' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access to explicitly permitted modules' },
  { value: 'custom', label: 'Custom', description: 'Manually customized module and action permissions' },
];

// ─── All System Modules ─────────────────────────────────────────────────────

export interface AppModuleDefinition {
  id: AppModule;
  label: string;
  href: string;
  icon: string;
  description: string;
  sectionId: string;
  isFinancial?: boolean;
}

// ─── Enterprise Categorized Sections ────────────────────────────────────────

export interface ModuleSection {
  id: string;
  title: string;
  shortTitle: string;
  description: string;
  modules: AppModule[];
}

export const MODULE_SECTIONS: ModuleSection[] = [
  {
    id: 'section_operations',
    title: 'SECTION A — WORKSHOP OPERATIONS',
    shortTitle: 'Workshop Operations',
    description: 'Vehicle intake, customer profiles, repair orders, and labor services catalog',
    modules: ['dashboard', 'customers', 'job_cards', 'services'],
  },
  {
    id: 'section_inventory',
    title: 'SECTION B — INVENTORY & PROCUREMENT',
    shortTitle: 'Inventory & Procurement',
    description: 'Parts catalog, warehouse stock balances, supplier profiles, and purchase orders',
    modules: ['spare_parts', 'inventory', 'suppliers', 'purchases'],
  },
  {
    id: 'section_billing',
    title: 'SECTION C — BILLING & FINANCE',
    shortTitle: 'Billing & Finance',
    description: 'VAT tax invoices, payment receipts, workshop overhead expenses, and general ledger accounts',
    modules: ['invoices', 'payments', 'expenses', 'accounts'],
  },
  {
    id: 'section_reporting',
    title: 'SECTION D — REPORTING',
    shortTitle: 'Reporting & Analytics',
    description: 'Financial reports, sales analytics, VAT returns, and mechanic productivity metrics',
    modules: ['reports'],
  },
  {
    id: 'section_admin',
    title: 'SECTION E — ADMINISTRATION',
    shortTitle: 'System Administration',
    description: 'Soft-deleted records recovery, workshop system preferences, and staff user access governance',
    modules: ['recycle_bin', 'settings', 'user_access'],
  },
];

// ─── Protected Actions Definitions with Risk Badges ─────────────────────────

export interface ProtectedActionDef {
  key: string;
  module: AppModule;
  label: string;
  description: string;
  riskLevel: ProtectionRiskLevel;
  isOwnerDefaultOnly: boolean;
}

export const PROTECTED_ACTIONS: ProtectedActionDef[] = [
  // Purchases
  {
    key: 'finalize_purchase',
    module: 'purchases',
    label: 'Finalize Purchase',
    description: 'Approve vendor purchase order and commit received parts into stock ledger',
    riskLevel: 'FINANCIAL',
    isOwnerDefaultOnly: false,
  },
  {
    key: 'adjust_stock',
    module: 'purchases',
    label: 'Adjust Stock on Order',
    description: 'Modify received inventory count differing from original supplier bill',
    riskLevel: 'SENSITIVE',
    isOwnerDefaultOnly: false,
  },
  // Invoices
  {
    key: 'record_payment',
    module: 'invoices',
    label: 'Record Payment',
    description: 'Accept customer settlement and issue official payment receipt',
    riskLevel: 'FINANCIAL',
    isOwnerDefaultOnly: false,
  },
  {
    key: 'void_invoice',
    module: 'invoices',
    label: 'Void Invoice',
    description: 'Cancel posted VAT invoice and reverse accounts receivable',
    riskLevel: 'SENSITIVE',
    isOwnerDefaultOnly: false,
  },
  // Payments
  {
    key: 'reverse_payment',
    module: 'payments',
    label: 'Reverse Payment',
    description: 'Nullify customer payment transaction and restore outstanding invoice balance',
    riskLevel: 'FINANCIAL',
    isOwnerDefaultOnly: false,
  },
  // Inventory
  {
    key: 'manual_stock_adjustment',
    module: 'inventory',
    label: 'Manual Stock Adjustment',
    description: 'Directly alter on-hand spare parts quantities without an official purchase invoice',
    riskLevel: 'SENSITIVE',
    isOwnerDefaultOnly: false,
  },
  // Accounts / Ledger
  {
    key: 'add_manual_entry',
    module: 'accounts',
    label: 'Add Manual Entry',
    description: 'Post custom debits/credits directly into the chart of accounts',
    riskLevel: 'FINANCIAL',
    isOwnerDefaultOnly: false,
  },
  {
    key: 'transfer_money',
    module: 'accounts',
    label: 'Transfer Money',
    description: 'Transfer capital between workshop bank accounts and cash floats (Owner default only)',
    riskLevel: 'FINANCIAL',
    isOwnerDefaultOnly: true,
  },
  {
    key: 'manual_journal',
    module: 'accounts',
    label: 'Manual Journal',
    description: 'Create multi-line double-entry adjusting journal vouchers (Owner default only)',
    riskLevel: 'FINANCIAL',
    isOwnerDefaultOnly: true,
  },
  {
    key: 'reverse_transaction',
    module: 'accounts',
    label: 'Reverse Transaction',
    description: 'Post full reversal debit/credit entry on past financial audit record (Owner default only)',
    riskLevel: 'FINANCIAL',
    isOwnerDefaultOnly: true,
  },
  {
    key: 'view_bank_balances',
    module: 'accounts',
    label: 'View Bank Balances',
    description: 'Inspect exact liquidity, bank balances, and owner equity balances',
    riskLevel: 'FINANCIAL',
    isOwnerDefaultOnly: false,
  },
  // Recycle Bin
  {
    key: 'restore_record',
    module: 'recycle_bin',
    label: 'Restore Record',
    description: 'Restore soft-deleted customer, job card, or invoice records',
    riskLevel: 'STANDARD',
    isOwnerDefaultOnly: false,
  },
  {
    key: 'permanent_delete',
    module: 'recycle_bin',
    label: 'Permanent Delete',
    description: 'Permanently purge historical record from database (Owner default only)',
    riskLevel: 'ADMIN_ONLY',
    isOwnerDefaultOnly: true,
  },
  // User Access
  {
    key: 'invite_user',
    module: 'user_access',
    label: 'Invite User',
    description: 'Send invitation link to create new staff login credentials',
    riskLevel: 'ADMIN_ONLY',
    isOwnerDefaultOnly: true,
  },
  {
    key: 'change_permissions',
    module: 'user_access',
    label: 'Change Permissions',
    description: 'Modify assigned modules and action permissions for staff members',
    riskLevel: 'ADMIN_ONLY',
    isOwnerDefaultOnly: true,
  },
  {
    key: 'disable_user',
    module: 'user_access',
    label: 'Disable / Suspend User',
    description: 'Immediately block login and revoke system session for a staff member',
    riskLevel: 'ADMIN_ONLY',
    isOwnerDefaultOnly: true,
  },
];

// ─── Account Hierarchy Level Helper ──────────────────────────────────────────

export function getUserHierarchyLevel(user?: { role?: UserRole; email?: string } | null): HierarchyLevel {
  if (!user) return 'STAFF';
  const email = (user.email || '').trim().toLowerCase();
  if (email === PRIMARY_OWNER_EMAIL.toLowerCase() || user.role === 'owner') {
    return 'PRIMARY_OWNER';
  }
  if (user.role === 'admin') return 'ADMIN';
  if (user.role === 'manager') return 'MANAGER';
  if (user.role === 'viewer') return 'VIEW_ONLY';
  return 'STAFF';
}

export const HIERARCHY_BADGE_CONFIG: Record<
  HierarchyLevel,
  { label: string; bg: string; text: string; border: string; desc: string }
> = {
  PRIMARY_OWNER: {
    label: 'PRIMARY OWNER',
    bg: 'bg-blue-900',
    text: 'text-white',
    border: 'border-blue-950',
    desc: 'Highest authority with permanent unrestricted access',
  },
  ADMIN: {
    label: 'ADMIN',
    bg: 'bg-purple-800',
    text: 'text-white',
    border: 'border-purple-900',
    desc: 'High-level administration explicitly delegated by Owner',
  },
  MANAGER: {
    label: 'MANAGER',
    bg: 'bg-emerald-800',
    text: 'text-white',
    border: 'border-emerald-900',
    desc: 'Comprehensive operational workshop oversight',
  },
  STAFF: {
    label: 'STAFF',
    bg: 'bg-slate-700',
    text: 'text-white',
    border: 'border-slate-800',
    desc: 'Sub-user account with assigned module permissions',
  },
  VIEW_ONLY: {
    label: 'VIEW ONLY',
    bg: 'bg-slate-200 dark:bg-slate-800',
    text: 'text-slate-800 dark:text-slate-300',
    border: 'border-slate-300 dark:border-slate-700',
    desc: 'Read-only inspection rights where permitted',
  },
};

export const ALL_APP_MODULES: AppModuleDefinition[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/', icon: 'LayoutDashboard', description: 'Workshop overview and live performance metrics', sectionId: 'section_operations' },
  { id: 'customers', label: 'Customers', href: '/customers', icon: 'Users', description: 'Customer database, contacts, and vehicle history', sectionId: 'section_operations' },
  { id: 'job_cards', label: 'Job Cards', href: '/job-cards', icon: 'ClipboardList', description: 'Repair orders, vehicle inspections, and status', sectionId: 'section_operations' },
  { id: 'services', label: 'Services', href: '/services', icon: 'Wrench', description: 'Labor catalog, service pricing, and codes', sectionId: 'section_operations' },
  { id: 'spare_parts', label: 'Spare Parts', href: '/parts', icon: 'Cog', description: 'Parts catalog, OEM numbers, and stock pricing', sectionId: 'section_inventory' },
  { id: 'inventory', label: 'Inventory', href: '/inventory', icon: 'Package', description: 'Warehouse stock levels and inventory movement ledger', sectionId: 'section_inventory' },
  { id: 'suppliers', label: 'Suppliers', href: '/suppliers', icon: 'Truck', description: 'Parts vendors, supplier profiles, and balances', sectionId: 'section_inventory' },
  { id: 'purchases', label: 'Purchases', href: '/purchases', icon: 'ShoppingCart', description: 'Parts purchase orders and vendor payables', sectionId: 'section_inventory' },
  { id: 'invoices', label: 'Invoices', href: '/invoices', icon: 'FileText', description: 'VAT tax invoices, billing, and statements', sectionId: 'section_billing' },
  { id: 'payments', label: 'Payments', href: '/payments', icon: 'CreditCard', description: 'Customer payments, receipts, and settlements', sectionId: 'section_billing' },
  { id: 'expenses', label: 'Expenses', href: '/expenses', icon: 'Receipt', description: 'Workshop operational expenses and overheads', sectionId: 'section_billing' },
  { id: 'accounts', label: 'Accounts / Ledger', href: '/accounts', icon: 'BookOpen', description: 'Double-entry general ledger, banks, and chart of accounts', sectionId: 'section_billing', isFinancial: true },
  { id: 'reports', label: 'Reports', href: '/reports', icon: 'BarChart3', description: 'Financial analytics, sales reports, and VAT returns', sectionId: 'section_reporting' },
  { id: 'recycle_bin', label: 'Recycle Bin', href: '/recycle-bin', icon: 'Trash2', description: 'Soft-deleted records, audit log, and restore', sectionId: 'section_admin' },
  { id: 'settings', label: 'Settings', href: '/settings', icon: 'Settings', description: 'Workshop system preferences and profile', sectionId: 'section_admin' },
  { id: 'user_access', label: 'User Access', href: '/settings?tab=user_access', icon: 'Shield', description: 'Staff user accounts, roles, and granular security', sectionId: 'section_admin' },
];

// ─── Navigation ─────────────────────────────────────────────────────────────

export const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: 'LayoutDashboard', module: 'dashboard' as AppModule },
  { href: '/customers', label: 'Customers', icon: 'Users', module: 'customers' as AppModule },
  { href: '/job-cards', label: 'Job Cards', icon: 'ClipboardList', module: 'job_cards' as AppModule },
  { href: '/services', label: 'Services', icon: 'Wrench', module: 'services' as AppModule },
  { href: '/parts', label: 'Spare Parts', icon: 'Cog', module: 'spare_parts' as AppModule },
  { href: '/inventory', label: 'Inventory', icon: 'Package', module: 'inventory' as AppModule },
  { href: '/suppliers', label: 'Suppliers', icon: 'Truck', module: 'suppliers' as AppModule },
  { href: '/purchases', label: 'Purchases', icon: 'ShoppingCart', module: 'purchases' as AppModule },
  { href: '/invoices', label: 'Invoices', icon: 'FileText', module: 'invoices' as AppModule },
  { href: '/payments', label: 'Payments', icon: 'CreditCard', module: 'payments' as AppModule },
  { href: '/expenses', label: 'Expenses', icon: 'Receipt', module: 'expenses' as AppModule },
  { href: '/accounts', label: 'Accounts / Ledger', icon: 'BookOpen', module: 'accounts' as AppModule },
  { href: '/reports', label: 'Reports', icon: 'BarChart3', module: 'reports' as AppModule },
  { href: '/recycle-bin', label: 'Recycle Bin', icon: 'Trash2', module: 'recycle_bin' as AppModule },
  { href: '/settings', label: 'Settings', icon: 'Settings', module: 'settings' as AppModule },
];

// ─── Default Permission Generator Helpers ────────────────────────────────────

export function getEmptyPermissions(): Record<AppModule, UserModulePermission> {
  const perms: Partial<Record<AppModule, UserModulePermission>> = {};
  for (const m of ALL_APP_MODULES) {
    perms[m.id] = {
      module: m.id,
      access: false,
      can_view: false,
      can_create: false,
      can_edit: false,
      can_delete: false,
      can_print: false,
      can_export: false,
      can_transfer: false,
      can_journal: false,
      can_reverse: false,
      can_finalize: false,
      can_record_payment: false,
      can_void: false,
      can_view_bank_balance: false,
    };
  }
  return perms as Record<AppModule, UserModulePermission>;
}

export function getAllPermissionsEnabled(): Record<AppModule, UserModulePermission> {
  const perms: Partial<Record<AppModule, UserModulePermission>> = {};
  for (const m of ALL_APP_MODULES) {
    perms[m.id] = {
      module: m.id,
      access: true,
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: true,
      can_print: true,
      can_export: true,
      can_transfer: true,
      can_journal: true,
      can_reverse: true,
      can_finalize: true,
      can_record_payment: true,
      can_void: true,
      can_view_bank_balance: true,
    };
  }
  return perms as Record<AppModule, UserModulePermission>;
}

export function getViewOnlyPermissions(selectedModules?: AppModule[]): Record<AppModule, UserModulePermission> {
  const perms = getEmptyPermissions();
  const modulesToEnable = selectedModules || ALL_APP_MODULES.map((m) => m.id);
  for (const mod of modulesToEnable) {
    perms[mod] = {
      ...perms[mod],
      access: true,
      can_view: true,
    };
  }
  return perms;
}

export function getDefaultPermissionsForRole(role: UserRole): Record<AppModule, UserModulePermission> {
  if (role === 'owner' || role === 'admin') {
    return getAllPermissionsEnabled();
  }

  const perms = getEmptyPermissions();

  switch (role) {
    case 'manager': {
      // Manager: Full operational workflow, no user management, no owner settings, no permanent financial delete
      const opsModules: AppModule[] = [
        'dashboard',
        'customers',
        'job_cards',
        'services',
        'spare_parts',
        'inventory',
        'suppliers',
        'purchases',
        'invoices',
        'payments',
        'expenses',
        'reports',
        'recycle_bin',
      ];
      for (const m of opsModules) {
        perms[m] = {
          module: m,
          access: true,
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: m !== 'purchases' && m !== 'invoices' && m !== 'payments', // delete off for financial records
          can_print: true,
          can_export: true,
          can_finalize: true,
          can_record_payment: true,
          can_void: false,
          can_transfer: false,
          can_journal: false,
          can_reverse: false,
          can_view_bank_balance: false,
        };
      }
      break;
    }

    case 'receptionist': {
      // Receptionist: Customers, Job Cards, Services, Invoices, Payments
      const recModules: AppModule[] = ['dashboard', 'customers', 'job_cards', 'services', 'invoices', 'payments'];
      for (const m of recModules) {
        perms[m] = {
          module: m,
          access: true,
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: false, // Receptionists cannot delete records
          can_print: true,
          can_export: false,
          can_record_payment: true,
          can_void: false,
        };
      }
      break;
    }

    case 'mechanic': {
      // Mechanic: Dashboard + Job Cards (inspect, progress, service notes)
      perms.dashboard = {
        module: 'dashboard',
        access: true,
        can_view: true,
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_print: false,
        can_export: false,
      };
      perms.job_cards = {
        module: 'job_cards',
        access: true,
        can_view: true,
        can_create: false,
        can_edit: true, // update progress and work notes
        can_delete: false,
        can_print: true,
        can_export: false,
      };
      break;
    }

    case 'storekeeper': {
      // Storekeeper: Spare Parts, Inventory, Suppliers, Purchases
      const storeModules: AppModule[] = ['dashboard', 'spare_parts', 'inventory', 'suppliers', 'purchases'];
      for (const m of storeModules) {
        perms[m] = {
          module: m,
          access: true,
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: false,
          can_print: true,
          can_export: true,
          can_finalize: true,
        };
      }
      break;
    }

    case 'accountant': {
      // Accountant: Invoices, Payments, Expenses, Accounts/Ledger, Reports, Customer/Supplier ledgers
      const accModules: AppModule[] = [
        'dashboard',
        'customers',
        'suppliers',
        'invoices',
        'payments',
        'expenses',
        'accounts',
        'reports',
        'purchases',
      ];
      for (const m of accModules) {
        perms[m] = {
          module: m,
          access: true,
          can_view: true,
          can_create: m !== 'customers' && m !== 'suppliers',
          can_edit: m !== 'customers' && m !== 'suppliers',
          can_delete: false,
          can_print: true,
          can_export: true,
          can_record_payment: true,
          can_finalize: true,
          // Ledger permissions
          can_transfer: false, // requires owner approval by default
          can_journal: false,
          can_reverse: false,
          can_view_bank_balance: true,
        };
      }
      break;
    }

    case 'viewer': {
      // Viewer: View-only on dashboard, customers, job cards, invoices, reports
      return getViewOnlyPermissions(['dashboard', 'customers', 'job_cards', 'invoices', 'reports']);
    }

    case 'custom': {
      // Custom: Starts with view-only on dashboard; Owner selects everything
      perms.dashboard = {
        module: 'dashboard',
        access: true,
        can_view: true,
        can_create: false,
        can_edit: false,
        can_delete: false,
        can_print: false,
        can_export: false,
      };
      break;
    }
  }

  return perms;
}

// ─── Quick Access Presets ───────────────────────────────────────────────────

export function getFullOperationalPermissions(): Record<AppModule, UserModulePermission> {
  const perms = getEmptyPermissions();
  const operationalModules: AppModule[] = [
    'dashboard',
    'customers',
    'job_cards',
    'services',
    'spare_parts',
    'inventory',
    'suppliers',
    'purchases',
    'invoices',
    'payments',
    'expenses',
    'reports',
    'recycle_bin',
  ];

  for (const m of operationalModules) {
    perms[m] = {
      module: m,
      access: true,
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: m !== 'purchases' && m !== 'invoices' && m !== 'payments',
      can_print: true,
      can_export: true,
      can_approve: true,
      can_finalize: true,
      can_record_payment: true,
      // Strictly exclude owner-only defaults:
      can_void: false,
      can_transfer: false,
      can_journal: false,
      can_reverse: false,
      can_view_bank_balance: false,
      protected_actions: {
        finalize_purchase: true,
        record_payment: true,
        restore_record: true,
      },
    };
  }

  return perms;
}

export function getFinanceOnlyPermissions(): Record<AppModule, UserModulePermission> {
  const perms = getEmptyPermissions();
  const financeModules: AppModule[] = ['dashboard', 'invoices', 'payments', 'expenses', 'accounts', 'reports'];

  for (const m of financeModules) {
    perms[m] = {
      module: m,
      access: true,
      can_view: true,
      can_create: m !== 'reports',
      can_edit: m !== 'reports',
      can_delete: false,
      can_print: true,
      can_export: true,
      can_record_payment: true,
      can_view_bank_balance: true,
      // Owner-only financial actions remain OFF by default
      can_transfer: false,
      can_journal: false,
      can_reverse: false,
      can_void: false,
      protected_actions: {
        record_payment: true,
        view_bank_balances: true,
      },
    };
  }

  return perms;
}

export function getWorkshopOperationsPermissions(): Record<AppModule, UserModulePermission> {
  const perms = getEmptyPermissions();
  const opsModules: AppModule[] = ['dashboard', 'customers', 'job_cards', 'services'];

  for (const m of opsModules) {
    perms[m] = {
      module: m,
      access: true,
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: m === 'customers' || m === 'services',
      can_print: true,
      can_export: true,
      can_approve: true,
    };
  }

  return perms;
}

export function getInventoryOnlyPermissions(): Record<AppModule, UserModulePermission> {
  const perms = getEmptyPermissions();
  const invModules: AppModule[] = ['dashboard', 'spare_parts', 'inventory', 'suppliers', 'purchases'];

  for (const m of invModules) {
    perms[m] = {
      module: m,
      access: true,
      can_view: true,
      can_create: true,
      can_edit: true,
      can_delete: false,
      can_print: true,
      can_export: true,
      can_finalize: true,
      protected_actions: {
        finalize_purchase: true,
      },
    };
  }

  return perms;
}

// ─── Intelligent Permission Dependency Sanitizer ─────────────────────────────

export function sanitizePermissionDependencies(perm: UserModulePermission): UserModulePermission {
  const sanitized = { ...perm };

  // Rule 1: If Module Access is OFF, all action permissions and protected actions become false
  if (!sanitized.access) {
    sanitized.can_view = false;
    sanitized.can_create = false;
    sanitized.can_edit = false;
    sanitized.can_delete = false;
    sanitized.can_print = false;
    sanitized.can_export = false;
    sanitized.can_approve = false;
    sanitized.can_transfer = false;
    sanitized.can_journal = false;
    sanitized.can_reverse = false;
    sanitized.can_finalize = false;
    sanitized.can_record_payment = false;
    sanitized.can_void = false;
    sanitized.can_view_bank_balance = false;
    if (sanitized.protected_actions) {
      for (const k of Object.keys(sanitized.protected_actions)) {
        sanitized.protected_actions[k] = false;
      }
    }
    return sanitized;
  }

  // Rule 2: If Edit or Delete or any action is enabled, View must automatically be ON
  if (
    sanitized.can_create ||
    sanitized.can_edit ||
    sanitized.can_delete ||
    sanitized.can_print ||
    sanitized.can_export ||
    sanitized.can_approve ||
    sanitized.can_transfer ||
    sanitized.can_journal ||
    sanitized.can_reverse ||
    sanitized.can_finalize ||
    sanitized.can_record_payment ||
    sanitized.can_void ||
    sanitized.can_view_bank_balance ||
    (sanitized.protected_actions && Object.values(sanitized.protected_actions).some(Boolean))
  ) {
    sanitized.can_view = true;
  }

  // Rule 3: If View is OFF, all CRUD and approval actions must be OFF
  if (!sanitized.can_view) {
    sanitized.can_create = false;
    sanitized.can_edit = false;
    sanitized.can_delete = false;
    sanitized.can_print = false;
    sanitized.can_export = false;
    sanitized.can_approve = false;
  }

  return sanitized;
}

// ─── Legacy String-Based Section Mapping (Maintained for Backward Compatibility) ───

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  owner: ['*'],
  admin: ['*'],
  manager: [
    'dashboard', 'customers', 'job-cards', 'services',
    'parts', 'inventory', 'suppliers', 'purchases', 'invoices',
    'payments', 'expenses', 'reports', 'recycle-bin',
  ],
  viewer: [
    'dashboard', 'customers', 'job-cards', 'invoices', 'reports',
  ],
  receptionist: [
    'dashboard', 'customers', 'job-cards', 'services', 'invoices', 'payments',
  ],
  storekeeper: [
    'dashboard', 'parts', 'inventory', 'suppliers', 'purchases',
  ],
  mechanic: [
    'dashboard', 'job-cards',
  ],
  accountant: [
    'dashboard', 'customers', 'suppliers', 'invoices', 'payments', 'expenses', 'accounts', 'reports', 'purchases',
  ],
  custom: [
    'dashboard',
  ],
};

// ─── Accounting Chart of Accounts Constants ───────────────────────────────

export const ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset' },
  { value: 'liability', label: 'Liability' },
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
  { value: 'equity', label: 'Equity' },
] as const;

export const DEFAULT_ACCOUNT_SUB_TYPES: Record<string, string[]> = {
  asset: ['Cash', 'Bank', 'Customer Receivable', 'Inventory', 'Staff Advance', 'Other Current Asset'],
  liability: ['Customer Advance', 'Supplier Payable', 'Worker Payable', 'VAT / Tax Payable', 'Other Liability'],
  income: ['Service Revenue', 'Spare Parts Revenue', 'Other Income'],
  expense: [
    'Rent',
    'Salaries / Wages',
    'Electricity',
    'Water',
    'Internet / Phone',
    'Fuel',
    'Tools',
    'Workshop Supplies',
    'Maintenance',
    'Government Fees',
    'Miscellaneous Expense',
  ],
  equity: ['Owner Capital', 'Owner Drawings', 'Owner Advance'],
};


// ─── Expense Categories & Payment Methods ─────────────────────────────────

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Rent',
  'Salary / Wages',
  'Electricity',
  'Water',
  'Internet / Phone',
  'Fuel',
  'Tools & Equipment',
  'Workshop Supplies',
  'Vehicle / Delivery',
  'Supplier Payment',
  'Maintenance',
  'Government / Fees',
  'Miscellaneous',
] as const;

export const EXPENSE_PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'other', label: 'Other' },
] as const;

// ─── Enterprise Delegated Access Defaults & Data Scopes ───────────────────────

export const DATA_ACCESS_SCOPES: { value: DataAccessScope; label: string; description: string }[] = [
  { value: 'all', label: 'All Workspace Records', description: 'Access across all customers, job cards, and transactions in this workspace' },
  { value: 'assigned', label: 'Assigned Records Only', description: 'Restricted strictly to jobs, tasks, or tickets specifically assigned to this user' },
  { value: 'own', label: 'Own Records Only', description: 'Restricted strictly to records created by this user account' },
  { value: 'team', label: 'Team Records', description: 'Restricted to this user and their designated department / team' },
];

export const FINANCIAL_VISIBILITY_FIELDS: { key: keyof FinancialVisibilitySettings; label: string; description: string; risk: ProtectionRiskLevel }[] = [
  { key: 'view_selling_prices', label: 'View Selling Prices', description: 'Inspect client retail prices and service labor billing rates', risk: 'STANDARD' },
  { key: 'view_purchase_prices', label: 'View Purchase Prices', description: 'Inspect vendor invoice costs on spare parts and supplier bills', risk: 'SENSITIVE' },
  { key: 'view_cost_price', label: 'View Cost Price', description: 'Inspect internal inventory landed cost and parts acquisition prices', risk: 'SENSITIVE' },
  { key: 'view_profit', label: 'View Profit & Margins', description: 'Inspect gross profit margins, markup, and net earnings per job', risk: 'FINANCIAL' },
  { key: 'view_customer_outstanding', label: 'View Customer Receivables', description: 'Inspect client credit ledger, overdue debts, and balances', risk: 'STANDARD' },
  { key: 'view_supplier_outstanding', label: 'View Supplier Payables', description: 'Inspect unpaid bills owed to parts suppliers and vendors', risk: 'SENSITIVE' },
  { key: 'view_cash_balance', label: 'View Cash Balance', description: 'Inspect workshop petty cash, till drawer, and cash register balance', risk: 'FINANCIAL' },
  { key: 'view_bank_balances', label: 'View Bank Balances', description: 'Inspect exact corporate bank accounts and liquidity balances', risk: 'FINANCIAL' },
  { key: 'view_owner_capital', label: 'View Owner Capital & Equity', description: 'Inspect partner equity, drawings, capital investment, and retained profit', risk: 'ADMIN_ONLY' },
  { key: 'view_full_ledger', label: 'View Full General Ledger', description: 'Unrestricted access to the entire Chart of Accounts and Trial Balance', risk: 'ADMIN_ONLY' },
];

export const DEFAULT_FINANCIAL_VISIBILITY: Record<UserRole, FinancialVisibilitySettings> = {
  owner: {
    view_selling_prices: true,
    view_purchase_prices: true,
    view_cost_price: true,
    view_profit: true,
    view_customer_outstanding: true,
    view_supplier_outstanding: true,
    view_cash_balance: true,
    view_bank_balances: true,
    view_owner_capital: true,
    view_full_ledger: true,
  },
  admin: {
    view_selling_prices: true,
    view_purchase_prices: true,
    view_cost_price: true,
    view_profit: true,
    view_customer_outstanding: true,
    view_supplier_outstanding: true,
    view_cash_balance: true,
    view_bank_balances: true,
    view_owner_capital: false,
    view_full_ledger: true,
  },
  manager: {
    view_selling_prices: true,
    view_purchase_prices: true,
    view_cost_price: true,
    view_profit: true,
    view_customer_outstanding: true,
    view_supplier_outstanding: true,
    view_cash_balance: true,
    view_bank_balances: false,
    view_owner_capital: false,
    view_full_ledger: false,
  },
  accountant: {
    view_selling_prices: true,
    view_purchase_prices: true,
    view_cost_price: true,
    view_profit: true,
    view_customer_outstanding: true,
    view_supplier_outstanding: true,
    view_cash_balance: true,
    view_bank_balances: true,
    view_owner_capital: false,
    view_full_ledger: true,
  },
  receptionist: {
    view_selling_prices: true,
    view_purchase_prices: false,
    view_cost_price: false,
    view_profit: false,
    view_customer_outstanding: true,
    view_supplier_outstanding: false,
    view_cash_balance: true,
    view_bank_balances: false,
    view_owner_capital: false,
    view_full_ledger: false,
  },
  storekeeper: {
    view_selling_prices: true,
    view_purchase_prices: true,
    view_cost_price: true,
    view_profit: false,
    view_customer_outstanding: false,
    view_supplier_outstanding: true,
    view_cash_balance: false,
    view_bank_balances: false,
    view_owner_capital: false,
    view_full_ledger: false,
  },
  mechanic: {
    view_selling_prices: false,
    view_purchase_prices: false,
    view_cost_price: false,
    view_profit: false,
    view_customer_outstanding: false,
    view_supplier_outstanding: false,
    view_cash_balance: false,
    view_bank_balances: false,
    view_owner_capital: false,
    view_full_ledger: false,
  },
  viewer: {
    view_selling_prices: true,
    view_purchase_prices: false,
    view_cost_price: false,
    view_profit: false,
    view_customer_outstanding: false,
    view_supplier_outstanding: false,
    view_cash_balance: false,
    view_bank_balances: false,
    view_owner_capital: false,
    view_full_ledger: false,
  },
  custom: {
    view_selling_prices: false,
    view_purchase_prices: false,
    view_cost_price: false,
    view_profit: false,
    view_customer_outstanding: false,
    view_supplier_outstanding: false,
    view_cash_balance: false,
    view_bank_balances: false,
    view_owner_capital: false,
    view_full_ledger: false,
  },
};

export const DEFAULT_APPROVAL_LIMITS: Record<UserRole, UserApprovalLimits> = {
  owner: {
    expense_approval_limit: 10000000,
    transfer_money_limit: 10000000,
    payment_approval_limit: 10000000,
    discount_limit_percentage: 100,
    manual_stock_adjustment_max_units: 1000000,
    can_void_invoice: true,
  },
  admin: {
    expense_approval_limit: 50000,
    transfer_money_limit: 50000,
    payment_approval_limit: 50000,
    discount_limit_percentage: 25,
    manual_stock_adjustment_max_units: 500,
    can_void_invoice: true,
  },
  manager: {
    expense_approval_limit: 2000,
    transfer_money_limit: 5000,
    payment_approval_limit: 10000,
    discount_limit_percentage: 15,
    manual_stock_adjustment_max_units: 50,
    can_void_invoice: false,
  },
  accountant: {
    expense_approval_limit: 1000,
    transfer_money_limit: 2000,
    payment_approval_limit: 10000,
    discount_limit_percentage: 10,
    manual_stock_adjustment_max_units: 0,
    can_void_invoice: false,
  },
  receptionist: {
    expense_approval_limit: 200,
    transfer_money_limit: 0,
    payment_approval_limit: 2000,
    discount_limit_percentage: 5,
    manual_stock_adjustment_max_units: 0,
    can_void_invoice: false,
  },
  storekeeper: {
    expense_approval_limit: 500,
    transfer_money_limit: 0,
    payment_approval_limit: 0,
    discount_limit_percentage: 0,
    manual_stock_adjustment_max_units: 20,
    can_void_invoice: false,
  },
  mechanic: {
    expense_approval_limit: 0,
    transfer_money_limit: 0,
    payment_approval_limit: 0,
    discount_limit_percentage: 0,
    manual_stock_adjustment_max_units: 0,
    can_void_invoice: false,
  },
  viewer: {
    expense_approval_limit: 0,
    transfer_money_limit: 0,
    payment_approval_limit: 0,
    discount_limit_percentage: 0,
    manual_stock_adjustment_max_units: 0,
    can_void_invoice: false,
  },
  custom: {
    expense_approval_limit: 0,
    transfer_money_limit: 0,
    payment_approval_limit: 0,
    discount_limit_percentage: 0,
    manual_stock_adjustment_max_units: 0,
    can_void_invoice: false,
  },
};

export const DEFAULT_DATA_SCOPE: Record<UserRole, DataAccessScope> = {
  owner: 'all',
  admin: 'all',
  manager: 'all',
  accountant: 'all',
  receptionist: 'all',
  storekeeper: 'all',
  mechanic: 'assigned',
  viewer: 'all',
  custom: 'own',
};

export function getDefaultFinancialVisibility(role: UserRole): FinancialVisibilitySettings {
  return DEFAULT_FINANCIAL_VISIBILITY[role] || DEFAULT_FINANCIAL_VISIBILITY.viewer;
}

export function getDefaultApprovalLimits(role: UserRole): UserApprovalLimits {
  return DEFAULT_APPROVAL_LIMITS[role] || DEFAULT_APPROVAL_LIMITS.viewer;
}

export function getDefaultDataScope(role: UserRole): DataAccessScope {
  return DEFAULT_DATA_SCOPE[role] || 'all';
}


