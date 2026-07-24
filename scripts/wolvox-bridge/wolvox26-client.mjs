import { createHash } from 'node:crypto'

const READ_ONLY_COMMANDS = new Set([
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

export class WolvoxSdkError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'WolvoxSdkError'
    this.code = code
  }
}

export function md5WolvoxPassword(password) {
  return createHash('md5').update(String(password), 'utf8').digest('hex').toUpperCase()
}

export function encodeSdkParameters(parameters) {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(parameters)) {
    if (value !== null && value !== undefined && value !== '') query.set(key, String(value))
  }
  return Buffer.from(query.toString(), 'utf8').toString('base64')
}

export function decodeSdkResponse(payload) {
  const trimmed = String(payload ?? '').trim().replace(/^\uFEFF/, '')
  if (!trimmed) throw new WolvoxSdkError('empty_response', 'WOLVOX SDK boş yanıt döndürdü')
  if (trimmed.startsWith('<') || /^[01]&/.test(trimmed)) return trimmed

  const encoded = trimmed.startsWith('DATA=') ? trimmed.slice(5) : trimmed
  const compact = decodeURIComponent(encoded).replace(/\s+/g, '')
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(compact)) {
    throw new WolvoxSdkError('invalid_response', 'WOLVOX SDK yanıt biçimi tanınamadı')
  }

  const decoded = Buffer.from(compact, 'base64').toString('utf8').trim().replace(/^\uFEFF/, '')
  if (!decoded) throw new WolvoxSdkError('empty_decoded_response', 'WOLVOX SDK yanıtı çözülemedi')
  return decoded
}

export function parseLoginResponse(response) {
  const separator = response.indexOf('&')
  const status = separator >= 0 ? response.slice(0, separator) : response
  const detail = separator >= 0 ? response.slice(separator + 1) : ''
  if (status !== '1' || !detail) {
    throw new WolvoxSdkError('login_failed', detail || 'WOLVOX SDK oturumu açılamadı')
  }
  return detail
}

export class Wolvox26Client {
  constructor({ host = '127.0.0.1', port = 3056, timeoutMs = 20_000, fetchImpl = fetch } = {}) {
    if (!['127.0.0.1', 'localhost', '::1'].includes(host)) {
      throw new WolvoxSdkError('non_local_host', 'İlk bağlantı testi yalnızca mağaza bilgisayarındaki yerel WOLVOX servisine izin verir')
    }
    this.endpoint = `http://${host}:${Number(port)}/`
    this.timeoutMs = timeoutMs
    this.fetchImpl = fetchImpl
    this.temporaryPassword = null
  }

