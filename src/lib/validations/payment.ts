import { z } from 'zod';

export const paymentSchema = z.object({
  invoice_id: z.string().uuid().optional().or(z.literal('')),
  job_card_id: z.string().uuid().optional().or(z.literal('')),
  customer_id: z.string().uuid('Please select a customer'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  payment_method: z.enum(['cash', 'bank', 'credit']),
  reference_number: z.string().max(100).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  payment_date: z.string().min(1, 'Payment date is required'),
});

export type PaymentFormValues = z.infer<typeof paymentSchema>;
