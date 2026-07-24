import { extractModelCodes } from './product-identity.ts'

export type IdentityEvidenceSource =
  | 'manual'
  | 'supplier'
  | 'wolvox'
  | 'verified_marketplace'

export interface IdentityEvidence {
  source: IdentityEvidenceSource
  sourceLabel: string
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
  const groups = new Map<string, { value: string; count: number }>()
  for (const item of evidence.filter(item => item.verified)) {
    const value = selector(item)?.trim()
    const key = normalize(value)
    if (!value || !key) continue
    const current = groups.get(key)
    groups.set(key, { value, count: (current?.count ?? 0) + 1 })
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count)[0] ?? null
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
    .flatMap(item => extractModelCodes(item.productName))
    .map(code => canonicalManufacturerCode(code))
    .filter((code): code is string => Boolean(code))
  const codeGroups = new Map<string, number>()
  for (const code of extractedCodes) {
    const key = normalize(code)
    codeGroups.set(key, (codeGroups.get(key) ?? 0) + 1)
  }
  const corroboratedCode = Array.from(codeGroups.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

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
