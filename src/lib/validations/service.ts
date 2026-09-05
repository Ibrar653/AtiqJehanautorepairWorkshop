import { z } from 'zod';

export const serviceSchema = z.object({
  name: z.string().min(1, 'Service name is required').max(200),
  description: z.string().max(500).optional().or(z.literal('')),
  default_price: z.coerce.number().min(0, 'Price must be 0 or more'),
  is_active: z.boolean().default(true),
});

export type ServiceFormValues = z.infer<typeof serviceSchema>;
