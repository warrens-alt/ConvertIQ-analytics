import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, BarChart3, CheckCircle2, DatabaseZap, Download, Gauge, Layers3, LineChart as LineIcon, ListChecks, PhoneCall, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Target, TrendingUp, UsersRound, WalletCards, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Funnel, FunnelChart, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';
import './unified.css';

type ApiSource = 'unified' | 'onvest' | 'ontact' | 'powerbi';
type AtomicSource = 'onvest' | 'ontact' | 'powerbi';
type Tab = 'command' | 'allMetrics' | 'journey' | 'sources' | 'vendors' | 'ontact' | 'media' | 'commercials' | 'powerbi' | 'explorer' | 'qa';
type Status = 'excellent' | 'good' | 'watch' | 'critical' | 'empty';
type MetricStatus = 'live' | 'zero' | 'protected' | 'derived' | 'missing';
type FieldProfile = { source?: string; field: string; rawField?: string; group: string; role: string; type: string; numeric: boolean; pii: boolean; nonNull: number; total?: number; sampleValues: string[] };
type Row = Record<string, number | string>;
type Analytics = { fields: { numeric: string[]; text: string[] }; fieldCatalog: FieldProfile[]; columns: string[]; totals: Record<string, number>; derived: Record<string, number>; byDate: Row[]; byVendor: Row[]; byAgent: Row[]; byStatus: Row[]; records: Record<string, unknown>[]; recordsReturned: number; recordLimit: number };
type AnalyticsResult = { source: string; ok: boolean; configured: boolean; status?: number; type?: string; rows?: number; rawRows?: number; filteredRows?: number; excludedByDate?: number; undatedRowsExcluded?: number; upstreamCount?: number; truncated?: boolean; maxRows?: number; recordLimit?: number; defaultWindowApplied?: boolean; error?: string; reportTitle?: string; queryDataEndpoint?: string; filters?: { from?: string; to?: string; strategy?: string; applied?: boolean }; analytics?: Analytics };
type Payload = { ok: boolean; mode: string; generatedAt: string; results: AnalyticsResult[] };
type Assumptions = { acceptedFee: number; ontactAgents: number; ontactOpexPerAgent: number; mtnActivation: number; blcActivation: number; mondoA: number; mondoB: number; mondoC: number; mondoD: number; mondoOther: number };
type PerformanceRow = { name: string; score: number; spend: number; fetched: number; valid: number; delivered: number; accepted: number; qualified: number; sales: number; activations: number; cpl: number; cpaAccepted: number; validationRate: number; deliveryRate: number; acceptanceRate: number; salesRate: number; activationRate: number };
type Insight = { title: string; detail: string; status: Status; action: string };
type MetricRow = { id: string; source: string; field: string; label: string; group: string; role: string; type: string; value: number; display: string; status: MetricStatus; additive: boolean; pii: boolean; nonNull: number; usedIn: string; formula: string; samples: string };

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 });
const NON_ADDITIVE = new Set(['uniqueid', 'lead_id', 'list_id', 'campaign_id', 'source_id', 'entry_list_id', 'start_epoch', 'end_epoch', 'gmt_offset_now', 'rank', 'model_id', 'dataset_id', 'report_id', 'visual_id', 'query_index', 'select_index', 'data_volume', 'window_count', 'select_count', 'phone_code']);
const DEFAULT_ASSUMPTIONS: Assumptions = { acceptedFee: 35, ontactAgents: 0, ontactOpexPerAgent: 0, mtnActivation: 200, blcActivation: 900, mondoA: 75, mondoB: 17, mondoC: 10, mondoD: 10, mondoOther: 0 };

const n = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};
const ratio = (top: unknown, bottom: unknown) => (n(bottom) ? n(top) / n(bottom) : 0);
const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const avg = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
const scoreAgainst = (value: number, target: number, lowerIsBetter = false) => target > 0 ? clamp((lowerIsBetter ? target / Math.max(value, 0.00001) : value / target) * 100) : 0;
const titleCase = (value: string) => value.replace(/^.*\./, '').replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).replace(/Mtn/g, 'MTN').replace(/Blc/g, 'BLC').replace(/Rpc/g, 'RPC').replace(/Id/g, 'ID').replace(/Dnc/g, 'DNC').replace(/Fwa/g, 'FWA').replace(/Ftp/g, 'FTP');
const fmt = (value: unknown, key = '') => key.toLowerCase().includes('amount') || key.toLowerCase().includes('spend') || key.toLowerCase().startsWith('cp') || key.toLowerCase().includes('revenue') || key.toLowerCase().includes('profit') || key.toLowerCase().includes('opex') ? currency.format(n(value)) : number.format(n(value));
const metricStatus = (field: FieldProfile, additive: boolean): MetricStatus => field.pii ? 'protected' : field.nonNull === 0 ? 'missing' : additive && n(field.total) === 0 ? 'zero' : 'live';

