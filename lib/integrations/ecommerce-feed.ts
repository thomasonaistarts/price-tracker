export interface EcommerceFeedProduct {
  sku: string
  barcode?: string | null
  title: string
  brand?: string | null
  manufacturerCode?: string | null
  productType?: string | null
  category?: string | null
  price: number
  stockQuantity: number
  safetyStock: number
  stockUnit?: string | null
  currency?: string | null
  description?: string | null
  imageUrls?: string[] | null
  updatedAt?: string | null
}

const xmlEscape = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

const number = (value: number) =>
  Number.isFinite(value) ? Math.round(value * 1000) / 1000 : 0

export function ecommerceAvailableStock(product: EcommerceFeedProduct) {
  return Math.max(0, number(product.stockQuantity) - Math.max(0, number(product.safetyStock)))
}

export function buildEcommerceXmlFeed(
  products: EcommerceFeedProduct[],
  generatedAt = new Date().toISOString(),
) {
  const items = products
    .filter(product =>
      product.sku.trim()
      && product.title.trim()
      && Number.isFinite(product.price)
      && product.price > 0
    )
    .map(product => {
      const images = (product.imageUrls ?? [])
        .filter(url => /^https:\/\//i.test(url))
        .map(url => `<image>${xmlEscape(url)}</image>`)
        .join('')
      return [
        '<product>',
        `<sku>${xmlEscape(product.sku)}</sku>`,
        `<barcode>${xmlEscape(product.barcode)}</barcode>`,
        `<title>${xmlEscape(product.title)}</title>`,
        `<brand>${xmlEscape(product.brand)}</brand>`,
        `<manufacturer_code>${xmlEscape(product.manufacturerCode)}</manufacturer_code>`,
        `<product_type>${xmlEscape(product.productType)}</product_type>`,
        `<category>${xmlEscape(product.category)}</category>`,
        `<price currency="${xmlEscape(product.currency || 'TRY')}">${number(product.price).toFixed(2)}</price>`,
        `<stock>${ecommerceAvailableStock(product)}</stock>`,
        `<stock_unit>${xmlEscape(product.stockUnit)}</stock_unit>`,
        `<description>${xmlEscape(product.description)}</description>`,
        `<images>${images}</images>`,
        `<updated_at>${xmlEscape(product.updatedAt)}</updated_at>`,
        '</product>',
      ].join('')
    })

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<fiyatlaa_feed generated_at="${xmlEscape(generatedAt)}" count="${items.length}">`,
    ...items,
    '</fiyatlaa_feed>',
  ].join('')
}
