"use client";

import { useState } from "react";
import { createCustomer, checkDuplicateCustomerPhone, type CustomerWithMetrics } from "@/lib/services/customer-service";
import { createVehicle, checkDuplicateChassisVin, checkDuplicateRegistrationNumber } from "@/lib/services/vehicle-service";
import type { Customer, Vehicle } from "@/types/database";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  UserPlus,
  Car,
  User,
  Phone,
  Mail,
  MapPin,
  FileText,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Sparkles,
  Hash,
} from "lucide-react";

interface CombinedCustomerVehicleModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (customer: CustomerWithMetrics, vehicle: Vehicle) => void;
  initialCustomerName?: string;
}

export function CombinedCustomerVehicleModal({
  open,
  onOpenChange,
  onSuccess,
  initialCustomerName = "",
}: CombinedCustomerVehicleModalProps) {
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  // Section A: Customer Details
  const [customerName, setCustomerName] = useState(initialCustomerName);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [trnNumber, setTrnNumber] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  // Section B: Vehicle Details
  const [vehicleName, setVehicleName] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [color, setColor] = useState("");
  const [chassisVin, setChassisVin] = useState("");
  const [registrationNumber, setRegistrationNumber] = useState("");
  const [mileage, setMileage] = useState("");
  const [vehicleNotes, setVehicleNotes] = useState("");

  const resetForm = () => {
    setCustomerName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setCompanyName("");
    setTrnNumber("");
    setCustomerNotes("");
    setVehicleName("");
    setMake("");
    setModel("");
    setYear(new Date().getFullYear().toString());
    setColor("");
    setChassisVin("");
    setRegistrationNumber("");
    setMileage("");
    setVehicleNotes("");
    setErrorMessage(null);
    setWarningMessage(null);
  };

  const handleOpenChange = (isOpen: boolean) => {
    if (isOpen && initialCustomerName && !customerName) {
      setCustomerName(initialCustomerName);
    }
    if (!isOpen) {
      resetForm();
    }
    onOpenChange(isOpen);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setWarningMessage(null);

    // Validation
    const cleanCustName = customerName.trim();
    const cleanMake = make.trim();
    const cleanModel = model.trim();
    const cleanPhone = phone.trim();
    const cleanVin = chassisVin.trim();
    const cleanPlate = registrationNumber.trim();

    if (!cleanCustName) {
      setErrorMessage("Customer Name is required in Section A.");
      return;
    }
    if (!cleanMake || !cleanModel) {
      setErrorMessage("Vehicle Make and Model are required in Section B.");
      return;
    }

    setSaving(true);

    try {
      // 1. Check duplicate phone if provided
      if (cleanPhone) {
        const existingCust = await checkDuplicateCustomerPhone(cleanPhone);
        if (existingCust) {
          setWarningMessage(`Note: A customer "${existingCust.name}" already exists with phone ${cleanPhone}. Creating new profile linked to this vehicle.`);
        }
      }

      // 2. Prevent duplicate chassis / VIN if provided
      if (cleanVin) {
        const existingVin = await checkDuplicateChassisVin(cleanVin);
        if (existingVin) {
          setErrorMessage(`Chassis / VIN "${cleanVin}" is already registered to vehicle ${existingVin.make} ${existingVin.model}. Please verify the VIN.`);
          setSaving(false);
          return;
        }
      }

      // 3. Warn about duplicate plate number if provided
      if (cleanPlate) {
        const existingPlate = await checkDuplicateRegistrationNumber(cleanPlate);
        if (existingPlate) {
          setWarningMessage(`Warning: Registration plate "${cleanPlate}" is already on file for ${existingPlate.make} ${existingPlate.model}.`);
        }
      }

      // 4. Create Customer
      const newCustomer = await createCustomer({
        name: cleanCustName,
        mobile: cleanPhone || null,
        email: email.trim() || null,
        address: address.trim() || null,
        company_name: companyName.trim() || null,
        trn_number: trnNumber.trim() || null,
        notes: customerNotes.trim() || null,
      });

      if (!newCustomer || !newCustomer.id) {
        throw new Error("Failed to create customer record.");
      }

      // 5. Create Vehicle linked to new customer_id
      const combinedNotes = [
        vehicleName.trim() ? `Car Name: ${vehicleName.trim()}` : "",
        vehicleNotes.trim(),
      ]
        .filter(Boolean)
        .join(" • ");

      const newVehicle = await createVehicle({
        customer_id: newCustomer.id,
        make: cleanMake,
        model: cleanModel,
        year: year ? parseInt(year) : null,
        color: color.trim() || null,
        chassis_vin: cleanVin ? cleanVin.toUpperCase() : null,
        registration_number: cleanPlate ? cleanPlate.toUpperCase() : null,
        mileage: mileage ? parseInt(mileage) : null,
        notes: combinedNotes || null,
      });

      if (!newVehicle || !newVehicle.id) {
        throw new Error("Customer saved, but failed to create linked vehicle.");
      }

      // 6. Callback and Close
      const customerWithMetrics: CustomerWithMetrics = {
        ...newCustomer,
        vehicles: [newVehicle],
        vehicles_count: 1,
        vehicles_summary: `${newVehicle.make} ${newVehicle.model} (${newVehicle.registration_number || "No Plate"})`,
        outstanding_balance: 0,
      };

      if (onSuccess) {
        onSuccess(customerWithMetrics, newVehicle);
      }

      handleOpenChange(false);
    } catch (err: any) {
      console.error("Error creating customer and vehicle:", err);
      setErrorMessage(err.message || "An unexpected error occurred while saving.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 rounded-xl border border-border bg-card shadow-xl">
        {/* Modal Header */}
        <div className="p-6 pb-4 border-b border-border bg-muted/20">
          <DialogTitle className="text-lg font-bold flex items-center gap-2.5 text-foreground">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <UserPlus className="h-5 w-5" />
            </div>
            <span>+ Add Customer &amp; Vehicle</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Register a new client owner and their vehicle in a single step. Both records will be saved into their respective databases.
          </DialogDescription>
        </div>

        {/* Feedback Alerts */}
        {errorMessage && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {warningMessage && (
          <div className="mx-6 mt-4 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
            <span>{warningMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* SECTION A — CUSTOMER DETAILS */}
          <div className="space-y-4 rounded-xl p-4 bg-muted/30 border border-border/60">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2">
              <User className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Section A — Customer Details
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-name" className="text-xs font-semibold">
                  Customer / Owner Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="c-name"
                  placeholder="e.g. Gul Khan / Mohammed Al Ameri"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  required
                  autoFocus
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-phone" className="text-xs font-semibold">
                  Phone Number
                </Label>
                <Input
                  id="c-phone"
                  placeholder="e.g. +971501234567 or 0501234567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-email" className="text-xs font-semibold">
                  Email Address
                </Label>
                <Input
                  id="c-email"
                  type="email"
                  placeholder="e.g. client@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-address" className="text-xs font-semibold">
                  Physical Address / Emirate
                </Label>
                <Input
                  id="c-address"
                  placeholder="e.g. Mussafah M-14, Abu Dhabi, UAE"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-company" className="text-xs font-semibold">
                  Company Name (Optional)
                </Label>
                <Input
                  id="c-company"
                  placeholder="e.g. Al Dhafra Transport LLC"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="c-trn" className="text-xs font-semibold text-primary">
                  Company / Customer TRN No. (Optional)
                </Label>
                <Input
                  id="c-trn"
                  placeholder="e.g. 100123456789003"
                  value={trnNumber}
                  onChange={(e) => setTrnNumber(e.target.value)}
                  className="h-10 text-sm bg-background font-mono"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-notes" className="text-xs font-semibold">
                  Customer Notes (Optional)
                </Label>
                <Input
                  id="c-notes"
                  placeholder="e.g. VIP client, preferred payment method, company account..."
                  value={customerNotes}
                  onChange={(e) => setCustomerNotes(e.target.value)}
                  className="h-9 text-xs bg-background"
                />
              </div>
            </div>
          </div>

          {/* SECTION B — VEHICLE DETAILS */}
          <div className="space-y-4 rounded-xl p-4 bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-2 border-b border-primary/20 pb-2">
              <Car className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-primary">
                Section B — Vehicle Details
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="v-custom-name" className="text-xs font-semibold">
                  Vehicle / Car Name (Optional Nickname)
                </Label>
                <Input
                  id="v-custom-name"
                  placeholder="e.g. White Land Cruiser / Daily Driver / Fleet #4"
                  value={vehicleName}
                  onChange={(e) => setVehicleName(e.target.value)}
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="v-make" className="text-xs font-semibold">
                  Make / Manufacturer <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="v-make"
                  placeholder="e.g. Toyota, Nissan, Mercedes..."
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  required
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="v-model" className="text-xs font-semibold">
                  Model <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="v-model"
                  placeholder="e.g. Land Cruiser VXR, Patrol, Prado..."
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  required
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="v-plate" className="text-xs font-semibold">
                  Registration / Number Plate
                </Label>
                <Input
                  id="v-plate"
                  placeholder="e.g. AD-45892 or DXB-K-12345"
                  value={registrationNumber}
                  onChange={(e) => setRegistrationNumber(e.target.value)}
                  className="h-10 text-sm uppercase font-mono bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="v-vin" className="text-xs font-semibold">
                  Chassis Number / VIN
                </Label>
                <Input
                  id="v-vin"
                  placeholder="17-character VIN code"
                  value={chassisVin}
                  onChange={(e) => setChassisVin(e.target.value)}
                  className="h-10 text-sm uppercase font-mono bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="v-year" className="text-xs font-semibold">
                  Year of Manufacture
                </Label>
                <Input
                  id="v-year"
                  type="number"
                  placeholder="e.g. 2023"
                  min="1970"
                  max={new Date().getFullYear() + 2}
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="v-color" className="text-xs font-semibold">
                  Color
                </Label>
                <Input
                  id="v-color"
                  placeholder="e.g. Pearl White, Silver, Black"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="v-mileage" className="text-xs font-semibold">
                  Current Mileage (KM)
                </Label>
                <Input
                  id="v-mileage"
                  type="number"
                  placeholder="e.g. 65000"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  className="h-10 text-sm bg-background"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="v-notes" className="text-xs font-semibold">
                  Vehicle Specific Notes
                </Label>
                <Input
                  id="v-notes"
                  placeholder="e.g. Lift kit installed, ceramic coated, modified exhaust..."
                  value={vehicleNotes}
                  onChange={(e) => setVehicleNotes(e.target.value)}
                  className="h-9 text-xs bg-background"
                />
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={saving}
              className="h-10 px-4 text-xs font-semibold rounded-lg"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="h-10 px-5 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs gap-2"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving Both Records...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Save Customer &amp; Vehicle
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
