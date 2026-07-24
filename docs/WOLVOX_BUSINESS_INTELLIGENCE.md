# WOLVOX Business Intelligence Discovery

## Goal

Extend the existing WOLVOX 26 integration from catalog and inventory import to
read-only business intelligence. The first target reports are:

- daily sales and purchase analysis,
- returns,
- supplier/current-account structure,
- branch and depot attribution,
- latest and weighted purchase cost,
- product sales velocity and stock-cover days.

No WOLVOX write command is part of this discovery phase.

## Official read commands

The WOLVOX 26 SDK documents these relevant read operations:

| Command | Intended use |
| --- | --- |
| `get_faturaanalizi` | Daily, weekly, monthly or yearly invoice analysis |
| `get_carilist` | Customer and supplier master data |
| `get_carihrklist` | Current-account movements |
| `get_carihrkanalizi` | Current-account movement analysis |
| `get_kasahrkanalizi` | Cash movement analysis |
| `get_gunsonuraporu1` | Date-scoped day-end and general report |
| `get_stokenvanter` | Stock inventory with selectable cost calculation |
| `get_depoenvanter` | Depot inventory with selectable cost calculation |

The documented cost calculation types include latest purchase cost (5),
average purchase cost (6), weighted average purchase cost (7), FIFO and LIFO.

The SDK does not document a dedicated `get_faturalist` or
`get_stokhareketlist` read command. Product-line granularity must therefore be
confirmed from real `get_faturaanalizi` and day-end XML responses before a
production schema is finalized.

## Discovery package

Run on the stationery-store computer while WOLVOX Control Panel is open:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\export-business-samples.ps1 -SampleDate "2026-07-22"
```

The script:

1. connects only to the local WOLVOX service,
2. uses only documented read commands,
3. exports daily invoice analysis,
4. exports one date-scoped day-end report,
5. exports inventory using latest purchase cost,
6. writes a hash and row-count manifest,
7. never writes passwords or developer credentials to disk.

Current-account master data is optional because it may contain personal data:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\export-business-samples.ps1 -SampleDate "22.07.2026" -IncludeCurrentAccounts
```

Before sharing an XML report, create a privacy-conscious structural summary:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\wolvox-bridge\summarize-report.ps1 -InputPath "C:\path\report.xml"
```

The summary exposes row counts, field names, non-empty counts and limited
values for approved structural fields. It omits unknown field values.

## Validation gates

Real data is accepted only after all of these checks pass:

1. XML is valid and contains stable record identifiers.
2. One-day sales totals match the WOLVOX UI.
3. Purchase totals match the WOLVOX UI.
4. Returns are distinguishable from sales and purchases.
5. Product, quantity, unit price, VAT, date, depot and branch fields are
   available at the required granularity.
6. Latest-cost and weighted-cost figures match WOLVOX.
7. Re-running the same window does not create duplicate normalized records.

If line-level product data is not available, the integration must remain
aggregate-only until AKINSOFT exposes a supported report. Direct database
queries are not assumed or enabled by this package.

## Normalized model

The additive, RLS-protected model is defined in
`supabase-wolvox-business-intelligence-migration.sql`:

- `integration_sync_runs`: request window, entity, status, counts and errors,
- `wolvox_documents`: sales, purchase and return document headers,
- `wolvox_document_lines`: product, quantity, tax, unit price and cost,
- `wolvox_current_accounts`: supplier/customer business identities,
- `wolvox_inventory_snapshots`: product/depot quantities and cost,
- `wolvox_channel_mappings`: physical store, web and future marketplace codes.

Inventory and daily aggregate records can be synchronized now. Document-line
ingestion stays empty until a supported, stable line-level WOLVOX export is
verified. Raw customer names, phone numbers and addresses are not needed for
Fiyatlaa analytics and must not be transferred to the cloud.

## Channel attribution

Recommended future channel codes:

- `MAGAZA`: physical store,
- `WEB`: owned e-commerce site,
- `TRENDYOL`, `HEPSIBURADA`, `AMAZON`: future marketplace channels.

The owned e-commerce integration should write a stable channel code and
external order id to WOLVOX. Existing WOLVOX `OZEL_KODU` usage must be checked
before assigning it to this purpose.

## First reports after validation

- fastest-depleting products over 7, 30 and 90 days,
- net units sold after returns,
- stock-cover days,
- dead and slow-moving stock,
- sales acceleration,
- latest purchase-cost changes,
- physical-store versus web sales,
- category revenue, contribution and inventory value.
