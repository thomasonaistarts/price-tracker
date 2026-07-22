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
  sku: z.coerce.string().min(1, 'SKU zorunlu'),
  product_name: z.coerce.string().min(1, 'Ürün adı zorunlu'),
  brand: z.coerce.string().optional(),
  category: z.coerce.string().optional(),
  // Excel'den string, number, currency-format ("150,00 ₺"), boş hücre gelebilir
  our_price: z.preprocess((val) => {
    if (val === null || val === undefined || val === '') return undefined
    if (typeof val === 'number') return isNaN(val) ? undefined : val
    // "1.234,56 ₺" veya "1,234.56" gibi formatları normalize et
    const cleaned = String(val).replace(/[^\d.,]/g, '')
    // Türkçe format: binlik ayracı nokta, ondalık virgül → "1.234,56" → "1234.56"
    const normalized = cleaned.includes(',')
      ? cleaned.replace(/\./g, '').replace(',', '.')
      : cleaned
    const n = parseFloat(normalized)
    return isNaN(n) ? undefined : n
  }, z.number({ required_error: 'our_price zorunlu' }).positive('our_price sıfırdan büyük olmalı')),
  currency: z.coerce.string().default('TRY'),
})

export const analyzeSchema = z.object({
  products: z.array(productSchema),
  threshold_percent: z.number().min(1).max(50).optional(),
  min_sources: z.number().min(1).max(5).optional(),
  category_thresholds: z.record(z.number()).optional(),
})

const platformSchema = z.enum(['Hepsiburada', 'N11', 'PTTAvm', 'İdefix', 'Trendyol'])

export const userSettingsPatchSchema = z.object({
  default_threshold_percent: z.number().min(1).max(50).optional(),
  min_sources: z.number().int().min(1).max(5).optional(),
  outlier_filter_pct: z.number().min(1).max(100).optional(),
  outlier_upper_pct: z.number().min(100).max(500).optional(),
  active_platforms: z.array(platformSchema).min(1).optional(),
  weekly_report_enabled: z.boolean().optional(),
  weekly_report_day: z.number().int().min(0).max(6).optional(),
  weekly_report_hour: z.number().int().min(0).max(23).optional(),
  confidence_exact: z.number().int().min(1).max(99).optional(),
  confidence_high: z.number().int().min(1).max(99).optional(),
  confidence_medium: z.number().int().min(1).max(99).optional(),
  confidence_low: z.number().int().min(1).max(99).optional(),
}).strict()

export const categoryThresholdSchema = z.object({
  category: z.string().min(1),
  threshold_percent: z.number().min(1).max(50),
})

export type LoginInput = z.infer<typeof loginSchema>
export type CreateUserInput = z.infer<typeof createUserSchema>
export type UpdateUserInput = z.infer<typeof updateUserSchema>
export type ProductInput = z.infer<typeof productSchema>
export type AnalyzeInput = z.infer<typeof analyzeSchema>
