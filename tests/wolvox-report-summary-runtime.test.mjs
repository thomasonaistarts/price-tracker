import test from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const summaryScript = new URL('../scripts/wolvox-bridge/summarize-report.ps1', import.meta.url)

test('PowerShell report summary preserves UTF-8 and discovers nested day-end fields', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fiyatlaa-wolvox-summary-'))
  const input = join(directory, 'nested.xml')
  await writeFile(input, `<?xml version="1.0" encoding="utf-8"?>
    <report><table><row>
      <section><DEPO_ADI>MERKEZ ŞUBE</DEPO_ADI><NET_SATIS>1.234,56</NET_SATIS></section>
    </row></table></report>`, 'utf8')

  await execFileAsync('powershell', [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', summaryScript.pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    '-InputPath', input,
  ])

  const summary = JSON.parse(await readFile(join(directory, 'nested-summary.json'), 'utf8'))
  assert.equal(summary.row_count, 1)
  assert.equal(summary.nested_structure, true)
  assert.deepEqual(
    summary.fields.find(field => field.name === 'DEPO_ADI').safe_sample_values,
    ['MERKEZ ŞUBE'],
  )
  assert.deepEqual(
    summary.fields.find(field => field.name === 'NET_SATIS').safe_sample_values,
    [],
  )
})
