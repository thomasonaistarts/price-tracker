import test from 'node:test'
import assert from 'node:assert/strict'
import {
  Wolvox26Client,
  decodeSdkResponse,
  encodeSdkParameters,
  md5WolvoxPassword,
  parseLoginResponse,
  WOLVOX26_READ_ONLY_COMMANDS,
} from '../scripts/wolvox-bridge/wolvox26-client.mjs'

test('WOLVOX password uses the uppercase MD5 format required by the SDK', () => {
  assert.equal(md5WolvoxPassword('password'), '5F4DCC3B5AA765D61D8327DEB882CF99')
})

test('SDK parameters and fully encoded responses use base64', () => {
  const encoded = encodeSdkParameters({ command: 'get_sirketliste', tPwd: 'temporary' })
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), 'command=get_sirketliste&tPwd=temporary')

  const response = Buffer.from('<ROOT><ROW /></ROOT>', 'utf8').toString('base64')
  assert.equal(decodeSdkResponse(response), '<ROOT><ROW /></ROOT>')
})

test('successful login returns only the temporary session password', () => {
  assert.equal(parseLoginResponse('1&ABC123'), 'ABC123')
  assert.throws(() => parseLoginResponse('0&Geçersiz kullanıcı'), error => error.code === 'login_failed')
})

test('client exposes only documented read operations needed by Fiyatlaa', () => {
  assert.deepEqual(WOLVOX26_READ_ONLY_COMMANDS, [
    'get_sirketliste',
    'get_faturaanalizi',
    'get_kasahrkanalizi',
    'get_carihrkanalizi',
    'get_carilist',
    'get_carihrklist',
    'get_stoklist',
    'get_stokenvanter',
    'get_depolist',
    'get_depoenvanter',
    'get_gunsonuraporu1',
  ])
})

test('write commands are rejected before any network request', async () => {
  let networkCalls = 0
  const client = new Wolvox26Client({
    fetchImpl: async () => {
      networkCalls += 1
      throw new Error('network should not be reached')
    },
  })
  await assert.rejects(client.requestReadOnly('xmlpost_stok'), error => error.code === 'command_not_allowed')
  assert.equal(networkCalls, 0)
})

test('initial client refuses non-local WOLVOX hosts', () => {
  assert.throws(
    () => new Wolvox26Client({ host: '192.168.1.20' }),
    error => error.code === 'non_local_host',
  )
})

test('depot inventory uses the official weighted average cost parameters', async () => {
  let postedBody = ''
  const client = new Wolvox26Client({
    fetchImpl: async (_url, options) => {
      postedBody = String(options.body)
      return { ok: true, text: async () => Buffer.from('<report />', 'utf8').toString('base64') }
    },
  })
  client.temporaryPassword = 'temporary'

  await client.getDepotInventory({ companyCode: '001', workingYear: 2024 })

  const encoded = new URLSearchParams(postedBody).get('DATA')
  const parameters = new URLSearchParams(Buffer.from(encoded, 'base64').toString('utf8'))
  assert.equal(parameters.get('command'), 'get_depoenvanter')
  assert.equal(parameters.get('sirketKodu'), '001')
  assert.equal(parameters.get('calismaYili'), '2024')
  assert.equal(parameters.get('envHesabi'), 'TL')
  assert.equal(parameters.get('maliyetTipi'), '7')
  assert.equal(parameters.get('doviziDahilEt'), '1')
  assert.equal(parameters.get('sadeceMikEnv'), '0')
})

test('invoice analysis uses the documented daily local-currency parameters', async () => {
  let postedBody = ''
  const client = new Wolvox26Client({
    fetchImpl: async (_url, options) => {
      postedBody = String(options.body)
      return { ok: true, text: async () => Buffer.from('<report />', 'utf8').toString('base64') }
    },
  })
  client.temporaryPassword = 'temporary'

  await client.getInvoiceAnalysis({ companyCode: '001', workingYear: 2024 })

  const encoded = new URLSearchParams(postedBody).get('DATA')
  const parameters = new URLSearchParams(Buffer.from(encoded, 'base64').toString('utf8'))
  assert.equal(parameters.get('command'), 'get_faturaanalizi')
  assert.equal(parameters.get('sirketKodu'), '001')
  assert.equal(parameters.get('calismaYili'), '2024')
  assert.equal(parameters.get('analizTipi'), '1')
  assert.equal(parameters.get('KPBDVZ'), '1')
})

test('day-end report keeps the requested sample window and excludes transfer noise', async () => {
  let postedBody = ''
  const client = new Wolvox26Client({
    fetchImpl: async (_url, options) => {
      postedBody = String(options.body)
      return { ok: true, text: async () => Buffer.from('<report />', 'utf8').toString('base64') }
    },
  })
  client.temporaryPassword = 'temporary'

  await client.getDayEndReport({
    companyCode: '001',
    workingYear: 2024,
    startDate: '22.07.2026 00:00:00',
    endDate: '22.07.2026 23:59:59',
  })

  const encoded = new URLSearchParams(postedBody).get('DATA')
  const parameters = new URLSearchParams(Buffer.from(encoded, 'base64').toString('utf8'))
  assert.equal(parameters.get('command'), 'get_gunsonuraporu1')
  assert.equal(parameters.get('GunBslTarihi'), '22.07.2026 00:00:00')
  assert.equal(parameters.get('GunBtsTarihi'), '22.07.2026 23:59:59')
  assert.equal(parameters.get('GunKaynakAlan'), '2')
  assert.equal(parameters.get('GnlEnvMaliyet'), '7')
  assert.equal(parameters.get('GunKasaTrs'), '0')
  assert.equal(parameters.get('GunBankaKasaTrs'), '0')
  assert.equal(parameters.get('GnlEnvDahilEt'), '1')
})
