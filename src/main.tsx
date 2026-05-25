import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, AlertTriangle, BarChart3, DatabaseZap, Download, Gauge, ListChecks, PhoneCall, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Target, TrendingDown, TrendingUp, UsersRound } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Funnel, FunnelChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';
import './unified.css';

type ApiSource = 'unified' | 'onvest' | 'ontact' | 'powerbi';
type AtomicSource = 'onvest' | 'ontact' | 'powerbi';
type Tab = 'overview' | 'performance' | 'parameters' | 'rows' | 'funnel' | 'vendors' | 'operations' | 'powerbi';

type FieldProfile = { source?: string; field: string; rawField?: string; group: string; role: string; type: string; numeric: boolean; pii: boolean; nonNull: number; total?: number; sampleValues: string[] };
type Analytics = { fields: { numeric: string[]; text: string[] }; fieldCatalog: FieldProfile[]; columns: string[]; totals: Record<string, number>; derived: Record<string, number>; byDate: Record<string, number | string>[]; byVendor: Record<string, number | string>[]; byAgent: Record<string, number | string>[]; byStatus: Record<string, number | string>[]; records: Record<string, unknown>[]; recordsReturned: number; recordLimit: number };
type AnalyticsResult = { source: string; ok: boolean; configured: boolean; status?: number; type?: string; rows?: number; upstreamCount?: number; truncated?: boolean; maxRows?: number; recordLimit?: number; defaultWindowApplied?: boolean; fallbackUsed?: boolean; error?: string; reportTitle?: string; queryDataEndpoint?: string; analytics?: Analytics };
type Payload = { ok: boolean; mode: string; generatedAt: string; results: AnalyticsResult[] };
type PowerBiQueryBucket = { query: string; records: number; count_activation: number; total_activations: number; count_capture_complete: number; total_capture_complete: number; count_nett_app: number; total_nett_apps: number; count_date_created: number };
type PerformanceStatus = 'excellent' | 'good' | 'watch' | 'critical' | 'empty';
type PerformanceMetric = { label: string; category: string; value: number; formatted: string; target: string; score: number; status: PerformanceStatus; delta?: number; deltaLabel?: string; invertDelta?: boolean };
type PerformanceRow = { name: string; score: number; spend: number; fetched: number; accepted: number; qualified: number; sales: number; cpl: number; cpaAccepted: number; validationRate: number; deliveryRate: number; acceptanceRate: number; qualifiedRate: number; salesRate: number; ctr: number; formRate: number; activationRate: number };
type Bottleneck = { stage: string; input: number; output: number; rate: number; lost: number; severity: PerformanceStatus; note: string };
type Diagnostic = { title: string; detail: string; severity: PerformanceStatus; value: string };

type AccurateDerived = {
  spend: number;
  fetchedLeads: number;
  acceptedLeads: number;
  qualifiedLeads: number;
  sales: number;
  mtnActivations: number;
  powerBiActivations: number;
  captureComplete: number;
  nettApps: number;
  calls: number;
  talkSeconds: number;
  cpl: number;
  cpaAccepted: number;
  acceptedRate: number;
  answerRate: number;
};

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 });

const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);
const fmt = (value: unknown, key = '') => key.toLowerCase().includes('amount') || key.toLowerCase().includes('spend') || key.toLowerCase().startsWith('cp') ? currency.format(n(value)) : number.format(n(value));
const ratio = (top: unknown, bottom: unknown) => n(bottom) ? n(top) / n(bottom) : 0;
const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const NON_ADDITIVE_FIELD_NAMES = new Set([
  'uniqueid', 'lead_id', 'list_id', 'campaign_id', 'source_id', 'entry_list_id', 'start_epoch', 'end_epoch', 'gmt_offset_now', 'rank', 'model_id', 'dataset_id', 'report_id', 'visual_id', 'query_index', 'select_index', 'data_volume', 'window_count', 'select_count', 'phone_code'
]);

const SNAPSHOT_URL = '/data/attached-snapshot.json';

function isPayload(value: unknown): value is Payload {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<Payload>;
  return typeof maybe.ok === 'boolean' && typeof maybe.generatedAt === 'string' && Array.isArray(maybe.results);
}

function normaliseFieldName(field: string) {
  return field.includes('.') ? field.split('.').pop() ?? field : field;
}

function isAdditiveField(field: FieldProfile) {
  const raw = normaliseFieldName(field.rawField ?? field.field);
  const lowered = raw.toLowerCase();
  if (!field.numeric || field.pii) return false;
  if (field.role === 'identifier' || field.role === 'metadata' || field.role === 'date/time') return false;
  if (field.group.toLowerCase().includes('identifier') || field.group.toLowerCase().includes('query context')) return false;
  if (NON_ADDITIVE_FIELD_NAMES.has(raw) || NON_ADDITIVE_FIELD_NAMES.has(lowered)) return false;
  if (lowered.endsWith('_id') || lowered === 'id') return false;
  return true;
}

function buildAccurateDerived(totals: Record<string, number>): AccurateDerived {
  const sales = n(totals.MTN_Sales) + n(totals.Total_Leads_Sold_A) + n(totals.Total_Leads_Sold_B) + n(totals.Total_Leads_Sold_C) + n(totals.Total_Leads_Sold_D) + n(totals.Total_Leads_Sold_Other);
  const pbiActivations = Math.max(n(totals.count_activation), n(totals.total_activations));
  const spend = n(totals.Amount_Spent);
  const forms = n(totals.Form_Completion);
  const accepted = n(totals.Accepted_Leads) || n(totals.Total_Leads_Delivered_OnTact);
  const fetched = n(totals.Fetched_Leads);
  return {
    spend,
    fetchedLeads: fetched,
    acceptedLeads: accepted,
    qualifiedLeads: n(totals.Qualified_Leads),
    sales,
    mtnActivations: n(totals.MTN_Activated_Sales),
    powerBiActivations: pbiActivations,
    captureComplete: Math.max(n(totals.total_capture_complete), n(totals.count_capture_complete)),
    nettApps: Math.max(n(totals.count_nett_app), n(totals.total_nett_apps)),
    calls: n(totals.__call_records) || (n(totals.length_in_sec) ? n(totals.records) : 0),
    talkSeconds: n(totals.length_in_sec),
    cpl: forms ? spend / forms : 0,
    cpaAccepted: accepted ? spend / accepted : 0,
    acceptedRate: fetched ? accepted / fetched : 0,
    answerRate: n(totals.MTN_Dialed_Leads) ? n(totals.MTN_Answered_Calls) / n(totals.MTN_Dialed_Leads) : 0
  };
}

