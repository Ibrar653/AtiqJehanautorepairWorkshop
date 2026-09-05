"use client";

import { useState, useEffect } from "react";
import { CustomerSearchSelect } from "@/components/shared/customer-search-select";
import { uploadJobCardFile, createUploadedJobCard } from "@/lib/services/document-service";
import { getVehiclesByCustomer } from "@/lib/services/vehicle-service";
import type { CustomerWithMetrics } from "@/lib/services/customer-service";
import type { Vehicle, UploadedJobCardWithRelations, DocumentType } from "@/types/database";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Upload,
  FileText,
  FileSpreadsheet,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  CheckCircle2,
  X,
  Plus,
  Car,
} from "lucide-react";

interface UploadJobCardDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (newDoc: UploadedJobCardWithRelations) => void;
  onUploadComplete?: () => void;
  initialCustomerId?: string;
  customerId?: string;
  initialVehicleId?: string;
  vehicleId?: string;
}

export function UploadJobCardDialog({
  open,
  onOpenChange,
  onSuccess,
  onUploadComplete,
  initialCustomerId,
  customerId,
  initialVehicleId,
  vehicleId,
}: UploadJobCardDialogProps) {
  const activeCustId = customerId || initialCustomerId;
  const activeVehId = vehicleId || initialVehicleId;
  const [jobCardNumber, setJobCardNumber] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithMetrics | null>(null);
  const [customerVehicles, setCustomerVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(activeVehId || "");
  const [description, setDescription] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("paper_job_card");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load vehicles when customer changes
  useEffect(() => {
    if (!selectedCustomer) {
      setCustomerVehicles([]);
      setSelectedVehicleId("");
      return;
    }

    setLoadingVehicles(true);
    getVehiclesByCustomer(selectedCustomer.id)
      .then((vehs) => {
        setCustomerVehicles(vehs);
        if (vehs.length > 0 && !selectedVehicleId) {
          setSelectedVehicleId(vehs[0].id);
        }
      })
      .catch(console.error)
      .finally(() => setLoadingVehicles(false));
  }, [selectedCustomer]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate type (PDF, PNG, JPG, JPEG)
    const allowedTypes = ["application/pdf", "image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Only PDF, JPG, JPEG, and PNG files are supported for paper job cards.");
      setSelectedFile(null);
      return;
    }

    // Validate size (max 15MB)
    if (file.size > 15 * 1024 * 1024) {
      setError("File size exceeds 15MB limit. Please upload a smaller document.");
      setSelectedFile(null);
      return;
    }

    setError(null);
    setSelectedFile(file);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!jobCardNumber.trim()) {
      setError("Job Card Number is required (e.g. JC-1129).");
      return;
    }

    if (!selectedCustomer) {
      setError("Please select or register a customer for this document.");
      return;
    }

    if (!selectedFile) {
      setError("Please select a paper job card file to upload.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      // 1. Upload file to Supabase Storage (with base64 fallback)
      const uploadedFile = await uploadJobCardFile(selectedFile, "uploaded-job-cards");

      const activeVeh = customerVehicles.find((v) => v.id === selectedVehicleId);

      // 2. Create database record
      const docRecord = await createUploadedJobCard(
        {
          job_card_number: jobCardNumber.trim(),
          customer_id: selectedCustomer.id,
          vehicle_id: selectedVehicleId || null,
          date: date || new Date().toISOString().slice(0, 10),
          description: description.trim() || null,
          file_url: uploadedFile.fileUrl,
          file_name: uploadedFile.fileName,
          file_type: uploadedFile.fileType,
          file_size: uploadedFile.fileSize,
          document_type: documentType,
        },
        {
          name: selectedCustomer.name,
          mobile: selectedCustomer.mobile,
          email: selectedCustomer.email,
        },
        activeVeh
          ? {
              make: activeVeh.make,
              model: activeVeh.model,
              registration_number: activeVeh.registration_number,
              chassis_vin: activeVeh.chassis_vin,
            }
          : null
      );

      // Reset form
      setJobCardNumber("");
      setSelectedFile(null);
      setDescription("");
      setSelectedCustomer(null);
      setSelectedVehicleId("");

      onOpenChange(false);
      if (onSuccess) {
        onSuccess(docRecord);
      }
      if (onUploadComplete) {
        onUploadComplete();
      }
    } catch (err: any) {
      setError(err.message || "Failed to upload and save job card document.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5 text-primary" /> Upload Existing / Paper Job Card
        </DialogTitle>
        <DialogDescription>
          Archive a physical or historical repair order (PDF, JPG, PNG). It will be linked to the customer and vehicle history.
        </DialogDescription>

        <form onSubmit={handleUploadSubmit} className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="up-jc-num">
                Job Card Number <span className="text-destructive">*</span>
              </Label>
              <Input
                id="up-jc-num"
                placeholder="e.g. JC-1129 / ARCH-2024-05"
                value={jobCardNumber}
                onChange={(e) => setJobCardNumber(e.target.value)}
                required
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="up-date">
                Job Card Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="up-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Customer Selection with Search & Inline Add */}
          <div className="space-y-2">
            <CustomerSearchSelect
              selectedCustomerId={selectedCustomer?.id}
              selectedVehicleId={selectedVehicleId}
              onSelectCustomer={(c, v) => {
                setSelectedCustomer(c);
                if (v) setSelectedVehicleId(v.id);
              }}
            />
          </div>

          {/* Vehicle Selection (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="up-vehicle">Vehicle (Optional)</Label>
            {selectedCustomer ? (
              loadingVehicles ? (
                <div className="h-10 flex items-center gap-2 text-xs text-muted-foreground px-3 border rounded-lg bg-muted/20">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Loading vehicles...
                </div>
              ) : customerVehicles.length > 0 ? (
                <select
                  id="up-vehicle"
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">No specific vehicle / General record</option>
                  {customerVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.make} {v.model} {v.year ? `(${v.year})` : ""} — Plate: {v.registration_number || "No Plate"} | VIN: {v.chassis_vin || "N/A"}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="h-10 flex items-center text-xs text-muted-foreground px-3 border rounded-lg bg-muted/30">
                  No vehicles registered for {selectedCustomer.name} (Optional)
                </div>
              )
            ) : (
              <div className="h-10 flex items-center text-xs text-muted-foreground px-3 border rounded-lg bg-muted/30">
                Select a customer first to list vehicles
              </div>
            )}
          </div>

          {/* File Upload Dropzone */}
          <div className="space-y-2">
            <Label>
              Document / Paper Scan File <span className="text-destructive">*</span>
            </Label>
            <div className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-4 text-center bg-muted/10">
              {selectedFile ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-background border text-left">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      {selectedFile.type.includes("pdf") ? (
                        <FileText className="h-5 w-5" />
                      ) : (
                        <ImageIcon className="h-5 w-5" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • {selectedFile.type || "Document"}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedFile(null)}
                    className="text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div>
                  <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm font-semibold text-foreground">Click to browse or drag & drop scan file</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Supported formats: PDF, JPG, JPEG, PNG (Max 15MB)
                  </p>
                  <input
                    type="file"
                    accept=".pdf,image/png,image/jpeg,image/jpg,image/webp"
                    onChange={handleFileChange}
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="up-desc">Description / Scope of Historical Work</Label>
            <Textarea
              id="up-desc"
              placeholder="e.g. Engine overhaul, suspension replacement, historical repair summary..."
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Uploading & Saving...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" /> Upload & Archive Job Card
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
