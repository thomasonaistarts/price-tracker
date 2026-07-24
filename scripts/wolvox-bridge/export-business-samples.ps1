param(
  [string]$CompanyCode = '001',
  [int]$WorkingYear = 2024,
  [Parameter(Mandatory = $true)]
  [string]$SampleDate,
  [switch]$IncludeCurrentAccounts,
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
  throw 'Business sample export only permits the local WOLVOX service.'
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
    -TimeoutSec 300

  $payload = ([string]$response.Content).Trim()
  if ($payload.StartsWith('DATA=')) {
    $payload = [Uri]::UnescapeDataString($payload.Substring(5))
  }
  if ($payload.StartsWith('<') -or $payload -match '^[01]&') {
    return $payload
  }
  return [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String(($payload -replace '\s', ''))).Trim()
}

function Save-WolvoxReport {
  param(
    [string]$Name,
    [string]$Command,
    [string]$Payload,
    [string]$OutputDirectory
  )

  if (-not $Payload.TrimStart().StartsWith('<')) {
    throw "$Command did not return XML data."
  }

  try {
    [xml]$parsed = $Payload
  }
  catch {
    throw "$Command returned invalid XML: $($_.Exception.Message)"
  }

  $fileName = "$Name.xml"
  $outputPath = Join-Path $OutputDirectory $fileName
  [IO.File]::WriteAllText($outputPath, $Payload, [Text.UTF8Encoding]::new($false))

  $rows = @($parsed.report.table.row)
  $file = Get-Item -LiteralPath $outputPath
  $hash = Get-FileHash -LiteralPath $outputPath -Algorithm SHA256
  return [pscustomobject]@{
    name = $Name
    command = $Command
    file = $fileName
    bytes = $file.Length
    row_count = $rows.Count
    sha256 = $hash.Hash.ToLowerInvariant()
  }
}

function ConvertTo-SampleDate {
  param([string]$Value)

  $formats = @('yyyy-MM-dd', 'dd.MM.yyyy')
  $parsed = [DateTime]::MinValue
  foreach ($format in $formats) {
    if ([DateTime]::TryParseExact(
      $Value.Trim(),
      $format,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::None,
      [ref]$parsed
    )) {
      return $parsed
    }
  }

  throw 'SampleDate must use yyyy-MM-dd (recommended) or dd.MM.yyyy format.'
}