function performanceStatus(score: number): PerformanceStatus {
  if (!Number.isFinite(score) || score <= 0) return 'empty';
  if (score >= 90) return 'excellent';
  if (score >= 72) return 'good';
  if (score >= 50) return 'watch';
  return 'critical';
}

function scoreAgainst(value: number, target: number, lowerIsBetter = false) {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return 0;
  if (lowerIsBetter) return value > 0 ? clamp((target / value) * 100) : 0;
  return clamp((value / target) * 100);
}

function formatDelta(delta?: number, invert = false) {
  if (!Number.isFinite(delta)) return undefined;
  const direction = (delta ?? 0) >= 0 ? 'up' : 'down';
  const favourable = invert ? direction === 'down' : direction === 'up';
  return `${direction === 'up' ? '+' : ''}${pct.format(delta ?? 0)} ${favourable ? 'better' : 'worse'} vs previous 7d`;
}

function periodRatioDelta(rows: Record<string, number | string>[], numeratorKeys: string[], denominatorKeys: string[]) {
  const dated = rows
    .filter((row) => typeof row.date === 'string' && !Number.isNaN(new Date(String(row.date)).getTime()))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const latest = dated.at(-1)?.date;
  if (!latest) return undefined;
  const latestDate = new Date(String(latest));
  const currentStart = new Date(latestDate);
  currentStart.setUTCDate(latestDate.getUTCDate() - 6);
  const previousStart = new Date(latestDate);
  previousStart.setUTCDate(latestDate.getUTCDate() - 13);
  const previousEnd = new Date(latestDate);
  previousEnd.setUTCDate(latestDate.getUTCDate() - 7);
  const sumKeys = (row: Record<string, number | string>, keys: string[]) => keys.reduce((sum, key) => sum + n(row[key]), 0);
  const sumBetween = (start: Date, end: Date, keys: string[]) => dated.reduce((sum, row) => {
    const rowDate = new Date(String(row.date));
    return rowDate >= start && rowDate <= end ? sum + sumKeys(row, keys) : sum;
  }, 0);
  const currentDenominator = sumBetween(currentStart, latestDate, denominatorKeys);
  const previousDenominator = sumBetween(previousStart, previousEnd, denominatorKeys);
  const current = ratio(sumBetween(currentStart, latestDate, numeratorKeys), currentDenominator || 1);
  const previous = ratio(sumBetween(previousStart, previousEnd, numeratorKeys), previousDenominator || 1);
  return previous ? (current - previous) / previous : undefined;
}

function makeMetric(label: string, category: string, value: number, target: number, formatter: (value: number) => string, targetLabel: string, lowerIsBetter = false, delta?: number): PerformanceMetric {
  const score = scoreAgainst(value, target, lowerIsBetter);
  return {
    label,
    category,
    value,
    formatted: formatter(value),
    target: targetLabel,
    score,
    status: performanceStatus(score),
    delta,
    deltaLabel: formatDelta(delta, lowerIsBetter),
    invertDelta: lowerIsBetter
  };
}

function buildPerformanceRow(name: string, totals: Record<string, unknown>): PerformanceRow {
  const delivered = n(totals.Total_Leads_Delivered_OnTact) + n(totals.Total_Leads_Delivered_MTN) + n(totals.Total_Leads_Delivered_Mondo);
  const valid = n(totals.Total_Leads_WithValid_Phone_ID) || Math.min(n(totals.Valid_IDNumber), n(totals.Valid_Phone));
  const sales = n(totals.MTN_Sales) + n(totals.Total_Leads_Sold_A) + n(totals.Total_Leads_Sold_B) + n(totals.Total_Leads_Sold_C) + n(totals.Total_Leads_Sold_D) + n(totals.Total_Leads_Sold_Other);
  const spend = n(totals.Amount_Spent);
  const fetched = n(totals.Fetched_Leads);
  const forms = n(totals.Form_Completion);
  const accepted = n(totals.Accepted_Leads) || n(totals.Total_Leads_Delivered_OnTact);
  const qualified = n(totals.Qualified_Leads);
  const cpl = ratio(spend, n(totals.Form_Completion) || fetched);
  const cpaAccepted = ratio(spend, accepted);
  const validationRate = ratio(valid, fetched);
  const deliveryRate = ratio(delivered, valid || fetched);
  const acceptanceRate = ratio(accepted, fetched);
  const qualifiedRate = ratio(qualified, fetched);
  const salesRate = ratio(sales, accepted || fetched);
  const ctr = ratio(totals.Clicks, totals.Impressions);
  const formRate = ratio(totals.Form_Completion, n(totals.Landing_Page_View) || n(totals.Clicks));
  const activationRate = ratio(totals.MTN_Activated_Sales, totals.MTN_Sales);
  const scores: number[] = [];
  if (fetched > 0) scores.push(scoreAgainst(validationRate, 0.95), scoreAgainst(acceptanceRate, 0.55), scoreAgainst(qualifiedRate, 0.5));
  if (valid > 0 || fetched > 0) scores.push(scoreAgainst(deliveryRate, 0.7));
  if (accepted > 0 || fetched > 0) scores.push(scoreAgainst(salesRate, 0.25));
  if (spend > 0 && (forms || fetched)) scores.push(scoreAgainst(cpl, 50, true));
  if (n(totals.Impressions) > 0) scores.push(scoreAgainst(ctr, 0.015));
  if (n(totals.Landing_Page_View) > 0 || n(totals.Clicks) > 0) scores.push(scoreAgainst(formRate, 0.1));
  if (n(totals.MTN_Sales) > 0) scores.push(scoreAgainst(activationRate, 0.1));
  if ((spend > 0 || forms > 0) && fetched === 0 && accepted === 0 && sales === 0) scores.push(35);
  const score = average(scores);
  return { name, score, spend, fetched, accepted, qualified, sales, cpl, cpaAccepted, validationRate, deliveryRate, acceptanceRate, qualifiedRate, salesRate, ctr, formRate, activationRate };
}

