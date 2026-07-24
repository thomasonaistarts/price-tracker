import {
  priceChangePercent,
  requiresLargePriceChangeConfirmation,
} from '../price-change-safety.ts'

export interface WolvoxPriceWritePreviewInput {
  connectionId: string
  productId: string
  externalId: string
  currentPrice: number
  targetPrice: number
  proposalId?: string | null
}

export interface WolvoxPriceWritePreview {
  connectionId: string
  productId: string
  externalId: string
  expectedOldPrice: number
  targetPrice: number
  rollbackPrice: number
  changePercent: number
  requiresExtraApproval: boolean
  idempotencyKey: string
  executable: false
  blockedReason: 'wolvox_write_command_not_verified'
}

export function buildWolvoxPriceWritePreview(
  input: WolvoxPriceWritePreviewInput,
): WolvoxPriceWritePreview {
  if (!input.connectionId || !input.productId || !input.externalId.trim()) {
    throw new Error('wolvox_price_write_identity_missing')
  }
  if (
    !Number.isFinite(input.currentPrice) || input.currentPrice <= 0
    || !Number.isFinite(input.targetPrice) || input.targetPrice <= 0
  ) {
    throw new Error('wolvox_price_write_price_invalid')
  }
  const expectedOldPrice = round2(input.currentPrice)
  const targetPrice = round2(input.targetPrice)
  const proposalIdentity = input.proposalId?.trim() || 'manual-preview'

  return {
    connectionId: input.connectionId,
    productId: input.productId,
    externalId: input.externalId.trim(),
    expectedOldPrice,
    targetPrice,
    rollbackPrice: expectedOldPrice,
    changePercent: priceChangePercent(expectedOldPrice, targetPrice),
    requiresExtraApproval: requiresLargePriceChangeConfirmation(expectedOldPrice, targetPrice),
    idempotencyKey: [
      input.connectionId,
      input.externalId.trim(),
      proposalIdentity,
      expectedOldPrice.toFixed(2),
      targetPrice.toFixed(2),
    ].join(':'),
    executable: false,
    blockedReason: 'wolvox_write_command_not_verified',
  }
}

export function verifyWolvoxPriceReadback(input: {
  expectedTargetPrice: number
  actualPrice: number
}) {
  if (!Number.isFinite(input.actualPrice) || input.actualPrice <= 0) return false
  return Math.abs(round2(input.expectedTargetPrice) - round2(input.actualPrice)) < 0.01
}

const round2 = (value: number) =>
  Math.round((value + Number.EPSILON) * 100) / 100
