# ConvertIQ Analytics

Comprehensive React/Vite analytics dashboard for Cloudflare Pages. It profiles, tracks, and visualizes the attached Onvest lead/media metrics, recovered Ontact call-centre records, and Power BI QueryData visual definitions.

## Dashboard Coverage

- Performance measurement layer with KPI benchmarks, weighted source scoring, bottleneck detection, diagnostics, and CSV export.
- Onvest funnel, validation, vendor, media spend, delivery, sales, MTN, Mondo, Naga, and Debt Rescue metrics from the attached JSON snapshot.
- Ontact call-centre records with PII redacted in samples and row tables.
- Power BI QueryData catalog extracted from the attached cURL logs without committing cookies or raw session traces.
- Unified parameter registry, row explorer, daily trends, source composition, vendor matrix, journey funnel, operations breakdown, and Power BI query view.

## Cloudflare Pages

Use these Pages settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `24`

Optional live API environment variables:

- `ONVEST_API_URL`
- `ONVEST_API_USERNAME`
- `ONVEST_API_PASSWORD`
- `ONTACT_API_URL`
- `ONTACT_API_USERNAME`
- `ONTACT_API_PASSWORD`
- `POWERBI_QUERYDATA_URL`
- `POWERBI_RESOURCE_KEY`

If live variables are not configured, the dashboard keeps working from `public/data/attached-snapshot.json`.

## Local Development

```bash
npm install
npm run dev
```

Regenerate the sanitized attached snapshot after replacing the files in `~/Downloads`:

```bash
npm run snapshot
```
