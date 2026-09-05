import { z } from 'zod';

export const partSchema = z.object({
  name: z.string().min(1, 'Part name is required').max(200),
  part_number: z.string().max(100).optional().or(z.literal('')),
  brand: z.string().max(100).optional().or(z.literal('')),
  unit: z.string().min(1).max(50).default('piece'),
  purchase_price: z.coerce.number().min(0, 'Purchase price must be 0 or more'),
  selling_price: z.coerce.number().min(0, 'Selling price must be 0 or more'),
  current_stock: z.coerce.number().int().min(0).default(0),
  minimum_stock: z.coerce.number().int().min(0).default(0),
  supplier_id: z.string().uuid().optional().or(z.literal('')),
  is_active: z.boolean().default(true),
});

export type PartFormValues = z.infer<typeof partSchema>;
