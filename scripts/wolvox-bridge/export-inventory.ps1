param(
  [string]$CompanyCode = '001',
  [int]$WorkingYear = 2024,
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

if ($WolvoxHost -notin @('127.0.0.1', 'localhost', '::1')) {
  throw 'This first inventory read only permits the local WOLVOX service.'
}

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
    -TimeoutSec 180

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
  Write-Host 'Fiyatlaa WOLVOX 26 read-only depot inventory export' -ForegroundColor Cyan
  Write-Host "Company: $CompanyCode | Working year: $WorkingYear" -ForegroundColor DarkGray
  Write-Host 'Scope: all active depots | Cost: weighted average (type 7)' -ForegroundColor DarkGray
  Write-Host 'Passwords are hidden and are not written to disk.' -ForegroundColor DarkGray

  $username = Read-Host 'WOLVOX username [SYSDBA]'
  if ([string]::IsNullOrWhiteSpace($username)) {
    $username = 'SYSDBA'
  }
  $developerCode = Read-Host 'AKINSOFT developer code'
  $wolvoxPassword = Read-Host 'WOLVOX user password' -AsSecureString
  $developerPassword = Read-Host 'AKINSOFT developer password' -AsSecureString

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
    $reason = if ($loginResponse.Contains('&')) { $loginResponse.Substring($loginResponse.IndexOf('&') + 1) } else { 'Login failed' }
    throw "WOLVOX SDK login failed: $reason"
  }

  $temporaryPassword = $loginResponse.Substring(2)
  $inventoryXml = Invoke-WolvoxSdk ([ordered]@{
    command         = 'get_depoenvanter'
    tPwd            = $temporaryPassword
    sirketKodu      = $CompanyCode
    calismaYili     = $WorkingYear
    envHesabi       = 'TL'
    maliyetTipi     = 7
    doviziDahilEt   = 1
    sadeceMikEnv    = 0
  })

  if (-not $inventoryXml.TrimStart().StartsWith('<')) {
    throw 'WOLVOX did not return inventory data in XML format.'
  }

  try {
    [xml]$parsedInventoryXml = $inventoryXml
  }
  catch {
    throw "WOLVOX returned invalid inventory XML: $($_.Exception.Message)"
  }

  $outputDirectory = Join-Path $env:TEMP 'fiyatlaa-wolvox'
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
  $outputPath = Join-Path $outputDirectory ('depot-inventory-{0}-{1}-{2}.xml' -f $CompanyCode, $WorkingYear, (Get-Date -Format 'yyyyMMdd-HHmmss'))
  [IO.File]::WriteAllText($outputPath, $inventoryXml, [Text.UTF8Encoding]::new($false))

  $rowCount = @($parsedInventoryXml.report.table.row).Count
  Write-Host 'OK: Read-only WOLVOX 26 session opened.' -ForegroundColor Green
  Write-Host "OK: Depot inventory XML received ($([Text.Encoding]::UTF8.GetByteCount($inventoryXml)) bytes, $rowCount records)." -ForegroundColor Green
  Write-Host "Local output: $outputPath"
}
catch {
  Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
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