  async login({ username, password, developerCode, developerPassword, sessionMinutes = 15 }) {
    if (!username || !password || !developerCode || !developerPassword) {
      throw new WolvoxSdkError('credentials_missing', 'WOLVOX kullanıcı ve geliştirici bilgileri gerekli')
    }
    const response = await this.#post({
      command: 'wlogin',
      username,
      password: md5WolvoxPassword(password),
      devCode: developerCode,
      devPass: developerPassword,
      timeOut: sessionMinutes,
    })
    this.temporaryPassword = parseLoginResponse(response)
  }

  async logout() {
    if (!this.temporaryPassword) return
    try {
      await this.#post({ command: 'wlogout', tPwd: this.temporaryPassword })
    } finally {
      this.temporaryPassword = null
    }
  }

  async requestReadOnly(command, parameters = {}) {
    if (!READ_ONLY_COMMANDS.has(command)) {
      throw new WolvoxSdkError('command_not_allowed', `Salt-okunur köprü komuta izin vermiyor: ${command}`)
    }
    if (!this.temporaryPassword) {
      throw new WolvoxSdkError('not_authenticated', 'Önce WOLVOX SDK oturumu açılmalı')
    }
    return this.#post({ command, tPwd: this.temporaryPassword, ...parameters })
  }

  getCompanyList() {
    return this.requestReadOnly('get_sirketliste')
  }

  getInvoiceAnalysis({
    companyCode,
    workingYear,
    analysisType = 1,
    localCurrency = 1,
    analysisAccount,
    branchFilter,
    filter,
  } = {}) {
    return this.requestReadOnly('get_faturaanalizi', {
      sirketKodu: companyCode,
      calismaYili: workingYear,
      analizTipi: analysisType,
      KPBDVZ: localCurrency,
      analizHesap: analysisAccount,
      subeSart: branchFilter,
      ekSart: filter,
    })
  }

  getCashMovementAnalysis({
    companyCode,
    workingYear,
    analysisType = 1,
    localCurrency = 1,
    analysisAccount,
    branchFilter,
    filter,
  } = {}) {
    return this.requestReadOnly('get_kasahrkanalizi', {
      sirketKodu: companyCode,
      calismaYili: workingYear,
      analizTipi: analysisType,
      KPBDVZ: localCurrency,
      analizHesap: analysisAccount,
      subeSart: branchFilter,
      ekSart: filter,
    })
  }

  getCurrentAccountMovementAnalysis({
    companyCode,
    workingYear,
    analysisType = 1,
    localCurrency = 1,
    analysisAccount,
    branchFilter,
    filter,
  } = {}) {
    return this.requestReadOnly('get_carihrkanalizi', {
      sirketKodu: companyCode,
      calismaYili: workingYear,
      analizTipi: analysisType,
      KPBDVZ: localCurrency,
      analizHesap: analysisAccount,
      subeSart: branchFilter,
      ekSart: filter,
    })
  }

  getCurrentAccountList({ companyCode, workingYear, filter, fieldList } = {}) {
    return this.requestReadOnly('get_carilist', {
      sirketKodu: companyCode,
      calismaYili: workingYear,
      ekSart: filter,
      fieldList,
    })
  }

  getCurrentAccountMovements({ companyCode, workingYear, filter, fieldList } = {}) {
    return this.requestReadOnly('get_carihrklist', {
      sirketKodu: companyCode,
      calismaYili: workingYear,
      ekSart: filter,
      fieldList,
    })
  }

  getStockList({ companyCode, workingYear, filter, fieldList } = {}) {
    return this.requestReadOnly('get_stoklist', {
      sirketKodu: companyCode,
      calismaYili: workingYear,
      ekSart: filter,
      fieldList,
    })
  }

  getStockInventory(parameters = {}) {
    return this.requestReadOnly('get_stokenvanter', parameters)
  }

  getDepotList({ companyCode, workingYear, filter, fieldList } = {}) {
    return this.requestReadOnly('get_depolist', {
      sirketKodu: companyCode,
      calismaYili: workingYear,
      ekSart: filter,
      fieldList,
    })
  }

  getDepotInventory({
    companyCode,
    workingYear,
    inventoryAccount = 'TL',
    costType = 7,
    includeForeignCurrency = 1,
    quantityOnly = 0,
  } = {}) {
    return this.requestReadOnly('get_depoenvanter', {
      sirketKodu: companyCode,
      calismaYili: workingYear,
      envHesabi: inventoryAccount,
      maliyetTipi: costType,
      doviziDahilEt: includeForeignCurrency,
      sadeceMikEnv: quantityOnly,
    })
  }

  getDayEndReport({
    companyCode,
    workingYear,
    startDate,
    endDate,
    generalEndDate = endDate,
    generalPosEndDate = endDate,
    dateSource = 2,
    inventoryCostType = 7,
    inventoryQuantityFilter = 4,
    branchFilter,
    currency = 'TL',
    personnel,
    includeCashTransfers = 0,
    includeBankCashTransfers = 0,
    includeChequeCollections = 0,
    includeBankTransfers = 0,
    includeCurrentAccountTransfers = 0,
    groupCashMovements = 0,
    groupPosByBank = 0,
    includeInventory = 1,
    includeDifferenceAccounts = 0,
  } = {}) {
    return this.requestReadOnly('get_gunsonuraporu1', {
      sirketKodu: companyCode,
      calismaYili: workingYear,
      GunBslTarihi: startDate,
      GunBtsTarihi: endDate,
      GnlBtsTarihi: generalEndDate,
      GnlPosBtsTarihi: generalPosEndDate,
      GunKaynakAlan: dateSource,
      GnlEnvMaliyet: inventoryCostType,
      GnlEnvMiktar: inventoryQuantityFilter,
      GunSubeKodu: branchFilter,
      GunParaBirimi: currency,
      GunPersonel: personnel,
      GunKasaTrs: includeCashTransfers,
      GunBankaKasaTrs: includeBankCashTransfers,
      GunCekSenTah: includeChequeCollections,
      GunBankaTrs: includeBankTransfers,
      GunCariVirman: includeCurrentAccountTransfers,
      GunGrupKasaHrk: groupCashMovements,
      GunGrupPos: groupPosByBank,
      GnlEnvDahilEt: includeInventory,
      GnlFarkHesDahilEt: includeDifferenceAccounts,
    })
  }

  async #post(parameters) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ DATA: encodeSdkParameters(parameters) }).toString(),
        signal: controller.signal,
      })
      if (!response.ok) throw new WolvoxSdkError('http_error', `WOLVOX SDK HTTP ${response.status} döndürdü`)
      return decodeSdkResponse(await response.text())
    } catch (error) {
      if (error?.name === 'AbortError') throw new WolvoxSdkError('timeout', 'WOLVOX SDK bağlantısı zaman aşımına uğradı')
      if (error instanceof WolvoxSdkError) throw error
      throw new WolvoxSdkError('connection_failed', 'WOLVOX SDK yerel servisine bağlanılamadı')
    } finally {
      clearTimeout(timer)
    }
  }
}

export const WOLVOX26_READ_ONLY_COMMANDS = Object.freeze(Array.from(READ_ONLY_COMMANDS))
