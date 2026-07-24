import { extractModelCodes } from './product-identity.ts'
import { normalizeSourceUrl } from './source-decisions.ts'

export type IdentityEvidenceSource =
  | 'manual'
  | 'supplier'
  | 'wolvox'
  | 'verified_marketplace'

export interface IdentityEvidence {
  source: IdentityEvidenceSource
  sourceLabel: string
  sourceUrl?: string | null
  productName: string
  brand?: string | null
  manufacturerCode?: string | null
  productType?: string | null
  verified: boolean
}

export interface IdentityProposal {
  brand: string | null
  manufacturerCode: string | null
  productType: string | null
  approvalRequired: boolean
  confidence: 'authoritative' | 'corroborated' | 'insufficient'
  evidence: IdentityEvidence[]
}

const normalize = (value?: string | null) =>
  (value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9çğıöşü]+/g, ' ')
    .replace(/\s+/g, ' ')

function canonicalManufacturerCode(value?: string | null) {
  const cleaned = (value ?? '').trim().toLocaleUpperCase('tr-TR')
  if (!cleaned) return null
  return /^[A-Z0-9ÇĞİÖŞÜ]+(?:[\s._/-]+[A-Z0-9ÇĞİÖŞÜ]+)+$/.test(cleaned)
    ? cleaned.replace(/[\s._/-]+/g, '-')
    : cleaned
}

function agreedValue(
  evidence: IdentityEvidence[],
  selector: (item: IdentityEvidence) => string | null | undefined,
) {
  const groups = new Map<string, { value: string; sources: Set<string> }>()
  for (const item of evidence.filter(item => item.verified)) {
    const value = selector(item)?.trim()
    const key = normalize(value)
    if (!value || !key) continue
    const current = groups.get(key) ?? { value, sources: new Set<string>() }
    current.sources.add(`${item.source}:${normalize(item.sourceLabel)}`)
    groups.set(key, current)
  }
  return Array.from(groups.values())
    .map(item => ({ value: item.value, count: item.sources.size }))
    .sort((a, b) => b.count - a.count)[0] ?? null
}

export interface IdentityEvidenceProduct {
  productName: string
  brand?: string | null
  manufacturerCode?: string | null
  productType?: string | null
  externalSource?: string | null
}

export interface RememberedIdentitySource {
  platform: string
  sourceUrl: string
  productName?: string | null
}

export interface AnalysisIdentitySource {
  site: string
  url: string
  product_name: string
  brand?: string | null
  manufacturerCode?: string | null
  productType?: string | null
  confidence?: string | null
  manualDecision?: string | null
}

export interface IdentityProfileSnapshot {
  status?: string | null
  evidence?: unknown
}

function safeEvidenceUrl(value?: string | null) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

function profileEvidence(profile?: IdentityProfileSnapshot | null): IdentityEvidence[] {
  if (profile?.status !== 'approved' || !Array.isArray(profile.evidence)) return []
  return profile.evidence.flatMap((item): IdentityEvidence[] => {
    if (!item || typeof item !== 'object') return []
    const value = item as Partial<IdentityEvidence>
    if (
      !value.source
      || !['manual', 'supplier', 'wolvox', 'verified_marketplace'].includes(value.source)
      || !value.sourceLabel
      || !value.productName
      || value.verified !== true
    ) return []
    return [{
      source: value.source,
      sourceLabel: String(value.sourceLabel),
      sourceUrl: safeEvidenceUrl(value.sourceUrl ? String(value.sourceUrl) : null),
      productName: String(value.productName),
      brand: value.brand ? String(value.brand) : null,
      manufacturerCode: value.manufacturerCode ? String(value.manufacturerCode) : null,
      productType: value.productType ? String(value.productType) : null,
      verified: true,
    }]
  })
}

/**
 * Only already verified source URLs and approved/manual history may contribute
 * to an identity proposal. Search results that merely look similar are excluded.
 */
