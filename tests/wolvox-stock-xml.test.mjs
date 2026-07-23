import test from 'node:test'
import assert from 'node:assert/strict'
import { mapWolvoxStockRow, parseWolvoxStockXml } from '../lib/integrations/wolvox-stock-xml.ts'

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<report>
  <executeSQL><![CDATA[SELECT S.*,SF.* FROM STOK S]]></executeSQL>
  <table>
    <row>
      <BLKODU><![CDATA[1]]></BLKODU>
      <STOKKODU><![CDATA[ST00001]]></STOKKODU>
      <STOK_ADI><![CDATA[Faber Castell Tack-It]]></STOK_ADI>
      <GRUBU><![CDATA[KIRTASİYE]]></GRUBU>
      <ARA_GRUBU><![CDATA[YAPIŞTIRICI]]></ARA_GRUBU>
      <BIRIMI><![CDATA[ADET]]></BIRIMI>
      <KDV_ORANI><![CDATA[20]]></KDV_ORANI>
      <BARKODU><![CDATA[9555684605665]]></BARKODU>
      <MARKASI><![CDATA[Faber &amp; Castell]]></MARKASI>
      <WEBDE_GORUNSUN><![CDATA[1]]></WEBDE_GORUNSUN>
      <AKTIF><![CDATA[1]]></AKTIF>
      <KSF1><![CDATA[247,49]]></KSF1>
      <KAF1><![CDATA[75]]></KAF1>
    </row>
  </table>
</report>`

test('WOLVOX stock XML maps the real SDK field names to staging inputs', () => {
  const result = parseWolvoxStockXml(fixture)
  assert.equal(result.sourceRowCount, 1)
  assert.ok(result.sourceFields.includes('KSF1'))
  assert.deepEqual(result.products[0], {
    external_id: '1',
    sku: 'ST00001',
    barcode: '9555684605665',
    product_name: 'Faber Castell Tack-It',
    brand: 'Faber & Castell',
    category: 'KIRTASİYE',
    sales_price: '247,49',
    purchase_cost: '75',
    vat_rate: '20',
    stock_quantity: null,
    unit_name: 'ADET',
    is_active: '1',
    raw_data: {
      BLKODU: '1',
      STOKKODU: 'ST00001',
      BARKODU: '9555684605665',
      STOK_ADI: 'Faber Castell Tack-It',
      MARKASI: 'Faber & Castell',
      GRUBU: 'KIRTASİYE',
      ARA_GRUBU: 'YAPIŞTIRICI',
      BIRIMI: 'ADET',
      KDV_ORANI: '20',
      KSF1: '247,49',
      KAF1: '75',
      AKTIF: '1',
      WEBDE_GORUNSUN: '1',
    },
  })
})

test('GTIN is used only when the primary WOLVOX barcode is empty', () => {
  const mapped = mapWolvoxStockRow({
    BLKODU: '2',
    STOKKODU: 'ST00002',
    STOK_ADI: 'Ürün',
    BARKODU: '',
    GTIN_NO: '8690000000001',
    AKTIF: '0',
  })
  assert.equal(mapped.barcode, '8690000000001')
  assert.equal(mapped.is_active, '0')
})

test('malformed and empty SDK documents are rejected before staging', () => {
  assert.throws(() => parseWolvoxStockXml('<not-wolvox />'), /invalid_root/)
  assert.throws(() => parseWolvoxStockXml('<report><table /></report>'), /_empty/)
})
