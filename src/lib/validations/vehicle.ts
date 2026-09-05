import { z } from 'zod';

export const vehicleSchema = z.object({
  customer_id: z.string().uuid('Please select a customer'),
  make: z.string().min(1, 'Vehicle make is required').max(100),
  model: z.string().min(1, 'Vehicle model is required').max(100),
  year: z.coerce.number().min(1900).max(2100).optional().or(z.literal(0)),
  color: z.string().max(50).optional().or(z.literal('')),
  chassis_vin: z.string().max(50).optional().or(z.literal('')),
  mileage: z.coerce.number().min(0).optional().or(z.literal(0)),
  registration_number: z.string().max(30).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

export type VehicleFormValues = z.infer<typeof vehicleSchema>;
