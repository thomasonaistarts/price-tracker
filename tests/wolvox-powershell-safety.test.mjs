import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const scriptPath = new URL('../scripts/wolvox-bridge/discover.ps1', import.meta.url)
const stockScriptPath = new URL('../scripts/wolvox-bridge/export-stock.ps1', import.meta.url)
const depotScriptPath = new URL('../scripts/wolvox-bridge/export-depots.ps1', import.meta.url)
const inventoryScriptPath = new URL('../scripts/wolvox-bridge/export-inventory.ps1', import.meta.url)
const businessSamplesScriptPath = new URL('../scripts/wolvox-bridge/export-business-samples.ps1', import.meta.url)
const reportSummaryScriptPath = new URL('../scripts/wolvox-bridge/summarize-report.ps1', import.meta.url)

test('PowerShell discovery script remains strictly read-only', async () => {
  const script = await readFile(scriptPath, 'utf8')
  assert.match(script, /get_sirketliste/)
  assert.match(script, /wlogin/)
  assert.match(script, /wlogout/)
  assert.doesNotMatch(script, /xmlpost/i)
  assert.doesNotMatch(script, /get_stoklist/i)
  assert.doesNotMatch(script, /get_stokenvanter/i)
})

test('PowerShell discovery script uses hidden password prompts', async () => {
  const script = await readFile(scriptPath, 'utf8')
  const hiddenPrompts = script.match(/-AsSecureString/g) ?? []
  assert.equal(hiddenPrompts.length, 2)
  assert.match(script, /ZeroFreeBSTR/)
})

test('PowerShell stock export is local, read-only and scoped to the discovered company', async () => {
  const script = await readFile(stockScriptPath, 'utf8')
  assert.match(script, /get_stoklist/)
  assert.match(script, /CompanyCode = '001'/)
  assert.match(script, /WorkingYear = 2024/)
  assert.match(script, /sirketKodu\s+= \$CompanyCode/)
  assert.match(script, /calismaYili\s+= \$WorkingYear/)
  assert.match(script, /127\.0\.0\.1/)
  assert.doesNotMatch(script, /xmlpost/i)
  assert.doesNotMatch(script, /get_stokenvanter/i)
})

test('PowerShell stock export keeps both passwords hidden and clears their buffers', async () => {
  const script = await readFile(stockScriptPath, 'utf8')
  const hiddenPrompts = script.match(/-AsSecureString/g) ?? []
  assert.equal(hiddenPrompts.length, 2)
  assert.match(script, /ZeroFreeBSTR/)
})

test('PowerShell depot export remains local and strictly read-only', async () => {
  const script = await readFile(depotScriptPath, 'utf8')
  assert.match(script, /get_depolist/)
  assert.match(script, /CompanyCode = '001'/)
  assert.match(script, /WorkingYear = 2024/)
  assert.match(script, /127\.0\.0\.1/)
  assert.doesNotMatch(script, /xmlpost/i)
  assert.doesNotMatch(script, /get_depoenvanter/i)
  assert.equal((script.match(/-AsSecureString/g) ?? []).length, 2)
  assert.match(script, /ZeroFreeBSTR/)
})

test('PowerShell inventory export uses the official read-only weighted-cost parameters', async () => {
  const script = await readFile(inventoryScriptPath, 'utf8')
  assert.match(script, /get_depoenvanter/)
  assert.match(script, /envHesabi\s+= 'TL'/)
  assert.match(script, /maliyetTipi\s+= 7/)
  assert.match(script, /doviziDahilEt\s+= 1/)
  assert.match(script, /sadeceMikEnv\s+= 0/)
  assert.doesNotMatch(script, /xmlpost/i)
  assert.equal((script.match(/-AsSecureString/g) ?? []).length, 2)
  assert.match(script, /ZeroFreeBSTR/)
})

test('PowerShell business sample export remains local, read-only and date-scoped', async () => {
  const script = await readFile(businessSamplesScriptPath, 'utf8')
  assert.match(script, /get_faturaanalizi/)
  assert.match(script, /get_gunsonuraporu1/)
  assert.match(script, /get_stokenvanter/)
  assert.match(script, /maliyetTipi\s+= 5/)
  assert.match(script, /GunBslTarihi\s+= \$startDate/)
  assert.match(script, /GunBtsTarihi\s+= \$endDate/)
  assert.match(script, /127\.0\.0\.1/)
  assert.doesNotMatch(script, /xmlpost/i)
  assert.equal((script.match(/-AsSecureString/g) ?? []).length, 2)
  assert.match(script, /ZeroFreeBSTR/)
})

test('PowerShell report summary omits unknown field values', async () => {
  const script = await readFile(reportSummaryScriptPath, 'utf8')
  assert.match(script, /safeValueFields/)
  assert.match(script, /Unknown field values are intentionally omitted/)
  assert.doesNotMatch(script, /TICARI_UNVANI/)
  assert.doesNotMatch(script, /ADI_SOYADI/)
  assert.doesNotMatch(script, /TELEFON/)
  assert.doesNotMatch(script, /ADRESI/)
})
