# ConvertIQ Analytics

Professional React/Vite performance analytics dashboard for Cloudflare Pages. It profiles, tracks, and visualizes live Onvest lead/media metrics, live Ontact call-centre records, and Power BI QueryData reference metrics through `/api/analytics`.

## Production Mode

ConvertIQ Analytics is now API-sync only.

- No demo data is bundled.
- No attached snapshot fallback is loaded by the frontend.
- All visible dashboard rows and metrics must come from `/api/analytics`.
- If a source is not configured or fails, the UI shows a production sync/configuration state instead of fallback data.
- PII returned by the API is redacted before display in row explorer samples.

## Dashboard Coverage

- Executive command center for revenue, gross profit, media spend, fetched leads, accepted leads, sales, activations, and production recommendations.
- Journey funnel from media spend through impressions, clicks, landing views, forms, fetched, valid, delivered, accepted, qualified, sales, and activations.
- Source performance scoring across validation, delivery, acceptance, sales, activation, CPL, and CPA accepted.
- Vendor matrix for BLC / OnTact, MTN, Mondo, Naga, and Debt Rescue flows.
- Ontact operations view for call records, talk time, answer rate, RPC rate, agent productivity, and outcome mix.
- Media efficiency view for impressions, clicks, LPVs, forms, CTR, CPC, and CPL.
- Commercial model with editable TP1 fee, OnTact fixed Opex, MTN activation payout, BLC reference payout, Mondo rate card, gross profit, margin, ROI, and break-even TP1 fee.
- Power BI QueryData reference view without embedded-report dependency.
- Metric registry, redacted row explorer, additive-metric audit, and QA checks.

## Cloudflare Pages

Use these Pages settings:

- Build command: `npm run build`
- Build output directory: `dist`
- Node version: `24`

Required / supported live API environment variables:

- `ONVEST_API_URL`
- `ONVEST_API_USERNAME`
- `ONVEST_API_PASSWORD`
- `ONTACT_API_URL`
- `ONTACT_API_USERNAME`
- `ONTACT_API_PASSWORD`
- `POWERBI_QUERYDATA_URL`
- `POWERBI_RESOURCE_KEY`

`POWERBI_QUERYDATA_URL` and `POWERBI_RESOURCE_KEY` have server-side defaults in the Pages Function, but production deployments should explicitly configure them when needed.

## Local Development

```bash
npm install
npm run dev
```

For Cloudflare Pages Function testing, use a Pages-compatible local environment rather than plain Vite only, because `/api/analytics` is served by Cloudflare Pages Functions.
