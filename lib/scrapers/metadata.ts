import type { SourceCommerceMetadata } from './types'

type UnknownRecord = Record<string, unknown>

function asRecord(value: unknown): UnknownRecord | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null
}

function getPath(source: unknown, path: string): unknown {
  let value: unknown = source
  for (const segment of path.split('.')) {
    const record = asRecord(value)
    if (!record) return undefined
    value = record[segment]
  }
  return value
}

function firstString(source: unknown, paths: string[]): string | undefined {
  for (const path of paths) {
    const value = getPath(source, path)
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

function firstNumber(source: unknown, paths: string[]): number | undefined {
  for (const path of paths) {
    const raw = getPath(source, path)
    const value = typeof raw === 'string'
      ? Number(raw.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''))
      : Number(raw)
    if (Number.isFinite(value) && value > 0) return value
  }
  return undefined
}

function firstBoolean(source: unknown, paths: string[]): boolean | undefined {
  for (const path of paths) {
    const value = getPath(source, path)
    if (typeof value === 'boolean') return value
  }
  return undefined
}

function uniqueStrings(values: Array<string | undefined>): string[] | undefined {
  const unique = Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
  return unique.length ? unique : undefined
}

function validOriginalPrice(candidate: number | undefined, currentPrice: number): number | undefined {
  return candidate != null && candidate > currentPrice ? candidate : undefined
}

export function extractTrendyolMetadata(item: unknown, currentPrice: number): SourceCommerceMetadata {
  const isSoldOut = firstBoolean(item, ['availability.stock.is_sold_out'])
  const freeShipping = firstBoolean(item, ['fulfillment.free_shipping'])
  const fastDelivery = firstBoolean(item, ['fulfillment.fast_delivery'])
  const sameDay = firstBoolean(item, ['fulfillment.same_day_shipping'])
  const nextDay = firstBoolean(item, ['details.additional.next_day_delivery'])
  const promotions = asRecord(getPath(item, 'promotions'))
  const priceLabels = Array.isArray(promotions?.price_labels)
    ? promotions.price_labels.map((label) => firstString(label, ['name']))
    : []

  return {
    originalPrice: validOriginalPrice(firstNumber(item, [
      'pricing.price.original_price',
      'pricing.price.old',
      'pricing.components.single_price.strikethrough_price_numeric',
      'pricing.components.recommended_retail_price.selling_price_numerized',
    ]), currentPrice),
    inStock: isSoldOut == null ? undefined : !isSoldOut,
    shipping: uniqueStrings([
      freeShipping ? 'Ücretsiz kargo' : undefined,
      sameDay ? 'Aynı gün teslimat' : undefined,
      nextDay ? 'Ertesi gün teslimat' : undefined,
      fastDelivery ? 'Hızlı teslimat' : undefined,
    ]),
    campaigns: uniqueStrings([
      ...priceLabels,
      firstString(item, ['promotions.single_promotion.short_name', 'promotions.single_promotion.name']),
      firstBoolean(item, ['promotions.has_collectable_coupon']) ? 'Kupon var' : undefined,
      firstBoolean(item, ['promotions.has_code_promo']) ? 'Kodlu kampanya' : undefined,
    ]),
    officialSeller: firstBoolean(item, ['badges.official_seller']),
  }
}

export function extractSchemaOfferMetadata(offersInput: unknown, currentPrice: number): SourceCommerceMetadata {
  const offer = Array.isArray(offersInput) ? offersInput[0] : offersInput
  const availability = firstString(offer, ['availability'])?.toLowerCase()
  const shippingRate = firstNumber(offer, ['shippingDetails.shippingRate.value'])
  const rawShippingRate = getPath(offer, 'shippingDetails.shippingRate.value')

  return {
    seller: firstString(offer, ['seller.name', 'offeredBy.name']),
    originalPrice: validOriginalPrice(firstNumber(offer, ['highPrice', 'listPrice']), currentPrice),
    inStock: availability?.includes('outofstock')
      ? false
      : availability?.includes('instock') ? true : undefined,
    shipping: uniqueStrings([
      (shippingRate === 0 || rawShippingRate === 0 || rawShippingRate === '0') ? 'Ücretsiz kargo' : undefined,
    ]),
  }
}

export function extractGenericCommerceMetadata(item: unknown, currentPrice: number): SourceCommerceMetadata {
  const explicitInStock = firstBoolean(item, ['isInStock', 'inStock', 'available', 'isAvailable'])
  const isSoldOut = firstBoolean(item, ['isSoldOut', 'soldOut', 'availability.stock.is_sold_out'])
  const stockCount = firstNumber(item, ['stock', 'stockCount', 'availableStock'])
  const availability = firstString(item, ['availability'])?.toLowerCase()

  let inStock = explicitInStock
  if (inStock == null && isSoldOut != null) inStock = !isSoldOut
  if (inStock == null && stockCount != null) inStock = stockCount > 0
  if (inStock == null && availability?.includes('outofstock')) inStock = false
  if (inStock == null && availability?.includes('instock')) inStock = true

  return {
    seller: firstString(item, ['merchantName', 'sellerName', 'seller.name', 'merchant.name', 'storeName']),
    originalPrice: validOriginalPrice(firstNumber(item, ['listPrice', 'originalPrice', 'oldPrice', 'priceInfo.originalPrice']), currentPrice),
    inStock,
    shipping: uniqueStrings([
      firstBoolean(item, ['freeShipping', 'isFreeShipping']) ? 'Ücretsiz kargo' : undefined,
      firstBoolean(item, ['fastDelivery', 'isFastDelivery']) ? 'Hızlı teslimat' : undefined,
      firstBoolean(item, ['sameDayShipping', 'sameDayDelivery']) ? 'Aynı gün teslimat' : undefined,
    ]),
    campaigns: uniqueStrings([
      firstString(item, ['campaignText', 'campaignName', 'promotionName', 'badgeText']),
    ]),
    officialSeller: firstBoolean(item, ['officialSeller', 'isOfficialSeller', 'badges.official_seller']),
  }
}

export function mergeCommerceMetadata(
  ...items: Array<SourceCommerceMetadata | undefined>
): SourceCommerceMetadata {
  return {
    seller: items.find((item) => item?.seller)?.seller,
    originalPrice: items.find((item) => item?.originalPrice)?.originalPrice,
    inStock: items.find((item) => item?.inStock != null)?.inStock,
    shipping: uniqueStrings(items.flatMap((item) => item?.shipping ?? [])),
    campaigns: uniqueStrings(items.flatMap((item) => item?.campaigns ?? [])),
    officialSeller: items.find((item) => item?.officialSeller != null)?.officialSeller,
  }
}
