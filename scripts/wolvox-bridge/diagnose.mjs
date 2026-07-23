import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import readline from 'node:readline/promises'
import { emitKeypressEvents } from 'node:readline'
import { stdin, stdout } from 'node:process'
import { Wolvox26Client, WolvoxSdkError } from './wolvox26-client.mjs'

const command = process.argv[2] ?? 'probe'
const host = '127.0.0.1'
const port = Number(process.env.WOLVOX_PORT ?? 3056)

if (command === 'stock') {
  await exportStock(host, port)
  process.exit(process.exitCode ?? 0)
}

if (command === 'probe') {
  await probePort(host, port)
} else if (command === 'discover') {
  await discoverCompanies(host, port)
} else {
  console.error('Kullanım: node scripts/wolvox-bridge/diagnose.mjs [probe|discover]')
  process.exitCode = 1
}

async function probePort(targetHost, targetPort) {
  await new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: targetHost, port: targetPort })
    const timer = setTimeout(() => {
      socket.destroy()
      reject(new Error('zaman aşımı'))
    }, 5000)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.end()
      resolve()
    })
    socket.once('error', error => {
      clearTimeout(timer)
      reject(error)
    })
  }).then(
    () => console.log(`OK: WOLVOX Kontrol Paneli ${host}:${port} adresinde bağlantı kabul ediyor.`),
    () => {
      console.error(`HATA: ${host}:${port} kapalı. WOLVOX Kontrol Paneli açık mı ve Güncelleme Portu 3056 mı kontrol edin.`)
      process.exitCode = 2
    },
  )
}

async function discoverCompanies(targetHost, targetPort) {
  const answers = await readCredentials()
  const client = new Wolvox26Client({ host: targetHost, port: targetPort })
  try {
    await client.login(answers)
    const companyXml = await client.getCompanyList()
    const outputDirectory = path.join(os.tmpdir(), 'fiyatlaa-wolvox')
    await mkdir(outputDirectory, { recursive: true })
    const outputPath = path.join(outputDirectory, `company-list-${Date.now()}.xml`)
    await writeFile(outputPath, companyXml, 'utf8')
    console.log('OK: Salt-okunur WOLVOX 26 oturumu açıldı.')
    console.log(`OK: Şirket/çalışma yılı XML çıktısı alındı (${Buffer.byteLength(companyXml, 'utf8')} bayt).`)
    console.log(`Yerel çıktı: ${outputPath}`)
    console.log('Parola veya geliştirici bilgilerini ekran görüntüsüyle paylaşmayın.')
  } catch (error) {
    const code = error instanceof WolvoxSdkError ? error.code : 'unexpected_error'
    console.error(`HATA (${code}): ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`)
    process.exitCode = 3
  } finally {
    await client.logout().catch(() => undefined)
  }
}

async function exportStock(targetHost, targetPort) {
  const companyCode = process.env.WOLVOX_COMPANY_CODE ?? '001'
  const workingYear = Number(process.env.WOLVOX_WORKING_YEAR ?? 2024)
  const answers = await readCredentials()
  const client = new Wolvox26Client({ host: targetHost, port: targetPort, timeoutMs: 120_000 })
  try {
    await client.login(answers)
    const stockXml = await client.getStockList({ companyCode, workingYear })
    if (!stockXml.trimStart().startsWith('<')) {
      throw new WolvoxSdkError('invalid_stock_response', 'WOLVOX stok verisini XML biciminde dondurmedi')
    }
    const outputDirectory = path.join(os.tmpdir(), 'fiyatlaa-wolvox')
    await mkdir(outputDirectory, { recursive: true })
    const outputPath = path.join(outputDirectory, `stock-list-${companyCode}-${workingYear}-${Date.now()}.xml`)
    await writeFile(outputPath, stockXml, 'utf8')
    console.log('OK: Salt-okunur WOLVOX 26 oturumu acildi.')
    console.log(`OK: Stok listesi XML ciktisi alindi (${Buffer.byteLength(stockXml, 'utf8')} bayt).`)
    console.log(`Yerel cikti: ${outputPath}`)
  } catch (error) {
    const code = error instanceof WolvoxSdkError ? error.code : 'unexpected_error'
    console.error(`HATA (${code}): ${error instanceof Error ? error.message : 'Bilinmeyen hata'}`)
    process.exitCode = 3
  } finally {
    await client.logout().catch(() => undefined)
  }
}

async function readCredentials() {
  const prompt = readline.createInterface({ input: stdin, output: stdout })
  try {
    const usernameInput = await prompt.question('WOLVOX kullanıcı adı [SYSDBA]: ')
    const developerCode = await prompt.question('AKINSOFT geliştirici kodu: ')
    prompt.close()
    const password = await readSecret('WOLVOX kullanıcı parolası: ')
    const developerPassword = await readSecret('AKINSOFT geliştirici parolası: ')
    return {
      username: usernameInput.trim() || 'SYSDBA',
      password,
      developerCode: developerCode.trim(),
      developerPassword,
    }
  } finally {
    prompt.close()
  }
}

async function readSecret(label) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    throw new Error('Gizli parola girişi için komutu etkileşimli PowerShell penceresinde çalıştırın')
  }
  stdout.write(label)
  emitKeypressEvents(stdin)
  stdin.setRawMode(true)
  stdin.resume()
  let value = ''
  return new Promise((resolve, reject) => {
    const onKeypress = (character, key) => {
      if (key?.ctrl && key.name === 'c') {
        cleanup()
        reject(new Error('İşlem iptal edildi'))
      } else if (key?.name === 'return' || key?.name === 'enter') {
        cleanup()
        stdout.write('\n')
        resolve(value)
      } else if (key?.name === 'backspace') {
        value = value.slice(0, -1)
      } else if (character && !key?.ctrl && !key?.meta) {
        value += character
      }
    }
    const cleanup = () => {
      stdin.off('keypress', onKeypress)
      stdin.setRawMode(false)
      stdin.pause()
    }
    stdin.on('keypress', onKeypress)
  })
}
