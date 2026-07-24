param(
  [Parameter(Mandatory = $true)]
  [string]$InventoryPath,
  [string]$FinancialPath,
  [string]$SummaryDate,
  [Parameter(Mandatory = $true)]
  [Guid]$ConnectionId,
  [string]$Endpoint = 'http://localhost:3000/api/bridge/wolvox/business-data',
  [ValidateRange(1, 250)]
  [int]$BatchSize = 200,
  [switch]$Upload
)

$ErrorActionPreference = 'Stop'
$bridgeSecretPlain = $null
$bridgeSecretPointer = [IntPtr]::Zero

function ConvertFrom-SecureValue {
  param(
    [Security.SecureString]$Value,
    [ref]$Pointer
  )
  $Pointer.Value = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value)
  return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Pointer.Value)
}

function Convert-WolvoxNumber {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return 0.0 }
  $normalized = $Value.Trim() -replace '\s', ''
  if ($normalized -match '^-?\d{1,3}(\.\d{3})+,\d+$') {
    $normalized = ($normalized -replace '\.', '') -replace ',', '.'
  }
  elseif ($normalized -match '^-?\d+,\d+$') {
    $normalized = $normalized -replace ',', '.'
  }
  elseif ($normalized -match '^-?\d{1,3}(,\d{3})+\.\d+$') {
    $normalized = $normalized -replace ',', ''
  }
  $result = 0.0
  if (-not [double]::TryParse(
    $normalized,
    [Globalization.NumberStyles]::Float,
    [Globalization.CultureInfo]::InvariantCulture,
    [ref]$result
  )) {
    throw "Invalid WOLVOX number: $Value"
  }
  return $result
}

function Get-StableHash {
  param([string[]]$Values)
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $inputText = $Values -join [char]0x1f
    $bytes = [Text.Encoding]::UTF8.GetBytes($inputText)
    return ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha.Dispose()
  }
}

function Read-WolvoxRows {
  param(
    [string]$Path,
    [scriptblock]$OnRow
  )
  $settings = [Xml.XmlReaderSettings]::new()
  $settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
  $settings.IgnoreComments = $true
  $settings.IgnoreWhitespace = $true
  $reader = [Xml.XmlReader]::Create($Path, $settings)
  try {
    while ($reader.Read()) {
      if ($reader.NodeType -ne [Xml.XmlNodeType]::Element -or $reader.Name -ne 'row') {
        continue
      }
      $subtree = $reader.ReadSubtree()
      $row = @{}
      try {
        while ($subtree.Read()) {
          if (
            $subtree.NodeType -eq [Xml.XmlNodeType]::Element -and
            $subtree.Depth -eq 1 -and
            -not $subtree.IsEmptyElement
          ) {
            $fieldName = $subtree.Name.ToUpperInvariant()
            $row[$fieldName] = $subtree.ReadElementContentAsString().Trim()
          }
        }
      }
      finally {
        $subtree.Dispose()
      }
      & $OnRow $row
    }
  }
  finally {
    $reader.Dispose()
  }
}

function Invoke-Bridge {
  param([hashtable]$Payload)
  $headers = @{
    Authorization = "Bearer $bridgeSecretPlain"
  }
  return Invoke-RestMethod `
    -Uri $Endpoint `
    -Method Post `
    -Headers $headers `
    -ContentType 'application/json; charset=utf-8' `
    -Body ($Payload | ConvertTo-Json -Depth 8 -Compress) `
    -TimeoutSec 60
}

function Send-Batch {
  param(
    [string]$Action,
    [Guid]$RunId,
    [Collections.ArrayList]$Rows
  )
  if ($Rows.Count -eq 0) { return }
  $response = Invoke-Bridge @{
    action = $Action
    connection_id = $ConnectionId.ToString()
    run_id = $RunId.ToString()
    rows = @($Rows)
  }
  if ([int]$response.accepted -ne $Rows.Count) {
    throw "Bridge count mismatch: sent $($Rows.Count), accepted $($response.accepted)"
  }
  $Rows.Clear()
}

