export type UserRole =
  | 'owner'
  | 'manager'
  | 'viewer'
  | 'admin'
  | 'receptionist'
  | 'storekeeper'
  | 'mechanic'
  | 'accountant'
  | 'custom';

export type UserStatus = 'invited' | 'active' | 'suspended' | 'disabled' | 'expired' | 'removed' | 'deleted';

export type HierarchyLevel =
  | 'PRIMARY_OWNER'
  | 'ADMIN'
  | 'MANAGER'
  | 'STAFF'
  | 'VIEW_ONLY';

export type ProtectionRiskLevel = 'STANDARD' | 'SENSITIVE' | 'FINANCIAL' | 'ADMIN_ONLY';

export type AppModule =
  | 'dashboard'
  | 'customers'
  | 'job_cards'
  | 'services'
  | 'spare_parts'
  | 'inventory'
  | 'suppliers'
  | 'purchases'
  | 'invoices'
  | 'payments'
  | 'expenses'
  | 'accounts'
  | 'reports'
  | 'recycle_bin'
  | 'settings'
  | 'user_access';

export type PermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'print'
  | 'export'
  | 'approve'
  // Special action permissions
  | 'transfer_money'
  | 'manual_journal'
  | 'reverse_transaction'
  | 'finalize'
  | 'record_payment'
  | 'void'
  | 'view_bank_balance';

export interface UserModulePermission {
  id?: string;
  user_id?: string;
  module: AppModule;
  access: boolean;
  can_view: boolean;
  can_create: boolean;
  can_edit: boolean;
  can_delete: boolean;
  can_print: boolean;
  can_export: boolean;
  can_approve?: boolean;
  // Financial & protected actions flags
  can_transfer?: boolean;
  can_journal?: boolean;
  can_reverse?: boolean;
  can_finalize?: boolean;
  can_record_payment?: boolean;
  can_void?: boolean;
  can_view_bank_balance?: boolean;
  // Dynamic protected actions dictionary for fine-grained operations
  protected_actions?: Record<string, boolean>;
}