function buildPerformanceMetrics(totals: Record<string, unknown>, byDate: Record<string, number | string>[]) {
  const row = buildPerformanceRow('Total', totals);
  const answerRate = ratio(totals.MTN_Answered_Calls, totals.MTN_Dialed_Leads);
  const rpcRate = ratio(totals.MTN_Right_Party_Contact, totals.MTN_Answered_Calls);
  const spend = n(totals.Amount_Spent);
  const forms = n(totals.Form_Completion);
  const metrics = [
    makeMetric('Data quality', 'Quality', row.validationRate, 0.95, pct.format, '>= 95%', false, periodRatioDelta(byDate, ['Total_Leads_WithValid_Phone_ID'], ['Fetched_Leads'])),
    makeMetric('Delivery coverage', 'Funnel', row.deliveryRate, 0.7, pct.format, '>= 70%', false, periodRatioDelta(byDate, ['Total_Leads_Delivered_OnTact', 'Total_Leads_Delivered_MTN', 'Total_Leads_Delivered_Mondo'], ['Total_Leads_WithValid_Phone_ID'])),
    makeMetric('Acceptance rate', 'Funnel', row.acceptanceRate, 0.55, pct.format, '>= 55%', false, periodRatioDelta(byDate, ['Accepted_Leads'], ['Fetched_Leads'])),
    makeMetric('Sales conversion', 'Revenue', row.salesRate, 0.25, pct.format, '>= 25%', false, periodRatioDelta(byDate, ['MTN_Sales', 'Total_Leads_Sold_A', 'Total_Leads_Sold_B', 'Total_Leads_Sold_C', 'Total_Leads_Sold_D', 'Total_Leads_Sold_Other'], ['Accepted_Leads'])),
    makeMetric('Activation yield', 'Revenue', row.activationRate, 0.1, pct.format, '>= 10%', false, periodRatioDelta(byDate, ['MTN_Activated_Sales'], ['MTN_Sales'])),
    makeMetric('CTR', 'Media', row.ctr, 0.015, pct.format, '>= 1.5%', false, periodRatioDelta(byDate, ['Clicks'], ['Impressions'])),
    makeMetric('LPV to form', 'Media', row.formRate, 0.1, pct.format, '>= 10%', false, periodRatioDelta(byDate, ['Form_Completion'], ['Landing_Page_View'])),
    makeMetric('Cost per form', 'Efficiency', ratio(spend, forms), 50, currency.format, '<= R50', true, periodRatioDelta(byDate, ['Amount_Spent'], ['Form_Completion'])),
    makeMetric('Answer rate', 'Operations', answerRate, 0.55, pct.format, '>= 55%', false, periodRatioDelta(byDate, ['MTN_Answered_Calls'], ['MTN_Dialed_Leads'])),
    makeMetric('RPC rate', 'Operations', rpcRate, 0.85, pct.format, '>= 85%', false, periodRatioDelta(byDate, ['MTN_Right_Party_Contact'], ['MTN_Answered_Calls']))
  ];
  const groups = [
    { name: 'Media efficiency', score: average(metrics.filter((metric) => metric.category === 'Media' || metric.category === 'Efficiency').map((metric) => metric.score)) },
    { name: 'Lead quality', score: average(metrics.filter((metric) => metric.category === 'Quality').map((metric) => metric.score)) },
    { name: 'Funnel movement', score: average(metrics.filter((metric) => metric.category === 'Funnel').map((metric) => metric.score)) },
    { name: 'Revenue outcomes', score: average(metrics.filter((metric) => metric.category === 'Revenue').map((metric) => metric.score)) },
    { name: 'Operations', score: average(metrics.filter((metric) => metric.category === 'Operations').map((metric) => metric.score)) }
  ];
  return { metrics, groups, score: average(groups.map((group) => group.score)), row };
}

function buildBottlenecks(totals: Record<string, unknown>): Bottleneck[] {
  const sales = n(totals.MTN_Sales) + n(totals.Total_Leads_Sold_A) + n(totals.Total_Leads_Sold_B) + n(totals.Total_Leads_Sold_C) + n(totals.Total_Leads_Sold_D) + n(totals.Total_Leads_Sold_Other);
  const pairs = [
    { stage: 'Impressions to clicks', input: n(totals.Impressions), output: n(totals.Clicks), target: 0.015, note: 'Paid media attention' },
    { stage: 'Clicks to landing views', input: n(totals.Clicks), output: n(totals.Landing_Page_View), target: 0.25, note: 'Traffic quality and page load continuity' },
    { stage: 'Landing views to forms', input: n(totals.Landing_Page_View), output: n(totals.Form_Completion), target: 0.1, note: 'Form conversion' },
    { stage: 'Fetched to valid leads', input: n(totals.Fetched_Leads), output: n(totals.Total_Leads_WithValid_Phone_ID), target: 0.95, note: 'Data quality' },
    { stage: 'Valid leads to delivery', input: n(totals.Total_Leads_WithValid_Phone_ID), output: n(totals.Total_Leads_Delivered_OnTact) + n(totals.Total_Leads_Delivered_MTN) + n(totals.Total_Leads_Delivered_Mondo), target: 0.7, note: 'Provider routing' },
    { stage: 'Fetched to accepted', input: n(totals.Fetched_Leads), output: n(totals.Accepted_Leads), target: 0.55, note: 'Commercial acceptance' },
    { stage: 'Dialed to answered', input: n(totals.MTN_Dialed_Leads), output: n(totals.MTN_Answered_Calls), target: 0.55, note: 'Contactability' },
    { stage: 'Accepted to sales', input: n(totals.Accepted_Leads), output: sales, target: 0.25, note: 'Sales conversion' },
    { stage: 'MTN sales to activations', input: n(totals.MTN_Sales), output: n(totals.MTN_Activated_Sales), target: 0.1, note: 'Fulfilment quality' }
  ];
  return pairs
    .filter((pair) => pair.input > 0)
    .map((pair) => {
      const rate = ratio(pair.output, pair.input);
      const score = scoreAgainst(rate, pair.target);
      return { stage: pair.stage, input: pair.input, output: pair.output, rate, lost: Math.max(pair.input - pair.output, 0), severity: performanceStatus(score), note: pair.note };
    })
    .sort((a, b) => a.rate - b.rate);
}

