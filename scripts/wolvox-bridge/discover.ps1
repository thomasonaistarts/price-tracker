param(
  [string]$WolvoxHost = '127.0.0.1',
  [int]$Port = 3056
)

$ErrorActionPreference = 'Stop'
$baseUri = "http://${WolvoxHost}:${Port}/"
$temporaryPassword = $null
$wolvoxPasswordPlain = $null
$developerPasswordPlain = $null
$wolvoxPasswordPointer = [IntPtr]::Zero
$developerPasswordPointer = [IntPtr]::Zero

function ConvertFrom-SecureValue {
  param(
    [Security.SecureString]$Value,
    [ref]$Pointer
  )
  $Pointer.Value = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer.Value)
}

function Get-WolvoxMd5 {
  param([string]$Value)
  $md5 = [Security.Cryptography.MD5]::Create()
  try {
    $bytes = [Text.Encoding]::UTF8.GetBytes($Value)
    return ([BitConverter]::ToString($md5.ComputeHash($bytes))).Replace('-', '')
  }
  finally {
    $md5.Dispose()
  }
}

function Invoke-WolvoxSdk {
  param([Collections.IDictionary]$Parameters)

  $parts = foreach ($entry in $Parameters.GetEnumerator()) {
    if ($null -ne $entry.Value -and [string]$entry.Value -ne '') {
      '{0}={1}' -f $entry.Key, [Uri]::EscapeDataString([string]$entry.Value)
    }
  }
  $query = $parts -join '&'
  $encoded = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($query))
  $response = Invoke-WebRequest `
    -Uri $baseUri `
    -Method Post `
    -ContentType 'application/x-www-form-urlencoded' `
    -Body @{ DATA = $encoded } `
    -UseBasicParsing `
    -TimeoutSec 20

  $payload = ([string]$response.Content).Trim()
  if ($payload.StartsWith('DATA=')) {
    $payload = [Uri]::UnescapeDataString($payload.Substring(5))
  }
  if ($payload.StartsWith('<') -or $payload -match '^[01]&') {
    return $payload
  }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($payload -replace '\s', ''))).Trim()
}

try {
  Write-Host 'Fiyatlaa WOLVOX 26 salt-okunur şirket keşfi' -ForegroundColor Cyan
  Write-Host 'Parolalar ekranda gösterilmez ve dosyaya yazılmaz.' -ForegroundColor DarkGray

  $username = Read-Host 'WOLVOX kullanıcı adı [SYSDBA]'
  if ([string]::IsNullOrWhiteSpace($username)) {
    $username = 'SYSDBA'
  }
  $developerCode = Read-Host 'AKINSOFT geliştirici kodu'
  $wolvoxPassword = Read-Host 'WOLVOX kullanıcı parolası' -AsSecureString
  $developerPassword = Read-Host 'AKINSOFT geliştirici parolası' -AsSecureString

  $wolvoxPasswordPlain = ConvertFrom-SecureValue $wolvoxPassword ([ref]$wolvoxPasswordPointer)
  $developerPasswordPlain = ConvertFrom-SecureValue $developerPassword ([ref]$developerPasswordPointer)

  $loginResponse = Invoke-WolvoxSdk ([ordered]@{
    command  = 'wlogin'
    username = $username.Trim()
    password = Get-WolvoxMd5 $wolvoxPasswordPlain
    devCode  = $developerCode.Trim()
    devPass  = $developerPasswordPlain
    timeOut  = 15
  })

  if (-not $loginResponse.StartsWith('1&')) {
    $reason = if ($loginResponse.Contains('&')) { $loginResponse.Substring($loginResponse.IndexOf('&') + 1) } else { 'Oturum açılamadı' }
    throw "WOLVOX SDK girişi başarısız: $reason"
  }

  $temporaryPassword = $loginResponse.Substring(2)
  $companyXml = Invoke-WolvoxSdk ([ordered]@{
    command = 'get_sirketliste'
    tPwd    = $temporaryPassword
  })

  $outputDirectory = Join-Path $env:TEMP 'fiyatlaa-wolvox'
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  $outputPath = Join-Path $outputDirectory ('company-list-{0}.xml' -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
  [IO.File]::WriteAllText($outputPath, $companyXml, [Text.UTF8Encoding]::new($false))

  Write-Host 'OK: Salt-okunur WOLVOX 26 oturumu açıldı.' -ForegroundColor Green
  Write-Host "OK: Şirket/çalışma yılı XML çıktısı alındı ($([Text.Encoding]::UTF8.GetByteCount($companyXml)) bayt)." -ForegroundColor Green
  Write-Host "Yerel çıktı: $outputPath"
}
catch {
  Write-Host "HATA: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
finally {
  if ($temporaryPassword) {
    try {
      Invoke-WolvoxSdk ([ordered]@{
        command = 'wlogout'
        tPwd    = $temporaryPassword
      }) | Out-Null
    }
    catch {}
  }

  $wolvoxPasswordPlain = $null
  $developerPasswordPlain = $null
  if ($wolvoxPasswordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($wolvoxPasswordPointer)
  }
  if ($developerPasswordPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($developerPasswordPointer)
  }
}
