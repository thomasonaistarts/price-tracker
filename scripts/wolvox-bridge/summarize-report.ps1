param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath
)

$ErrorActionPreference = 'Stop'
$resolvedPath = (Resolve-Path -LiteralPath $InputPath).Path

if ([IO.Path]::GetExtension($resolvedPath) -ne '.xml') {
  throw 'Input file must be a WOLVOX XML report.'
}

[xml]$document = Get-Content -LiteralPath $resolvedPath -Raw
$rows = @($document.report.table.row)
if ($rows.Count -eq 0) {
  throw 'The WOLVOX report does not contain report/table/row records.'
}

$safeValueFields = @(
  'FATURA_DURUMU',
  'ISLEM_TURU',
  'SIPARIS_DURUMU',
  'SIPARIS_TURU',
  'SUBE_KODU',
  'DEPO_ADI',
  'KAYNAK',
  'BIRIMI',
  'GRUBU',
  'ARA_GRUBU',
  'ALT_GRUBU',
  'MARKASI'
)

$fieldNames = @(
  $rows |
    ForEach-Object { $_.ChildNodes | ForEach-Object { $_.Name } } |
    Sort-Object -Unique
)

$fieldSummary = foreach ($fieldName in $fieldNames) {
  $values = @(
    $rows |
      ForEach-Object {
        $node = $_.SelectSingleNode($fieldName)
        if ($null -ne $node -and -not [string]::IsNullOrWhiteSpace($node.InnerText)) {
          $node.InnerText.Trim()
        }
      }
  )
  $distinctValues = @($values | Sort-Object -Unique)
  $safeSamples = if ($fieldName -in $safeValueFields) {
    @($distinctValues | Select-Object -First 20)
  }
  else {
    @()
  }

  [pscustomobject]@{
    name = $fieldName
    non_empty_count = $values.Count
    distinct_count = $distinctValues.Count
    safe_sample_values = $safeSamples
  }
}

$file = Get-Item -LiteralPath $resolvedPath
$hash = Get-FileHash -LiteralPath $resolvedPath -Algorithm SHA256
$summary = [pscustomobject]@{
  source_file = $file.Name
  source_bytes = $file.Length
  source_sha256 = $hash.Hash.ToLowerInvariant()
  generated_at = (Get-Date).ToUniversalTime().ToString('o')
  row_count = $rows.Count
  field_count = $fieldNames.Count
  fields = @($fieldSummary)
  privacy_note = 'Unknown field values are intentionally omitted. Only structural fields expose limited sample values.'
}

$summaryPath = Join-Path $file.DirectoryName ($file.BaseName + '-summary.json')
$json = $summary | ConvertTo-Json -Depth 7
[IO.File]::WriteAllText($summaryPath, $json, [Text.UTF8Encoding]::new($false))

Write-Host 'OK: Privacy-conscious WOLVOX report summary created.' -ForegroundColor Green
Write-Host "Rows: $($rows.Count) | Fields: $($fieldNames.Count)"
Write-Host "Summary: $summaryPath"