function buildDiagnostics(results: AnalyticsResult[], totals: Record<string, unknown>, metrics: PerformanceMetric[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const weak = metrics.filter((metric) => metric.status === 'critical' || metric.status === 'watch').sort((a, b) => a.score - b.score).slice(0, 3);
  weak.forEach((metric) => diagnostics.push({ title: `${metric.label} below benchmark`, detail: `${metric.formatted} against target ${metric.target}`, severity: metric.status, value: decimal.format(metric.score) }));
  if (n(totals.Impressions) > 0 && n(totals.Reach) === 0) diagnostics.push({ title: 'Reach is missing', detail: 'Impressions are populated but Reach is zero across the current dataset.', severity: 'watch', value: '0' });
  if (results.some((result) => result.truncated)) diagnostics.push({ title: 'Source response capped', detail: 'At least one source is truncated; use date filters or live credentials for full operations measurement.', severity: 'watch', value: 'capped' });
  if (results.some((result) => result.fallbackUsed || !result.ok)) diagnostics.push({ title: 'Live sync fallback active', detail: 'Snapshot data is available while one or more live API sources need configuration.', severity: 'watch', value: 'fallback' });
  if (!diagnostics.length) diagnostics.push({ title: 'Performance checks clear', detail: 'Tracked KPIs are at or above configured operating benchmarks.', severity: 'excellent', value: 'OK' });
  return diagnostics.slice(0, 6);
}

function emptyAnalytics(): Analytics {
  return { fields: { numeric: [], text: [] }, fieldCatalog: [], columns: [], totals: { records: 0 }, derived: {}, byDate: [], byVendor: [], byAgent: [], byStatus: [], records: [], recordsReturned: 0, recordLimit: 0 };
}

function addNumericRow(target: Map<string, Record<string, number | string>>, keyName: string, row: Record<string, number | string>) {
  const key = String(row[keyName] ?? 'Unknown');
  const bucket = target.get(key) ?? { [keyName]: key, records: 0 };
  for (const [field, value] of Object.entries(row)) {
    if (field === keyName) continue;
    bucket[field] = n(bucket[field]) + n(value);
  }
  target.set(key, bucket);
}

function mergeAnalytics(results: AnalyticsResult[]): Analytics {
  const available = results.filter((result) => result.analytics);
  if (!available.length) return emptyAnalytics();
  const totals: Record<string, number> = { records: 0 };
  const numeric = new Set<string>();
  const text = new Set<string>();
  const fields: FieldProfile[] = [];
  const columns = new Set<string>(['__source']);
  const records: Record<string, unknown>[] = [];
  const byDate = new Map<string, Record<string, number | string>>();
  const byVendor = new Map<string, Record<string, number | string>>();
  const byAgent = new Map<string, Record<string, number | string>>();
  const byStatus = new Map<string, Record<string, number | string>>();

  for (const result of available) {
    const sourceAnalytics = result.analytics!;
    sourceAnalytics.fields.numeric.forEach((field) => numeric.add(field));
    sourceAnalytics.fields.text.forEach((field) => text.add(field));
    for (const [field, value] of Object.entries(sourceAnalytics.totals)) totals[field] = (totals[field] ?? 0) + n(value);
    fields.push(...sourceAnalytics.fieldCatalog.map((field) => ({ ...field, source: result.source, rawField: field.field, field: `${result.source}.${field.field}` })));
    sourceAnalytics.columns.forEach((column) => columns.add(column));
    records.push(...sourceAnalytics.records.map((record) => ({ __source: result.source, ...record })));
    sourceAnalytics.byDate.forEach((row) => addNumericRow(byDate, 'date', row));
    sourceAnalytics.byVendor.forEach((row) => addNumericRow(byVendor, 'vendor', row));
    sourceAnalytics.byAgent.forEach((row) => addNumericRow(byAgent, 'agent', row));
    sourceAnalytics.byStatus.forEach((row) => addNumericRow(byStatus, 'status', row));
  }

  return {
    fields: { numeric: [...numeric].sort(), text: [...text].sort() },
    fieldCatalog: fields,
    columns: [...columns],
    totals,
    derived: buildAccurateDerived(totals),
    byDate: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    byVendor: [...byVendor.values()].sort((a, b) => n(b.records) - n(a.records)),
    byAgent: [...byAgent.values()].sort((a, b) => n(b.records) - n(a.records)).slice(0, 50),
    byStatus: [...byStatus.values()].sort((a, b) => n(b.records) - n(a.records)),
    records: records.slice(0, 5000),
    recordsReturned: records.length,
    recordLimit: records.length
  };
}

function StatCard({ title, value, sub, icon: Icon }: { title: string; value: string; sub: string; icon: React.ElementType }) {
  return <section className="card stat-card"><div className="stat-icon"><Icon size={18}/></div><div><p>{title}</p><strong>{value}</strong><span>{sub}</span></div></section>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card chart-card"><h2>{title}</h2>{children}</section>;
}

function MetricTable({ title, rows }: { title: string; rows: { metric: string; value: string }[] }) {
  return <section className="card table-card"><h2>{title}</h2><div className="table-wrap"><table><tbody>{rows.map((row) => <tr key={row.metric}><td>{row.metric}</td><td>{row.value}</td></tr>)}</tbody></table></div></section>;
}

function DataTable({ title, rows, columns }: { title: string; rows: Record<string, unknown>[]; columns?: string[] }) {
  const keys = (columns && columns.length ? columns : Array.from(new Set(rows.flatMap((row) => Object.keys(row))))).slice(0, 120);
  return <section className={title ? 'card table-card wide' : 'table-card-inner'}>{title && <h2>{title}</h2>}<div className="table-wrap rows-table"><table><thead><tr>{keys.map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{keys.map((key) => <td key={key}>{String(row[key] ?? '')}</td>)}</tr>)}</tbody></table></div></section>;
}

function StatusBadge({ status }: { status: PerformanceStatus }) {
  const label = status === 'excellent' ? 'Excellent' : status === 'good' ? 'Good' : status === 'watch' ? 'Watch' : status === 'critical' ? 'Critical' : 'No data';
  return <span className={`status-badge ${status}`}>{label}</span>;
}