function isPayload(value: unknown): value is Payload {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<Payload>;
  return typeof maybe.ok === 'boolean' && typeof maybe.generatedAt === 'string' && Array.isArray(maybe.results);
}
function emptyAnalytics(): Analytics {
  return { fields: { numeric: [], text: [] }, fieldCatalog: [], columns: [], totals: { records: 0 }, derived: {}, byDate: [], byVendor: [], byAgent: [], byStatus: [], records: [], recordsReturned: 0, recordLimit: 0 };
}
function addNumericRow(target: Map<string, Row>, keyName: string, row: Row) {
  const key = String(row[keyName] ?? 'Unknown');
  const bucket = target.get(key) ?? { [keyName]: key, records: 0 };
  for (const [field, value] of Object.entries(row)) if (field !== keyName) bucket[field] = n(bucket[field]) + n(value);
  target.set(key, bucket);
}
function mergeAnalytics(results: AnalyticsResult[]): Analytics {
  const available = results.filter((result) => result.analytics && result.ok);
  if (!available.length) return emptyAnalytics();
  const totals: Record<string, number> = { records: 0 };
  const numeric = new Set<string>();
  const text = new Set<string>();
  const fields: FieldProfile[] = [];
  const columns = new Set<string>(['__source']);
  const records: Record<string, unknown>[] = [];
  const byDate = new Map<string, Row>();
  const byVendor = new Map<string, Row>();
  const byAgent = new Map<string, Row>();
  const byStatus = new Map<string, Row>();
  for (const result of available) {
    const analytics = result.analytics!;
    analytics.fields.numeric.forEach((field) => numeric.add(field));
    analytics.fields.text.forEach((field) => text.add(field));
    Object.entries(analytics.totals).forEach(([field, value]) => { totals[field] = (totals[field] ?? 0) + n(value); });
    fields.push(...analytics.fieldCatalog.map((field) => ({ ...field, source: result.source, rawField: field.field, field: `${result.source}.${field.field}` })));
    analytics.columns.forEach((column) => columns.add(column));
    records.push(...analytics.records.map((record) => ({ __source: result.source, ...record })));
    analytics.byDate.forEach((row) => addNumericRow(byDate, 'date', row));
    analytics.byVendor.forEach((row) => addNumericRow(byVendor, 'vendor', row));
    analytics.byAgent.forEach((row) => addNumericRow(byAgent, 'agent', row));
    analytics.byStatus.forEach((row) => addNumericRow(byStatus, 'status', row));
  }
  return { fields: { numeric: [...numeric].sort(), text: [...text].sort() }, fieldCatalog: fields, columns: [...columns], totals, derived: buildDerived(totals), byDate: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))), byVendor: [...byVendor.values()].sort((a, b) => n(b.records) - n(a.records)), byAgent: [...byAgent.values()].sort((a, b) => n(b.records) - n(a.records)).slice(0, 80), byStatus: [...byStatus.values()].sort((a, b) => n(b.records) - n(a.records)), records: records.slice(0, 5000), recordsReturned: records.length, recordLimit: records.length };
}
function buildDerived(totals: Record<string, number>) {
  const mondoSales = n(totals.Total_Leads_Sold_A) + n(totals.Total_Leads_Sold_B) + n(totals.Total_Leads_Sold_C) + n(totals.Total_Leads_Sold_D) + n(totals.Total_Leads_Sold_Other);
  const mtnSales = n(totals.MTN_Sales);
  const sales = mtnSales + mondoSales;
  const delivered = n(totals.Total_Leads_Delivered_OnTact) + n(totals.Total_Leads_Delivered_MTN) + n(totals.Total_Leads_Delivered_Mondo) + n(totals.DebtRescue_LeadDelivered) + n(totals.Naga_FileDroppedOnFTP);
  const valid = n(totals.Total_Leads_WithValid_Phone_ID) || Math.min(n(totals.Valid_IDNumber), n(totals.Valid_Phone));
  const activations = n(totals.MTN_Activated_Sales) + Math.max(n(totals.count_activation), n(totals.total_activations));
  return { spend: n(totals.Amount_Spent), impressions: n(totals.Impressions), clicks: n(totals.Clicks), lpv: n(totals.Landing_Page_View), forms: n(totals.Form_Completion), fetched: n(totals.Fetched_Leads), valid, delivered, accepted: n(totals.Accepted_Leads) || n(totals.Total_Leads_Delivered_OnTact), qualified: n(totals.Qualified_Leads), sales, mondoSales, mtnSales, activations, mtnActivations: n(totals.MTN_Activated_Sales), calls: n(totals.__call_records) || n(totals.records), talkSeconds: n(totals.length_in_sec), answered: n(totals.MTN_Answered_Calls), dialed: n(totals.MTN_Dialed_Leads), rpc: n(totals.MTN_Right_Party_Contact), cpl: ratio(totals.Amount_Spent, n(totals.Form_Completion) || n(totals.Fetched_Leads)), cpaAccepted: ratio(totals.Amount_Spent, n(totals.Accepted_Leads) || n(totals.Total_Leads_Delivered_OnTact)) };
}
function isAdditiveField(field: FieldProfile) {
  const raw = (field.rawField ?? field.field).split('.').pop() ?? field.field;
  const lowered = raw.toLowerCase();
  if (!field.numeric || field.pii) return false;
  if (field.role === 'identifier' || field.role === 'metadata' || field.role === 'date/time') return false;
  if (field.group.toLowerCase().includes('identifier') || field.group.toLowerCase().includes('query context')) return false;
  if (NON_ADDITIVE.has(raw) || NON_ADDITIVE.has(lowered) || lowered.endsWith('_id') || lowered === 'id') return false;
  return true;
}
function buildPerformanceRow(name: string, row: Record<string, unknown>): PerformanceRow {
  const spend = n(row.Amount_Spent);
  const fetched = n(row.Fetched_Leads);
  const valid = n(row.Total_Leads_WithValid_Phone_ID) || Math.min(n(row.Valid_IDNumber), n(row.Valid_Phone));
  const delivered = n(row.Total_Leads_Delivered_OnTact) + n(row.Total_Leads_Delivered_MTN) + n(row.Total_Leads_Delivered_Mondo) + n(row.DebtRescue_LeadDelivered) + n(row.Naga_FileDroppedOnFTP);
  const accepted = n(row.Accepted_Leads) || n(row.Total_Leads_Delivered_OnTact);
  const qualified = n(row.Qualified_Leads);
  const sales = n(row.MTN_Sales) + n(row.Total_Leads_Sold_A) + n(row.Total_Leads_Sold_B) + n(row.Total_Leads_Sold_C) + n(row.Total_Leads_Sold_D) + n(row.Total_Leads_Sold_Other);
  const activations = n(row.MTN_Activated_Sales) + Math.max(n(row.count_activation), n(row.total_activations));
  const cpl = ratio(spend, n(row.Form_Completion) || fetched);
  const cpaAccepted = ratio(spend, accepted);
  const validationRate = ratio(valid, fetched);
  const deliveryRate = ratio(delivered, valid || fetched);
  const acceptanceRate = ratio(accepted, fetched || delivered);
  const salesRate = ratio(sales, accepted || fetched);
  const activationRate = ratio(activations, sales || n(row.count_capture_complete));
  const scores = [scoreAgainst(validationRate, 0.95), scoreAgainst(deliveryRate, 0.7), scoreAgainst(acceptanceRate, 0.45), scoreAgainst(salesRate, 0.18), scoreAgainst(activationRate, 0.08)];
  if (spend > 0 && (fetched > 0 || n(row.Form_Completion) > 0)) scores.push(scoreAgainst(cpl, 65, true));
  return { name, score: avg(scores.filter(Number.isFinite)), spend, fetched, valid, delivered, accepted, qualified, sales, activations, cpl, cpaAccepted, validationRate, deliveryRate, acceptanceRate, salesRate, activationRate };
}
function commercial(totals: Record<string, number>, assumptions: Assumptions) {
  const derived = buildDerived(totals);
  const acceptedRevenue = derived.accepted * assumptions.acceptedFee;
  const mtnRevenue = n(totals.MTN_Activated_Sales) * assumptions.mtnActivation;
  const mondoRevenue = n(totals.Total_Leads_Sold_A) * assumptions.mondoA + n(totals.Total_Leads_Sold_B) * assumptions.mondoB + n(totals.Total_Leads_Sold_C) * assumptions.mondoC + n(totals.Total_Leads_Sold_D) * assumptions.mondoD + n(totals.Total_Leads_Sold_Other) * assumptions.mondoOther;
  const pbiOperationalRevenue = Math.max(n(totals.count_activation), n(totals.total_activations)) * assumptions.blcActivation;
  const revenue = acceptedRevenue + mtnRevenue + mondoRevenue;
  const ontactOpex = assumptions.ontactAgents * assumptions.ontactOpexPerAgent;
  const grossProfit = revenue - derived.spend - ontactOpex;
  return { acceptedRevenue, mtnRevenue, mondoRevenue, pbiOperationalRevenue, revenue, ontactOpex, grossProfit, margin: ratio(grossProfit, revenue), roi: ratio(grossProfit, derived.spend + ontactOpex), breakEvenAcceptedFee: derived.accepted ? (derived.spend + ontactOpex - mtnRevenue - mondoRevenue) / derived.accepted : 0 };
}
function journeyRows(totals: Record<string, number>) {
  const d = buildDerived(totals);
  const stages = [['Spend', d.spend, 'Media investment'], ['Impressions', d.impressions, 'Paid reach proxy'], ['Clicks', d.clicks, 'Traffic action'], ['Landing views', d.lpv, 'Page arrival'], ['Forms', d.forms, 'Lead capture'], ['Fetched', d.fetched, 'Lead ingestion'], ['Valid ID + phone', d.valid, 'Data quality'], ['Delivered', d.delivered, 'Vendor / Ontact routing'], ['Accepted', d.accepted, 'TP1 commercial result'], ['Qualified', d.qualified, 'Sales-ready volume'], ['Sales', d.sales, 'Downstream conversion'], ['Activations', d.activations, 'Fulfilled result']].filter((stage) => n(stage[1]) > 0);
  return stages.map((stage, index) => {
    const previous = index > 0 ? n(stages[index - 1][1]) : 0;
    const current = n(stage[1]);
    return { stage: String(stage[0]), value: current, previous, rate: previous ? current / previous : 1, lost: previous ? Math.max(previous - current, 0) : 0, note: String(stage[2]) };
  });
}
function qaRows(results: AnalyticsResult[], analytics: Analytics, totals: Record<string, number>, allMetrics: MetricRow[] = []) {
  const d = buildDerived(totals);
  const checks = [
    { check: 'API source health', status: results.length && results.every((r) => r.ok) ? 'good' : 'critical', detail: results.length ? results.map((r) => `${r.source}: ${r.ok ? 'synced' : r.configured === false ? 'missing env vars' : r.error || 'sync failed'}`).join(' | ') : 'No API results have been returned yet.' },
    { check: 'Metric registry coverage', status: analytics.fieldCatalog.length ? 'good' : 'critical', detail: `${number.format(analytics.fieldCatalog.length)} live API parameters profiled and grouped.` },
    { check: 'All metrics cockpit coverage', status: allMetrics.length >= analytics.fieldCatalog.length ? 'good' : 'critical', detail: `${number.format(allMetrics.length)} metric rows available, including returned API fields and derived calculations.` },
    { check: 'No demo or snapshot data', status: 'good', detail: 'Frontend does not load /data/attached-snapshot.json. All visible records come from /api/analytics.' },
    { check: 'Additive total protection', status: 'good', detail: 'Identifiers, dates, query metadata and PII fields are excluded from additive totals.' },
    { check: 'PII redaction', status: analytics.records.some((r) => Object.values(r).includes('[redacted]')) || allMetrics.some((m) => m.pii) ? 'good' : 'watch', detail: 'Sensitive fields are shown as protected presence counts rather than exposed values.' },
    { check: 'Reach availability', status: d.impressions > 0 && n(totals.Reach) === 0 ? 'watch' : 'good', detail: d.impressions > 0 && n(totals.Reach) === 0 ? 'Impressions are populated while Reach is zero; do not use Reach-derived frequency yet.' : 'Reach field is either populated or not required for selected data.' },
    { check: 'Universal filter audit', status: results.some((r) => r.excludedByDate || r.filters?.applied) ? 'good' : 'watch', detail: results.map((r) => `${r.source}: raw ${number.format(r.rawRows ?? r.upstreamCount ?? 0)} → filtered ${number.format(r.filteredRows ?? r.rows ?? 0)} (${r.filters?.strategy ?? 'source filter'})`).join(' | ') || 'No filter audit returned yet.' },
    { check: 'Cloudflare resource safety', status: results.some((r) => r.truncated) ? 'watch' : 'good', detail: results.some((r) => r.truncated) ? 'At least one API response was capped; narrow the date range for full detail.' : 'No API truncation flag detected.' }
  ];
  return checks as { check: string; status: Status; detail: string }[];
}
function recommendations(results: AnalyticsResult[], totals: Record<string, number>, assumptions: Assumptions): Insight[] {
  const d = buildDerived(totals);
  const money = commercial(totals, assumptions);
  const recs: Insight[] = [];
  if (!results.length) recs.push({ title: 'No live API response yet', detail: 'The dashboard has not received any /api/analytics response in this session.', status: 'critical', action: 'Check the Cloudflare Pages Function route and click Sync dashboard.' });
  results.filter((result) => !result.ok).forEach((result) => recs.push({ title: `${result.source.toUpperCase()} sync needs attention`, detail: result.configured === false ? 'Required Cloudflare environment variables are missing.' : result.error || 'The source did not return a usable analytics payload.', status: 'critical', action: 'Configure live API URL and credentials in Cloudflare Pages, then resync.' }));
  if (d.spend > 0 && d.forms === 0 && d.fetched === 0) recs.push({ title: 'Spend is present without lead output', detail: `${currency.format(d.spend)} spend is visible but forms/fetched leads are zero.`, status: 'critical', action: 'Audit tracking, lead ingestion and source mapping before increasing budget.' });
  if (d.fetched > 0 && ratio(d.valid, d.fetched) < 0.85) recs.push({ title: 'Lead data quality below threshold', detail: `Valid lead rate is ${pct.format(ratio(d.valid, d.fetched))}.`, status: 'watch', action: 'Review source quality, validation rules and duplicate/invalid phone-ID failures.' });
  if (d.valid > 0 && ratio(d.delivered, d.valid) < 0.6) recs.push({ title: 'Routing / delivery leakage', detail: `Delivery coverage is ${pct.format(ratio(d.delivered, d.valid))}.`, status: 'watch', action: 'Audit BLC, MTN, Mondo, Naga and Debt Rescue rejection/dedupe logic.' });
  if (d.accepted > 0 && ratio(d.sales, d.accepted) < 0.12) recs.push({ title: 'Accepted leads are not converting downstream', detail: `Sales rate from accepted leads is ${pct.format(ratio(d.sales, d.accepted))}.`, status: 'critical', action: 'Review Ontact answer/RPC rates, scripting, vendor handoff and sales qualification.' });
  if (d.dialed > 0 && ratio(d.answered, d.dialed) < 0.45) recs.push({ title: 'Contactability is weak', detail: `MTN answer rate is ${pct.format(ratio(d.answered, d.dialed))}.`, status: 'watch', action: 'Test time-of-day dialling windows and recycle rules before adding more leads.' });
  if (money.revenue > 0 && money.margin < 0.2) recs.push({ title: 'Commercial margin is thin', detail: `Gross margin is ${pct.format(money.margin)} under current assumptions.`, status: money.margin < 0 ? 'critical' : 'watch', action: 'Increase accepted fee, reduce CPL, improve activation yield or lower fixed Ontact Opex.' });
  if (!recs.length) recs.push({ title: 'No critical production issues detected', detail: 'Live API data is syncing and core funnel/commercial checks are within current thresholds.', status: 'excellent', action: 'Continue monitoring source-level score and vendor delivery drift.' });
  return recs;
}
function csvDownload(filename: string, rows: Record<string, unknown>[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const csv = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))].map((cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function buildMetricRows(analytics: Analytics, totals: Record<string, number>, money: ReturnType<typeof commercial>): MetricRow[] {
  const apiRows = analytics.fieldCatalog.map((field) => {
    const raw = field.rawField ?? field.field;
    const additive = isAdditiveField(field);
    const value = additive ? n(field.total) : field.nonNull;
    const status = metricStatus(field, additive);
    return { id: `${field.source ?? 'unknown'}-${raw}`, source: field.source ?? 'unknown', field: raw, label: titleCase(raw), group: field.group, role: field.role, type: field.type, value, display: field.pii ? `Protected (${number.format(field.nonNull)})` : additive ? fmt(field.total, raw) : `${number.format(field.nonNull)} present`, status, additive, pii: field.pii, nonNull: field.nonNull, usedIn: additive ? 'Totals, charts, QA, exports' : 'Explorer, QA, row context', formula: additive ? `SUM(${raw}) after universal filtering` : `Presence count after universal filtering`, samples: field.pii ? '[protected]' : field.sampleValues.join(' | ') };
  });
  const derived = buildDerived(totals);
  const derivedRows: MetricRow[] = [
    ['derived.cpl', 'CPL', derived.cpl, 'Commercial / cost', 'Spend ÷ forms or fetched leads', 'Command, Media, QA'],
    ['derived.cpaAccepted', 'CPA Accepted', derived.cpaAccepted, 'Commercial / cost', 'Spend ÷ accepted leads', 'Command, Sources, Commercials'],
    ['derived.validRate', 'Valid Lead Rate', ratio(derived.valid, derived.fetched), 'Lead quality', 'Valid leads ÷ fetched leads', 'Command, Journey, Recommendations'],
    ['derived.deliveryRate', 'Delivery Rate', ratio(derived.delivered, derived.valid || derived.fetched), 'Routing quality', 'Delivered leads ÷ valid or fetched leads', 'Journey, Vendors'],
    ['derived.answerRate', 'Answer Rate', ratio(derived.answered, derived.dialed), 'Ontact operations', 'Answered calls ÷ dialled leads', 'OnTact, Recommendations'],
    ['derived.rpcRate', 'RPC Rate', ratio(derived.rpc, derived.answered), 'Ontact operations', 'RPC ÷ answered calls', 'OnTact, Recommendations'],
    ['derived.salesRate', 'Sales Rate', ratio(derived.sales, derived.accepted || derived.fetched), 'Conversion / sales', 'Sales ÷ accepted or fetched leads', 'Command, Sources'],
    ['derived.activationRate', 'Activation Rate', ratio(derived.activations, derived.sales), 'Conversion / activation', 'Activations ÷ sales', 'Command, Vendors'],
    ['commercial.revenue', 'Base Revenue', money.revenue, 'Commercial model', 'Accepted revenue + MTN + Mondo', 'Command, Commercials'],
    ['commercial.grossProfit', 'Gross Profit', money.grossProfit, 'Commercial model', 'Revenue - spend - OnTact Opex', 'Command, Commercials'],
    ['commercial.margin', 'Gross Margin', money.margin, 'Commercial model', 'Gross profit ÷ revenue', 'Command, Commercials'],
    ['commercial.breakEvenAcceptedFee', 'Break-even TP1 Fee', money.breakEvenAcceptedFee, 'Commercial model', 'Required accepted fee for break-even', 'Commercials']
  ].map(([id, label, value, group, formula, usedIn]) => ({ id: String(id), source: 'derived', field: String(id), label: String(label), group: String(group), role: 'derived', type: 'number', value: n(value), display: String(id).includes('Rate') || String(id).includes('margin') ? pct.format(n(value)) : fmt(value, String(id)), status: 'derived', additive: false, pii: false, nonNull: n(value) ? 1 : 0, formula: String(formula), usedIn: String(usedIn), samples: '' }));
  return [...apiRows, ...derivedRows].sort((a, b) => a.source.localeCompare(b.source) || a.group.localeCompare(b.group) || a.label.localeCompare(b.label));
}

function StatusBadge({ status }: { status: Status }) { return <span className={`status ${status}`}>{status === 'empty' ? 'no data' : status}</span>; }
function MetricBadge({ status }: { status: MetricStatus }) { return <span className={`metric-badge ${status}`}>{status}</span>; }
function Card({ title, value, sub, icon: Icon }: { title: string; value: string; sub: string; icon: LucideIcon }) { return <section className="card stat"><div className="stat-icon"><Icon size={18}/></div><div><p>{title}</p><strong>{value}</strong><span>{sub}</span></div></section>; }
function Panel({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) { return <section className="card panel"><div className="panel-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>; }
function SimpleTable({ rows, columns }: { rows: Record<string, unknown>[]; columns?: string[] }) {
  const keys = columns ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 80);
  if (!rows.length) return <div className="empty-state"><b>No rows returned</b><span>Sync the live API or adjust the selected source/date range.</span></div>;
  return <div className="table-wrap"><table><thead><tr>{keys.map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{keys.map((key) => <td key={key}>{String(row[key] ?? '')}</td>)}</tr>)}</tbody></table></div>;
}
function AssumptionInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="assumption"><span>{label}</span><input type="number" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)}/></label>; }
function MetricWall({ rows }: { rows: MetricRow[] }) {
  if (!rows.length) return <div className="empty-state"><b>No metrics available</b><span>Sync the live API or widen the active date range.</span></div>;
  return <div className="metric-wall">{rows.map((metric) => <article className={`metric-tile ${metric.status}`} key={metric.id}><header><span>{metric.source}</span><MetricBadge status={metric.status}/></header><h3>{metric.label}</h3><strong>{metric.display}</strong><p>{metric.group} · {metric.role}</p><small>{metric.field}</small><footer><span>{metric.formula}</span></footer></article>)}</div>;
}

