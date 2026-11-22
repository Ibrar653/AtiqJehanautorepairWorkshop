export type AIProvider = "openai" | "gemini";
export type AIMode = "ask" | "agent";

export interface AIModelOption {
  id: string;
  label: string;
  provider: AIProvider;
  description: string;
  supportsTools: boolean;
  supportsStreaming: boolean;
  recommended?: boolean;
}

export interface ProviderConnectionStatus {
  provider: AIProvider;
  label: string;
  configured: boolean;
  operational: boolean;
  statusMessage: string;
  models: AIModelOption[];
}

export interface AIChatMessageInput {
  role: "user" | "assistant";
  content: string;
}

export interface PlannedLineItem {
  item_type: "service" | "part";
  description: string;
  quantity: number;
  unit_price: number;
  labour_charge?: number;
  total_price: number;
  service_id?: string | null;
  part_id?: string | null;
  matched_catalog_name?: string | null;
}

export interface ActionConfirmationPayload {
  idempotency_key: string;
  workflow_type:
    | "customer_vehicle_jobcard_invoice"
    | "create_customer"
    | "register_vehicle"
    | "create_job_card"
    | "update_job_card"
    | "convert_job_card_to_invoice"
    | "create_direct_invoice";
  summary_title: string;
  customer: {
    existing_id?: string | null;
    name: string;
    mobile?: string | null;
    company_name?: string | null;
    trn_number?: string | null;
    will_create: boolean;
    possible_duplicates?: Array<{ id: string; name: string; mobile?: string | null }>;
  };
  vehicle?: {
    existing_id?: string | null;
    make: string;
    model: string;
    year?: number | null;
    registration_number?: string | null;
    chassis_vin?: string | null;
    color?: string | null;
    mileage?: number | null;
    will_create: boolean;
  } | null;
  job_card?: {
    existing_id?: string | null;
    existing_number?: string | null;
    status?: "new" | "in_progress" | "waiting" | "completed" | "cancelled" | null;
    customer_complaint?: string | null;
    work_details?: string | null;
    assigned_mechanic?: string | null;
    notes?: string | null;
    will_create: boolean;
    will_update?: boolean;
  } | null;
  invoice?: {
    will_create: boolean;
    open_print_preview?: boolean;
    payment_status?: "paid" | "partially_paid" | "credit";
    notes?: string | null;
  } | null;
  items: PlannedLineItem[];
  financials: {
    subtotal: number;
    discount: number;
    discount_type: "fixed";
    taxable_amount: number;
    vat_rate: number;
    vat_amount: number;
    grand_total: number;
  };
  proposed_actions: string[];
  warnings?: string[];
}

export interface ExecutionStepStatus {
  id: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  detail?: string;
}

export interface DocumentActionRef {
  type: "job_card" | "invoice";
  id: string;
  number: string;
  label: string;
  autoPrintPreview?: boolean;
}

export interface ActionExecutionResult {
  success: boolean;
  idempotency_key: string;
  duplicate_prevented?: boolean;
  steps: ExecutionStepStatus[];
  created: {
    customer_id?: string;
    customer_name?: string;
    vehicle_id?: string;
    vehicle_label?: string;
    job_card_id?: string;
    job_card_number?: string;
    invoice_id?: string;
    invoice_number?: string;
  };
  documents: DocumentActionRef[];
  error?: string;
}

export interface ToolActivityLog {
  name: string;
  status: "running" | "completed" | "error";
  summary?: string;
}

export interface AIChatMessageUI {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  provider?: AIProvider;
  model?: string;
  mode?: AIMode;
  toolLogs?: ToolActivityLog[];
  confirmation?: ActionConfirmationPayload | null;
  confirmationStatus?: "pending" | "confirmed" | "cancelled" | "executed" | "failed";
  executionResult?: ActionExecutionResult | null;
  documents?: DocumentActionRef[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
  error?: string;
}

export interface AIConversationThread {
  id: string;
  title: string;
  provider: AIProvider;
  model: string;
  mode: AIMode;
  updatedAt: string;
  messages: AIChatMessageUI[];
}