export function buildProductIdentityEvidence(input: {
  product: IdentityEvidenceProduct
  profile?: IdentityProfileSnapshot | null
  rememberedSources?: RememberedIdentitySource[]
  latestSources?: AnalysisIdentitySource[]
}): IdentityEvidence[] {
  const evidence = profileEvidence(input.profile)

  if (
    evidence.length === 0
    && input.product.externalSource?.toLocaleLowerCase('tr-TR') === 'wolvox'
    && (input.product.brand || input.product.manufacturerCode || input.product.productType)
  ) {
    evidence.push({
      source: 'wolvox',
      sourceLabel: 'WOLVOX ürün kartı',
      productName: input.product.productName,
      brand: input.product.brand,
      manufacturerCode: input.product.manufacturerCode,
      productType: input.product.productType,
      verified: true,
    })
  }

  const latestBySource = new Map(
    (input.latestSources ?? [])
      .filter(source =>
        source.manualDecision === 'approved'
        || source.confidence === 'exact'
        || source.confidence === 'high'
      )
      .map(source => [
        `${source.site.toLocaleLowerCase('tr-TR')}|${normalizeSourceUrl(source.url)}`,
        source,
      ]),
  )

  for (const remembered of input.rememberedSources ?? []) {
    const key = `${remembered.platform.toLocaleLowerCase('tr-TR')}|${normalizeSourceUrl(remembered.sourceUrl)}`
    const source = latestBySource.get(key)
    evidence.push({
      source: 'verified_marketplace',
      sourceLabel: remembered.platform,
      sourceUrl: safeEvidenceUrl(remembered.sourceUrl),
      productName: source?.product_name || remembered.productName || input.product.productName,
      brand: source?.brand ?? null,
      manufacturerCode: source?.manufacturerCode ?? null,
      productType: source?.productType ?? null,
      verified: true,
    })
  }

  return Array.from(new Map(evidence.map(item => [
    `${item.source}:${normalize(item.sourceLabel)}:${normalizeSourceUrl(item.sourceUrl ?? '')}`,
    item,
  ])).values())
}

/**
 * Kimlik alanlarını yalnızca açık kaynak kanıtından üretir.
 * WOLVOX/manual/tedarikçi alanları otoritatiftir. Pazaryeri başlıklarından
 * gelen değerler en az iki doğrulanmış bağımsız kaynakta aynı olmadıkça
 * öneri dahi oluşturmaz ve her durumda insan onayı ister.
 */
export function proposeProductIdentity(evidence: IdentityEvidence[]): IdentityProposal {
  const verified = evidence.filter(item => item.verified)
  const authoritative = verified.filter(item =>
    item.source === 'manual' || item.source === 'supplier' || item.source === 'wolvox'
  )

  const authoritativeBrand = agreedValue(authoritative, item => item.brand)
  const authoritativeCode = agreedValue(authoritative, item => canonicalManufacturerCode(item.manufacturerCode))
  const authoritativeType = agreedValue(authoritative, item => item.productType)

  if (authoritativeBrand || authoritativeCode || authoritativeType) {
    return {
      brand: authoritativeBrand?.value ?? null,
      manufacturerCode: authoritativeCode?.value ?? null,
      productType: authoritativeType?.value ?? null,
      approvalRequired: authoritative.some(item => item.source !== 'manual'),
      confidence: 'authoritative',
      evidence: verified,
    }
  }

  const marketplace = verified.filter(item => item.source === 'verified_marketplace')
  const brand = agreedValue(marketplace, item => item.brand)
  const productType = agreedValue(marketplace, item => item.productType)
  const explicitCode = agreedValue(marketplace, item => canonicalManufacturerCode(item.manufacturerCode))
  const extractedCodes = marketplace
    .flatMap(item => extractModelCodes(item.productName).map(code => ({
      code: canonicalManufacturerCode(code),
      source: `${item.source}:${normalize(item.sourceLabel)}`,
    })))
    .filter((item): item is { code: string; source: string } => Boolean(item.code))
  const codeGroups = new Map<string, { code: string; sources: Set<string> }>()
  for (const item of extractedCodes) {
    const key = normalize(item.code)
    const group = codeGroups.get(key) ?? { code: item.code, sources: new Set<string>() }
    group.sources.add(item.source)
    codeGroups.set(key, group)
  }
  const corroboratedCode = Array.from(codeGroups.values())
    .filter(group => group.sources.size >= 2)
    .sort((a, b) => b.sources.size - a.sources.size)[0]?.code ?? null

  const corroboratedBrand = brand && brand.count >= 2 ? brand.value : null
  const corroboratedType = productType && productType.count >= 2 ? productType.value : null
  const manufacturerCode = explicitCode && explicitCode.count >= 2
    ? explicitCode.value
    : corroboratedCode

  return {
    brand: corroboratedBrand,
    manufacturerCode,
    productType: corroboratedType,
    approvalRequired: true,
    confidence: corroboratedBrand || manufacturerCode || corroboratedType
      ? 'corroborated'
      : 'insufficient',
    evidence: marketplace,
  }
}

export function canWriteIdentityToWolvox(proposal: IdentityProposal) {
  return proposal.confidence === 'authoritative'
    && proposal.approvalRequired === false
    && proposal.evidence.some(item => item.source === 'manual' && item.verified)
}
