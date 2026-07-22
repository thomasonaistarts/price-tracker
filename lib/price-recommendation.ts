export interface ProfitabilityInput {
  salePrice: number
  purchaseCost: number | null
  vatRate: number
  commissionRate: number
  shippingCost: number
  packagingCost: number
  targetMarginRate: number
  priceFloor?: number | null
  priceCeiling?: number | null
  marketMean?: number | null
}

export interface ProfitabilitySnapshot {
  salePrice: number
  commissionCost: number
  grossContribution: number
  netContribution: number
  contributionMarginRate: number
}

export interface PriceRecommendation {
  status: 'ready' | 'missing_cost' | 'invalid_rules'
  minimumSafePrice: number | null
  recommendedPrice: number | null
  current: ProfitabilitySnapshot | null
  recommended: ProfitabilitySnapshot | null
  reason: string
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

function finiteOr(value: number | null | undefined, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

export function calculateProfitability(
  salePrice: number,
  input: Pick<ProfitabilityInput, 'purchaseCost' | 'vatRate' | 'commissionRate' | 'shippingCost' | 'packagingCost'>,
): ProfitabilitySnapshot | null {
  const purchaseCost = finiteOr(input.purchaseCost, -1)
  if (!Number.isFinite(salePrice) || salePrice <= 0 || purchaseCost < 0) return null

  const vatMultiplier = 1 + Math.max(0, finiteOr(input.vatRate)) / 100
  const commissionCost = salePrice * Math.max(0, finiteOr(input.commissionRate)) / 100
  const grossContribution = salePrice
    - purchaseCost
    - commissionCost
    - Math.max(0, finiteOr(input.shippingCost))
    - Math.max(0, finiteOr(input.packagingCost))

  return {
    salePrice: round2(salePrice),
    commissionCost: round2(commissionCost),
    grossContribution: round2(grossContribution),
    netContribution: round2(grossContribution / vatMultiplier),
    contributionMarginRate: round2((grossContribution / salePrice) * 100),
  }
}

export function recommendPrice(input: ProfitabilityInput): PriceRecommendation {
  if (input.purchaseCost == null || !Number.isFinite(input.purchaseCost) || input.purchaseCost < 0) {
    return {
      status: 'missing_cost',
      minimumSafePrice: null,
      recommendedPrice: null,
      current: null,
      recommended: null,
      reason: 'Fiyat önerisi için alış maliyetini girin.',
    }
  }

  const commissionRate = Math.max(0, finiteOr(input.commissionRate))
  const targetMarginRate = Math.max(0, finiteOr(input.targetMarginRate))
  const remainingRate = 1 - (commissionRate + targetMarginRate) / 100
  const fixedCosts = input.purchaseCost
    + Math.max(0, finiteOr(input.shippingCost))
    + Math.max(0, finiteOr(input.packagingCost))
  const manualFloor = input.priceFloor != null && input.priceFloor > 0 ? input.priceFloor : null
  const manualCeiling = input.priceCeiling != null && input.priceCeiling > 0 ? input.priceCeiling : null

  if (remainingRate <= 0) {
    return {
      status: 'invalid_rules',
      minimumSafePrice: null,
      recommendedPrice: null,
      current: calculateProfitability(input.salePrice, input),
      recommended: null,
      reason: 'Komisyon ve hedef marj toplamı %100’den küçük olmalıdır.',
    }
  }

  const calculatedFloor = fixedCosts / remainingRate
  const minimumSafePrice = round2(Math.max(calculatedFloor, manualFloor ?? 0))
  if (manualCeiling != null && manualCeiling < minimumSafePrice) {
    return {
      status: 'invalid_rules',
      minimumSafePrice,
      recommendedPrice: null,
      current: calculateProfitability(input.salePrice, input),
      recommended: null,
      reason: 'Maksimum fiyat, hedef marjı sağlayan güvenli taban fiyatın altında kalıyor.',
    }
  }

  const hasMarket = input.marketMean != null && Number.isFinite(input.marketMean) && input.marketMean > 0
  let candidate = hasMarket ? input.marketMean as number : minimumSafePrice
  let reason: string

  if (!hasMarket) {
    reason = 'Piyasa verisi olmadığı için maliyet ve hedef marja göre güvenli taban fiyat önerildi.'
  } else if (candidate < minimumSafePrice) {
    candidate = minimumSafePrice
    reason = 'Piyasa ortalaması hedef marjı karşılamadığı için güvenli taban fiyat önerildi.'
  } else {
    reason = 'Hedef marjı koruyan piyasa ortalaması önerildi.'
  }

  if (manualCeiling != null && candidate > manualCeiling) {
    candidate = manualCeiling
    reason = 'Öneri, tanımlı maksimum fiyat sınırına çekildi.'
  }

  const recommendedPrice = round2(candidate)
  return {
    status: 'ready',
    minimumSafePrice,
    recommendedPrice,
    current: calculateProfitability(input.salePrice, input),
    recommended: calculateProfitability(recommendedPrice, input),
    reason,
  }
}
