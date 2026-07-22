// Bu dosya `npm run db:types` ile Supabase'den otomatik üretilir.
// Manuel olarak da güncelleyebilirsiniz.

export type UserRole = 'admin' | 'user'
export type AlertType = 'above_market' | 'below_market' | 'no_alert' | 'insufficient_data'
export type AnalysisAttemptStatus = 'success' | 'failed'
export type SourceDecisionValue = 'approved' | 'rejected'

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
          purchase_cost: number | null
          vat_rate: number
          commission_rate: number
          shipping_cost: number
          packaging_cost: number
          target_margin_rate: number
          price_floor: number | null
          price_ceiling: number | null
          currency: string
          is_active: boolean
          created_at: string
          updated_at: string
          last_analyzed_at: string | null
          last_attempted_at: string | null
          last_attempt_status: AnalysisAttemptStatus | null
          last_attempt_failure_reason: string | null
          last_attempt_error: string | null
        }
        Insert: Omit<Database['public']['Tables']['products']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['products']['Insert']>
      }
      price_analyses: {
        Row: {
          id: string
          product_id: string
          user_id: string
          our_price: number | null
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
          scraper_health: Json
          confidence: number
          threshold_used: number
          notes: string[]
          follow_up: string[]
          run_at: string
        }
        Insert: Omit<Database['public']['Tables']['price_analyses']['Row'], 'id'>
        Update: Partial<Database['public']['Tables']['price_analyses']['Insert']>
      }
      product_price_changes: {
        Row: {
          id: string
          product_id: string
          user_id: string
          old_price: number
          new_price: number
          change_source: 'manual' | 'recommendation'
          reason: string | null
          recommendation_snapshot: Json
          created_at: string
        }
        Insert: Omit<Database['public']['Tables']['product_price_changes']['Row'], 'id' | 'created_at'>
        Update: never
      }
      analysis_attempts: {
        Row: {
          id: string
          product_id: string
          user_id: string
          status: AnalysisAttemptStatus
          failure_reason: string | null
          error_message: string | null
          scraper_health: Json
          attempted_at: string
        }
        Insert: Omit<Database['public']['Tables']['analysis_attempts']['Row'], 'id'>
        Update: never
      }
      source_match_decisions: {
        Row: {
          id: string
          product_id: string
          user_id: string
          platform: string
          source_url: string
          source_product_name: string | null
          decision: SourceDecisionValue
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['source_match_decisions']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['source_match_decisions']['Insert']>
      }
      data_archive_batches: {
        Row: {
          id: string
          scope: 'site_catalog'
          status: 'preparing' | 'verified' | 'failed'
          reason: string | null
          source_counts: Json
          archive_counts: Json
          created_by: string
          created_at: string
          verified_at: string | null
        }
        Insert: Omit<Database['public']['Tables']['data_archive_batches']['Row'], 'id' | 'created_at'>
        Update: Partial<Database['public']['Tables']['data_archive_batches']['Insert']>
      }
      data_archive_rows: {
        Row: {
          id: string
          batch_id: string
          source_table: string
          source_id: string
          owner_user_id: string | null
          payload: Json
          archived_at: string
        }
        Insert: Omit<Database['public']['Tables']['data_archive_rows']['Row'], 'id' | 'archived_at'>
        Update: never
      }
      integration_connections: {
        Row: {
          id: string
          owner_user_id: string
          provider: 'wolvox'
          display_name: string
          status: 'configuring' | 'disconnected' | 'connected' | 'error' | 'paused'
          wolvox_version: string | null
          company_code: string | null
          working_year: number | null
          bridge_installation_id: string | null
          last_heartbeat_at: string | null
          last_error: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database['public']['Tables']['integration_connections']['Row'], 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Database['public']['Tables']['integration_connections']['Insert']>
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
export type AnalysisAttempt = Database['public']['Tables']['analysis_attempts']['Row']
export type ProductPriceChange = Database['public']['Tables']['product_price_changes']['Row']
export type SourceMatchDecision = Database['public']['Tables']['source_match_decisions']['Row']

// Kullanıcı ayarları — JSONB içeriği
export interface UserSettings {
  // Fiyat analizi
  default_threshold_percent: number    // varsayılan uyarı eşiği, default: 10
  min_sources: number                  // minimum kaynak sayısı, default: 2
  outlier_filter_pct: number           // alt aykırı filtresi %, default: 50 (medyanın %X altı)
  outlier_upper_pct: number            // üst aykırı filtresi %, default: 250 (piyasa ort. %X üstü)

  // Aktif platformlar
  active_platforms: string[]           // default: tüm 5 platform

  // E-posta bildirimleri
  weekly_report_enabled: boolean       // default: true
  weekly_report_day: number            // 0=Paz … 6=Cmt, default: 1 (Pzt)
  weekly_report_hour: number           // 0-23, default: 8
  weekly_report_last_sent_at?: string  // cron tarafından tekrar gönderimi önlemek için tutulur

  // Eşleşme hassasiyeti (0-100 tam sayı → score = değer / 100)
  confidence_exact: number             // default: 95  → ⭐ Tam eşleşme
  confidence_high: number              // default: 75  → ✓ Yüksek eşleşme
  confidence_medium: number            // default: 58  → ⚠ Orta eşleşme
  confidence_low: number               // default: 42  → ↓ Düşük eşleşme
}

export const DEFAULT_SETTINGS: UserSettings = {
  default_threshold_percent: 10,
  min_sources: 2,
  outlier_filter_pct: 50,
  outlier_upper_pct: 250,
  active_platforms: ['Hepsiburada', 'N11', 'PTTAvm', 'İdefix', 'Trendyol'],
  weekly_report_enabled: true,
  weekly_report_day: 1,
  weekly_report_hour: 8,
  confidence_exact: 95,
  confidence_high: 75,
  confidence_medium: 58,
  confidence_low: 42,
}
