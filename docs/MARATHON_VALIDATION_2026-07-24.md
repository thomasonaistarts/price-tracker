# Marathon Validation — 2026-07-24

## Automated gates

- `npm test`: 183 passed, 0 failed.
- `npx tsc --noEmit`: passed.
- `npm run build`: passed; all 31 routes/pages compiled.
- PowerShell bridge runtime test: dry-run XML parsing and batching passed.
- No deployment or large catalogue scan was performed.

## In-app browser checks

Tested with the signed-in Efe Kırtasiye user on the local application:

- dashboard loaded 6,455 active products and current analysis metrics,
- product list loaded 6,456 rows with pagination/filter controls,
- an expanded product showed profitability, product identity, separate
  e-commerce price and price-history sections,
- the e-commerce form showed commission, payment, shipping, packaging, target
  margin, safety stock, floor and ceiling without changing any record,
- reports loaded and the Stock Intelligence tab showed its explicit
  “WOLVOX movement sync pending” state,
- account settings loaded,
- a normal user opening `/admin/settings` was redirected to `/dashboard`,
- a fresh browser tab produced no console errors or warnings on product and
  analysis pages.

Unauthenticated local API checks:

- identity update: `401`,
- e-commerce pricing update: `401`,
- WOLVOX price preview: `401`,
- bridge and feed: `503` because their server secrets are intentionally absent
  from the local environment.

## Controlled scrape canary

The canary was dry-run only and wrote zero Supabase rows.

| Metric | Result |
| --- | --- |
| Product | `0 6 Yaş Dönemi Çocuk Eğitiminde 100 Temel Kural` |
| Barcode | `9786050820034` |
| Duration | 148.7 seconds |
| Estimated provider calls | 7 |
| Accepted result | N11, same title, medium confidence, score 0.71 |
| Data writes | 0 |

The N11 result page was then opened in the in-app browser. The product identity
was correct. The price visible in the live page differed from the provider
snapshot (live standard/basket campaign prices versus the canary price). This
is not treated as an identity failure, but it confirms why timestamps, campaign
metadata, repeat sampling and manual review remain necessary. The remaining
four selected products were stopped before execution to avoid multiplying
slow provider requests after the first product had already exercised all five
platforms and three search strategies.

## Real-system gates left intentionally locked

- Apply the additive Supabase migration.
- Configure bridge/feed secrets.
- Compare a date-scoped WOLVOX upload with the WOLVOX UI.
- Verify a supported line-level sales/purchase/return contract.
- Classify store/web channel codes.
- Prove one WOLVOX price XML Post and cent-level read-back.
- Connect the separate e-commerce consumer.

No executable WOLVOX price write or production deployment should be enabled
before those checks.