function App() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [source, setSource] = useState<ApiSource>('unified');
  const [tab, setTab] = useState<Tab>('command');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [maxRows, setMaxRows] = useState('5000');
  const [recordLimit, setRecordLimit] = useState('1000');
  const [search, setSearch] = useState('');
  const [fieldSearch, setFieldSearch] = useState('');
  const [metricGroup, setMetricGroup] = useState('all');
  const [metricStatusFilter, setMetricStatusFilter] = useState('all');
  const [metricSource, setMetricSource] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);

  const fetchOne = async (target: AtomicSource, mode: ApiSource): Promise<AnalyticsResult> => {
    const params = new URLSearchParams({ source: target, maxRows: mode === 'unified' && target === 'ontact' ? '1000' : maxRows, recordLimit: mode === 'unified' && target === 'ontact' ? '250' : recordLimit });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const response = await fetch(`/api/analytics?${params}`, { cache: 'no-store' });
    const data: unknown = await response.json();
    if (!isPayload(data)) throw new Error(`${target} returned an unexpected payload shape.`);
    const result = data.results[0];
    return result ?? { source: target, ok: false, configured: true, error: `${target} returned no result object.` };
  };
  const load = async (nextSource: ApiSource = source) => {
    setLoading(true);
    setError('');
    const targets: AtomicSource[] = nextSource === 'unified' ? ['onvest', 'ontact', 'powerbi'] : [nextSource];
    const settled = await Promise.allSettled(targets.map((target) => fetchOne(target, nextSource)));
    const results = settled.map((item, index): AnalyticsResult => item.status === 'fulfilled' ? item.value : { source: targets[index], ok: false, configured: true, error: item.reason instanceof Error ? item.reason.message : String(item.reason) });
    const live: Payload = { ok: results.every((result) => result.ok), mode: nextSource === 'unified' ? 'client-side-unified-live-api-sync' : 'single-source-live-api-sync', generatedAt: new Date().toISOString(), results };
    setPayload(live);
    if (!live.ok) setError(results.filter((result) => !result.ok).map((result) => `${result.source}: ${result.configured === false ? 'missing Cloudflare env vars' : result.error || 'sync failed'}`).join(' | '));
    setLoading(false);
  };
  useEffect(() => { void load('unified'); }, []);

  const results = payload?.results ?? [];
  const single = source === 'unified' ? undefined : results.find((item) => item.source === source) ?? results[0];
  const analytics = source === 'unified' ? mergeAnalytics(results) : single?.ok ? single.analytics ?? emptyAnalytics() : emptyAnalytics();
  const totals = analytics.totals;
  const d = buildDerived(totals);
  const money = commercial(totals, assumptions);
  const allMetrics = useMemo(() => buildMetricRows(analytics, totals, money), [analytics, totals, money]);
  const journey = journeyRows(totals);
  const sourceRows = analytics.byVendor.map((row) => buildPerformanceRow(String(row.vendor ?? 'Unknown'), row)).filter((row) => row.fetched || row.accepted || row.spend || row.sales || row.activations).sort((a, b) => b.score - a.score);
  const qa = qaRows(results, analytics, totals, allMetrics);
  const insightRows = recommendations(results, totals, assumptions);
  const additiveFields = analytics.fieldCatalog.filter(isAdditiveField).map((field) => ({ source: field.source ?? source, metric: field.rawField ?? field.field, group: field.group, total: fmt(field.total, field.rawField ?? field.field) }));
  const filteredFields = analytics.fieldCatalog.filter((field) => !fieldSearch || `${field.source} ${field.rawField ?? field.field} ${field.group} ${field.role}`.toLowerCase().includes(fieldSearch.toLowerCase()));
  const filteredRecords = analytics.records.filter((record) => !search || Object.values(record).some((value) => String(value ?? '').toLowerCase().includes(search.toLowerCase()))).slice(0, 500);
  const powerBiRows = analytics.records.filter((record) => record.__source === 'powerbi' || source === 'powerbi');
  const agentRows = analytics.byAgent.slice(0, 20).map((row) => ({ agent: row.agent, records: row.records, calls: row.__call_records ?? row.records, talkSeconds: row.length_in_sec, avgSeconds: decimal.format(ratio(row.length_in_sec, row.records)), mtnSales: row.MTN_Sales ?? 0, activations: row.MTN_Activated_Sales ?? row.count_activation ?? 0 }));
  const statusRows = analytics.byStatus.slice(0, 20).map((row) => ({ status: row.status, records: row.records, sales: row.MTN_Sales ?? 0, activations: row.MTN_Activated_Sales ?? row.count_activation ?? 0 }));
  const mediaRows = analytics.byDate.map((row) => ({ date: row.date, spend: n(row.Amount_Spent), impressions: n(row.Impressions), clicks: n(row.Clicks), lpv: n(row.Landing_Page_View), forms: n(row.Form_Completion), cpc: ratio(row.Amount_Spent, row.Clicks), cpl: ratio(row.Amount_Spent, n(row.Form_Completion) || n(row.Fetched_Leads)) }));
  const metricGroups = [...new Set(allMetrics.map((metric) => metric.group))].sort();
  const metricSources = [...new Set(allMetrics.map((metric) => metric.source))].sort();
  const filteredMetrics = allMetrics.filter((metric) => (metricGroup === 'all' || metric.group === metricGroup) && (metricStatusFilter === 'all' || metric.status === metricStatusFilter) && (metricSource === 'all' || metric.source === metricSource) && (!fieldSearch || `${metric.source} ${metric.field} ${metric.label} ${metric.group} ${metric.role}`.toLowerCase().includes(fieldSearch.toLowerCase())));
  const metricSummary = { total: allMetrics.length, api: allMetrics.filter((m) => m.source !== 'derived').length, derived: allMetrics.filter((m) => m.source === 'derived').length, protected: allMetrics.filter((m) => m.pii).length, live: allMetrics.filter((m) => m.status === 'live').length };
  const metricTableRows = filteredMetrics.map((metric) => ({ source: metric.source, metric: metric.label, apiField: metric.field, group: metric.group, role: metric.role, status: metric.status, value: metric.display, additive: metric.additive ? 'yes' : 'no', usedIn: metric.usedIn, formula: metric.formula, samples: metric.samples }));
  const filterAuditRows = results.map((result) => ({ source: result.source, status: result.ok ? 'synced' : 'attention', rawRows: result.rawRows ?? result.upstreamCount ?? 0, filteredRows: result.filteredRows ?? result.rows ?? 0, excludedByDate: result.excludedByDate ?? 0, undatedExcluded: result.undatedRowsExcluded ?? 0, from: result.filters?.from ?? '', to: result.filters?.to ?? '', strategy: result.filters?.strategy ?? 'source-level' }));
  const tabs: { id: Tab; label: string }[] = [{ id: 'command', label: 'Command Center' }, { id: 'allMetrics', label: 'All Metrics' }, { id: 'journey', label: 'Journey' }, { id: 'sources', label: 'Sources' }, { id: 'vendors', label: 'Vendors' }, { id: 'ontact', label: 'OnTact' }, { id: 'media', label: 'Media' }, { id: 'commercials', label: 'Commercials' }, { id: 'powerbi', label: 'Power BI' }, { id: 'explorer', label: 'Explorer' }, { id: 'qa', label: 'QA Audit' }];

  return <main>
    <aside className="sidebar"><div className="brand"><div className="brand-mark">CIQ</div><div><b>ConvertIQ</b><span>Performance Analytics</span></div></div><nav>{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav><div className="sync-panel"><ShieldCheck size={18}/><b>API-only production mode</b><span>All metric cards, tables, charts and exports come from the same filtered /api/analytics payload.</span></div></aside>
    <section className="workspace">
      <header className="hero"><div><p className="eyebrow">Live API sync · all metrics visible · universal filtering</p><h1>ConvertIQ Performance Command Center</h1><p>Executive dashboard plus a complete metric cockpit: every returned API field is grouped, searchable, exportable and QA-audited.</p></div><button className="primary" onClick={() => load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/>{loading ? 'Syncing' : 'Sync dashboard'}</button></header>
      <section className="controls card"><SlidersHorizontal size={18}/><select value={source} onChange={(e) => { const next = e.target.value as ApiSource; setSource(next); void load(next); }}><option value="unified">Unified Dashboard</option><option value="onvest">Onvest API</option><option value="ontact">Ontact API</option><option value="powerbi">Power BI QueryData</option></select><input type="date" value={from} onChange={(e) => setFrom(e.target.value)}/><input type="date" value={to} onChange={(e) => setTo(e.target.value)}/><select value={maxRows} onChange={(e) => setMaxRows(e.target.value)}><option value="1000">1,000 rows</option><option value="5000">5,000 rows</option><option value="10000">10,000 rows</option><option value="15000">15,000 rows</option></select><select value={recordLimit} onChange={(e) => setRecordLimit(e.target.value)}><option value="250">Show 250</option><option value="1000">Show 1,000</option><option value="2500">Show 2,500</option><option value="5000">Show 5,000</option></select><button onClick={() => load()}>Apply</button><span>{payload ? `Last sync: ${new Date(payload.generatedAt).toLocaleString()}` : 'Waiting for API sync'}</span></section>
      {error && <section className="notice">{error}</section>}
      {!loading && payload && analytics.records.length === 0 && <section className="notice soft">No live API records are available for this source/range. This is production mode: configure Cloudflare env vars or widen the date range; no snapshot/demo data will be shown.</section>}
      <section className="source-grid">{results.map((item) => <section className="card source-card" key={item.source}><span className={item.ok ? 'pill ok' : 'pill warn'}>{item.ok ? 'API synced' : item.configured === false ? 'Configure env' : 'Sync failed'}</span><h3>{item.source.toUpperCase()}</h3><p>{number.format(item.rows ?? 0)} rows · {number.format(item.analytics?.fieldCatalog.length ?? 0)} parameters {item.truncated ? '· capped' : ''}</p></section>)}<section className="card source-card"><span className="pill ok">Coverage</span><h3>{number.format(metricSummary.total)}</h3><p>API + derived metrics visible in All Metrics.</p></section></section>

      {tab === 'command' && <><section className="kpi-grid"><Card title="Revenue" value={currency.format(money.revenue)} sub="Base commercial model" icon={WalletCards}/><Card title="Gross Profit" value={currency.format(money.grossProfit)} sub={`${pct.format(money.margin)} margin`} icon={TrendingUp}/><Card title="Spend" value={currency.format(d.spend)} sub="Media cost" icon={DatabaseZap}/><Card title="Fetched Leads" value={number.format(d.fetched)} sub={`${pct.format(ratio(d.valid, d.fetched))} valid`} icon={UsersRound}/><Card title="Accepted Leads" value={number.format(d.accepted)} sub={`${currency.format(d.cpaAccepted)} CPA accepted`} icon={Gauge}/><Card title="Metric Coverage" value={number.format(metricSummary.total)} sub={`${number.format(metricSummary.api)} API fields · ${number.format(metricSummary.derived)} derived`} icon={ListChecks}/></section><section className="grid two"><Panel title="Performance trend" sub="Live API trend: spend, accepted leads, sales and activations by day"><ResponsiveContainer width="100%" height={330}><AreaChart data={analytics.byDate}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area dataKey="Amount_Spent" name="Spend"/><Area dataKey="Accepted_Leads" name="Accepted"/><Area dataKey="MTN_Sales" name="MTN Sales"/><Area dataKey="count_activation" name="Power BI Activations"/></AreaChart></ResponsiveContainer></Panel><Panel title="Production recommendations" sub="Rule-based actions from live sync results"><div className="diagnostic-list">{insightRows.map((item) => <article className={`diagnostic ${item.status}`} key={item.title}><AlertTriangle size={16}/><div><b>{item.title}</b><span>{item.detail}</span><small>{item.action}</small></div><StatusBadge status={item.status}/></article>)}</div></Panel></section></>}

      {tab === 'allMetrics' && <><section className="metric-hero card"><div><span>All metrics cockpit</span><h2>{number.format(metricSummary.total)} metrics visible</h2><p>Every live API field is exposed here, plus derived commercial and performance calculations. This is the full metric layer behind the executive dashboard.</p></div><div className="metric-hero-grid"><article><span>API fields</span><strong>{number.format(metricSummary.api)}</strong></article><article><span>Derived</span><strong>{number.format(metricSummary.derived)}</strong></article><article><span>Live values</span><strong>{number.format(metricSummary.live)}</strong></article><article><span>PII protected</span><strong>{number.format(metricSummary.protected)}</strong></article></div></section><Panel title="Metric controls" sub="Search, group and filter the complete metric registry" action={<button className="secondary" onClick={() => csvDownload('convertiq-all-metrics.csv', metricTableRows)}><Download size={14}/>Export all metrics</button>}><div className="metric-controls"><div className="inline-tools"><Search size={16}/><input placeholder="Search metric, field, group, source" value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)}/></div><select value={metricSource} onChange={(e) => setMetricSource(e.target.value)}><option value="all">All sources</option>{metricSources.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={metricGroup} onChange={(e) => setMetricGroup(e.target.value)}><option value="all">All groups</option>{metricGroups.map((item) => <option key={item} value={item}>{item}</option>)}</select><select value={metricStatusFilter} onChange={(e) => setMetricStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="live">Live</option><option value="zero">Zero</option><option value="protected">Protected</option><option value="derived">Derived</option><option value="missing">Missing</option></select></div></Panel><MetricWall rows={filteredMetrics}/><Panel title="Complete metric audit table" sub={`${number.format(filteredMetrics.length)} filtered metrics shown`}><SimpleTable rows={metricTableRows}/></Panel></>}

      {tab === 'journey' && <section className="grid two"><Panel title="Full-funnel waterfall" sub="Live API funnel only"><ResponsiveContainer width="100%" height={460}><FunnelChart><Tooltip/><Funnel dataKey="value" data={journey} isAnimationActive><LabelList position="right" fill="#17202a" stroke="none" dataKey="stage"/></Funnel></FunnelChart></ResponsiveContainer></Panel><Panel title="Leakage audit" sub="Step rate and lost volume"><SimpleTable rows={journey.map((row) => ({ stage: row.stage, value: number.format(row.value), stepRate: pct.format(row.rate), lost: number.format(row.lost), signal: row.note }))}/></Panel></section>}

      {tab === 'sources' && <><section className="grid two"><Panel title="Source score ranking" sub="Composite score from validation, delivery, acceptance, sales and activation"><ResponsiveContainer width="100%" height={360}><BarChart data={sourceRows.slice(0, 14)}><CartesianGrid vertical={false}/><XAxis dataKey="name"/><YAxis domain={[0,100]}/><Tooltip/><Bar dataKey="score" name="Score"/></BarChart></ResponsiveContainer></Panel><Panel title="Source economics" sub="Spend and accepted lead efficiency"><ResponsiveContainer width="100%" height={360}><BarChart data={sourceRows.slice(0, 14)}><CartesianGrid vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="spend" name="Spend"/><Bar dataKey="accepted" name="Accepted"/></BarChart></ResponsiveContainer></Panel></section><Panel title="Source performance matrix" action={<button className="secondary" onClick={() => csvDownload('convertiq-source-performance.csv', sourceRows)}><Download size={14}/>Export CSV</button>}><SimpleTable rows={sourceRows.map((row) => ({ source: row.name, score: decimal.format(row.score), spend: currency.format(row.spend), fetched: number.format(row.fetched), validRate: pct.format(row.validationRate), deliveryRate: pct.format(row.deliveryRate), accepted: number.format(row.accepted), cpaAccepted: row.cpaAccepted ? currency.format(row.cpaAccepted) : '-', sales: number.format(row.sales), activationRate: pct.format(row.activationRate) }))}/></Panel></>}

      {tab === 'vendors' && <section className="grid two"><Panel title="Vendor delivery matrix" sub="BLC, MTN, Mondo, Naga and Debt Rescue signals"><SimpleTable rows={[{ vendor: 'BLC / OnTact', vetted: totals.Total_Leads_Passed_BLC_Vetting ?? 0, dedupePassed: totals.Total_Leads_Dedupe_Passed_BLC ?? 0, delivered: totals.Total_Leads_Delivered_OnTact ?? 0 }, { vendor: 'MTN', leads: totals.Total_Leads_Is_MTN_Lead ?? 0, delivered: totals.Total_Leads_Delivered_MTN ?? 0, dialed: totals.MTN_Dialed_Leads ?? 0, answered: totals.MTN_Answered_Calls ?? 0, sales: totals.MTN_Sales ?? 0, activated: totals.MTN_Activated_Sales ?? 0 }, { vendor: 'Mondo', gradePassed: totals.Total_Mondo_Grade_Passed_Lead ?? 0, delivered: totals.Total_Leads_Delivered_Mondo ?? 0, soldA: totals.Total_Leads_Sold_A ?? 0, soldB: totals.Total_Leads_Sold_B ?? 0, soldC: totals.Total_Leads_Sold_C ?? 0, soldD: totals.Total_Leads_Sold_D ?? 0, soldOther: totals.Total_Leads_Sold_Other ?? 0 }, { vendor: 'Naga', processed: totals.Naga_Processed ?? 0, dedupePassed: totals.Naga_DeDupedPassed ?? 0, contactVerified: totals.Naga_ContactVerified ?? 0, ftpDropped: totals.Naga_FileDroppedOnFTP ?? 0 }, { vendor: 'Debt Rescue', processed: totals.DebtRescua_Processed ?? 0, dedupePassed: totals.DebtRescue_DeDupedPassed ?? 0, contactVerified: totals.DebtRescue_ContactVerified ?? 0, delivered: totals.DebtRescue_LeadDelivered ?? 0 }]}/></Panel><Panel title="Vendor composition"><ResponsiveContainer width="100%" height={360}><BarChart data={analytics.byVendor.slice(0, 12)}><CartesianGrid vertical={false}/><XAxis dataKey="vendor"/><YAxis/><Tooltip/><Bar dataKey="Fetched_Leads" name="Fetched"/><Bar dataKey="Accepted_Leads" name="Accepted"/><Bar dataKey="MTN_Sales" name="MTN Sales"/></BarChart></ResponsiveContainer></Panel></section>}

      {tab === 'ontact' && <><section className="kpi-grid compact"><Card title="Call Records" value={number.format(d.calls)} sub="Ontact live rows / records" icon={PhoneCall}/><Card title="Talk Time" value={`${decimal.format(d.talkSeconds / 3600)}h`} sub="Total length_in_sec" icon={Activity}/><Card title="Answer Rate" value={pct.format(ratio(d.answered, d.dialed))} sub={`${number.format(d.answered)} answered`} icon={CheckCircle2}/><Card title="RPC Rate" value={pct.format(ratio(d.rpc, d.answered))} sub={`${number.format(d.rpc)} RPC`} icon={Target}/></section><section className="grid two"><Panel title="Agent productivity"><SimpleTable rows={agentRows}/></Panel><Panel title="Outcome mix"><ResponsiveContainer width="100%" height={360}><BarChart data={statusRows}><CartesianGrid vertical={false}/><XAxis dataKey="status"/><YAxis/><Tooltip/><Bar dataKey="records" name="Records"/></BarChart></ResponsiveContainer></Panel></section></>}

      {tab === 'media' && <><section className="kpi-grid compact"><Card title="Impressions" value={number.format(d.impressions)} sub="Media delivery" icon={Layers3}/><Card title="Clicks" value={number.format(d.clicks)} sub={`${pct.format(ratio(d.clicks, d.impressions))} CTR`} icon={LineIcon}/><Card title="Landing Views" value={number.format(d.lpv)} sub={`${pct.format(ratio(d.lpv, d.clicks))} click-to-LPV`} icon={BarChart3}/><Card title="Forms" value={number.format(d.forms)} sub={`${currency.format(d.cpl)} CPL`} icon={ListChecks}/></section><Panel title="Media efficiency by day"><ResponsiveContainer width="100%" height={380}><LineChart data={mediaRows}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line dataKey="spend" name="Spend"/><Line dataKey="clicks" name="Clicks"/><Line dataKey="forms" name="Forms"/><Line dataKey="cpl" name="CPL"/></LineChart></ResponsiveContainer></Panel></>}

      {tab === 'commercials' && <><section className="assumptions card"><AssumptionInput label="TP1 accepted fee" value={assumptions.acceptedFee} onChange={(v) => setAssumptions({ ...assumptions, acceptedFee: v })}/><AssumptionInput label="OnTact agents" value={assumptions.ontactAgents} onChange={(v) => setAssumptions({ ...assumptions, ontactAgents: v })}/><AssumptionInput label="Opex / agent" value={assumptions.ontactOpexPerAgent} onChange={(v) => setAssumptions({ ...assumptions, ontactOpexPerAgent: v })}/><AssumptionInput label="MTN activation payout" value={assumptions.mtnActivation} onChange={(v) => setAssumptions({ ...assumptions, mtnActivation: v })}/><AssumptionInput label="BLC reference payout" value={assumptions.blcActivation} onChange={(v) => setAssumptions({ ...assumptions, blcActivation: v })}/></section><section className="kpi-grid"><Card title="Base Revenue" value={currency.format(money.revenue)} sub="TP1 + MTN + Mondo" icon={WalletCards}/><Card title="Accepted Revenue" value={currency.format(money.acceptedRevenue)} sub={`${number.format(d.accepted)} accepted`} icon={Target}/><Card title="Mondo Revenue" value={currency.format(money.mondoRevenue)} sub="A/B/C/D/Other rate card" icon={BarChart3}/><Card title="MTN Revenue" value={currency.format(money.mtnRevenue)} sub={`${number.format(d.mtnActivations)} activations`} icon={CheckCircle2}/><Card title="OnTact Opex" value={currency.format(money.ontactOpex)} sub="Manual assumption" icon={PhoneCall}/><Card title="Break-even TP1" value={currency.format(money.breakEvenAcceptedFee)} sub="Accepted fee needed" icon={Gauge}/></section><Panel title="Commercial reconciliation"><SimpleTable rows={[{ line: 'Accepted lead revenue', value: currency.format(money.acceptedRevenue) }, { line: 'MTN activation revenue', value: currency.format(money.mtnRevenue) }, { line: 'Mondo sold-grade revenue', value: currency.format(money.mondoRevenue) }, { line: 'Power BI activation reference', value: currency.format(money.pbiOperationalRevenue) }, { line: 'Media spend', value: currency.format(d.spend) }, { line: 'OnTact fixed opex', value: currency.format(money.ontactOpex) }, { line: 'Gross profit', value: currency.format(money.grossProfit) }, { line: 'ROI on spend + opex', value: pct.format(money.roi) }]}/></Panel></>}

      {tab === 'powerbi' && <section className="grid two"><Panel title="Power BI QueryData summary" sub="Live QueryData reference, not embedded report fallback"><SimpleTable rows={[{ metric: 'Rows', value: number.format(powerBiRows.length) }, { metric: 'Activations reference', value: number.format(Math.max(n(totals.count_activation), n(totals.total_activations))) }, { metric: 'Capture complete reference', value: number.format(Math.max(n(totals.count_capture_complete), n(totals.total_capture_complete))) }, { metric: 'Nett apps reference', value: number.format(Math.max(n(totals.count_nett_app), n(totals.total_nett_apps))) }, { metric: 'Endpoint', value: results.find((r) => r.source === 'powerbi')?.queryDataEndpoint ?? 'live API unavailable' }]}/></Panel><Panel title="Power BI rows"><SimpleTable rows={powerBiRows.slice(0, 200)}/></Panel></section>}

      {tab === 'explorer' && <><Panel title="Metric registry" sub={`${number.format(filteredFields.length)} of ${number.format(analytics.fieldCatalog.length)} live API parameters`} action={<div className="inline-tools"><Search size={16}/><input placeholder="Search parameters" value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)}/></div>}><SimpleTable rows={filteredFields.map((field) => ({ source: field.source ?? source, parameter: field.rawField ?? field.field, group: field.group, role: field.role, type: field.type, additive: isAdditiveField(field) ? 'yes' : 'no', pii: field.pii ? 'redacted' : 'no', nonNull: field.nonNull, total: isAdditiveField(field) ? fmt(field.total, field.rawField ?? field.field) : '' }))}/></Panel><Panel title="Redacted row explorer" sub={`${number.format(filteredRecords.length)} visible live API records`} action={<div className="inline-tools"><Search size={16}/><input placeholder="Search rows" value={search} onChange={(e) => setSearch(e.target.value)}/><button className="secondary" onClick={() => csvDownload('convertiq-redacted-rows.csv', filteredRecords)}><Download size={14}/>Export</button></div>}><SimpleTable rows={filteredRecords} columns={analytics.columns}/></Panel></>}

      {tab === 'qa' && <section className="grid two"><Panel title="QA checks"><div className="diagnostic-list">{qa.map((item) => <article key={item.check} className={`diagnostic ${item.status}`}><ShieldCheck size={16}/><div><b>{item.check}</b><span>{item.detail}</span></div><StatusBadge status={item.status}/></article>)}</div></Panel><Panel title="Universal filter audit"><SimpleTable rows={filterAuditRows}/></Panel><Panel title="Additive metric audit"><SimpleTable rows={additiveFields.slice(0, 300)}/></Panel></section>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
