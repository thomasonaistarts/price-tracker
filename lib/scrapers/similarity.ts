/**
 * Akıllı ürün eşleştirme algoritması
 *
 * Özellikler:
 *  - Miktar normalizasyonu: "3kg" = "3 KG" = "3000g"
 *  - "2'li paket", "2li", "2 adet" → count: 2
 *  - Çoklu paket: "3kg 2'li" → toplam 6000g
 *  - Birim uyumsuzluğu: ağırlık vs hacim → direkt reddedilir
 *  - Birimsiz 2+ haneli sayı zorlaması: "20 Renk" vs "10 Renk" → reddedilir
 *  - Güven seviyesi: high / medium / low / rejected
 *  - Birim fiyat için miktar oranı döndürür
 */

export type Confidence = 'exact' | 'high' | 'medium' | 'low' | 'rejected'

export interface ConfidenceThresholds {
  exact: number   // 0–1, default 0.95
  high: number    // 0–1, default 0.75
  medium: number  // 0–1, default 0.58
  low: number     // 0–1, default 0.42
}

export const DEFAULT_CONFIDENCE_THRESHOLDS: ConfidenceThresholds = {
  exact: 0.95,
  high: 0.75,
  medium: 0.58,
  low: 0.42,
}

export function isAutomaticMatchEligible(confidence: Confidence): boolean {
  return confidence === 'exact' || confidence === 'high' || confidence === 'medium'
}

export interface MatchResult {
  score: number                             // 0–1 genel skor
  confidence: Confidence
  quantityRatio: number | null              // aday_miktar / sorgu_miktar
  queryBaseQty: number | null               // sorgu miktarı baz birimde (g / ml / adet / cm)
  candidateBaseQty: number | null           // aday miktarı baz birimde
  unitType: 'weight' | 'volume' | 'count' | 'length' | 'screen' | null
  unitDisplayLabel: string | null           // "kg" | "L" | "adet" | "m"
  reasons: string[]                         // Türkçe açıklama (debug / UI)
}

// ── Birim tanım tablosu ───────────────────────────────────────────────────────

type UnitType = 'weight' | 'volume' | 'count' | 'length' | 'screen'

interface UnitDef {
  type: UnitType
  factor: number          // → baz birime çevirme: baseValue = rawValue × factor
  display: string         // insan okunur etiket: "kg", "L", "adet"
  displayFactor: number   // baz_birim_fiyat → görüntü_birimi_fiyat: ×1000 g→kg, ×1000 ml→L
}

const UNIT_MAP: Record<string, UnitDef> = {
  // Ağırlık → gram
  kg:       { type: 'weight', factor: 1000,  display: 'kg',   displayFactor: 1000 },
  kilo:     { type: 'weight', factor: 1000,  display: 'kg',   displayFactor: 1000 },
  kilogram: { type: 'weight', factor: 1000,  display: 'kg',   displayFactor: 1000 },
  g:        { type: 'weight', factor: 1,     display: 'kg',   displayFactor: 1000 },
  gr:       { type: 'weight', factor: 1,     display: 'kg',   displayFactor: 1000 },
  gram:     { type: 'weight', factor: 1,     display: 'kg',   displayFactor: 1000 },
  mg:       { type: 'weight', factor: 0.001, display: 'kg',   displayFactor: 1000 },
  // Hacim → mililitre
  l:        { type: 'volume', factor: 1000,  display: 'L',    displayFactor: 1000 },
  lt:       { type: 'volume', factor: 1000,  display: 'L',    displayFactor: 1000 },
  litre:    { type: 'volume', factor: 1000,  display: 'L',    displayFactor: 1000 },
  liter:    { type: 'volume', factor: 1000,  display: 'L',    displayFactor: 1000 },
  ml:       { type: 'volume', factor: 1,     display: 'L',    displayFactor: 1000 },
  cc:       { type: 'volume', factor: 1,     display: 'L',    displayFactor: 1000 },
  cl:       { type: 'volume', factor: 10,    display: 'L',    displayFactor: 1000 },
  dl:       { type: 'volume', factor: 100,   display: 'L',    displayFactor: 1000 },
  // Adet (paket büyüklüğü)
  adet:     { type: 'count', factor: 1,      display: 'adet', displayFactor: 1 },
  tane:     { type: 'count', factor: 1,      display: 'adet', displayFactor: 1 },
  paket:    { type: 'count', factor: 1,      display: 'adet', displayFactor: 1 },
  parca:    { type: 'count', factor: 1,      display: 'adet', displayFactor: 1 },
  pk:       { type: 'count', factor: 1,      display: 'adet', displayFactor: 1 },
  kutu:     { type: 'count', factor: 1,      display: 'adet', displayFactor: 1 },
  set:      { type: 'count', factor: 1,      display: 'adet', displayFactor: 1 },
  // Uzunluk → cm
  m:        { type: 'length', factor: 100,   display: 'm',    displayFactor: 100 },
  mt:       { type: 'length', factor: 100,   display: 'm',    displayFactor: 100 },
  metre:    { type: 'length', factor: 100,   display: 'm',    displayFactor: 100 },
  cm:       { type: 'length', factor: 1,     display: 'm',    displayFactor: 100 },
  mm:       { type: 'length', factor: 0.1,   display: 'm',    displayFactor: 100 },
  // Ekran boyutu → inç  (normalizeText: "inç"→"inc", "inch"→"inc", 55"→55inc)
  inc:      { type: 'screen', factor: 1,     display: 'inç',  displayFactor: 1   },
}

