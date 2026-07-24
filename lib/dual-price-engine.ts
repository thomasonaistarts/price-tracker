import { recommendPrice, type PriceRecommendation, type ProfitabilityInput } from './price-recommendation.ts'
import {
  priceChangePercent,
  requiresLargePriceChangeConfirmation,
} from './price-change-safety.ts'

export interface DualPriceInput {
  store: ProfitabilityInput
  ecommerce: ProfitabilityInput
}

export interface PriceProposalDraft {
  target: 'store' | 'ecommerce'
  currentPrice: number
  proposedPrice: number | null
  changePercent: number | null
  requiresExtraApproval: boolean
  recommendation: PriceRecommendation
}

function draft(
  target: PriceProposalDraft['target'],
  input: ProfitabilityInput,
): PriceProposalDraft {
  const recommendation = recommendPrice(input)
  const proposedPrice = recommendation.recommendedPrice
  return {
    target,
    currentPrice: input.salePrice,
    proposedPrice,
    changePercent: proposedPrice == null
      ? null
      : priceChangePercent(input.salePrice, proposedPrice),
    requiresExtraApproval: proposedPrice != null
      && requiresLargePriceChangeConfirmation(input.salePrice, proposedPrice),
    recommendation,
  }
}

export function buildDualPriceProposals(input: DualPriceInput) {
  return {
    store: draft('store', input.store),
    ecommerce: draft('ecommerce', input.ecommerce),
  }
}
