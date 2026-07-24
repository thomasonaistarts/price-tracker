# Fiyatlaa Marathon Implementation

## Purpose

This iteration keeps Fiyatlaa's compact product workflow while adding the
foundations needed by the stationery store, WOLVOX and the separate e-commerce
application. Store price, e-commerce price and WOLVOX writes are deliberately
separate concerns.

## Delivered architecture

### Product identity

- Barcode remains the strongest automatic identity.
- SKU, normalized title, brand, manufacturer code and product type support
  fallback matching without pretending that a guess is authoritative.
- Manual identity approval is owner-scoped and atomic.
- Approved identity evidence is stored in `product_identity_profiles`.
- Identity edits in Fiyatlaa never silently write to WOLVOX.

### Marketplace discovery

- A previously verified product URL is tried before marketplace search.
- Direct URL reads use a strict marketplace host allowlist.
- A failed direct read falls back to discovery; it does not make stale data
  authoritative.
- Name matching uses identity tokens and rejects incompatible candidates.
- Existing five marketplace adapters keep bounded results and sequential
  execution. No new source is enabled without a controlled canary.

### WOLVOX read model

- Inventory snapshots retain depot, in/out quantities, remaining/available
  stock, unit cost and inventory value.
- Daily financial summaries retain sales, purchases and returns without
  transferring customer personal data.
- Document headers and lines are ready for stable sale, purchase and return
  identifiers when a supported line-level export is confirmed.
- Channel mappings never guess: unresolved sales remain `unknown`.
- Repeated bridge uploads are idempotent through source keys and hashes.
- The store-side PowerShell sync is dry-run by default and only posts when
  `-Upload` is explicitly supplied.

### Store intelligence

The Stock Intelligence report now supports:

- 7/30/90-day depletion and stock-cover calculations,
- dead and slow stock,
- financial totals net of returns,
- latest purchase-cost changes,
- store/web/marketplace/unknown channel totals.

Unknown channels remain visible so an incomplete mapping cannot create a
misleading store-versus-web chart.

### Two price engines

- `our_price` remains the physical-store/Fiyatlaa price.
- E-commerce price has separate commission, payment, shipping, packaging,
  target margin, safety stock, floor and ceiling fields.
- A change over 10% requires explicit extra confirmation in both the API and
  the database RPC.
- E-commerce price updates are atomic and write an applied `price_proposals`
  audit record containing old price, new price and the calculation inputs.
- Neither an e-commerce price update nor a proposal writes to WOLVOX.

### E-commerce feed

`GET /api/feeds/ecommerce` is:

- protected with `ECOMMERCE_FEED_SECRET`,
- scoped to one owner through `ECOMMERCE_OWNER_USER_ID`,
- read-only,
- limited to enabled products with a valid price,
- based on available stock minus safety stock.

The feed exposes product identity, content, price, stock and update timestamps.
The separate Vercel/Supabase store consumes it; it does not share Fiyatlaa's
database credentials.

### WOLVOX price safety

`POST /api/products/:id/wolvox-price-preview` creates a preview only. It returns
the expected old price, requested price, read-back tolerance and rollback price
but cannot queue or execute an SDK write.

Executable WOLVOX pricing stays locked until the exact WOLVOX 26 XML Post
contract has been proven on one product, read back and compared at cent
precision. Bulk write remains out of scope until that gate passes.

### Operations

- Admin platform health includes estimated ScraperAPI credits, Apify runs,
  accepted sources and provider issues for the last 24 hours.
- `SCRAPER_API_DAILY_CREDIT_LIMIT` can expose daily budget usage without
  embedding a provider credential in the browser.
- Bridge, feed and cron secrets are distinct.
- No customer names, phone numbers, addresses or SDK passwords are persisted
  by the bridge.

## Installation order

1. Run `supabase-wolvox-business-intelligence-migration.sql`.
2. Regenerate Supabase types if the project later adopts generated types.
3. Configure the server-only variables from `.env.local.example`.
4. Deploy only after the migration is successful.
5. Run the store bridge without `-Upload` and inspect counts.
6. Upload a small, date-scoped window.
7. Compare report totals with the WOLVOX UI before scheduling a recurring job.

## Required environment variables

| Variable | Purpose |
| --- | --- |
| `WOLVOX_BRIDGE_SECRET` | Authenticates the store-side bridge |
| `ECOMMERCE_FEED_SECRET` | Authenticates the separate store feed consumer |
| `ECOMMERCE_OWNER_USER_ID` | Restricts the feed to Efe Kırtasiye |
| `SCRAPER_API_DAILY_CREDIT_LIMIT` | Optional health-panel budget denominator |

Existing Supabase, ScraperAPI, Apify and cron variables remain required by
their current features.

## Final real-system checkpoints

These are intentionally not automated from a development computer:

1. Verify one-day WOLVOX sales, purchases and returns against the WOLVOX UI.
2. Confirm a supported line-level document export before enabling product-level
   sales velocity from invoices.
3. Classify existing depot/branch/document codes as store, web or marketplace.
4. Prove the WOLVOX 26 price XML Post and read-back on one disposable test
   product before unlocking an executable write path.
5. Connect the separate e-commerce application to the secret feed and verify
   safety-stock behavior.

Until these pass, aggregate reports stay aggregate, unknown channels stay
unknown and WOLVOX price writes stay preview-only.