// Regex için birimleri uzunluğa göre sırala (daha uzun = önce)
const UNIT_PAT = Object.keys(UNIT_MAP).sort((a, b) => b.length - a.length).join('|')

// ── Miktar çıkarma ────────────────────────────────────────────────────────────

interface ExtractedQty {
  baseValue: number    // normalize edilmiş baz birim (g, ml, adet, cm)
  unitType: UnitType
  display: string      // "kg" | "L" | "adet" | "m"
  rawStr: string       // orijinal metin: "3kg", "2'li"
}

interface QtySet {
  weight: ExtractedQty | null
  volume: ExtractedQty | null
  count:  ExtractedQty | null
  length: ExtractedQty | null
  screen: ExtractedQty | null   // inç (ekran boyutu)
}

function parseNumber(s: string): number {
  return parseFloat(s.replace(',', '.'))
}

// ── Metin normalizasyonu ──────────────────────────────────────────────────────

/**
 * Tokenizasyon öncesi tüm normalizasyonları uygular:
 *  1. Türkçe karakter fold (ş→s, ğ→g, ü→u, ö→o, ı→i, ç→c)
 *  2. İnç normalizasyonu: "55 inç" / "55 inch" / 55" → "55inc"
 *  3. Nesil / versiyon normalizasyonu: "3. Nesil" / "3rd Gen" / "Gen 3" → "gen3"
 *  4. Türkçe sayı kelimeleri: "ikili" → "2li", "üçlü" → "3li"
 */
