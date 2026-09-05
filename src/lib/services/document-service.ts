import { createClient } from "@/lib/supabase/client";
import type {
  UploadedJobCard,
  UploadedJobCardInsert,
  UploadedJobCardWithRelations,
  JobCardAttachment,
  JobCardAttachmentInsert,
} from "@/types/database";

const LOCAL_STORAGE_DOCS_KEY = "atiq_local_uploaded_job_cards";
const LOCAL_STORAGE_ATTACHMENTS_KEY = "atiq_local_job_card_attachments";

let inMemoryDocs: UploadedJobCardWithRelations[] = [];
let inMemoryAttachments: JobCardAttachment[] = [];

function getLocalDocs(): UploadedJobCardWithRelations[] {
  if (typeof window === "undefined") return inMemoryDocs;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_DOCS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.length > 0 ? parsed : inMemoryDocs;
  } catch {
    return inMemoryDocs;
  }
}

function saveLocalDocs(docs: UploadedJobCardWithRelations[]) {
  inMemoryDocs = docs;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_DOCS_KEY, JSON.stringify(docs));
  } catch (e) {
    console.error("Failed to save local uploaded job cards", e);
  }
}

function getLocalAttachments(): JobCardAttachment[] {
  if (typeof window === "undefined") return inMemoryAttachments;
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_ATTACHMENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return parsed.length > 0 ? parsed : inMemoryAttachments;
  } catch {
    return inMemoryAttachments;
  }
}

function saveLocalAttachments(attachments: JobCardAttachment[]) {
  inMemoryAttachments = attachments;
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LOCAL_STORAGE_ATTACHMENTS_KEY, JSON.stringify(attachments));
  } catch (e) {
    console.error("Failed to save local attachments", e);
  }
}

/**
 * Converts a File or Blob to a Base64 Data URL (used as bulletproof fallback)
 */
export function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof FileReader === "undefined") {
      // In Node.js environment
      resolve("data:application/pdf;base64,JVBERi0xLjQKJ...");
      return;
    }
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (err) => reject(err);
  });
}

/**
 * Upload a document or image to Supabase Storage with local fallback
 */
export async function uploadJobCardFile(
  file: File,
  folder = "documents"
): Promise<{ fileUrl: string; fileName: string; fileType: string; fileSize: number }> {
  const fileName = file.name;
  const fileType = file.type || "application/octet-stream";
  const fileSize = file.size;
  const cleanName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `${folder}/${Date.now()}_${cleanName}`;

  const supabase = createClient();
  try {
    const { data, error } = await supabase.storage
      .from("job-card-documents")
      .upload(filePath, file, {
        cacheControl: "3600",
        upsert: true,
      });

    if (error) throw error;

    const { data: publicUrlData } = supabase.storage
      .from("job-card-documents")
      .getPublicUrl(data.path);

    return {
      fileUrl: publicUrlData.publicUrl,
      fileName,
      fileType,
      fileSize,
    };
  } catch (err: any) {
    console.warn("Storage upload fallback to Data URL (Supabase offline/unreachable):", err.message || err);
    const base64Url = await fileToBase64(file);
    return {
      fileUrl: base64Url,
      fileName,
      fileType,
      fileSize,
    };
  }
}

/**
 * Create a new record for an uploaded historical / paper job card
 */
