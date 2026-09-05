import { z } from 'zod';

const jobCardItemSchema = z.object({
  item_type: z.enum(['service', 'part', 'labour']),
  service_id: z.string().uuid().optional().or(z.literal('')),
  part_id: z.string().uuid().optional().or(z.literal('')),
  description: z.string().min(1, 'Description is required'),
  quantity: z.coerce.number().min(0.01, 'Quantity must be greater than 0'),
  unit_price: z.coerce.number().min(0, 'Unit price must be 0 or more'),
  total_price: z.coerce.number().min(0),
});

export const jobCardSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  customer_id: z.string().uuid('Please select a customer'),
  vehicle_id: z.string().uuid('Please select a vehicle'),
  mileage_in: z.coerce.number().min(0).optional().or(z.literal(0)),
  customer_complaint: z.string().max(2000).optional().or(z.literal('')),
  discount: z.coerce.number().min(0).default(0),
  vat_rate: z.coerce.number().min(0).max(100).default(5),
  status: z.enum(['new', 'in_progress', 'waiting', 'completed', 'cancelled']).default('new'),
  notes: z.string().max(2000).optional().or(z.literal('')),
  items: z.array(jobCardItemSchema).min(0),
});

export type JobCardFormValues = z.infer<typeof jobCardSchema>;
export type JobCardItemFormValues = z.infer<typeof jobCardItemSchema>;