function normalizeText(raw: string): string {
  let s = raw
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[''`''']/g, '')
    .replace(/(\d),(\d)/g, '$1.$2')

  // 1. Türkçe karakter fold
  s = s
    .replace(/ş/g, 's').replace(/ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/ö/g, 'o')
    .replace(/ı/g, 'i').replace(/ç/g, 'c')
    .replace(/â/g, 'a').replace(/î/g, 'i').replace(/û/g, 'u')

  // 2. İnç normalizasyonu  (inç→inc zaten fold ile geldi)
  s = s.replace(/(\d+(?:\.\d+)?)\s*inch\b/g, '$1inc')  // "55 inch" → "55inc"
  s = s.replace(/(\d+(?:\.\d+)?)\s*"\s*/g,  '$1inc ')  // 55"      → "55inc"

  // 3. Nesil / versiyon normalizasyonu
  //    "3. nesil", "3 nesil", "3.nesil"  → "gen3"
  s = s.replace(/(\d+)\s*\.?\s*(?:nesil|kusak)\b/g, 'gen$1 ')
  //    "nesil 3", "kusak 3"  → "gen3"  (kusak = kuşak after fold)
  s = s.replace(/\b(?:nesil|kusak)\s+(\d+)\b/g, 'gen$1 ')
  //    "3rd gen", "3. gen", "3rd generation", "3rd generasyon"  → "gen3"
  s = s.replace(/(\d+)\s*(?:rd|st|nd|th|\.)\s*gen(?:eration|erasyon)?\b/g, 'gen$1 ')
  //    "gen 3", "generation 3"  → "gen3"
  s = s.replace(/\bgen(?:eration|erasyon)?\s+(\d+)\b/g, 'gen$1 ')
  //    "mk2", "mk3" (mark/version)  → "gen2", "gen3"
  s = s.replace(/\bmk\s*(\d+)\b/g, 'gen$1 ')

  // 4. Türkçe sayı kelimeleri → rakam  (fold sonrası: ü→u, ö→o, ç→c)
  //    cift = çift, uclu = üçlü, dortlu = dörtlü, besli = beşli, altili = altılı
  s = s
    .replace(/\bcift(?:li)?\b/g, '2li ')   // çift ve çiftli
    .replace(/\bikili\b/g,       '2li ')
    .replace(/\buclu\b/g,    '3li ')
    .replace(/\bdortlu\b/g,  '4lu ')
    .replace(/\bbesli\b/g,   '5li ')
    .replace(/\baltili\b/g,  '6li ')
    .replace(/\byedili\b/g,  '7li ')
    .replace(/\bsekizli\b/g, '8li ')
    .replace(/\bdokuzlu\b/g, '9lu ')
    .replace(/\bonlu\b/g,    '10lu ')

  return s
}

function extractQuantities(raw: string): { qtys: QtySet; clean: string } {
  let s = normalizeText(raw)

  const qtys: QtySet = { weight: null, volume: null, count: null, length: null, screen: null }

  function set(q: ExtractedQty) {
    if (!qtys[q.unitType]) qtys[q.unitType] = q
  }

  // Pattern 1: NxN.Nunit — "2x100g", "3×1.5L", "2*500ml"
  const pat1 = new RegExp(
    `(?<![a-zA-ZÀ-ž])(\\d+(?:\\.\\d+)?)\\s*[xX×*]\\s*(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PAT})\\b`,
    'g'
  )
  s = s.replace(pat1, (match, cnt, val, unit) => {
    const def = UNIT_MAP[unit]
    if (def) set({
      baseValue: parseNumber(cnt) * parseNumber(val) * def.factor,
      unitType: def.type,
      display: def.display,
      rawStr: match,
    })
    return ' '
  })

  // Pattern 2: N.Nunit — "3kg", "500ml", "1.5 L", "100 adet"
  // Önde harf olmamalı (model numaralarına karışmasın: A3, W20)
  const pat2 = new RegExp(
    `(?<![a-zA-ZÀ-ž])(\\d+(?:\\.\\d+)?)\\s*(${UNIT_PAT})\\b`,
    'g'
  )
  s = s.replace(pat2, (match, val, unit) => {
    const def = UNIT_MAP[unit]
    if (def) set({
      baseValue: parseNumber(val) * def.factor,
      unitType: def.type,
      display: def.display,
      rawStr: match,
    })
    return ' '
  })

  // Pattern 3: Türkçe sayı eki — fold sonrası: ı→i, ü→u
  //   "2li", "6lu", "12li", "3li"  (lı/lü zaten li/lu'ya fold edildi)
  const pat3 = /(?<![a-zA-Z])(\d+)(li|lu|lik|luk)\b/g
  s = s.replace(pat3, (match, n) => {
    const val = parseInt(n)
    if (val > 0 && val <= 10000) set({
      baseValue: val,
      unitType: 'count',
      display: 'adet',
      rawStr: match,
    })
    return ' '
  })

  return { qtys, clean: s }
}

/**
 * Birincil miktarı belirler.
 *
 * Öncelik: ağırlık > hacim > adet > uzunluk
 * Çoklu paket: ağırlık/hacim + adet > 1 → toplam = ağırlık × adet
 */
function primaryQty(qtys: QtySet): { qty: number | null; type: UnitType | null; display: string | null } {
  if (qtys.weight) {
    const countFactor = qtys.count && qtys.count.baseValue > 1 ? qtys.count.baseValue : 1
    return { qty: qtys.weight.baseValue * countFactor, type: 'weight', display: qtys.weight.display }
  }
  if (qtys.volume) {
    const countFactor = qtys.count && qtys.count.baseValue > 1 ? qtys.count.baseValue : 1
    return { qty: qtys.volume.baseValue * countFactor, type: 'volume', display: qtys.volume.display }
  }
  // Ekran boyutu — count'tan önce kontrol et (55" ≠ 2'li karışmasın)
  if (qtys.screen) return { qty: qtys.screen.baseValue, type: 'screen', display: qtys.screen.display }
  if (qtys.count)  return { qty: qtys.count.baseValue,  type: 'count',  display: qtys.count.display  }
  if (qtys.length) return { qty: qtys.length.baseValue, type: 'length', display: qtys.length.display }
  return { qty: null, type: null, display: null }
}

// ── Token araçları ────────────────────────────────────────────────────────────

function tokenize(s: string): string[] {
  // normalizeText sonrası sadece ASCII alfanümerik kalır; À-ž kontrolüne gerek yok
  return s
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(t => t.length >= 2)
}

/** Birimsiz 2+ haneli sayılar (model no, renk sayısı, vb.) */
function bareNums(tokens: string[]): Set<string> {
  return new Set(tokens.filter(t => /^\d{2,}$/.test(t)))
}

// Ürün tipini anlatan fakat model/varyant kimliği taşımayan genel kelimeler.
// Bunlar eşleşme skorunda kalır; yalnızca ayırt edici kimlik kontrolünden çıkar.
const GENERIC_IDENTITY_TOKENS = new Set([
  'adet', 'agac', 'agaci', 'anaokul', 'beslenme', 'boy', 'boya', 'boyama',
  'cam', 'canta', 'cantasi', 'cocuk', 'defter', 'erkek', 'figur', 'figuru',
  'fiyonk', 'girl', 'junior', 'kalem', 'kalemi', 'kalemlik', 'kitabi', 'kitap',
  'kids', 'kiz', 'kumbara', 'marker', 'matara', 'matarasi', 'mini', 'noel',
  'okul', 'oyuncak', 'parca', 'puzzle', 'renk', 'renkli', 'set', 'seti',
  'sirt', 'susu', 'urun', 'vernik', 'yilbasi',
])

const PRODUCT_SUBTYPE_GROUPS = [
  ['beslenme', 'sirt', 'kalemlik'],
] as const

const FIXED_VARIANT_QUANTITY_TOKENS = new Set([
  'agac', 'agaci', 'bardak', 'canta', 'cantasi', 'defter', 'figur', 'figuru',
  'kalemlik', 'kitap', 'kupa', 'matara', 'matarasi', 'oyuncak', 'puzzle',
  'sise', 'sisesi', 'termos',
])

function conflictingProductSubtype(queryTokens: string[], candidateTokens: string[]): string | null {
  const querySet = new Set(queryTokens)
  const candidateSet = new Set(candidateTokens)

  for (const group of PRODUCT_SUBTYPE_GROUPS) {
    const queryTypes = group.filter(token => querySet.has(token))
    const candidateTypes = group.filter(token => candidateSet.has(token))
    if (
      queryTypes.length > 0
      && candidateTypes.length > 0
      && !queryTypes.some(token => candidateSet.has(token))
    ) {
      return `${queryTypes.join('/')} ≠ ${candidateTypes.join('/')}`
    }
  }
  return null
}

function distinctiveIdentityTokens(tokens: string[]): string[] {
  return tokens
    .filter(token => !GENERIC_IDENTITY_TOKENS.has(token))
    .filter(token => !/^\d+$/.test(token))
}

// ── Ana eşleştirme fonksiyonu ─────────────────────────────────────────────────

export function matchProduct(
  query: string,
  candidate: string,
  thresholds: ConfidenceThresholds = DEFAULT_CONFIDENCE_THRESHOLDS,
): MatchResult {
  const reasons: string[] = []

  const qParsed = extractQuantities(query)
  const cParsed = extractQuantities(candidate)

  const qTokens = tokenize(qParsed.clean)
  const cTokens = tokenize(cParsed.clean)
  const cSet = new Set(cTokens)

  if (qTokens.length === 0) {
    return noMatch('Sorgu boş')
  }

  const subtypeConflict = conflictingProductSubtype(qTokens, cTokens)
  if (subtypeConflict) {
    return noMatch(`Ürün tipi uyuşmuyor: ${subtypeConflict}`)
  }

  // ── 1. Birimsiz sayı zorlaması (örn. "20 Renk" vs "10 Renk") ──────────────
  const qNums = bareNums(qTokens)
  const cNums = bareNums(cTokens)
  if (qNums.size > 0 && cNums.size > 0) {
    const hasCommon = Array.from(cNums).some(n => qNums.has(n))
    if (!hasCommon) {
      reasons.push(`Sayı uyumsuzluğu: [${Array.from(qNums).join(',')}] ≠ [${Array.from(cNums).join(',')}]`)
      return noMatch(reasons[0])
    }
  }

  // ── 2. Ayırt edici model/seri kimliği ─────────────────────────────────────
  const queryIdentity = distinctiveIdentityTokens(qTokens)
  const candidateIdentity = new Set(distinctiveIdentityTokens(cTokens))
  const identityHits = queryIdentity.filter(token => candidateIdentity.has(token))
  const requiredIdentityHits = queryIdentity.length <= 1
    ? queryIdentity.length
    : Math.max(2, Math.ceil(queryIdentity.length * 0.6))

  if (queryIdentity.length > 0 && identityHits.length < requiredIdentityHits) {
    const reason = `Ayırt edici kimlik yetersiz: ${identityHits.length}/${queryIdentity.length} (min: ${requiredIdentityHits})`
    reasons.push(reason)
    return noMatch(reason)
  }
  if (queryIdentity.length > 0) {
    reasons.push(`Kimlik: ${identityHits.length}/${queryIdentity.length}`)
  }

  // ── 3. Anahtar kelime skoru ───────────────────────────────────────────────
  const hits = qTokens.filter(t => cSet.has(t)).length
  const kwScore = hits / qTokens.length
  reasons.push(`Kelime: ${hits}/${qTokens.length} (${pct(kwScore)})`)

  // ── 4. Miktar karşılaştırması ─────────────────────────────────────────────
  const qQty = primaryQty(qParsed.qtys)
  const cQty = primaryQty(cParsed.qtys)
  const qCount = qParsed.qtys.count?.baseValue ?? null
  const cCount = cParsed.qtys.count?.baseValue ?? null

  // Bir tarafta açıkça çoklu paket/set varken diğer tarafta adet bilgisi yoksa
  // aynı ürün kabul edilemez. Örn. tek sırt çantası ile "çanta + beslenme
  // çantası + kalemlik 3'lü set" fiyat açısından karşılaştırılmamalıdır.
  if (
    (qCount !== null && qCount > 1 && cCount === null) ||
    (cCount !== null && cCount > 1 && qCount === null)
  ) {
    const reason = `Çoklu paket uyumsuzluğu: ${qCount ?? 1} ≠ ${cCount ?? 1}`
    reasons.push(reason)
    return noMatch(reason)
  }

  let qtyScore = 0.5
  let quantityRatio: number | null = null
  let unitType: MatchResult['unitType'] = null
  let unitDisplayLabel: string | null = null
  let qtyLabel = 'none'

  if (qQty.qty !== null && cQty.qty !== null) {
    unitType = qQty.type
    unitDisplayLabel = qQty.display

    if (qQty.type !== cQty.type) {
      // Birim türü uyumsuz → direkt reddet
      reasons.push(`Birim türü uyumsuz: ${qQty.type} ≠ ${cQty.type}`)
      return {
        score: 0, confidence: 'rejected',
        quantityRatio: null, queryBaseQty: qQty.qty, candidateBaseQty: cQty.qty,
        unitType: null, unitDisplayLabel: null, reasons,
      }
    }

    const ratio = qQty.qty > 0 ? cQty.qty / qQty.qty : 1
    quantityRatio = Math.round(ratio * 1000) / 1000

    if (Math.abs(ratio - 1) <= 0.05) {
      qtyScore = 1.0
      qtyLabel = 'exact'
      reasons.push(`Miktar eşleşiyor: ${formatQty(qQty.qty, qQty.type, qQty.display)}`)
    } else {
      const fixedVariantProduct = [...qTokens, ...cTokens]
        .some(token => FIXED_VARIANT_QUANTITY_TOKENS.has(token))
      if (fixedVariantProduct) {
        const reason = `Sabit ürün ölçüsü uyuşmuyor: ${formatQty(qQty.qty, qQty.type, qQty.display)} ≠ ${formatQty(cQty.qty, cQty.type, cQty.display)}`
        reasons.push(reason)
        return noMatch(reason)
      }
      qtyScore = 0.25
      qtyLabel = 'compatible'
      reasons.push(
        `Farklı miktar: ${formatQty(qQty.qty, qQty.type, qQty.display)} ≠ ` +
        `${formatQty(cQty.qty, cQty.type, cQty.display)} (oran: ${ratio.toFixed(2)}x)`
      )
    }
  } else if (qQty.qty !== null || cQty.qty !== null) {
    qtyScore = 0.4
    qtyLabel = 'one_missing'
    reasons.push(`Miktar tek tarafta: ${qQty.qty ? 'sorguda' : 'üründe'}`)
  } else {
    reasons.push('Miktar bilgisi yok — sadece kelime benzerliği')
  }

  // ── 5. Genel skor ─────────────────────────────────────────────────────────
  const score = Math.round((kwScore * 0.6 + qtyScore * 0.4) * 1000) / 1000

  // ── 6. Güven seviyesi ─────────────────────────────────────────────────────
  // İlk token (genellikle marka adı) adayda geçmiyorsa "high" olamaz
  const firstTokenMissing = qTokens.length > 0 && !cSet.has(qTokens[0])

  let confidence: Confidence
  if (score >= thresholds.exact && qtyLabel !== 'compatible' && !firstTokenMissing) {
    confidence = 'exact'   // ⭐ tam eşleşme
  } else if (score >= thresholds.high && qtyLabel !== 'compatible' && !firstTokenMissing) {
    confidence = 'high'    // ✓ yüksek eşleşme
  } else if (score >= thresholds.medium) {
    confidence = 'medium'  // ⚠ orta eşleşme
  } else if (score >= thresholds.low) {
    confidence = 'low'     // ↓ düşük eşleşme
  } else {
    confidence = 'rejected'
  }

  // Marka/model/seri gibi ayırt edici kimliği bulunmayan "ağaç kumbara",
  // "10 cm figür" ve "ikili fiyonk" türü genel adlar otomatik fiyat kaynağı
  // olamaz. Aday kullanıcıya gösterilir ve URL elle onaylanabilir.
  if (queryIdentity.length === 0 && confidence !== 'rejected') {
    confidence = 'low'
    reasons.push('Genel ürün adı — otomatik eşleşme için ayırt edici kimlik yok')
  }

  return {
    score,
    confidence,
    quantityRatio,
    queryBaseQty: qQty.qty,
    candidateBaseQty: cQty.qty,
    unitType,
    unitDisplayLabel,
    reasons,
  }
}

// ── Yardımcılar ───────────────────────────────────────────────────────────────

function noMatch(reason: string): MatchResult {
  return {
    score: 0, confidence: 'rejected',
    quantityRatio: null, queryBaseQty: null, candidateBaseQty: null,
    unitType: null, unitDisplayLabel: null,
    reasons: [reason],
  }
}

function pct(n: number) { return `${Math.round(n * 100)}%` }

function formatQty(baseVal: number, type: UnitType | null, display: string | null): string {
  if (!type || !display) return String(baseVal)
  if (type === 'weight') {
    return baseVal >= 1000 ? `${baseVal / 1000}${display}` : `${baseVal}g`
  }
  if (type === 'volume') {
    return baseVal >= 1000 ? `${baseVal / 1000}${display}` : `${baseVal}ml`
  }
  if (type === 'length') {
    return baseVal >= 100 ? `${baseVal / 100}m` : `${baseVal}cm`
  }
  return `${baseVal}${display ?? ''}`
}

/**
 * Birim fiyat hesapla: fiyat / (miktar baz birimde) × görüntü faktörü
 * Örnek: 140 TRY / 5000g × 1000 = 28 TRY/kg
 */
export function calcUnitPrice(
  price: number,
  candidateBaseQty: number,
  unitType: 'weight' | 'volume' | 'count' | 'length',
): { unitPrice: number; label: string } {
  const def = Object.values(UNIT_MAP).find(d => d.type === unitType)
  const displayFactor = def?.displayFactor ?? 1
  const displayLabel = def?.display ?? 'adet'
  const unitPrice = Math.round((price / candidateBaseQty) * displayFactor * 100) / 100
  return { unitPrice, label: `TRY/${displayLabel}` }
}

/** Geriye dönük uyumluluk */
export function matchScore(query: string, candidate: string): number {
  return matchProduct(query, candidate).score
}
