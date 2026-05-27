import type { ProductInput } from '@/lib/validations'

export interface MarketSource {
  site: string
  product_url: string
  unit_price: number
  price_type: 'kdv_dahil' | 'kdv_hariç' | 'unknown'
  timestamp: string
  match_confidence: number
}

export interface AnalysisResult {
  sku: string
  product_name: string
  category: string
  brand: string
  our_price: number
  threshold_used: number
  market_mean: number | null
  market_median: number | null
  market_std: number | null
  min_price: number | null
  max_price: number | null
  sources_count: number
  sources: MarketSource[]
  price_diff_percent: number | null
  alert: 'above_market' | 'below_market' | 'no_alert' | 'insufficient_data'
  alert_reason: string
  follow_up: string[]
  confidence: number
  notes: string[]
}

const PLATFORMS = [
  'Hepsiburada', 'Trendyol', 'n11', 'Amazon TR', 'Kitapyurdu',
  'CarrefourSA', 'PTTAVM', 'Vatan', 'Bıyıklıoğlu', 'Kırtasiyem Online',
]

const CAT_VARIATIONS: Record<string, number[]> = {
  'Kalem':       [0.82, 0.87, 0.91, 0.95, 0.98, 1.02, 1.06, 1.11, 1.16, 1.22],
  'Defter':      [0.79, 0.85, 0.90, 0.94, 0.97, 1.01, 1.05, 1.10, 1.15, 1.20],
  'Silgi':       [0.75, 0.82, 0.88, 0.93, 0.97, 1.03, 1.08, 1.13, 1.19, 1.25],
  'Kalemtıraş':  [0.78, 0.84, 0.89, 0.93, 0.97, 1.02, 1.06, 1.11, 1.16, 1.21],
  'Not Kağıdı':  [0.80, 0.86, 0.91, 0.95, 0.98, 1.02, 1.06, 1.11, 1.17, 1.23],
  'Ambalaj':     [0.77, 0.83, 0.88, 0.93, 0.97, 1.03, 1.07, 1.12, 1.18, 1.24],
  'Klasör':      [0.81, 0.87, 0.91, 0.95, 0.98, 1.02, 1.06, 1.10, 1.15, 1.20],
  'Bant':        [0.76, 0.83, 0.89, 0.94, 0.98, 1.03, 1.07, 1.13, 1.19, 1.25],
}

function r2(n: number) { return Math.round(n * 100) / 100 }

function iqrFilter(arr: number[]): number[] {
  const s = [...arr].sort((a, b) => a - b)
  const q1 = s[Math.floor(s.length * 0.25)]
  const q3 = s[Math.floor(s.length * 0.75)]
  const iqr = q3 - q1
  return arr.filter(v => v >= q1 - 1.5 * iqr && v <= q3 + 1.5 * iqr)
}

function simulateMarket(ourPrice: number, category: string): MarketSource[] {
  const mults = CAT_VARIATIONS[category] ?? [0.80, 0.86, 0.91, 0.95, 0.98, 1.02, 1.06, 1.11, 1.17, 1.23]
  const shuffled = [...PLATFORMS].sort(() => Math.random() - 0.5)
  const ts = new Date().toISOString()
  return shuffled.map((site, i) => ({
    site,
    product_url: `https://${site.toLowerCase().replace(/\s+/g, '')}.com.tr/urun/${Math.floor(Math.random() * 9e6 + 1e6)}`,
    unit_price: r2(ourPrice * mults[i]),
    price_type: 'kdv_dahil',
    timestamp: ts,
    match_confidence: r2(0.70 + Math.random() * 0.28),
  }))
}

// TODO: Gerçek scraping/API entegrasyonu burada yapılacak
// simulateMarket() yerine aşağıdaki gibi bir fonksiyon çağrılacak:
// async function fetchRealPrices(product: ProductInput): Promise<MarketSource[]>

export function analyzeProduct(
  product: ProductInput,
  thresholdPercent: number,
  minSources: number,
): AnalysisResult {
  const { sku, product_name, category = 'Genel', brand = '', our_price } = product
  const sources = simulateMarket(our_price, category)
  const prices = sources.map(s => s.unit_price)
  const filtered = iqrFilter(prices)

  if (filtered.length < minSources) {
    return {
      sku, product_name, category, brand, our_price,
      threshold_used: thresholdPercent,
      market_mean: null, market_median: null, market_std: null,
      min_price: null, max_price: null,
      sources_count: sources.length, sources,
      price_diff_percent: null,
      alert: 'insufficient_data',
      alert_reason: `Yalnızca ${filtered.length} güvenilir kaynak bulundu (min: ${minSources})`,
      follow_up: ['manual_review', 'fetch_more_sources'],
      confidence: 0.4,
      notes: [`IQR sonrası ${filtered.length} kaynak kaldı`],
    }
  }

  const mean = r2(filtered.reduce((a, b) => a + b, 0) / filtered.length)
  const sorted = [...filtered].sort((a, b) => a - b)
  const median = r2(sorted[Math.floor(sorted.length / 2)])
  const std = r2(Math.sqrt(filtered.reduce((a, b) => a + (b - mean) ** 2, 0) / filtered.length))
  const diff = r2((our_price - mean) / mean * 100)
  const absD = Math.abs(diff)

  let alert: AnalysisResult['alert'] = 'no_alert'
  let alert_reason = 'Fiyat piyasa ortalamasında'
  let follow_up: string[] = []

  if (absD >= thresholdPercent) {
    if (diff > 0) {
      alert = 'above_market'
      alert_reason = `Piyasa ortalamasının %${absD.toFixed(1)} üzerinde (eşik: %${thresholdPercent})`
      follow_up = ['notify_owner', 'manual_review', 'auto_reprice_on']
    } else {
      alert = 'below_market'
      alert_reason = `Piyasa ortalamasının %${absD.toFixed(1)} altında (eşik: %${thresholdPercent})`
      follow_up = ['notify_owner', 'manual_review']
    }
  }

  return {
    sku, product_name, category, brand, our_price,
    threshold_used: thresholdPercent,
    market_mean: mean, market_median: median, market_std: std,
    min_price: r2(Math.min(...prices)), max_price: r2(Math.max(...prices)),
    sources_count: sources.length, sources,
    price_diff_percent: diff,
    alert, alert_reason, follow_up,
    confidence: r2(0.72 + Math.random() * 0.2),
    notes: [`Kategori eşiği: %${thresholdPercent}`, 'Simüle edilmiş veri — gerçek scraping entegrasyonu gerekli'],
  }
}

export function runAnalysis(
  products: ProductInput[],
  thresholdPercent: number,
  minSources: number,
  categoryThresholds?: Record<string, number>,
): AnalysisResult[] {
  return products.map(p => {
    const thr = categoryThresholds?.[p.category ?? 'Genel'] ?? thresholdPercent
    return analyzeProduct(p, thr, minSources)
  })
}
