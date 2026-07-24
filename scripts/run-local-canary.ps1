param(
  [ValidateRange(1, 20)]
  [int]$MaxProducts = 20,
  [int]$Port = 3000,
  [string[]]$Skus = @()
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$temporarySecret = [guid]::NewGuid().ToString('N')
$env:CRON_SECRET = $temporarySecret
$stdoutPath = Join-Path $env:TEMP 'fiyatlaa-canary-dev.stdout.log'
$stderrPath = Join-Path $env:TEMP 'fiyatlaa-canary-dev.stderr.log'

if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
  throw "Port $Port is already in use. Stop the local server so the canary can start it with an ephemeral credential."
}

$server = Start-Process `
  -FilePath 'npm.cmd' `
  -ArgumentList @('run', 'dev', '--', '-p', $Port) `
  -WorkingDirectory $projectRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutPath `
  -RedirectStandardError $stderrPath `
  -PassThru

$ready = $false
for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    $ready = $true
    break
  }
}
if (-not $ready) {
  throw "Local server did not start. See $stderrPath"
}

$headers = @{ Authorization = "Bearer $temporarySecret" }
$baseUrl = "http://localhost:$Port"
$catalog = Invoke-RestMethod `
  -Uri "$baseUrl/api/debug-scraper/canary" `
  -Headers $headers `
  -Method Get `
  -TimeoutSec 30

$eligible = @(
  $catalog.candidates |
    Where-Object {
      $_.barcode -and (
        $Skus.Count -eq 0 -or
        $Skus -contains $_.sku
      )
    }
)

if ($Skus.Count -gt 0) {
  $selected = @($eligible | Select-Object -First $MaxProducts)
} else {
  $selected = @(
    $eligible |
      Group-Object {
        $category = if (
          [string]::IsNullOrWhiteSpace($_.category) -or
          $_.category -match '^\d{8,14}$'
        ) { 'KATEGORISIZ' } else { $_.category }
        $priceBand = if ($_.our_price -lt 300) {
          '150-299'
        } elseif ($_.our_price -lt 750) {
          '300-749'
        } else {
          '750+'
        }
        "$category|$priceBand"
      } |
      ForEach-Object { $_.Group | Select-Object -First 2 } |
      Select-Object -First $MaxProducts
  )
}

if ($Skus.Count -eq 0 -and $selected.Count -lt $MaxProducts) {
  $selectedIds = @{}
  foreach ($item in $selected) { $selectedIds[$item.id] = $true }
  $selected += @(
    $eligible |
      Where-Object { -not $selectedIds.ContainsKey($_.id) } |
      Select-Object -First ($MaxProducts - $selected.Count)
  )
}
if ($selected.Count -eq 0) {
  throw 'No eligible canary candidates were returned.'
}

Write-Output ("CANARY_START products={0} max={1} server_pid={2}" -f $selected.Count, $catalog.max_selection, $server.Id)
$runs = @()

foreach ($item in $selected) {
  Write-Output ("RUN_START {0} | {1} | {2}" -f $item.category, $item.sku, $item.product_name)
  try {
    $body = @{ product_id = $item.id } | ConvertTo-Json -Compress
    $result = Invoke-RestMethod `
      -Uri "$baseUrl/api/debug-scraper/canary" `
      -Headers $headers `
      -Method Post `
      -ContentType 'application/json' `
      -Body $body `
      -TimeoutSec 310

    $runs += [pscustomobject]@{
      status = 'success'
      product = $result.product
      elapsed_seconds = $result.elapsed_seconds
      estimated_provider_calls = $result.estimated_provider_calls
      outcome = $result.result.outcome
      alert = $result.result.alert
      sources_count = $result.result.sources_count
      sources = $result.result.sources
      review_candidates_count = @($result.result.review_candidates).Count
      review_candidates = $result.result.review_candidates
      scraper_health = $result.result.scraper_health
      search_attempts = $result.result.search_attempts
      writes_performed = $result.writes_performed
    }
    Write-Output (
      "RUN_DONE sku={0} outcome={1} sources={2} review={3} calls={4} elapsed={5}s writes={6}" -f `
        $item.sku,
        $result.result.outcome,
        $result.result.sources_count,
        @($result.result.review_candidates).Count,
        $result.estimated_provider_calls,
        $result.elapsed_seconds,
        $result.writes_performed
    )
  } catch {
    $runs += [pscustomobject]@{
      status = 'error'
      product = [pscustomobject]@{
        id = $item.id
        sku = $item.sku
        product_name = $item.product_name
        category = $item.category
      }
      error = $_.Exception.Message
    }
    Write-Output ("RUN_ERROR sku={0} error={1}" -f $item.sku, $_.Exception.Message)
  }
}

$report = [pscustomobject]@{
  generated_at = (Get-Date).ToUniversalTime().ToString('o')
  dry_run = $true
  requested_count = $selected.Count
  max_allowed = 20
  large_catalog_scan = $false
  runs = $runs
}
$reportPath = Join-Path $env:TEMP ("fiyatlaa-canary-{0}.json" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))
[IO.File]::WriteAllText(
  $reportPath,
  ($report | ConvertTo-Json -Depth 12),
  [Text.UTF8Encoding]::new($false)
)

$summary = [pscustomobject]@{
  report = $reportPath
  success = @($runs | Where-Object status -eq 'success').Count
  error = @($runs | Where-Object status -eq 'error').Count
  products_with_accepted_source = @($runs | Where-Object { $_.sources_count -gt 0 }).Count
  products_with_usable_market = @($runs | Where-Object { $_.sources_count -ge 2 }).Count
  products_with_review_candidate = @($runs | Where-Object { $_.review_candidates_count -gt 0 }).Count
  no_match = @($runs | Where-Object outcome -eq 'no_match').Count
  total_calls = ($runs | Measure-Object estimated_provider_calls -Sum).Sum
  total_elapsed_seconds = [math]::Round(($runs | Measure-Object elapsed_seconds -Sum).Sum, 1)
  total_sources = ($runs | Measure-Object sources_count -Sum).Sum
  total_review_candidates = ($runs | Measure-Object review_candidates_count -Sum).Sum
  writes = ($runs | Measure-Object writes_performed -Sum).Sum
}
Write-Output ('CANARY_SUMMARY ' + ($summary | ConvertTo-Json -Compress))
