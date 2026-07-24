param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath
)

$ErrorActionPreference = 'Stop'
$resolvedPath = (Resolve-Path -LiteralPath $InputPath).Path

if ([IO.Path]::GetExtension($resolvedPath) -ne '.xml') {
  throw 'Input file must be a WOLVOX XML report.'
}

$xmlText = [IO.File]::ReadAllText($resolvedPath, [Text.Encoding]::UTF8)
$document = [Xml.XmlDocument]::new()
$document.PreserveWhitespace = $false
$document.LoadXml($xmlText)

if ($null -eq $document.DocumentElement) {
  throw 'The WOLVOX report does not contain an XML document element.'
}

# Some WOLVOX reports (notably get_gunsonuraporu1) wrap their values in
# additional sections below the row. Descendant selection keeps the summary
# structural while supporting both flat and nested reports.
$rows = @($document.SelectNodes('//row'))
if ($rows.Count -eq 0) {
  $rows = @($document.DocumentElement)
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

function Get-LeafNodes {
  param([Xml.XmlNode]$Node)

  foreach ($child in @($Node.ChildNodes)) {
    if ($child.NodeType -ne [Xml.XmlNodeType]::Element) {
      continue
    }

    $elementChildren = @($child.ChildNodes | Where-Object {
      $_.NodeType -eq [Xml.XmlNodeType]::Element
    })
    if ($elementChildren.Count -eq 0) {
      $child
    }
    else {
      Get-LeafNodes -Node $child
    }
  }
}

$leafNodes = @($rows | ForEach-Object { Get-LeafNodes -Node $_ })
$fieldNames = @($leafNodes | ForEach-Object { $_.Name } | Sort-Object -Unique)

$fieldSummary = foreach ($fieldName in $fieldNames) {
  $values = @(
    $leafNodes |
      Where-Object { $_.Name -eq $fieldName } |
      ForEach-Object {
        if (-not [string]::IsNullOrWhiteSpace($_.InnerText)) {
          $_.InnerText.Trim()
        }
      }
  )
  $distinctValues = @($values | Sort-Object -Unique)
  $safeSamples = [Collections.ArrayList]::new()
  if ($fieldName -in $safeValueFields) {
    foreach ($sample in @($distinctValues | Select-Object -First 20)) {
      [void]$safeSamples.Add($sample)
    }
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
  nested_structure = [bool](@($leafNodes | Where-Object { $_.ParentNode.ParentNode -ne $document.DocumentElement }).Count -gt 0)
  fields = @($fieldSummary)
  privacy_note = 'Unknown field values are intentionally omitted. Only structural fields expose limited sample values.'
}

$summaryPath = Join-Path $file.DirectoryName ($file.BaseName + '-summary.json')
$json = $summary | ConvertTo-Json -Depth 7
[IO.File]::WriteAllText($summaryPath, $json, [Text.UTF8Encoding]::new($false))

Write-Host 'OK: Privacy-conscious WOLVOX report summary created.' -ForegroundColor Green
Write-Host "Rows: $($rows.Count) | Fields: $($fieldNames.Count)"
Write-Host "Summary: $summaryPath"