try {
  $sampleDateValue = ConvertTo-SampleDate $SampleDate
  $sampleDay = $sampleDateValue.ToString('dd.MM.yyyy', [Globalization.CultureInfo]::InvariantCulture)
  $startDate = "$sampleDay 00:00:00"
  $endDate = "$sampleDay 23:59:59"
  $runStamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $outputDirectory = Join-Path $env:TEMP "fiyatlaa-wolvox\business-samples-$CompanyCode-$WorkingYear-$runStamp"
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

  Write-Host 'Fiyatlaa WOLVOX 26 read-only business sample export' -ForegroundColor Cyan
  Write-Host "Company: $CompanyCode | Working year: $WorkingYear | Sample date: $sampleDay" -ForegroundColor DarkGray
  Write-Host 'Scope: invoice analysis, day-end report and latest-cost inventory.' -ForegroundColor DarkGray
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
    timeOut  = 30
  })

  if (-not $loginResponse.StartsWith('1&')) {
    $reason = if ($loginResponse.Contains('&')) { $loginResponse.Substring($loginResponse.IndexOf('&') + 1) } else { 'Login failed' }
    throw "WOLVOX SDK login failed: $reason"
  }

  $temporaryPassword = $loginResponse.Substring(2)
  $reports = [Collections.Generic.List[object]]::new()

  $invoiceAnalysisXml = Invoke-WolvoxSdk ([ordered]@{
    command       = 'get_faturaanalizi'
    tPwd          = $temporaryPassword
    sirketKodu    = $CompanyCode
    calismaYili   = $WorkingYear
    analizTipi    = 1
    KPBDVZ        = 1
  })
  $reports.Add((Save-WolvoxReport `
    -Name 'invoice-analysis-daily' `
    -Command 'get_faturaanalizi' `
    -Payload $invoiceAnalysisXml `
    -OutputDirectory $outputDirectory))

  $dayEndXml = Invoke-WolvoxSdk ([ordered]@{
    command                 = 'get_gunsonuraporu1'
    tPwd                    = $temporaryPassword
    sirketKodu              = $CompanyCode
    calismaYili             = $WorkingYear
    GunBslTarihi            = $startDate
    GunBtsTarihi            = $endDate
    GnlBtsTarihi            = $endDate
    GnlPosBtsTarihi         = $endDate
    GunKaynakAlan           = 2
    GnlEnvMaliyet           = 7
    GnlEnvMiktar            = 4
    GunParaBirimi           = 'TL'
    GunKasaTrs              = 0
    GunBankaKasaTrs         = 0
    GunCekSenTah            = 0
    GunBankaTrs             = 0
    GunCariVirman           = 0
    GunGrupKasaHrk          = 0
    GunGrupPos              = 0
    GnlEnvDahilEt           = 1
    GnlFarkHesDahilEt       = 0
  })
  $reports.Add((Save-WolvoxReport `
    -Name "day-end-$($sampleDateValue.ToString('yyyyMMdd'))" `
    -Command 'get_gunsonuraporu1' `
    -Payload $dayEndXml `
    -OutputDirectory $outputDirectory))

  $latestCostInventoryXml = Invoke-WolvoxSdk ([ordered]@{
    command         = 'get_stokenvanter'
    tPwd            = $temporaryPassword
    sirketKodu      = $CompanyCode
    calismaYili     = $WorkingYear
    envHesabi       = 'TL'
    maliyetTipi     = 5
    tarih1          = $startDate
    tarih2          = $endDate
    doviziDahilEt   = 1
    sadeceMikEnv    = 0
  })
  $reports.Add((Save-WolvoxReport `
    -Name "inventory-latest-cost-$($sampleDateValue.ToString('yyyyMMdd'))" `
    -Command 'get_stokenvanter' `
    -Payload $latestCostInventoryXml `
    -OutputDirectory $outputDirectory))

  if ($IncludeCurrentAccounts) {
    $currentAccountsXml = Invoke-WolvoxSdk ([ordered]@{
      command       = 'get_carilist'
      tPwd          = $temporaryPassword
      sirketKodu    = $CompanyCode
      calismaYili   = $WorkingYear
      fieldList     = 'BLKODU,CARIKODU,TICARI_UNVANI,GRUBU,ARA_GRUBU,ALT_GRUBU,AKTIF,SUBE_KODU'
    })
    $reports.Add((Save-WolvoxReport `
      -Name 'current-accounts-business-fields' `
      -Command 'get_carilist' `
      -Payload $currentAccountsXml `
      -OutputDirectory $outputDirectory))
  }

  $manifest = [pscustomobject]@{
    generated_at = (Get-Date).ToUniversalTime().ToString('o')
    company_code = $CompanyCode
    working_year = $WorkingYear
    sample_date = $sampleDay
    read_only = $true
    contains_current_accounts = [bool]$IncludeCurrentAccounts
    reports = @($reports)
  }
  $manifestPath = Join-Path $outputDirectory 'manifest.json'
  $manifestJson = $manifest | ConvertTo-Json -Depth 6
  [IO.File]::WriteAllText($manifestPath, $manifestJson, [Text.UTF8Encoding]::new($false))

  Write-Host 'OK: Read-only WOLVOX 26 business samples exported.' -ForegroundColor Green
  foreach ($report in $reports) {
    Write-Host ("OK: {0} -> {1} records, {2} bytes" -f $report.command, $report.row_count, $report.bytes) -ForegroundColor Green
  }
  Write-Host "Local output: $outputDirectory"
  Write-Host 'Run summarize-report.ps1 for each XML before sharing any report.' -ForegroundColor Yellow
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
