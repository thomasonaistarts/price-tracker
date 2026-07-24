# Scraping Source Rollout

## Current policy

Fiyatlaa prefers correctness over source count. A marketplace is not enabled
just because a scraper exists.

The current flow is:

1. Use a remembered, verified product URL when available.
2. Validate the direct page against product identity.
3. If it fails, search by barcode.
4. If barcode has no result, search with progressively safer title variants.
5. Reject incompatible candidates rather than lowering the threshold.
6. Keep weak candidates for manual review; do not include them in market price.

Requests are sequential and bounded. The catalogue scheduler remains on the
15-day policy, while an explicit per-product button can request a fresh scan.

## Provider roles

### ScraperAPI

Use for controlled HTTP acquisition and supported structured-data endpoints.
Structured endpoints are attractive where the provider explicitly supports the
target marketplace, but a provider-parsed result still has to pass Fiyatlaa's
identity rules.

Official references:

- <https://docs.scraperapi.com/structured-data-endpoints/overview>
- <https://www.scraperapi.com/solutions/structured-data/>

Amazon search is a future candidate, not an enabled Turkish source:

- <https://www.scraperapi.com/solutions/structured-data/amazon-search-scraper/>

Before enabling it, confirm Turkish catalogue/currency behavior and run the
same canary gates below.

### Apify

The current Trendyol actor supports search/product URLs and bounded result
counts. Fiyatlaa keeps enrichment and reviews disabled for price discovery and
deduplicates before accepting candidates.

Actor reference:

- <https://apify.com/fatihtahta/trendyol-scraper>

An actor is replaceable infrastructure, not the source of truth. Actor output
must still pass barcode, identity, price and stock validation.

## Canary gates for every adapter change

Use at most 20 deliberately mixed products:

- valid barcode with expected result,
- barcode with no result but strong title identity,
- ambiguous title,
- bundle/quantity mismatch,
- out-of-stock result,
- known wrong-match trap,
- Turkish characters and model codes.

An adapter can advance only when:

1. no known wrong match is accepted,
2. source URL is on the expected host,
3. parsed prices are positive Turkish-lira values,
4. bundle/quantity conflicts are rejected,
5. timeouts and provider failures are classified,
6. credit consumption stays within the expected budget,
7. retry does not multiply requests uncontrollably.

Rollout order is local test, read-only canary, limited production cohort and
only then scheduled catalogue coverage. Roll back by disabling the adapter;
verified URLs and older accepted analyses remain auditable.