function PerformanceMetricCard({ metric }: { metric: PerformanceMetric }) {
  const DeltaIcon = (metric.delta ?? 0) >= 0 ? TrendingUp : TrendingDown;
  return <section className="card perf-metric-card">
    <div className="perf-card-head"><span>{metric.category}</span><StatusBadge status={metric.status}/></div>
    <h3>{metric.label}</h3>
    <strong>{metric.formatted}</strong>
    <div className="meter"><span style={{ width: `${clamp(metric.score)}%` }}/></div>
    <p>Target {metric.target} · Score {decimal.format(metric.score)}</p>
    {metric.deltaLabel && <small className={metric.invertDelta ? 'invert' : ''}><DeltaIcon size={14}/>{metric.deltaLabel}</small>}
  </section>;
}

function ScoreSummary({ score, groups, onExport }: { score: number; groups: { name: string; score: number }[]; onExport: () => void }) {
  return <section className="card score-card">
    <div className="score-top"><div><p className="eyebrow">Performance score</p><h2>{decimal.format(score)}</h2><StatusBadge status={performanceStatus(score)}/></div><Target size={34}/></div>
    <div className="score-bars">{groups.map((group) => <div key={group.name} className="score-row"><span>{group.name}</span><div className="meter"><span style={{ width: `${clamp(group.score)}%` }}/></div><b>{decimal.format(group.score)}</b></div>)}</div>
    <button className="secondary" onClick={onExport}><Download size={16}/> Export CSV</button>
  </section>;
}

function DiagnosticsPanel({ diagnostics }: { diagnostics: Diagnostic[] }) {
  return <section className="card diagnostics-card">
    <div className="section-head"><div><h2>Performance diagnostics</h2><p>{number.format(diagnostics.length)} active signals</p></div><Activity size={20}/></div>
    <div className="diagnostic-list">{diagnostics.map((item) => <article key={item.title} className={`diagnostic ${item.severity}`}><AlertTriangle size={16}/><div><b>{item.title}</b><span>{item.detail}</span></div><strong>{item.value}</strong></article>)}</div>
  </section>;
}

function BottleneckTable({ rows }: { rows: Bottleneck[] }) {
  return <section className="card table-card">
    <h2>Bottleneck analysis</h2>
    <div className="table-wrap"><table><thead><tr><th>Stage</th><th>Input</th><th>Output</th><th>Rate</th><th>Lost</th><th>Status</th><th>Signal</th></tr></thead><tbody>{rows.map((row) => <tr key={row.stage}><td>{row.stage}</td><td>{number.format(row.input)}</td><td>{number.format(row.output)}</td><td>{pct.format(row.rate)}</td><td>{number.format(row.lost)}</td><td><StatusBadge status={row.severity}/></td><td>{row.note}</td></tr>)}</tbody></table></div>
  </section>;
}

function PerformanceRankingTable({ rows }: { rows: PerformanceRow[] }) {
  return <section className="card table-card">
    <h2>Source performance ranking</h2>
    <div className="table-wrap"><table><thead><tr><th>Source</th><th>Score</th><th>Spend</th><th>Fetched</th><th>Accepted</th><th>CPL</th><th>Acceptance</th><th>Sales</th><th>Sales rate</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name}><td>{row.name}</td><td>{decimal.format(row.score)}</td><td>{currency.format(row.spend)}</td><td>{number.format(row.fetched)}</td><td>{number.format(row.accepted)}</td><td>{row.cpl ? currency.format(row.cpl) : '-'}</td><td>{pct.format(row.acceptanceRate)}</td><td>{number.format(row.sales)}</td><td>{pct.format(row.salesRate)}</td></tr>)}</tbody></table></div>
  </section>;
}

