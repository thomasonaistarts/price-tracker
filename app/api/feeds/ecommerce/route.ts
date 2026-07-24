import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { buildEcommerceXmlFeed } from '@/lib/integrations/ecommerce-feed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

function authorized(request: NextRequest, expected: string) {
  const actual = request.headers.get('authorization') ?? ''
  const expectedHeader = `Bearer ${expected}`
  const actualBuffer = Buffer.from(actual)
  const expectedBuffer = Buffer.from(expectedHeader)
  return actualBuffer.length === expectedBuffer.length
    && timingSafeEqual(actualBuffer, expectedBuffer)
}

export async function GET(request: NextRequest) {
  const secret = process.env.ECOMMERCE_FEED_SECRET
  const ownerUserId = process.env.ECOMMERCE_OWNER_USER_ID
  if (!secret || secret.length < 24 || !ownerUserId) {
    return new Response('Feed yapılandırılmamış', { status: 503 })
  }
  if (!authorized(request, secret)) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createAdminClient() as any
  const { data, error } = await supabase
    .from('products')
    .select(`
      sku, barcode, product_name, brand, manufacturer_code, product_type, category,
      ecommerce_price, stock_quantity, safety_stock, stock_unit, currency,
      ecommerce_title, ecommerce_description, ecommerce_image_urls,
      ecommerce_updated_at, external_updated_at, updated_at
    `)
    .eq('user_id', ownerUserId)
    .eq('is_active', true)
    .eq('ecommerce_enabled', true)
    .not('ecommerce_price', 'is', null)
    .order('sku', { ascending: true })

  if (error) return new Response('Feed verisi okunamadı', { status: 500 })

  const xml = buildEcommerceXmlFeed((data ?? []).map((product: any) => ({
    sku: product.sku,
    barcode: product.barcode,
    title: product.ecommerce_title || product.product_name,
    brand: product.brand,
    manufacturerCode: product.manufacturer_code,
    productType: product.product_type,
    category: product.category,
    price: Number(product.ecommerce_price),
    stockQuantity: Number(product.stock_quantity ?? 0),
    safetyStock: Number(product.safety_stock ?? 0),
    stockUnit: product.stock_unit,
    currency: product.currency,
    description: product.ecommerce_description,
    imageUrls: product.ecommerce_image_urls,
    updatedAt: product.ecommerce_updated_at
      || product.external_updated_at
      || product.updated_at,
  })))
  const etag = `"${createHash('sha256').update(xml).digest('hex')}"`

  if (request.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } })
  }

  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      ETag: etag,
      'X-Content-Type-Options': 'nosniff',
    },
  })
}
