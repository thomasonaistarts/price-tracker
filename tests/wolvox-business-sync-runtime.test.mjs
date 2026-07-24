import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const inventoryXml = `<report><table>
  <row>
    <BLSTKODU>42</BLSTKODU>
    <DEPO_ADI_1>KIRTASİYE</DEPO_ADI_1>
    <MIKTAR_GIREN>12</MIKTAR_GIREN>
    <MIKTAR_CIKAN>5</MIKTAR_CIKAN>
    <MIKTAR_KALAN>7</MIKTAR_KALAN>
    <MIKTAR_KULBILIR>6</MIKTAR_KULBILIR>
    <MIKTAR_BLOKE>1</MIKTAR_BLOKE>
    <BIRIM_FIYATI>1.250,50</BIRIM_FIYATI>
    <ENV_TUTARI>8.753,50</ENV_TUTARI>
  </row>
  <row><DEPO_ADI_1>KIRTASİYE</DEPO_ADI_1></row>
</table></report>`

const financialXml = `<report><table><row>
  <ANALIZ_ZAMANI>22.07.2026 16:04</ANALIZ_ZAMANI>
  <ALIS_TUTARI>1.250,50</ALIS_TUTARI><ALIS_IADE>50,25</ALIS_IADE><NET_ALIS>1.200,25</NET_ALIS>
  <SATIS_TUTARI>2.500,75</SATIS_TUTARI><SATIS_IADE>100,25</SATIS_IADE><NET_SATIS>2.400,50</NET_SATIS>
</row></table></report>`

test('PowerShell business sync defaults to a read-only dry run and validates counts', () => {
  if (process.platform !== 'win32') return

  const directory = mkdtempSync(join(tmpdir(), 'fiyatlaa-wolvox-sync-'))
  const inventoryPath = join(directory, 'inventory.xml')
  const financialPath = join(directory, 'financial.xml')
  writeFileSync(inventoryPath, inventoryXml, 'utf8')
  writeFileSync(financialPath, financialXml, 'utf8')

  const scriptPath = resolve('scripts/wolvox-bridge/sync-business-data.ps1')
  const result = spawnSync('powershell.exe', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', scriptPath,
    '-InventoryPath', inventoryPath,
    '-FinancialPath', financialPath,
    '-SummaryDate', '2026-07-22',
    '-ConnectionId', '11111111-1111-4111-8111-111111111111',
  ], {
    cwd: resolve('.'),
    encoding: 'utf8',
    timeout: 30_000,
  })

  assert.equal(result.status, 0, result.stderr || result.stdout)
  const jsonStart = result.stdout.indexOf('{')
  assert.ok(jsonStart >= 0, result.stdout)
  const summary = JSON.parse(result.stdout.slice(jsonStart))
  assert.deepEqual(summary, {
    mode: 'dry_run',
    source_read_only: true,
    inventory_valid: 1,
    inventory_invalid: 1,
    financial_valid: 1,
    financial_invalid: 0,
    batch_size: 200,
  })
})