$resolvedInventoryPath = (Resolve-Path -LiteralPath $InventoryPath).Path
$snapshotAt = (Get-Item -LiteralPath $resolvedInventoryPath).LastWriteTimeUtc.ToString('o')
$inventoryCount = 0
$invalidInventoryCount = 0
$inventoryBatch = [Collections.ArrayList]::new()
$inventoryRunId = [Guid]::Empty

try {
  if ($Upload) {
    if (-not ([Uri]$Endpoint).IsLoopback -and -not $Endpoint.StartsWith('https://')) {
      throw 'Remote bridge endpoint must use HTTPS.'
    }
    $bridgeSecret = Read-Host 'Fiyatlaa bridge secret' -AsSecureString
    $bridgeSecretPlain = ConvertFrom-SecureValue $bridgeSecret ([ref]$bridgeSecretPointer)
    if ($bridgeSecretPlain.Length -lt 24) {
      throw 'Bridge secret must be at least 24 characters.'
    }
    $inventoryRunId = [Guid](Invoke-Bridge @{
      action = 'start'
      connection_id = $ConnectionId.ToString()
      entity_type = 'inventory'
    }).run_id
  }

  Read-WolvoxRows $resolvedInventoryPath {
    param($source)
    $externalId = [string]$source.BLSTKODU
    if ([string]::IsNullOrWhiteSpace($externalId)) {
      $externalId = [string]$source.BLKODU
    }
    if ([string]::IsNullOrWhiteSpace($externalId)) {
      $script:invalidInventoryCount += 1
      return
    }
    try {
      $depotName = [string]$source.DEPO_ADI_1
      if ([string]::IsNullOrWhiteSpace($depotName)) {
        $depotName = [string]$source.DEPO_ADI
      }
      $quantityIn = Convert-WolvoxNumber ([string]$source.MIKTAR_GIREN)
      $quantityOut = Convert-WolvoxNumber ([string]$source.MIKTAR_CIKAN)
      $quantityRemaining = Convert-WolvoxNumber ([string]$source.MIKTAR_KALAN)
      $quantityAvailable = Convert-WolvoxNumber ([string]$source.MIKTAR_KULBILIR)
      $quantityBlocked = Convert-WolvoxNumber ([string]$source.MIKTAR_BLOKE)
      $unitCostText = [string]$source.BIRIM_FIYATI
      $unitCost = if ([string]::IsNullOrWhiteSpace($unitCostText)) { $null } else { Convert-WolvoxNumber $unitCostText }
      $inventoryValue = Convert-WolvoxNumber ([string]$source.ENV_TUTARI)
      $row = [ordered]@{
        external_product_id = $externalId.Trim()
        depot_code = $depotName.Trim()
        depot_name = if ([string]::IsNullOrWhiteSpace($depotName)) { $null } else { $depotName.Trim() }
        snapshot_at = $snapshotAt
        period_started_at = $null
        quantity_in = $quantityIn
        quantity_out = $quantityOut
        quantity_remaining = $quantityRemaining
        quantity_available = $quantityAvailable
        quantity_blocked = $quantityBlocked
        unit_cost = $unitCost
        inventory_value = $inventoryValue
        source_hash = Get-StableHash @(
          $externalId.Trim(), $depotName.Trim(), $quantityIn, $quantityOut,
          $quantityRemaining, $quantityAvailable, $quantityBlocked, $unitCost, $inventoryValue
        )
      }
      $script:inventoryCount += 1
      if ($Upload) {
        [void]$script:inventoryBatch.Add($row)
        if ($script:inventoryBatch.Count -ge $BatchSize) {
          Send-Batch 'inventory_batch' $inventoryRunId $script:inventoryBatch
        }
      }
    }
    catch {
      $script:invalidInventoryCount += 1
    }
  }

  if ($Upload) {
    Send-Batch 'inventory_batch' $inventoryRunId $inventoryBatch
    [void](Invoke-Bridge @{
      action = 'finish'
      connection_id = $ConnectionId.ToString()
      run_id = $inventoryRunId.ToString()
      received_count = $inventoryCount + $invalidInventoryCount
      valid_count = $inventoryCount
      invalid_count = $invalidInventoryCount
    })
  }

  $financialCount = 0
  $invalidFinancialCount = 0
  if ($FinancialPath) {
    if ($SummaryDate -notmatch '^\d{4}-\d{2}-\d{2}$') {
      throw 'SummaryDate must use ISO format: yyyy-MM-dd'
    }
    $resolvedFinancialPath = (Resolve-Path -LiteralPath $FinancialPath).Path
    $financialBatch = [Collections.ArrayList]::new()
    $financialRunId = [Guid]::Empty
    if ($Upload) {
      $financialRunId = [Guid](Invoke-Bridge @{
        action = 'start'
        connection_id = $ConnectionId.ToString()
        entity_type = 'financial_summary'
      }).run_id
    }
    Read-WolvoxRows $resolvedFinancialPath {
      param($source)
      try {
        $analysisTime = $null
        if ([string]$source.ANALIZ_ZAMANI -match '(?:^|\s)(\d{1,2}):(\d{2})(?::(\d{2}))?') {
          $seconds = if ($Matches[3]) { $Matches[3] } else { '00' }
          $analysisTime = '{0:D2}:{1}:{2}' -f [int]$Matches[1], $Matches[2], $seconds
        }
        $purchase = Convert-WolvoxNumber ([string]$source.ALIS_TUTARI)
        $purchaseReturn = Convert-WolvoxNumber ([string]$source.ALIS_IADE)
        $netPurchase = Convert-WolvoxNumber ([string]$source.NET_ALIS)
        $sales = Convert-WolvoxNumber ([string]$source.SATIS_TUTARI)
        $salesReturn = Convert-WolvoxNumber ([string]$source.SATIS_IADE)
        $netSales = Convert-WolvoxNumber ([string]$source.NET_SATIS)
        $row = [ordered]@{
          summary_date = $SummaryDate
          analysis_time = $analysisTime
          purchase_total = $purchase
          purchase_return_total = $purchaseReturn
          net_purchase_total = $netPurchase
          sales_total = $sales
          sales_return_total = $salesReturn
          net_sales_total = $netSales
          source_hash = Get-StableHash @(
            $SummaryDate, $analysisTime, $purchase, $purchaseReturn,
            $netPurchase, $sales, $salesReturn, $netSales
          )
        }
        $script:financialCount += 1
        if ($Upload) {
          [void]$script:financialBatch.Add($row)
          if ($script:financialBatch.Count -ge $BatchSize) {
            Send-Batch 'financial_batch' $financialRunId $script:financialBatch
          }
        }
      }
      catch {
        $script:invalidFinancialCount += 1
      }
    }
    if ($Upload) {
      Send-Batch 'financial_batch' $financialRunId $financialBatch
      [void](Invoke-Bridge @{
        action = 'finish'
        connection_id = $ConnectionId.ToString()
        run_id = $financialRunId.ToString()
        received_count = $financialCount + $invalidFinancialCount
        valid_count = $financialCount
        invalid_count = $invalidFinancialCount
      })
    }
  }

  [pscustomobject]@{
    mode = if ($Upload) { 'uploaded' } else { 'dry_run' }
    source_read_only = $true
    inventory_valid = $inventoryCount
    inventory_invalid = $invalidInventoryCount
    financial_valid = $financialCount
    financial_invalid = $invalidFinancialCount
    batch_size = $BatchSize
  } | ConvertTo-Json -Depth 3
}
finally {
  $bridgeSecretPlain = $null
  if ($bridgeSecretPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bridgeSecretPointer)
  }
}