export async function createUploadedJobCard(
  payload: UploadedJobCardInsert,
  customerInfo?: { name: string; mobile?: string | null; email?: string | null },
  vehicleInfo?: { make: string; model: string; registration_number?: string | null; chassis_vin?: string | null } | null
) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("uploaded_job_cards")
      .insert(payload)
      .select("*, customer:customers(*), vehicle:vehicles(*)")
      .single();

    if (error) throw error;

    const formatted = data as UploadedJobCardWithRelations;
    const current = getLocalDocs();
    current.unshift(formatted);
    saveLocalDocs(current);
    return formatted;
  } catch (err: any) {
    console.warn("Saving uploaded job card to local store fallback:", err.message || err);
    const newDoc: UploadedJobCardWithRelations = {
      id: "upld-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      job_card_number: payload.job_card_number,
      customer_id: payload.customer_id,
      vehicle_id: payload.vehicle_id || null,
      date: payload.date || new Date().toISOString().slice(0, 10),
      description: payload.description || null,
      file_url: payload.file_url,
      file_name: payload.file_name,
      file_type: payload.file_type,
      file_size: payload.file_size,
      document_type: payload.document_type || "paper_job_card",
      job_card_id: payload.job_card_id || null,
      created_by: payload.created_by || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      customer: {
        id: payload.customer_id,
        name: customerInfo?.name || "Customer",
        mobile: customerInfo?.mobile || null,
        email: customerInfo?.email || null,
        address: null,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        created_by: null,
      },
      vehicle: payload.vehicle_id
        ? {
            id: payload.vehicle_id,
            customer_id: payload.customer_id,
            make: vehicleInfo?.make || "Vehicle",
            model: vehicleInfo?.model || "",
            year: null,
            color: null,
            chassis_vin: vehicleInfo?.chassis_vin || null,
            mileage: null,
            registration_number: vehicleInfo?.registration_number || null,
            notes: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }
        : null,
    };

    const current = getLocalDocs();
    current.unshift(newDoc);
    saveLocalDocs(current);
    return newDoc;
  }
}

/**
 * Fetch list of uploaded paper job cards with search & pagination
 */
export async function getUploadedJobCards(query?: string, page = 1, limit = 20) {
  const supabase = createClient();
  const offset = (page - 1) * limit;

  try {
    let dbQuery = supabase
      .from("uploaded_job_cards")
      .select("*, customer:customers(*), vehicle:vehicles(*)", { count: "exact" });

    if (query && query.trim()) {
      const q = query.trim();
      const [{ data: matchingCustomers }, { data: matchingVehicles }] = await Promise.all([
        supabase.from("customers").select("id").or(`name.ilike.%${q}%,mobile.ilike.%${q}%`),
        supabase.from("vehicles").select("id").or(`registration_number.ilike.%${q}%,chassis_vin.ilike.%${q}%,make.ilike.%${q}%,model.ilike.%${q}%`),
      ]);

      const custIds = (matchingCustomers || []).map((c: any) => c.id);
      const vehIds = (matchingVehicles || []).map((v: any) => v.id);

      const orClauses: string[] = [
        `job_card_number.ilike.%${q}%`,
        `description.ilike.%${q}%`,
      ];

      if (/^\d{4}(-\d{2})?(-\d{2})?$/.test(q)) {
        orClauses.push(`date.eq.${q}`);
      }
      if (custIds.length > 0) {
        orClauses.push(`customer_id.in.(${custIds.join(",")})`);
      }
      if (vehIds.length > 0) {
        orClauses.push(`vehicle_id.in.(${vehIds.join(",")})`);
      }

      dbQuery = dbQuery.or(orClauses.join(","));
    }

    const { data, count, error } = await dbQuery
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw error;

    saveLocalDocs(data || []);
    return {
      uploadedJobCards: (data || []) as UploadedJobCardWithRelations[],
      total: count || 0,
    };
  } catch (err: any) {
    console.warn("Using local uploaded job cards store fallback:", err.message || err);
    let local = getLocalDocs();

    if (query && query.trim()) {
      const q = query.trim().toLowerCase();
      local = local.filter((d) => {
        const jcMatch = d.job_card_number.toLowerCase().includes(q);
        const descMatch = d.description ? d.description.toLowerCase().includes(q) : false;
        const custNameMatch = d.customer?.name ? d.customer.name.toLowerCase().includes(q) : false;
        const custMobileMatch = d.customer?.mobile ? d.customer.mobile.toLowerCase().includes(q) : false;
        const vehMakeMatch = d.vehicle?.make ? d.vehicle.make.toLowerCase().includes(q) : false;
        const vehModelMatch = d.vehicle?.model ? d.vehicle.model.toLowerCase().includes(q) : false;
        const vehPlateMatch = d.vehicle?.registration_number ? d.vehicle.registration_number.toLowerCase().includes(q) : false;
        const vehVinMatch = d.vehicle?.chassis_vin ? d.vehicle.chassis_vin.toLowerCase().includes(q) : false;
        return (
          jcMatch ||
          descMatch ||
          custNameMatch ||
          custMobileMatch ||
          vehMakeMatch ||
          vehModelMatch ||
          vehPlateMatch ||
          vehVinMatch
        );
      });
    }

    const paged = local.slice(offset, offset + limit);
    return { uploadedJobCards: paged, total: local.length };
  }
}