export interface UserActivityLog {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action: string;
  module: AppModule | 'auth' | 'system';
  record_reference?: string | null;
  description: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface PermissionChangeLog {
  id: string;
  operator_id: string;
  operator_name: string;
  target_user_id: string;
  target_user_name: string;
  module: AppModule;
  change_summary: string;
  old_permissions: Partial<UserModulePermission>;
  new_permissions: Partial<UserModulePermission>;
  timestamp: string;
}

export type JobCardStatus = 'new' | 'in_progress' | 'waiting' | 'completed' | 'cancelled';

export type PaymentMethod = 'cash' | 'bank' | 'credit';

export type PaymentStatus = 'paid' | 'partially_paid' | 'credit';

export type PurchasePaymentStatus = 'paid' | 'partially_paid' | 'unpaid' | 'pending' | 'credit';
export type PurchasePaymentMethod = 'cash' | 'bank' | 'card' | 'credit' | 'other';

export type ItemType = 'service' | 'part' | 'labour';

export type InventoryTransactionType = 'purchase_in' | 'job_card_out' | 'adjustment' | 'return';

export type ExpensePaymentMethod = 'cash' | 'bank_transfer' | 'credit_card' | 'other' | 'bank';

export type WorkspaceStatus = 'pending' | 'active' | 'suspended' | 'rejected' | 'archived';
export type WorkspaceMemberStatus = 'pending' | 'active' | 'invited' | 'suspended' | 'expired' | 'rejected' | 'removed';

export interface Workspace {
  id: string;
  name: string;
  code?: string | null;
  workspace_code?: string | null;
  business_name: string;
  owner_user_id?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  country?: string;
  currency: string;
  trn?: string | null;
  trn_number?: string | null;
  logo_url?: string | null;
  status: WorkspaceStatus;
  is_primary?: boolean;
  created_by?: string | null;
  approved_by?: string | null;
  approved_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at: string;
  users_count?: number;
  last_activity?: string | null;
}

export interface CreateDirectWorkspacePayload {
  mode: "direct" | "invite";
  name: string;
  code?: string;
  business_name?: string;
  phone?: string;
  address?: string;
  country?: string;
  currency?: string;
  trn?: string;
  owner_name: string;
  owner_email: string;
  temporary_password?: string;
  role?: UserRole;
  access_duration?: '7d' | '30d' | '3m' | '6m' | '1y' | '7_days' | '30_days' | '3_months' | '6_months' | '1_year' | 'custom' | 'no_expiry' | 'never' | string;
  custom_expiry_date?: string;
  permissions?: Record<AppModule, UserModulePermission>;
  data_scope?: DataAccessScope;
  financial_visibility?: Partial<FinancialVisibilitySettings>;
  approval_limits?: Partial<UserApprovalLimits>;
}

export interface CreateDirectWorkspaceResponse {
  success: boolean;
  workspace?: Workspace;
  owner?: {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
  };
  login_url?: string;
  mode?: "direct" | "invite";
  already_exists?: boolean;
  error?: string;
}

export interface WorkspaceMember {
  id: string;
  workspace_id: string;
  user_id: string;
  role: UserRole;
  status: WorkspaceMemberStatus;
  is_workspace_owner?: boolean;
  access_starts_at?: string | null;
  access_expires_at?: string | null;
  expired_at?: string | null;
  access_duration?: string | null;
  joined_at: string;
  removed_at?: string | null;
  removed_by?: string | null;
  user?: User;
  workspace?: Workspace;
}

export type WorkspaceAuditAction =
  | 'WORKSPACE_CREATED'
  | 'OWNER_INVITED'
  | 'OWNER_ACTIVATED'
  | 'LOGIN'
  | 'ACCESS_SUSPENDED'
  | 'ACCESS_RESTORED'
  | 'OWNER_REMOVED'
  | 'OWNER_REPLACED'
  | 'USER_ACCESS_REMOVED'
  | 'USER_DELETED'
  | 'USER_SUSPENDED'
  | 'USER_RESTORED'
  | 'WORKSPACE_ARCHIVED'
  | 'WORKSPACE_RESTORED'
  | 'WORKSPACE_DELETED'
  | 'WORKSPACE_STATUS_CHANGED'
  | 'WORKSPACE_ACCESS_APPROVED'
  | 'WORKSPACE_ACCESS_RENEWED'
  | 'WORKSPACE_ACCESS_SUSPENDED'
  | 'WORKSPACE_ACCESS_REVOKED';

export interface WorkspaceAuditLog {
  id: string;
  workspace_id: string;
  action: WorkspaceAuditAction;
  performed_by: string;
  target_user?: string | null;
  details?: Record<string, any> | null;
  created_at: string;
}

export interface FinancialRecordCounts {
  invoices: number;
  payments: number;
  expenses: number;
  purchases: number;
  ledger_entries: number;
  customers: number;
  job_cards: number;
  inventory_items?: number;
  has_records: boolean;
}

export type DataAccessScope = 'own' | 'assigned' | 'team' | 'all';

export interface FinancialVisibilitySettings {
  view_selling_prices: boolean;
  view_purchase_prices: boolean;
  view_cost_price: boolean;
  view_profit: boolean;
  view_customer_outstanding: boolean;
  view_supplier_outstanding: boolean;
  view_cash_balance: boolean;
  view_bank_balances: boolean;
  view_owner_capital: boolean;
  view_full_ledger: boolean;
}

export interface UserApprovalLimits {
  expense_approval_limit: number;
  transfer_money_limit: number;
  payment_approval_limit: number;
  discount_limit_percentage: number;
  manual_stock_adjustment_max_units: number;
  can_void_invoice: boolean;
}

export type ApprovalRequestType =
  | 'large_expense'
  | 'large_transfer'
  | 'large_payment'
  | 'invoice_void'
  | 'high_discount'
  | 'manual_journal'
  | 'stock_adjustment'
  | 'permanent_delete';

export type ApprovalRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalRequest {
  id: string;
  workspace_id: string;
  user_id: string;
  user_name: string;
  request_type: ApprovalRequestType;
  amount?: number | null;
  currency?: string;
  details: Record<string, any>;
  status: ApprovalRequestStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

export type AccessRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface AccessRequest {
  id: string;
  workspace_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  requested_module: AppModule;
  requested_action: string;
  reason?: string | null;
  status: AccessRequestStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  rejection_reason?: string | null;
  created_at: string;
  updated_at?: string;
}

// ─── Table Row Types ────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  status?: UserStatus;
  membership_status?: WorkspaceMemberStatus;
  removed_at?: string | null;
  removed_by?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  hierarchy_level?: HierarchyLevel;
  workspace_id?: string;
  phone?: string | null;
  job_title?: string | null;
  data_scope?: DataAccessScope;
  financial_visibility?: Partial<FinancialVisibilitySettings>;
  approval_limits?: Partial<UserApprovalLimits>;
  access_start_date?: string | null;
  access_expiry_date?: string | null;
  access_starts_at?: string | null;
  access_expires_at?: string | null;
  expired_at?: string | null;
  access_duration?: string | null;
  two_factor_enabled?: boolean;
  notes?: string | null;
  permissions?: Record<AppModule, UserModulePermission>;
  last_login_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: string;
  name: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  company_name?: string | null;
  trn_number?: string | null;
  notes: string | null;
  workspace_id?: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface Vehicle {
  id: string;
  customer_id: string;
  make: string;
  model: string;
  year: number | null;
  color: string | null;
  chassis_vin: string | null;
  mileage: number | null;
  registration_number: string | null;
  notes: string | null;
  workspace_id?: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Service {
  id: string;
  name: string;
  service_code?: string | null;
  category?: string | null;
  description: string | null;
  default_price: number;
  estimated_time?: string | null;
  workspace_id?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  usage_count?: number;
}

export interface ServiceUsageRecord {
  job_card_id: string;
  job_card_number: string;
  date: string;
  customer_name: string;
  vehicle_make_model: string;
  registration_number: string;
  unit_price: number;
  total_price: number;
}

export interface Part {
  id: string;
  name: string;
  part_number: string | null;
  brand: string | null;
  description?: string | null;
  unit: string;
  purchase_price: number;
  selling_price: number;
  current_stock: number;
  minimum_stock: number;
  supplier_id: string | null;
  location?: string | null;
  workspace_id?: string;
  is_active: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier | { name: string } | null;
}

export interface Supplier {
  id: string;
  name: string;
  company_name?: string | null;
  contact_person: string | null;
  phone: string | null;
  alternate_phone?: string | null;
  email?: string | null;
  address: string | null;
  city?: string | null;
  trn_number?: string | null;
  notes: string | null;
  workspace_id?: string;
  is_active?: boolean;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobCard {
  id: string;
  job_card_number: string;
  date: string;
  customer_id: string;
  vehicle_id: string;
  mileage_in: number | null;
  customer_complaint: string | null;
  work_details?: string | null;
  discount: number;
  subtotal: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  paid: number;
  balance: number;
  status: JobCardStatus;
  assigned_mechanic: string | null;
  notes: string | null;
  workspace_id?: string;
  payment_status?: string | null;
  invoice_number?: number | string | null;
  invoice_number_mode?: 'auto' | 'manual' | null;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentType =
  | 'paper_job_card'
  | 'vehicle_photo'
  | 'supplier_document'
  | 'inspection_photo'
  | 'other';

export interface UploadedJobCard {
  id: string;
  job_card_number: string;
  customer_id: string;
  vehicle_id: string | null;
  date: string;
  description: string | null;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  document_type: DocumentType;
  job_card_id?: string | null;
  workspace_id?: string;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface JobCardAttachment {
  id: string;
  job_card_id: string;
  document_type: DocumentType;
  file_url: string;
  file_name: string;
  file_type: string;
  file_size: number;
  description: string | null;
  workspace_id?: string;
  created_by?: string | null;
  created_at: string;
}

export interface JobCardItem {
  id: string;
  job_card_id: string;
  item_type: ItemType;
  service_id: string | null;
  part_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  cost_price?: number;
  labour_charge?: number;
  total_price: number;
  workspace_id?: string;
  created_at: string;
}

export interface Invoice {
  id: string;
  invoice_number: string;
  job_card_id: string | null;
  customer_id: string;
  vehicle_id: string | null;
  subtotal: number;
  discount: number;
  vat_rate: number;
  vat_amount: number;
  total: number;
  paid: number;
  balance: number;
  payment_status: PaymentStatus;
  invoice_type?: "job_card" | "direct_service" | "direct_parts" | "direct_mixed" | "direct_parts_sale" | string;
  notes: string | null;
  workspace_id?: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface DirectInvoiceServiceItemPayload {
  service_id?: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  discount?: number;
  save_to_catalog?: boolean;
}

export interface DirectInvoicePartItemPayload {
  part_id: string;
  part_name: string;
  part_number?: string | null;
  quantity: number;
  unit_price: number;
  discount?: number;
  cost_price?: number;
}

export interface CreateDirectInvoicePayload {
  invoice_type_mode: "service" | "parts" | "mixed";
  customer_type: "walk_in" | "existing" | "new";
  customer_id?: string;
  customer_name?: string;
  customer_phone?: string | null;
  company_name?: string | null;
  trn_number?: string | null;
  vehicle_id?: string | null;
  vehicle_make?: string | null;
  vehicle_model?: string | null;
  vehicle_year?: number | string | null;
  vehicle_plate?: string | null;
  vehicle_vin?: string | null;
  services?: DirectInvoiceServiceItemPayload[];
  parts?: DirectInvoicePartItemPayload[];
  discount?: number;
  vat_rate?: number;
  payment_status: "paid" | "partially_paid" | "credit";
  payment_method: "cash" | "bank" | "credit";
  paid_amount?: number;
  bank_account_id?: string;
  notes?: string;
  date?: string;
  created_by?: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  item_type: ItemType;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  part_id?: string | null;
  service_id?: string | null;
  cost_price?: number;
  part_number?: string | null;
  workspace_id?: string;
  created_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string | null;
  job_card_id: string | null;
  customer_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string | null;
  notes: string | null;
  payment_date: string;
  workspace_id?: string;
  created_by: string | null;
  created_at: string;
}

export interface Purchase {
  id: string;
  supplier_id: string;
  purchase_invoice_number: string | null;
  date: string;
  total: number;
  paid_amount?: number;
  balance?: number;
  payment_status: PurchasePaymentStatus;
  payment_method?: PurchasePaymentMethod | string | null;
  notes: string | null;
  workspace_id?: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  supplier?: Supplier | { id: string; name: string } | null;
  items?: PurchaseItem[];
  payments?: SupplierPayment[];
}

export interface PurchaseItem {
  id: string;
  purchase_id: string;
  part_id: string;
  quantity: number;
  purchase_price: number;
  total_price: number;
  workspace_id?: string;
  created_at: string;
  part?: Part | { id: string; name: string; part_number?: string | null } | null;
}

export interface SupplierPayment {
  id: string;
  purchase_id: string;
  supplier_id: string;
  amount: number;
  payment_method: PurchasePaymentMethod | string;
  payment_date: string;
  reference_number?: string | null;
  notes?: string | null;
  workspace_id?: string;
  created_by?: string | null;
  created_at: string;
}

export interface Expense {
  id: string;
  date: string;
  expense_date?: string;
  category: string;
  description?: string | null;
  amount: number;
  payment_method: ExpensePaymentMethod | string;
  paid_to?: string | null;
  reference_number?: string | null;
  notes?: string | null;
  attachment_path?: string | null;
  workspace_id?: string;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
  is_deleted?: boolean;
  deleted_at?: string | null;
  deleted_by?: string | null;
}

export type ExpenseInsert = Omit<Expense, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type ExpenseUpdate = Partial<ExpenseInsert>;

export interface InventoryTransaction {
  id: string;
  part_id: string;
  transaction_type: InventoryTransactionType | string;
  quantity: number;
  quantity_before?: number;
  quantity_after?: number;
  unit_cost?: number;
  reference_id: string | null;
  reference_type: string | null;
  notes: string | null;
  workspace_id?: string;
  created_by: string | null;
  created_at: string;
  part?: Part | null;
}

export interface Setting {
  id: string;
  key: string;
  value: string;
  workspace_id?: string;
  updated_at: string;
  updated_by: string | null;
}

// ─── Insert Types (omit auto-generated fields) ─────────────────────────────

export type CustomerInsert = Omit<Customer, 'id' | 'created_at' | 'updated_at' | 'created_by' | 'notes'> & { created_by?: string | null; notes?: string | null };
export type CustomerUpdate = Partial<CustomerInsert>;

export type VehicleInsert = Omit<Vehicle, 'id' | 'created_at' | 'updated_at' | 'notes'> & { notes?: string | null };
export type VehicleUpdate = Partial<VehicleInsert>;

export type ServiceInsert = Omit<Service, 'id' | 'created_at' | 'updated_at'>;
export type ServiceUpdate = Partial<ServiceInsert>;

export type PartInsert = Omit<Part, 'id' | 'created_at' | 'updated_at'>;
export type PartUpdate = Partial<PartInsert>;

export type SupplierInsert = Omit<Supplier, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};
export type SupplierUpdate = Partial<SupplierInsert>;

export interface JobCardQueryOptions {
  search?: string;
  status?: JobCardStatus | "all" | string;
  type?: "all" | "digital" | "uploaded";
  assigned_mechanic?: string;
  data_scope?: DataAccessScope;
  page?: number;
  limit?: number;
}

export type JobCardInsert = Omit<
  JobCard,
  'id' | 'job_card_number' | 'created_at' | 'updated_at' | 'created_by' | 'notes' | 'mileage_in' | 'vat_rate' | 'vat_amount' | 'customer_complaint' | 'assigned_mechanic' | 'work_details' | 'paid' | 'balance' | 'status' | 'date' | 'discount' | 'subtotal' | 'total'
> & {
  job_card_number?: string;
  created_by?: string | null;
  notes?: string | null;
  mileage_in?: number | null;
  vat_rate?: number;
  vat_amount?: number;
  customer_complaint?: string | null;
  assigned_mechanic?: string | null;
  work_details?: string | null;
  payment_status?: string | null;
  invoice_number?: number | string | null;
  invoice_number_mode?: 'auto' | 'manual' | null;
  paid?: number;
  balance?: number;
  status?: JobCardStatus;
  date?: string;
  discount?: number;
  subtotal?: number;
  total?: number;
};
export type JobCardUpdate = Partial<JobCardInsert>;

export type UploadedJobCardInsert = Omit<UploadedJobCard, 'id' | 'created_at' | 'updated_at'>;
export type UploadedJobCardUpdate = Partial<UploadedJobCardInsert>;

export type JobCardAttachmentInsert = Omit<JobCardAttachment, 'id' | 'created_at'>;

export type JobCardItemInsert = Omit<JobCardItem, 'id' | 'created_at'>;
export type JobCardItemUpdate = Partial<JobCardItemInsert>;

export type InvoiceInsert = Omit<Invoice, 'id' | 'invoice_number' | 'created_at' | 'updated_at'>;
export type InvoiceUpdate = Partial<InvoiceInsert>;

export type InvoiceItemInsert = Omit<InvoiceItem, 'id' | 'created_at'>;

export type PaymentInsert = Omit<Payment, 'id' | 'created_at'>;

export type PurchaseInsert = Omit<
  Purchase,
  'id' | 'created_at' | 'updated_at' | 'total' | 'created_by' | 'supplier' | 'items' | 'payments'
> & {
  id?: string;
  total?: number;
  paid_amount?: number;
  balance?: number;
  created_by?: string | null;
};
export type PurchaseUpdate = Partial<PurchaseInsert>;

export type PurchaseItemInsert = Omit<PurchaseItem, 'id' | 'created_at' | 'purchase_id' | 'part'> & {
  id?: string;
  purchase_id?: string;
};

// ─── Joined / Extended Types (for UI queries) ───────────────────────────────

export interface CustomerWithVehicles extends Customer {
  vehicles: Vehicle[];
}

export interface VehicleWithCustomer extends Vehicle {
  customer: Customer;
}

export interface JobCardWithRelations extends JobCard {
  customer: Customer;
  vehicle: Vehicle;
  items: JobCardItem[];
  invoice?: Invoice | null;
  attachments?: JobCardAttachment[];
}

export interface UploadedJobCardWithRelations extends UploadedJobCard {
  customer: Customer;
  vehicle: Vehicle | null;
}

export interface InvoiceWithRelations extends Invoice {
  customer: Customer;
  vehicle: Vehicle | null;
  job_card: JobCard | null;
  items: InvoiceItem[];
  payments: Payment[];
}

export interface PurchaseWithRelations extends Purchase {
  supplier: Supplier;
  items: (PurchaseItem & { part: Part })[];
}

export interface PartWithSupplier extends Part {
  supplier: Supplier | null;
}

// ─── Dashboard Types ────────────────────────────────────────────────────────

export interface DashboardStats {
  today_total_sales: number;
  service_revenue: number;
  parts_revenue: number;
  cash_sales: number;
  bank_sales: number;
  credit_outstanding: number;
  expenses: number;
  net_result: number;
  open_job_cards: number;
  completed_job_cards: number;
  low_stock_parts: number;
}

export interface MonthlySales {
  month: string;
  total: number;
  services: number;
  parts: number;
}

// ─── Accounts & Ledger Types ────────────────────────────────────────────────

export type AccountType = 'asset' | 'liability' | 'income' | 'expense' | 'equity';

export type RelatedEntityType = 'customer' | 'supplier' | 'worker' | 'bank' | 'owner' | 'none';

export interface LedgerAccount {
  id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_sub_type: string;
  related_entity_type: RelatedEntityType;
  related_entity_id: string | null;
  opening_balance: number;
  opening_balance_date: string;
  is_active: boolean;
  notes: string | null;
  workspace_id?: string;
  created_at: string;
  updated_at?: string;
  current_balance?: number;
}

export type LedgerAccountInsert = Omit<LedgerAccount, 'id' | 'created_at' | 'updated_at' | 'current_balance'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export type CashFlowType = "cash_in" | "cash_out" | "internal_transfer";

export interface LedgerTransaction {
  id: string;
  transaction_number: string;
  transaction_date: string;
  reference_type: string;
  reference_id: string | null;
  description: string;
  cash_flow_type?: CashFlowType;
  workspace_id?: string;
  created_by?: string | null;
  created_at: string;
  entries?: LedgerEntry[];
  total_debit?: number;
  total_credit?: number;
}

export interface LedgerEntry {
  id: string;
  transaction_id: string;
  account_id: string;
  debit: number;
  credit: number;
  notes?: string | null;
  workspace_id?: string;
  created_at: string;
  account?: LedgerAccount;
  transaction?: LedgerTransaction;
}

export interface Worker {
  id: string;
  name: string;
  phone: string | null;
  job_position: string;
  salary_type: 'monthly' | 'daily' | 'hourly' | 'commission';
  basic_salary: number;
  opening_balance: number;
  status: 'active' | 'inactive' | 'on_leave' | 'terminated';
  notes: string | null;
  workspace_id?: string;
  created_at: string;
  updated_at?: string;
  current_balance?: number;
}

export type WorkerInsert = Omit<Worker, 'id' | 'created_at' | 'updated_at' | 'current_balance'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export interface BankAccount {
  id: string;
  bank_name: string;
  account_name: string;
  account_number_last_digits: string | null;
  opening_balance: number;
  currency: string;
  status: 'active' | 'inactive' | 'closed';
  notes: string | null;
  workspace_id?: string;
  created_at: string;
  updated_at?: string;
  current_balance?: number;
}

export type BankAccountInsert = Omit<BankAccount, 'id' | 'created_at' | 'updated_at' | 'current_balance'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

// ─── Workspace Invitations ───────────────────────────────────────────────────

export type WorkspaceInvitationStatus = 'pending' | 'sent' | 'accepted' | 'failed' | 'expired' | 'revoked';

export interface WorkspaceInvitation {
  id: string;
  workspace_id: string;
  email: string;
  invited_user_name: string;
  role: UserRole;
  token_hash: string;
  code_hash: string;
  code_plain_preview?: string | null;
  status: WorkspaceInvitationStatus;
  expires_at: string;
  invited_by: string;
  permissions?: Record<AppModule, UserModulePermission> | null;
  data_scope?: DataAccessScope | null;
  financial_visibility?: Partial<FinancialVisibilitySettings> | null;
  approval_limits?: Partial<UserApprovalLimits> | null;
  accepted_at?: string | null;
  error_message?: string | null;
  sent_at?: string | null;
  created_at: string;
  updated_at: string;
  workspace?: Workspace;
}

export type WorkspaceInvitationInsert = Omit<WorkspaceInvitation, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

