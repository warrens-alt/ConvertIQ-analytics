# Backend Aggregate Accuracy Patch

## Purpose

The dashboard must not calculate totals from a row-capped preview. Date filters must define the reporting dataset; preview rows must only be used for inspection tables.

## Current risk

In `functions/api/analytics.ts`, source API rows are date-filtered and then sliced before aggregation:

```ts
const rows = filtered.rows.slice(0, maxRows);
analytics: aggregateRows(rows, source, recordLimit)
```

This means dashboard totals can be capped by `maxRows`.

## Required correction

Use the full date-filtered set for aggregation and cap only preview records inside `aggregateRows()`.

```ts
const rows = filtered.rows;
analytics: aggregateRows(rows, source, PREVIEW_RECORD_LIMIT)
```

## Constants

Replace user-facing row controls with internal limits only:

```ts
const UPSTREAM_FETCH_LIMIT = 15000;
const PREVIEW_RECORD_LIMIT = 1000;
```

## Fetch-source response contract

The API response should expose these fields so the frontend can audit accuracy:

```ts
{
  filteredRows: rows.length,
  previewRows: Math.min(rows.length, PREVIEW_RECORD_LIMIT),
  previewLimit: PREVIEW_RECORD_LIMIT,
  upstreamFetchLimit: UPSTREAM_FETCH_LIMIT,
  upstreamTruncated,
  totalsUsePreviewRows: false,
  totalsSource: 'full-date-filtered-api-response',
  filters: {
    ...filter,
    strategy: 'row-level-date-filter-before-full-aggregation'
  },
  analytics: aggregateRows(rows, source, PREVIEW_RECORD_LIMIT)
}
```

## Power BI correction

Power BI rows should also aggregate from the full QueryData result, not a preview slice:

```ts
analytics: aggregateRows(rawRows, 'powerbi', PREVIEW_RECORD_LIMIT)
```

## Frontend status

The frontend has already been changed so row selection is not user-facing and not treated as a reporting filter. The UI now distinguishes filtered rows from preview rows and includes aggregate accuracy QA.

## QA rule

Changing preview row volume must never change:

- revenue
- spend
- leads
- CPL / CPA
- journey totals
- vendor totals
- P&L totals

Only date and business filters should change those values.