function App() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [snapshotPayload, setSnapshotPayload] = useState<Payload | null>(null);
  const [source, setSource] = useState<ApiSource>('unified');
  const [tab, setTab] = useState<Tab>('overview');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [maxRows, setMaxRows] = useState('5000');
  const [recordLimit, setRecordLimit] = useState('1000');
  const [fieldSearch, setFieldSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [rowSearch, setRowSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchOne = async (target: AtomicSource, mode: ApiSource): Promise<Payload> => {
    const params = new URLSearchParams();
    params.set('source', target);
    params.set('maxRows', mode === 'unified' && target === 'ontact' ? '1000' : maxRows);
    params.set('recordLimit', mode === 'unified' && target === 'ontact' ? '250' : recordLimit);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const res = await fetch(`/api/analytics?${params}`);
    const data: unknown = await res.json();
    if (!isPayload(data)) throw new Error(`${target} returned an unexpected payload shape.`);
    return data;
  };

  const loadAttachedSnapshot = async () => {
    const res = await fetch(SNAPSHOT_URL, { cache: 'no-store' });
    const data: unknown = await res.json();
    if (!res.ok || !isPayload(data)) throw new Error('Attached snapshot could not be loaded.');
    return data;
  };

  const withSnapshotFallback = (combined: Payload, fallbackPayload: Payload | null, targets: AtomicSource[]) => {
    if (!fallbackPayload) return combined;
    const liveBySource = new Map(combined.results.map((result) => [result.source, result]));
    const snapshotBySource = new Map(fallbackPayload.results.map((result) => [result.source, result]));
    const merged = targets.map((target) => {
      const live = liveBySource.get(target);
      if (live?.ok && live.analytics) return live;
      const snapshot = snapshotBySource.get(target);
      if (!snapshot) return live;
      if (!live) return snapshot;
      return {
        ...snapshot,
        ok: false,
        configured: live.configured,
        status: live.status,
        fallbackUsed: true,
        error: live.error || `${target} live sync unavailable; attached snapshot is displayed.`,
        type: `${snapshot.type || 'snapshot'}+fallback`
      };
    }).filter(Boolean) as AnalyticsResult[];
    for (const result of combined.results) {
      if (!targets.includes(result.source as AtomicSource)) merged.push(result);
    }
    return { ...combined, ok: merged.every((result) => result.ok), results: merged };
  };

  const load = async (nextSource: ApiSource = source, explicitFallback: Payload | null = snapshotPayload) => {
    setLoading(true);
    setError('');
    try {
      const targets: AtomicSource[] = nextSource === 'unified' ? ['onvest', 'ontact', 'powerbi'] : [nextSource];
      const responses = await Promise.all(targets.map((target) => fetchOne(target, nextSource)));
      const livePayload: Payload = { ok: responses.every((response) => response.ok), mode: nextSource === 'unified' ? 'unified-client-side-live-sync' : responses[0]?.mode ?? 'single-source-live-sync', generatedAt: new Date().toISOString(), results: responses.flatMap((response) => response.results) };
      const combined = withSnapshotFallback(livePayload, explicitFallback, targets);
      setPayload(combined);
      if (!combined.ok) setError(`${combined.results.filter((result) => !result.ok).map((result) => `${result.source}: ${result.error || 'needs attention'}`).join(' | ') || 'One or more sources need attention.'} Attached snapshot data remains available.`);
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : String(e);
      const friendlyMessage = rawMessage.includes("Unexpected token '<'")
        ? 'Cloudflare Pages Functions are not available through the plain Vite dev server'
        : rawMessage;
      if (explicitFallback) setPayload(explicitFallback);
      setError(`Live sync unavailable: ${friendlyMessage}. Attached snapshot data is displayed.`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    const boot = async () => {
      try {
        const snapshot = await loadAttachedSnapshot();
        if (!active) return;
        setSnapshotPayload(snapshot);
        setPayload(snapshot);
        await load('unified', snapshot);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : String(e));
      }
    };
    boot();
    return () => { active = false; };
  }, []);

  const results = payload?.results ?? [];
  const result = source === 'unified' ? undefined : results.find((item) => item.source === source) ?? results[0];
  const analytics = source === 'unified' ? mergeAnalytics(results) : result?.analytics ?? emptyAnalytics();
  const totals = analytics.totals;
  const derived = buildAccurateDerived(totals);
  const fields = analytics.fieldCatalog;
  const records = analytics.records;
  const columns = analytics.columns;
  const isPowerBi = source === 'powerbi';

  const groups = useMemo(() => ['all', ...Array.from(new Set(fields.map((field) => field.group))).sort()], [fields]);
  const filteredFields = useMemo(() => {
    const q = fieldSearch.toLowerCase();
    return fields.filter((field) => (groupFilter === 'all' || field.group === groupFilter) && (!q || field.field.toLowerCase().includes(q) || String(field.source ?? '').toLowerCase().includes(q) || field.group.toLowerCase().includes(q) || field.role.toLowerCase().includes(q)));
  }, [fields, fieldSearch, groupFilter]);
  const filteredRecords = useMemo(() => {
    const q = rowSearch.toLowerCase();
    if (!q) return records;
    return records.filter((record) => Object.values(record).some((value) => String(value ?? '').toLowerCase().includes(q))).slice(0, 250);
  }, [records, rowSearch]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Unified Overview' }, { id: 'performance', label: 'Performance' }, { id: 'parameters', label: 'All Parameters' }, { id: 'rows', label: 'All Rows' },
    { id: 'funnel', label: 'Journey Funnel' }, { id: 'vendors', label: 'Vendors' }, { id: 'operations', label: 'Operations' }, { id: 'powerbi', label: 'Power BI Data' }
  ];

  const sourceTitle = source === 'unified' ? 'Unified ConvertIQ Analytics Dashboard' : source === 'onvest' ? 'Onvest Dashboard API' : source === 'ontact' ? 'Ontact Analytics API' : 'Power BI QueryData';
  const sourceCopy = source === 'unified' ? 'One command-center view combining the attached sanitized snapshot with live Onvest funnel/media metrics, Ontact call-centre records, and Power BI QueryData when Cloudflare variables are configured.' : isPowerBi ? 'Power BI is treated as a data source. The dashboard tracks attached QueryData visual definitions and can call the Power BI querydata endpoint for live rows.' : 'Every API parameter is profiled, grouped, totalled where numeric, and shown in the row explorer. Sensitive lead fields are redacted but still listed in the parameter registry.';

  const funnel = [
    { name: 'Fetched', value: derived.fetchedLeads }, { name: 'Valid ID + Phone', value: n(totals.Total_Leads_WithValid_Phone_ID) || derived.fetchedLeads },
    { name: 'BLC Passed', value: n(totals.Total_Leads_Passed_BLC_Vetting) }, { name: 'BLC Delivered OnTact', value: n(totals.Total_Leads_Delivered_OnTact) },
    { name: 'MTN Delivered', value: n(totals.Total_Leads_Delivered_MTN) }, { name: 'Mondo Delivered', value: n(totals.Total_Leads_Delivered_Mondo) },
    { name: 'Accepted', value: derived.acceptedLeads }, { name: 'Qualified', value: derived.qualifiedLeads },
    { name: 'Sales', value: derived.sales }, { name: 'MTN Activated', value: derived.mtnActivations }
  ].filter((item) => item.value > 0);

  const sourceBreakdown = results.map((item) => ({ source: item.source, rows: item.rows ?? 0, parameters: item.analytics?.fieldCatalog.length ?? 0, records: item.analytics?.records.length ?? 0 }));
  const additiveRows = fields.filter(isAdditiveField).map((field) => ({ metric: `${field.source ? `${field.source}.` : ''}${field.rawField ?? field.field}`, value: fmt(field.total, field.rawField ?? field.field) }));
  const powerBiRows = source === 'unified' ? records.filter((row) => row.__source === 'powerbi') : records;
  const powerBiByQuery = Array.from(powerBiRows.reduce<Map<string, PowerBiQueryBucket>>((map, row) => {
    const key = String(row.query ?? 'unknown');
    const bucket = map.get(key) ?? { query: key, records: 0, count_activation: 0, total_activations: 0, count_capture_complete: 0, total_capture_complete: 0, count_nett_app: 0, total_nett_apps: 0, count_date_created: 0 };
    bucket.records += 1;
    bucket.count_activation += n(row.count_activation);
    bucket.total_activations += n(row.total_activations);
    bucket.count_capture_complete += n(row.count_capture_complete);
    bucket.total_capture_complete += n(row.total_capture_complete);
    bucket.count_nett_app += n(row.count_nett_app);
    bucket.total_nett_apps += n(row.total_nett_apps);
    bucket.count_date_created += n(row.count_date_created);
    map.set(key, bucket);
    return map;
  }, new Map<string, PowerBiQueryBucket>()).values());
  const performance = buildPerformanceMetrics(totals, analytics.byDate);
  const performanceRows = analytics.byVendor
    .map((row) => buildPerformanceRow(String(row.vendor ?? 'Unknown'), row))
    .filter((row) => row.fetched > 0 || row.accepted > 0 || row.spend > 0 || row.sales > 0)
    .sort((a, b) => b.score - a.score);
  const bottlenecks = buildBottlenecks(totals);
  const diagnostics = buildDiagnostics(results, totals, performance.metrics);
  const performanceTrend = analytics.byDate.map((row) => {
    const spend = n(row.Amount_Spent);
    const forms = n(row.Form_Completion);
    return {
      date: row.date,
      acceptedRate: ratio(row.Accepted_Leads, row.Fetched_Leads) * 100,
      cpl: forms ? spend / forms : 0,
      salesRate: ratio(n(row.MTN_Sales) + n(row.Total_Leads_Sold_A) + n(row.Total_Leads_Sold_B) + n(row.Total_Leads_Sold_C) + n(row.Total_Leads_Sold_D) + n(row.Total_Leads_Sold_Other), row.Accepted_Leads) * 100
    };
  });

  const exportPerformanceCsv = () => {
    const headers = ['source', 'score', 'spend', 'fetched', 'accepted', 'qualified', 'sales', 'cpl', 'cpa_accepted', 'validation_rate', 'delivery_rate', 'acceptance_rate', 'qualified_rate', 'sales_rate', 'ctr', 'form_rate', 'activation_rate'];
    const rows = performanceRows.map((row) => [row.name, row.score, row.spend, row.fetched, row.accepted, row.qualified, row.sales, row.cpl, row.cpaAccepted, row.validationRate, row.deliveryRate, row.acceptanceRate, row.qualifiedRate, row.salesRate, row.ctr, row.formRate, row.activationRate]);
    const csv = [headers, ...rows].map((cells) => cells.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `convertiq-performance-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return <main>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">CIQ</div><div><b>ConvertIQ</b><span>Analytics command center</span></div></div>
      <nav>{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
      <div className="sync-panel"><ShieldCheck size={18}/><b>QA-safe numbers</b><span>Power BI, Onvest and Ontact totals are separated to avoid duplicate counting.</span></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">Attached snapshot + live analytics · QA audited</p><h1>{sourceTitle}</h1><p className="subcopy">{sourceCopy}</p></div><button className="primary" onClick={() => load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/> {loading ? 'Syncing' : 'Sync dashboard'}</button></header>
      <section className="controls card"><SlidersHorizontal size={18}/><select value={source} onChange={(e) => { const next = e.target.value as ApiSource; setSource(next); if (next === 'powerbi') setTab('powerbi'); load(next); }}><option value="unified">Unified Dashboard</option><option value="onvest">Onvest Dashboard API</option><option value="ontact">Ontact Analytics API</option><option value="powerbi">Power BI QueryData</option></select><input type="date" value={from} onChange={(e) => setFrom(e.target.value)}/><input type="date" value={to} onChange={(e) => setTo(e.target.value)}/><select value={maxRows} onChange={(e) => setMaxRows(e.target.value)}><option value="1000">Process 1,000 rows</option><option value="5000">Process 5,000 rows</option><option value="10000">Process 10,000 rows</option><option value="15000">Process 15,000 rows</option></select><select value={recordLimit} onChange={(e) => setRecordLimit(e.target.value)}><option value="250">Show 250 rows</option><option value="1000">Show 1,000 rows</option><option value="2500">Show 2,500 rows</option><option value="5000">Show 5,000 rows</option></select><button onClick={() => load()}>Apply</button><span>{payload ? `Last sync: ${new Date(payload.generatedAt).toLocaleString()}` : 'Not synced yet'}</span></section>
      {error && <section className="notice">{error}</section>}
      {results.some((item) => item.defaultWindowApplied) && <section className="notice soft">No date range was selected, so each API request used a safe recent window where applicable. Select dates to inspect a specific period.</section>}
      {results.some((item) => item.truncated) && <section className="notice soft">Large response protected: at least one source was capped. Use date filters to narrow the period.</section>}

      <section className="source-grid">{results.map((item) => <section className="card source-card" key={item.source}><span className={item.ok ? 'pill ok' : 'pill warn'}>{item.fallbackUsed ? 'Snapshot fallback' : item.ok ? 'Ready' : 'Attention'}</span><h3>{item.source.toUpperCase()}</h3><p>{item.fallbackUsed ? `${number.format(item.rows ?? 0)} attached rows shown while live sync needs configuration.` : item.source === 'powerbi' ? `${number.format(item.rows ?? 0)} Power BI rows or visual definitions tracked.` : `${number.format(item.rows ?? 0)} rows processed · ${number.format(item.upstreamCount ?? item.rows ?? 0)} upstream rows`}</p></section>)}<section className="card source-card"><span className="pill ok">Additive Metrics</span><h3>{number.format(additiveRows.length)}</h3><p>Identifier/date/query fields excluded from additive totals.</p></section><section className="card source-card"><span className="pill ok">Unified Rows</span><h3>{number.format(records.length)}</h3><p>Sanitised records combined across API sources.</p></section></section>

      {tab === 'overview' && <><section className="kpi-grid"><StatCard title="Media Spend" value={currency.format(derived.spend)} sub="Onvest Amount_Spent only" icon={DatabaseZap}/><StatCard title="Fetched Leads" value={number.format(derived.fetchedLeads)} sub="Onvest Fetched_Leads" icon={UsersRound}/><StatCard title="Accepted Leads" value={number.format(derived.acceptedLeads)} sub={`Acceptance ${pct.format(derived.acceptedRate)}`} icon={Gauge}/><StatCard title="MTN Activations" value={number.format(derived.mtnActivations)} sub="Onvest MTN_Activated_Sales" icon={BarChart3}/><StatCard title="Call Records" value={number.format(derived.calls)} sub="Ontact recovered/live records" icon={PhoneCall}/><StatCard title="Parameters" value={number.format(fields.length)} sub="Across all attached sources" icon={ListChecks}/></section><section className="grid two"><ChartCard title="Unified daily trend"><ResponsiveContainer width="100%" height={320}><AreaChart data={analytics.byDate}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area dataKey="Amount_Spent" name="Spend"/><Area dataKey="Fetched_Leads" name="Fetched"/><Area dataKey="Accepted_Leads" name="Accepted"/><Area dataKey="count_activation" name="Power BI Activations"/><Area dataKey="records" name="Records"/></AreaChart></ResponsiveContainer></ChartCard><ChartCard title="Source composition"><ResponsiveContainer width="100%" height={320}><BarChart data={sourceBreakdown}><CartesianGrid vertical={false}/><XAxis dataKey="source"/><YAxis/><Tooltip/><Bar dataKey="rows" name="Rows"/><Bar dataKey="parameters" name="Parameters"/></BarChart></ResponsiveContainer></ChartCard></section></>}
      {tab === 'performance' && <><section className="performance-hero"><ScoreSummary score={performance.score} groups={performance.groups} onExport={exportPerformanceCsv}/><div className="perf-metric-grid">{performance.metrics.map((metric) => <PerformanceMetricCard key={metric.label} metric={metric}/>)}</div></section><section className="grid two"><ChartCard title="Top source performance scores"><ResponsiveContainer width="100%" height={360}><BarChart data={performanceRows.slice(0, 12)}><CartesianGrid vertical={false}/><XAxis dataKey="name"/><YAxis domain={[0, 100]}/><Tooltip/><Bar dataKey="score" name="Score"/></BarChart></ResponsiveContainer></ChartCard><DiagnosticsPanel diagnostics={diagnostics}/></section><section className="grid two performance-lower"><ChartCard title="Measured KPI trend"><ResponsiveContainer width="100%" height={360}><AreaChart data={performanceTrend}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area dataKey="acceptedRate" name="Acceptance %" /><Area dataKey="salesRate" name="Sales %" /><Area dataKey="cpl" name="CPL" /></AreaChart></ResponsiveContainer></ChartCard><BottleneckTable rows={bottlenecks}/></section><PerformanceRankingTable rows={performanceRows}/></>}
      {tab === 'parameters' && <section className="card table-card wide"><div className="section-head"><div><h2>Unified parameter registry</h2><p>{number.format(filteredFields.length)} visible of {number.format(fields.length)} detected fields. Totals only display for additive metrics/measures.</p></div><div className="inline-tools"><Search size={16}/><input placeholder="Search source, parameter or group..." value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)}/><select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>{groups.map((group) => <option key={group} value={group}>{group}</option>)}</select></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Source</th><th>Parameter</th><th>Group</th><th>Role</th><th>Type</th><th>Additive</th><th>PII</th><th>Non-null rows</th><th>Total</th><th>Sample values</th></tr></thead><tbody>{filteredFields.map((field, index) => { const additive = isAdditiveField(field); return <tr key={`${field.source}-${field.field}`}><td>{index + 1}</td><td>{field.source ?? source}</td><td>{field.rawField ?? field.field}</td><td>{field.group}</td><td>{field.role}</td><td>{field.type}</td><td>{additive ? 'Yes' : 'No'}</td><td>{field.pii ? 'Redacted' : 'No'}</td><td>{number.format(field.nonNull)}</td><td>{additive ? fmt(field.total, field.rawField ?? field.field) : ''}</td><td>{field.sampleValues.join(' | ')}</td></tr>; })}</tbody></table></div></section>}
      {tab === 'rows' && <section className="card table-card wide"><div className="section-head"><div><h2>Unified row explorer</h2><p>{number.format(filteredRecords.length)} visible rows · {number.format(columns.length)} columns. Sensitive fields are redacted.</p></div><div className="inline-tools"><Search size={16}/><input placeholder="Search rows..." value={rowSearch} onChange={(e) => setRowSearch(e.target.value)}/></div></div><DataTable rows={filteredRecords} columns={columns} title=""/></section>}
      {tab === 'funnel' && <section className="grid two"><ChartCard title="Onvest commercial journey waterfall"><ResponsiveContainer width="100%" height={420}><FunnelChart><Tooltip/><Funnel dataKey="value" data={funnel} isAnimationActive><LabelList position="right" fill="#173f35" stroke="none" dataKey="name"/></Funnel></FunnelChart></ResponsiveContainer></ChartCard><MetricTable title="QA-safe additive totals" rows={additiveRows}/></section>}
      {tab === 'vendors' && <section className="grid two"><ChartCard title="Vendor / source volume"><ResponsiveContainer width="100%" height={420}><BarChart data={analytics.byVendor}><CartesianGrid vertical={false}/><XAxis dataKey="vendor"/><YAxis/><Tooltip/><Bar dataKey="records" name="Records"/><Bar dataKey="Fetched_Leads" name="Fetched"/><Bar dataKey="Accepted_Leads" name="Accepted"/><Bar dataKey="count_activation" name="Power BI Activations"/></BarChart></ResponsiveContainer></ChartCard><DataTable rows={analytics.byVendor} title="Vendor / source metric matrix"/></section>}
      {tab === 'operations' && <section className="grid two"><ChartCard title="Agent productivity"><ResponsiveContainer width="100%" height={420}><BarChart data={analytics.byAgent}><CartesianGrid vertical={false}/><XAxis dataKey="agent"/><YAxis/><Tooltip/><Bar dataKey="records" name="Records / Calls"/><Bar dataKey="length_in_sec" name="Talk seconds"/><Bar dataKey="total_activations" name="Power BI Activations"/></BarChart></ResponsiveContainer></ChartCard><DataTable rows={analytics.byStatus} title="Status / outcome breakdown"/></section>}
      {tab === 'powerbi' && <section className="grid two"><ChartCard title="Power BI data by query"><ResponsiveContainer width="100%" height={420}><BarChart data={powerBiByQuery}><CartesianGrid vertical={false}/><XAxis dataKey="query"/><YAxis/><Tooltip/><Bar dataKey="records" name="Rows / catalog entries"/><Bar dataKey="count_activation" name="Activation Count"/><Bar dataKey="total_activations" name="Total Activations"/><Bar dataKey="count_capture_complete" name="Capture Complete Count"/><Bar dataKey="total_capture_complete" name="Total Capture Complete"/><Bar dataKey="count_nett_app" name="Nett Apps"/><Bar dataKey="total_nett_apps" name="Total Nett Apps"/></BarChart></ResponsiveContainer></ChartCard><DataTable rows={powerBiRows} title="Power BI QueryData / catalog rows"/></section>}
    </section>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