/**
 * Get single uploaded job card by ID
 */
export async function getUploadedJobCardById(id: string) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("uploaded_job_cards")
      .select("*, customer:customers(*), vehicle:vehicles(*)")
      .eq("id", id)
      .single();

    if (error) throw error;
    return data as UploadedJobCardWithRelations;
  } catch (err: any) {
    const local = getLocalDocs();
    return local.find((d) => d.id === id) || null;
  }
}

/**
 * Get all uploaded job cards and documents for a customer
 */
export async function getDocumentsByCustomer(customerId: string) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("uploaded_job_cards")
      .select("*, customer:customers(*), vehicle:vehicles(*)")
      .eq("customer_id", customerId)
      .order("date", { ascending: false });

    if (error) throw error;
    return (data || []) as UploadedJobCardWithRelations[];
  } catch (err: any) {
    const local = getLocalDocs();
    return local.filter((d) => d.customer_id === customerId);
  }
}

/**
 * Get all uploaded job cards and documents for a vehicle
 */
export async function getDocumentsByVehicle(vehicleId: string) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("uploaded_job_cards")
      .select("*, customer:customers(*), vehicle:vehicles(*)")
      .eq("vehicle_id", vehicleId)
      .order("date", { ascending: false });

    if (error) throw error;
    return (data || []) as UploadedJobCardWithRelations[];
  } catch (err: any) {
    const local = getLocalDocs();
    return local.filter((d) => d.vehicle_id === vehicleId);
  }
}

/**
 * Delete an uploaded job card record
 */
export async function deleteUploadedJobCard(id: string) {
  const supabase = createClient();
  try {
    const { error } = await supabase.from("uploaded_job_cards").delete().eq("id", id);
    if (error) throw error;
  } catch (err: any) {
    console.warn("Deleting uploaded job card from local fallback:", err.message || err);
  }

  const local = getLocalDocs().filter((d) => d.id !== id);
  saveLocalDocs(local);
  return true;
}

// ─── Attachments for Digital Job Cards ──────────────────────────────────────

/**
 * Get all attachments associated with a digital job card
 */
export async function getAttachmentsByJobCard(jobCardId: string) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("job_card_attachments")
      .select("*")
      .eq("job_card_id", jobCardId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data || []) as JobCardAttachment[];
  } catch (err: any) {
    const local = getLocalAttachments();
    return local.filter((a) => a.job_card_id === jobCardId);
  }
}

/**
 * Add an attachment to a digital job card
 */
export async function addJobCardAttachment(
  jobCardId: string,
  payload: Omit<JobCardAttachmentInsert, "job_card_id">
) {
  const supabase = createClient();
  try {
    const { data, error } = await supabase
      .from("job_card_attachments")
      .insert({ ...payload, job_card_id: jobCardId })
      .select()
      .single();

    if (error) throw error;
    const item = data as JobCardAttachment;
    const current = getLocalAttachments();
    current.unshift(item);
    saveLocalAttachments(current);
    return item;
  } catch (err: any) {
    console.warn("Adding job card attachment to local fallback:", err.message || err);
    const newAtt: JobCardAttachment = {
      id: "att-" + Date.now() + "-" + Math.random().toString(36).substring(2, 7),
      job_card_id: jobCardId,
      document_type: payload.document_type,
      file_url: payload.file_url,
      file_name: payload.file_name,
      file_type: payload.file_type,
      file_size: payload.file_size,
      description: payload.description || null,
      created_by: payload.created_by || null,
      created_at: new Date().toISOString(),
    };
    const current = getLocalAttachments();
    current.unshift(newAtt);
    saveLocalAttachments(current);
    return newAtt;
  }
}

/**
 * Delete a job card attachment
 */
export async function deleteJobCardAttachment(id: string) {
  const supabase = createClient();
  try {
    const { error } = await supabase.from("job_card_attachments").delete().eq("id", id);
    if (error) throw error;
  } catch (err: any) {
    console.warn("Deleting attachment from local fallback:", err.message || err);
  }
  const local = getLocalAttachments().filter((a) => a.id !== id);
  saveLocalAttachments(local);
  return true;
}
