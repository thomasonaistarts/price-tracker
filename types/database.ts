// Bu dosya `npm run db:types` ile Supabase'den otomatik üretilir.
// Manuel olarak da güncelleyebilirsiniz.

export type UserRole = 'admin' | 'user'
export type AlertType = 'above_market' | 'below_market' | 'no_alert' | 'insufficient_data'

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string
          email: string
          full_name: string
          role: UserRole
          is_active: boolean
          created_at: string
          updated_at: string
          created_by: string | null
          last_login: string | null
        }
        Insert: Omit<Database['public']['Tables']['users']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['users']['Insert']>
      }
      products: {
        Row: {
          id: string
          user_id: string
          sku: string
          product_name: string
          brand: string | null
          category: string | null
          our_price: number
          currency: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      price_analyses: {
        Row: {
          id: string
          product_id: string
          user_id: string
          market_mean: number | null
          market_median: number | null
          market_std: number | null
          min_price: number | null
          max_price: number | null
          price_diff_percent: number | null
          alert: AlertType
          alert_reason: string | null
          sources_count: number
          sources: Json
          confidence: number
          threshold_used: number
          notes: string[]
          follow_up: string[]
          run_at: string
        }
        Insert: Omit<Database['public']['Tables']['price_analyses']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['price_analyses']['Insert']>
      }
      category_thresholds: {
        Row: {
          id: string
          user_id: string
          category: string
          threshold_percent: number
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['category_thresholds']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['category_thresholds']['Insert']>
      }
    }
    Views: {}
    Functions: {}
    Enums: {
      user_role: UserRole
      alert_type: AlertType
    }
  }
}

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

// Convenience types
export type User = Database['public']['Tables']['users']['Row']
export type Product = Database['public']['Tables']['products']['Row']
export type PriceAnalysis = Database['public']['Tables']['price_analyses']['Row']
export type CategoryThreshold = Database['public']['Tables']['category_thresholds']['Row']
