import { z } from 'zod';

export const expenseSchema = z.object({
  date: z.string().min(1, 'Expense date is required'),
  category: z.string().min(1, 'Category is required'),
  description: z.string().min(1, 'Description is required').max(500, 'Description cannot exceed 500 characters'),
  amount: z.coerce.number().min(0.01, 'Amount must be greater than 0'),
  payment_method: z.enum(['cash', 'bank_transfer', 'credit_card', 'other', 'bank']),
  paid_to: z.string().max(255).optional().nullable().or(z.literal('')),
  reference_number: z.string().max(100).optional().nullable().or(z.literal('')),
  notes: z.string().max(1000).optional().nullable().or(z.literal('')),
  attachment_path: z.string().optional().nullable().or(z.literal('')),
});

export type ExpenseFormValues = z.infer<typeof expenseSchema>;

