import { z } from 'zod';

export const supplierSchema = z.object({
  name: z.string().min(1, 'Supplier name is required').max(200),
  company_name: z.string().max(200).optional().or(z.literal('')),
  contact_person: z.string().max(200).optional().or(z.literal('')),
  phone: z.string().min(1, 'Mobile phone is required').max(30),
  alternate_phone: z.string().max(30).optional().or(z.literal('')),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().max(500).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  trn_number: z.string().max(50).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  is_active: z.boolean().default(true),
});

export type SupplierFormValues = z.infer<typeof supplierSchema>;
