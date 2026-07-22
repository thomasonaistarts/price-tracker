export interface ScrapedPrice {
  site: string
  product_name: string
  price: number
  url: string
  currency: string
  // Eşleştirme meta verisi (matchProduct tarafından doldurulur)
  confidence?: 'exact' | 'high' | 'medium' | 'low'
  matchScore?: number
  comparisonPrice?: number // sorgudaki paket miktarına normalize edilmiş fiyat
  quantityRatio?: number    // aday_miktar / sorgu_miktar (birim fiyat için)
  unitPrice?: number        // ₺/kg, ₺/L, ₺/adet ...
  unitPriceLabel?: string   // "TRY/kg", "TRY/L" ...
  matchReasons?: string[]   // debug / UI açıklaması
  manualDecision?: 'approved'  // kullanıcı tarafından güvenilir kaynak olarak işaretlendi
}
