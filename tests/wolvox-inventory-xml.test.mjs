import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeWolvoxInventory, parseWolvoxInventoryXml } from '../lib/integrations/wolvox-inventory-xml.ts'

const fixture = `<?xml version="1.0" encoding="UTF-8"?>
<report><table>
  <row>
    <BLSTKODU><![CDATA[1]]></BLSTKODU>
    <DEPO_ADI_1><![CDATA[MERKEZ]]></DEPO_ADI_1>
    <MIKTAR_KALAN><![CDATA[7]]></MIKTAR_KALAN>
    <MIKTAR_KULBILIR><![CDATA[6]]></MIKTAR_KULBILIR>
    <MIKTAR_BLOKE><![CDATA[1]]></MIKTAR_BLOKE>
    <BIRIM_FIYATI><![CDATA[100]]></BIRIM_FIYATI>
    <ENV_TUTARI><![CDATA[700]]></ENV_TUTARI>
  </row>
  <row>
    <BLSTKODU><![CDATA[1]]></BLSTKODU>
    <DEPO_ADI_1><![CDATA[DEPO]]></DEPO_ADI_1>
    <MIKTAR_KALAN><![CDATA[3]]></MIKTAR_KALAN>
    <MIKTAR_KULBILIR><![CDATA[3]]></MIKTAR_KULBILIR>
    <MIKTAR_BLOKE><![CDATA[0]]></MIKTAR_BLOKE>
    <BIRIM_FIYATI><![CDATA[110]]></BIRIM_FIYATI>
    <ENV_TUTARI><![CDATA[330]]></ENV_TUTARI>
  </row>
  <row>
    <BLSTKODU><![CDATA[orphan]]></BLSTKODU>
    <DEPO_ADI_1><![CDATA[MERKEZ]]></DEPO_ADI_1>
    <MIKTAR_KALAN><![CDATA[-2]]></MIKTAR_KALAN>
    <MIKTAR_KULBILIR><![CDATA[-2]]></MIKTAR_KULBILIR>
    <BIRIM_FIYATI><![CDATA[0]]></BIRIM_FIYATI>
    <ENV_TUTARI><![CDATA[0]]></ENV_TUTARI>
  </row>
</table></report>`

test('depot inventory XML reads the real WOLVOX quantity and cost fields', () => {
  const parsed = parseWolvoxInventoryXml(fixture)
  assert.equal(parsed.sourceRowCount, 3)
  assert.deepEqual(parsed.records[0], {
    external_id: '1',
    depot_name: 'MERKEZ',
    quantity_remaining: 7,
    quantity_available: 6,
    quantity_blocked: 1,
    unit_cost: 100,
    inventory_value: 700,
  })
})

test('inventory is aggregated across depots and absent catalog items become zero stock', () => {
  const inventory = parseWolvoxInventoryXml(fixture)
  const merged = mergeWolvoxInventory([
    { external_id: '1', sku: 'ST1', purchase_cost: '90', raw_data: { source: 'catalog' } },
    { external_id: '2', sku: 'ST2', purchase_cost: '50' },
  ], inventory.records)

  assert.equal(merged.products[0].stock_quantity, 9)
  assert.equal(merged.products[0].purchase_cost, 103)
  assert.equal(merged.products[0].raw_data.inventory.depots.length, 2)
  assert.equal(merged.products[1].stock_quantity, 0)
  assert.equal(merged.products[1].purchase_cost, '50')
  assert.deepEqual(merged.summary, {
    catalogProducts: 2,
    inventoryRows: 3,
    inventoryProducts: 2,
    matchedProducts: 1,
    catalogWithoutInventory: 1,
    inventoryWithoutCatalog: 1,
    productsInMultipleDepots: 1,
    positiveStockProducts: 1,
    zeroStockProducts: 1,
    negativeStockProducts: 0,
  })
})
