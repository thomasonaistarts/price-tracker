import { z } from 'zod'

export const loginSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  password: z.string().min(4, 'Şifre en az 4 karakter olmalı'),
})

export const createUserSchema = z.object({
  email: z.string().email('Geçerli bir e-posta girin'),
  full_name: z.string().min(2, 'Ad soyad en az 2 karakter olmalı'),
  password: z.string().min(8, 'Şifre en az 8 karakter olmalı'),
  role: z.enum(['admin', 'user']).default('user'),
})

export const updateUserSchema = z.object({
  full_name: z.string().min(2).optional(),
  role: z.enum(['admin', 'user']).optional(),
  is_active: z.boolean().optional(),
})

export const productSchema = z.object({
  sku: z.string().min(1, 'SKU zorunlu'),
  product_name: z.string().min(1, 'Ürün adı zorunlu'),
  brand: z.string().optional(),
  category: z.string().optional(),
  our_price: z.number().positive('Fiyat sıfırdan büyük olmalı'),
  currency: z.string().default('TRY'),
})

export const analyzeSchema = z.object({
  products: z.array(productSchema),
  threshold_percent: z.number().min(1).max(50).default(10),
  min_sources: z.number().min(1).max(10).default(5),
  category_thresholds: z.record(z.number()).optional(),
})

export const categoryThresholdSchema = z.object({
  category: z.string().min(1),
  threshold_percent: z.number().min(1).max(50),
})

export type LoginInput = z.infer<typeof loginSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ProductInput = z.infer<typeof productSchema>
export type AnalyzeInput = z.infer<typeof analyzeSchema>
