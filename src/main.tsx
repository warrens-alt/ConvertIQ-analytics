import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { AlertTriangle, BarChart3, CheckCircle2, DatabaseZap, Download, Gauge, Layers3, ListChecks, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Target, TrendingUp, UsersRound, WalletCards, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Funnel, FunnelChart, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { calculateCommercialRevenue, RATE_CARD } from './commercialRateCard';
import './styles.css';
import './unified.css';

type AtomicSource = 'onvest' | 'ontact' | 'powerbi';
type ApiSource = 'unified' | AtomicSource;
type Tab = 'command' | 'allMetrics' | 'journey' | 'sources' | 'vendors' | 'ontact' | 'media' | 'commercials' | 'powerbi' | 'explorer' | 'qa';
type Status = 'excellent' | 'good' | 'watch' | 'critical' | 'empty';
type FieldProfile = { source?: string; field: string; rawField?: string; group: string; role: string; type: string; numeric: boolean; pii: boolean; nonNull: number; total?: number; sampleValues: string[] };
type Row = Record<string, number | string>;
type Analytics = { fields: { numeric: string[]; text: string[] }; fieldCatalog: FieldProfile[]; columns: string[]; totals: Record<string, number>; derived: Record<string, number>; byDate: Row[]; byVendor: Row[]; byAgent: Row[]; byStatus: Row[]; records: Record<string, unknown>[]; recordsReturned: number; recordLimit: number };
type AnalyticsResult = { source: string; ok: boolean; configured: boolean; rows?: number; rawRows?: number; filteredRows?: number; excludedByDate?: number; undatedRowsExcluded?: number; upstreamCount?: number; truncated?: boolean; error?: string; queryDataEndpoint?: string; filters?: { from?: string; to?: string; strategy?: string; applied?: boolean }; analytics?: Analytics };
type Payload = { ok: boolean; mode: string; generatedAt: string; results: AnalyticsResult[] };
type Assumptions = { acceptedFee: number; ontactAgents: number; ontactOpexPerAgent: number };
type PbiCanonical = { activations: number; captureComplete: number; nettApps: number; dateCreated: number };
type MetricRow = { source: string; metric: string; apiField: string; group: string; role: string; status: string; value: string; additive: string; formula: string; samples: string };
type PerfRow = { name: string; score: number; spend: number; fetched: number; valid: number; delivered: number; accepted: number; sales: number; activations: number; cpl: number; cpaAccepted: number; validationRate: number; deliveryRate: number; acceptanceRate: number; salesRate: number; activationRate: number };

const moneyFmt = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pctFmt = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const decFmt = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 });
const DEFAULT_ASSUMPTIONS: Assumptions = { acceptedFee: 35, ontactAgents: 0, ontactOpexPerAgent: 0 };
const NON_ADDITIVE = new Set(['uniqueid', 'lead_id', 'list_id', 'campaign_id', 'source_id', 'entry_list_id', 'start_epoch', 'end_epoch', 'gmt_offset_now', 'rank', 'model_id', 'dataset_id', 'report_id', 'phone_code']);
const currencyField = (key = '') => /amount|spend|revenue|profit|opex|cpl|cpa|fee|rate/i.test(key);
const n = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : typeof value === 'string' ? Number(value.replace(/[^0-9.-]/g, '')) || 0 : 0;
const ratio = (top: unknown, bottom: unknown) => n(bottom) ? n(top) / n(bottom) : 0;
const fmt = (value: unknown, key = '') => currencyField(key) ? moneyFmt.format(n(value)) : numFmt.format(n(value));
const title = (value: string) => value.replace(/^.*\./, '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()).replace(/Mtn/g, 'MTN').replace(/Blc/g, 'BLC').replace(/Rpc/g, 'RPC').replace(/Id/g, 'ID').replace(/Dnc/g, 'DNC').replace(/Ftp/g, 'FTP');
const score = (value: number, target: number, lower = false) => Math.max(0, Math.min(100, target ? (lower ? target / Math.max(value, 0.00001) : value / target) * 100 : 0));
const average = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

function emptyAnalytics(): Analytics {
  return { fields: { numeric: [], text: [] }, fieldCatalog: [], columns: [], totals: { records: 0 }, derived: {}, byDate: [], byVendor: [], byAgent: [], byStatus: [], records: [], recordsReturned: 0, recordLimit: 0 };
}
function isPayload(value: unknown): value is Payload {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as Payload).results));
}
function addBucket(map: Map<string, Row>, keyName: string, row: Row) {
  const key = String(row[keyName] ?? 'Unknown');
  const bucket = map.get(key) ?? { [keyName]: key, records: 0 };
  Object.entries(row).forEach(([field, value]) => { if (field !== keyName) bucket[field] = n(bucket[field]) + n(value); });
  map.set(key, bucket);
}
function mergeAnalytics(results: AnalyticsResult[]): Analytics {
  const available = results.filter(result => result.ok && result.analytics);
  if (!available.length) return emptyAnalytics();
  const totals: Record<string, number> = { records: 0 };
  const numeric = new Set<string>();
  const text = new Set<string>();
  const columns = new Set<string>(['__source']);
  const fieldCatalog: FieldProfile[] = [];
  const records: Record<string, unknown>[] = [];
  const byDate = new Map<string, Row>();
  const byVendor = new Map<string, Row>();
  const byAgent = new Map<string, Row>();
  const byStatus = new Map<string, Row>();
  available.forEach(result => {
    const analytics = result.analytics!;
    analytics.fields.numeric.forEach(field => numeric.add(field));
    analytics.fields.text.forEach(field => text.add(field));
    analytics.columns.forEach(column => columns.add(column));
    Object.entries(analytics.totals).forEach(([field, value]) => { totals[field] = (totals[field] ?? 0) + n(value); });
    fieldCatalog.push(...analytics.fieldCatalog.map(field => ({ ...field, source: result.source, rawField: field.field, field: `${result.source}.${field.field}` })));
    records.push(...analytics.records.map(record => ({ __source: result.source, ...record })));
    analytics.byDate.forEach(row => addBucket(byDate, 'date', row));
    analytics.byVendor.forEach(row => addBucket(byVendor, 'vendor', row));
    analytics.byAgent.forEach(row => addBucket(byAgent, 'agent', row));
    analytics.byStatus.forEach(row => addBucket(byStatus, 'status', row));
  });
  return { fields: { numeric: [...numeric].sort(), text: [...text].sort() }, fieldCatalog, columns: [...columns], totals, derived: {}, byDate: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))), byVendor: [...byVendor.values()].sort((a, b) => n(b.records) - n(a.records)), byAgent: [...byAgent.values()].sort((a, b) => n(b.records) - n(a.records)).slice(0, 80), byStatus: [...byStatus.values()].sort((a, b) => n(b.records) - n(a.records)), records: records.slice(0, 5000), recordsReturned: records.length, recordLimit: records.length };
}
function canonicalPowerBi(records: Record<string, unknown>[]): PbiCanonical {
  const sum = (query: string, field: string) => records.filter(row => row.__source === 'powerbi' && row.query === query).reduce((total, row) => total + n(row[field]), 0);
  return { activations: sum('activation_dates', 'count_activation'), captureComplete: sum('capture_complete_dates', 'count_capture_complete'), nettApps: sum('nett_app_dates', 'count_nett_app'), dateCreated: sum('date_created_on_capture_complete', 'count_date_created') };
}
function derived(totals: Record<string, number>, pbi: PbiCanonical) {
  const mondoSales = n(totals.Total_Leads_Sold_A) + n(totals.Total_Leads_Sold_B) + n(totals.Total_Leads_Sold_C) + n(totals.Total_Leads_Sold_D) + n(totals.Total_Leads_Sold_Other);
  const delivered = n(totals.Total_Leads_Delivered_OnTact) + n(totals.Total_Leads_Delivered_MTN) + n(totals.Total_Leads_Delivered_Mondo) + n(totals.DebtRescue_LeadDelivered) + n(totals.Naga_FileDroppedOnFTP);
  const accepted = n(totals.Accepted_Leads);
  const sales = n(totals.MTN_Sales) + mondoSales;
  return { spend: n(totals.Amount_Spent), impressions: n(totals.Impressions), clicks: n(totals.Clicks), lpv: n(totals.Landing_Page_View), forms: n(totals.Form_Completion), fetched: n(totals.Fetched_Leads), valid: n(totals.Total_Leads_WithValid_Phone_ID) || Math.min(n(totals.Valid_IDNumber), n(totals.Valid_Phone)), delivered, accepted, sales, activations: n(totals.MTN_Activated_Sales) + pbi.activations, calls: n(totals.__call_records) || n(totals.records), talkSeconds: n(totals.length_in_sec), dialed: n(totals.MTN_Dialed_Leads), answered: n(totals.MTN_Answered_Calls), rpc: n(totals.MTN_Right_Party_Contact), cpl: ratio(totals.Amount_Spent, n(totals.Form_Completion) || n(totals.Fetched_Leads)), cpaAccepted: ratio(totals.Amount_Spent, accepted) };
}
function isAdditive(field: FieldProfile) {
  const raw = (field.rawField ?? field.field).split('.').pop() ?? field.field;
  const lowered = raw.toLowerCase();
  return field.numeric && !field.pii && field.role !== 'identifier' && field.role !== 'metadata' && field.role !== 'date/time' && !field.group.toLowerCase().includes('identifier') && !NON_ADDITIVE.has(raw) && !NON_ADDITIVE.has(lowered) && !lowered.endsWith('_id') && lowered !== 'id';
}
function groupExactSources(records: Record<string, unknown>[]) {
  const grouped = new Map<string, Record<string, unknown>>();
  records.filter(row => row.__source === 'onvest' || row.offershop_source).forEach(row => {
    const key = String(row.offershop_source ?? row.source ?? row.__source ?? 'Unclassified');
    const bucket = grouped.get(key) ?? { source: key, records: 0 };
    bucket.records = n(bucket.records) + 1;
    Object.entries(row).forEach(([field, value]) => {
      if (field.startsWith('__') || field === 'offershop_source' || field === 'date') return;
      if (typeof value === 'number' || (typeof value === 'string' && /^-?[\d,.]+$/.test(value.trim()))) bucket[field] = n(bucket[field]) + n(value);
    });
    grouped.set(key, bucket);
  });
  return [...grouped.values()].sort((a, b) => n(b.records) - n(a.records));
}
function performanceRow(name: string, row: Record<string, unknown>, pbi: PbiCanonical): PerfRow {
  const spend = n(row.Amount_Spent);
  const fetched = n(row.Fetched_Leads);
  const valid = n(row.Total_Leads_WithValid_Phone_ID) || Math.min(n(row.Valid_IDNumber), n(row.Valid_Phone));
  const delivered = n(row.Total_Leads_Delivered_OnTact) + n(row.Total_Leads_Delivered_MTN) + n(row.Total_Leads_Delivered_Mondo) + n(row.DebtRescue_LeadDelivered) + n(row.Naga_FileDroppedOnFTP);
  const accepted = n(row.Accepted_Leads);
  const sales = n(row.MTN_Sales) + n(row.Total_Leads_Sold_A) + n(row.Total_Leads_Sold_B) + n(row.Total_Leads_Sold_C) + n(row.Total_Leads_Sold_D) + n(row.Total_Leads_Sold_Other);
  const activations = n(row.MTN_Activated_Sales) + (name === 'Power BI' ? pbi.activations : 0);
  const validationRate = ratio(valid, fetched);
  const deliveryRate = ratio(delivered, valid || fetched);
  const acceptanceRate = ratio(accepted, fetched || delivered);
  const salesRate = ratio(sales, accepted || fetched);
  const activationRate = ratio(activations, sales || pbi.captureComplete);
  const scores = [score(validationRate, 0.95), score(deliveryRate, 0.7), score(acceptanceRate, 0.45), score(salesRate, 0.18), score(activationRate, 0.08)];
  return { name, score: average(scores.filter(Number.isFinite)), spend, fetched, valid, delivered, accepted, sales, activations, cpl: ratio(spend, n(row.Form_Completion) || fetched), cpaAccepted: ratio(spend, accepted), validationRate, deliveryRate, acceptanceRate, salesRate, activationRate };
}
function buildMetricRows(analytics: Analytics, totals: Record<string, number>, revenue: ReturnType<typeof calculateCommercialRevenue>, grossProfit: number, pbi: PbiCanonical): MetricRow[] {
  const api = analytics.fieldCatalog.map(field => {
    const raw = field.rawField ?? field.field;
    const additive = isAdditive(field);
    const override = field.source === 'powerbi' && raw === 'count_activation' ? pbi.activations : field.source === 'powerbi' && raw === 'count_capture_complete' ? pbi.captureComplete : field.source === 'powerbi' && raw === 'count_nett_app' ? pbi.nettApps : undefined;
    const value = additive ? (override ?? n(field.total)) : field.nonNull;
    const status = field.pii ? 'protected' : field.nonNull === 0 ? 'missing' : additive && value === 0 ? 'zero' : 'live';
    return { source: field.source ?? 'unknown', metric: title(raw), apiField: raw, group: field.group, role: field.role, status, value: field.pii ? `Protected (${numFmt.format(field.nonNull)})` : additive ? fmt(value, raw) : `${numFmt.format(field.nonNull)} present`, additive: additive ? 'yes' : 'no', formula: additive ? `SUM(${raw}) after filtering${override !== undefined ? ' using canonical Power BI total' : ''}` : 'Presence count after filtering', samples: field.pii ? '[protected]' : field.sampleValues.join(' | ') };
  });
  const d = derived(totals, pbi);
  const derivedRows: MetricRow[] = [
    { source: 'derived', metric: 'Total Revenue', apiField: 'commercial.totalRevenue', group: 'Commercial model', role: 'derived', status: 'derived', value: moneyFmt.format(revenue.totalRevenue), additive: 'no', formula: 'Accepted + BLC + MTN + Mondo rate-card revenue', samples: '' },
    { source: 'derived', metric: 'BLC Revenue', apiField: 'commercial.blcRevenue', group: 'Commercial model', role: 'derived', status: 'derived', value: moneyFmt.format(revenue.blcRevenue), additive: 'no', formula: 'Power BI segment_activations × BLC segment rate card', samples: '' },
    { source: 'derived', metric: 'MTN Revenue', apiField: 'commercial.mtnRevenue', group: 'Commercial model', role: 'derived', status: 'derived', value: moneyFmt.format(revenue.mtnRevenue), additive: 'no', formula: 'MTN_Activated_Sales × R200', samples: '' },
    { source: 'derived', metric: 'Mondo Revenue', apiField: 'commercial.mondoRevenue', group: 'Commercial model', role: 'derived', status: 'derived', value: moneyFmt.format(revenue.mondoRevenue), additive: 'no', formula: 'Mondo sold classes × class rates', samples: '' },
    { source: 'derived', metric: 'Gross Profit', apiField: 'commercial.grossProfit', group: 'Commercial model', role: 'derived', status: 'derived', value: moneyFmt.format(grossProfit), additive: 'no', formula: 'Total revenue - media spend - OnTact fixed Opex', samples: '' },
    { source: 'derived', metric: 'CPL', apiField: 'derived.cpl', group: 'Commercial / cost', role: 'derived', status: 'derived', value: moneyFmt.format(d.cpl), additive: 'no', formula: 'Spend ÷ forms or fetched leads', samples: '' },
    { source: 'derived', metric: 'CPA Accepted', apiField: 'derived.cpaAccepted', group: 'Commercial / cost', role: 'derived', status: 'derived', value: moneyFmt.format(d.cpaAccepted), additive: 'no', formula: 'Spend ÷ Accepted_Leads only', samples: '' }
  ];
  return [...api, ...derivedRows].sort((a, b) => a.source.localeCompare(b.source) || a.group.localeCompare(b.group) || a.metric.localeCompare(b.metric));
}
function journeyRows(totals: Record<string, number>, pbi: PbiCanonical) {
  const d = derived(totals, pbi);
  const rows = [['Spend', d.spend, 'Media investment'], ['Impressions', d.impressions, 'Paid reach proxy'], ['Clicks', d.clicks, 'Traffic action'], ['Forms', d.forms, 'Lead capture'], ['Fetched', d.fetched, 'Lead ingestion'], ['Valid ID + phone', d.valid, 'Data quality'], ['Delivered', d.delivered, 'Vendor / OnTact routing'], ['Accepted', d.accepted, 'TP1 commercial result'], ['Sales', d.sales, 'Downstream conversion'], ['Activations', d.activations, 'Fulfilled result']].filter(row => n(row[1]) > 0);
  return rows.map((row, index) => ({ stage: String(row[0]), value: n(row[1]), rate: index ? ratio(row[1], rows[index - 1][1]) : 1, lost: index ? Math.max(n(rows[index - 1][1]) - n(row[1]), 0) : 0, note: String(row[2]) }));
}
function commercialQa(results: AnalyticsResult[], analytics: Analytics, allMetrics: MetricRow[], pbi: PbiCanonical, rateCardRows: Record<string, unknown>[]) {
  return [
    { check: 'API source health', status: results.length && results.every(result => result.ok) ? 'good' : 'critical', detail: results.map(result => `${result.source}: ${result.ok ? 'synced' : result.error || 'sync failed'}`).join(' | ') || 'No API results.' },
    { check: 'Commercial rate card', status: 'good', detail: 'Mondo A/B/C/D = R75/R17/R10/R10, MTN activation = R200, BLC = segment weighted Power BI activation rates.' },
    { check: 'BLC segment mapping', status: Object.keys(calculateCommercialRevenue({}, analytics.records, 0).segments).length ? 'good' : 'watch', detail: Object.keys(calculateCommercialRevenue({}, analytics.records, 0).segments).length ? 'Power BI segment_activations rows are available and mapped to BLC segment rates.' : 'No Power BI segment_activations rows found; BLC revenue is zero rather than an unlabelled flat fallback.' },
    { check: 'Billable event rows', status: rateCardRows.length ? 'good' : 'critical', detail: `${numFmt.format(rateCardRows.length)} commercial rows generated from the rate card.` },
    { check: 'Exact source mapping', status: analytics.records.some(row => row.offershop_source) ? 'good' : 'watch', detail: 'Sources tab groups exact offershop_source. Vendor tab remains classified operational flow.' },
    { check: 'Accepted vs delivered separation', status: 'good', detail: 'Accepted leads map only from Accepted_Leads. Delivered OnTact/MTN/Mondo remain delivery stages.' },
    { check: 'Power BI double-count guard', status: 'good', detail: `Canonical activations use activation_dates only: ${numFmt.format(pbi.activations)}.` },
    { check: 'All metrics coverage', status: allMetrics.length >= analytics.fieldCatalog.length ? 'good' : 'critical', detail: `${numFmt.format(allMetrics.length)} API and derived metrics visible.` }
  ] as { check: string; status: Status; detail: string }[];
}
function csvDownload(filename: string, rows: Record<string, unknown>[]) {
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  const data = [headers, ...rows.map(row => headers.map(header => row[header] ?? ''))].map(row => row.map(cell => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
function StatusBadge({ status }: { status: Status }) { return <span className={`status ${status}`}>{status}</span>; }
function Card({ title, value, sub, icon: Icon }: { title: string; value: string; sub: string; icon: LucideIcon }) { return <section className="card stat"><div className="stat-icon"><Icon size={18}/></div><div><p>{title}</p><strong>{value}</strong><span>{sub}</span></div></section>; }
function Panel({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) { return <section className="card panel"><div className="panel-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>; }
function Table({ rows, columns }: { rows: Record<string, unknown>[]; columns?: string[] }) {
  const keys = columns ?? Array.from(new Set(rows.flatMap(row => Object.keys(row)))).slice(0, 80);
  if (!rows.length) return <div className="empty-state"><b>No rows returned</b><span>Sync the live API or adjust filters.</span></div>;
  return <div className="table-wrap"><table><thead><tr>{keys.map(key => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{keys.map(key => <td key={key}>{String(row[key] ?? '')}</td>)}</tr>)}</tbody></table></div>;
}
function AssumptionInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) { return <label className="assumption"><span>{label}</span><input type="number" value={value} onChange={event => onChange(Number(event.target.value) || 0)}/></label>; }

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
  const [metricStatus, setMetricStatus] = useState('all');
  const [metricSource, setMetricSource] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assumptions, setAssumptions] = useState(DEFAULT_ASSUMPTIONS);

  async function fetchOne(target: AtomicSource, mode: ApiSource): Promise<AnalyticsResult> {
    const rowLimit = mode === 'unified' && target === 'ontact' ? '1000' : maxRows;
    const params = new URLSearchParams({ source: target, maxRows: rowLimit, recordLimit });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const response = await fetch(`/api/analytics?${params}`, { cache: 'no-store' });
    const data = await response.json();
    if (!isPayload(data)) throw new Error(`${target} returned an unexpected payload.`);
    return data.results[0] ?? { source: target, ok: false, configured: true, error: `${target} returned no result.` };
  }
  async function load(next: ApiSource = source) {
    setLoading(true);
    setError('');
    const targets: AtomicSource[] = next === 'unified' ? ['onvest', 'ontact', 'powerbi'] : [next as AtomicSource];
    const settled = await Promise.allSettled(targets.map(target => fetchOne(target, next)));
    const results = settled.map((result, index): AnalyticsResult => result.status === 'fulfilled' ? result.value : { source: targets[index], ok: false, configured: true, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
    const live = { ok: results.every(result => result.ok), mode: next === 'unified' ? 'client-side-unified-live-api-sync' : 'single-source-live-api-sync', generatedAt: new Date().toISOString(), results };
    setPayload(live);
    if (!live.ok) setError(results.filter(result => !result.ok).map(result => `${result.source}: ${result.error || 'sync failed'}`).join(' | '));
    setLoading(false);
  }
  useEffect(() => { void load('unified'); }, []);

  const results = payload?.results ?? [];
  const single = source === 'unified' ? undefined : results.find(result => result.source === source) ?? results[0];
  const analytics = source === 'unified' ? mergeAnalytics(results) : single?.ok ? single.analytics ?? emptyAnalytics() : emptyAnalytics();
  const pbi = useMemo(() => canonicalPowerBi(analytics.records), [analytics.records]);
  const totals = analytics.totals;
  const core = derived(totals, pbi);
  const commercial = calculateCommercialRevenue(totals, analytics.records, assumptions.acceptedFee);
  const ontactOpex = assumptions.ontactAgents * assumptions.ontactOpexPerAgent;
  const grossProfit = commercial.totalRevenue - core.spend - ontactOpex;
  const margin = ratio(grossProfit, commercial.totalRevenue);
  const breakEvenAcceptedFee = core.accepted ? (core.spend + ontactOpex - commercial.blcRevenue - commercial.mtnRevenue - commercial.mondoRevenue) / core.accepted : 0;
  const rateCardRows = commercial.rows.map(row => ({ ...row, rate: moneyFmt.format(row.rate), revenue: moneyFmt.format(row.revenue) }));
  const allMetrics = useMemo(() => buildMetricRows(analytics, totals, commercial, grossProfit, pbi), [analytics, totals, commercial, grossProfit, pbi]);
  const exactSources = groupExactSources(analytics.records).map(row => performanceRow(String(row.source), row, pbi)).filter(row => row.fetched || row.accepted || row.spend || row.sales).sort((a, b) => b.score - a.score);
  const vendors = analytics.byVendor.map(row => performanceRow(String(row.vendor ?? 'Unknown'), row, pbi)).filter(row => row.fetched || row.accepted || row.sales || row.name === 'Power BI').sort((a, b) => b.score - a.score);
  const metricGroups = [...new Set(allMetrics.map(metric => metric.group))].sort();
  const metricSources = [...new Set(allMetrics.map(metric => metric.source))].sort();
  const filteredMetrics = allMetrics.filter(metric => (metricGroup === 'all' || metric.group === metricGroup) && (metricStatus === 'all' || metric.status === metricStatus) && (metricSource === 'all' || metric.source === metricSource) && (!fieldSearch || `${metric.source} ${metric.apiField} ${metric.metric} ${metric.group} ${metric.role}`.toLowerCase().includes(fieldSearch.toLowerCase())));
  const records = analytics.records.filter(record => !search || Object.values(record).some(value => String(value ?? '').toLowerCase().includes(search.toLowerCase()))).slice(0, 500);
  const mediaRows = analytics.byDate.map(row => ({ date: row.date, spend: n(row.Amount_Spent), impressions: n(row.Impressions), clicks: n(row.Clicks), forms: n(row.Form_Completion), cpl: ratio(row.Amount_Spent, n(row.Form_Completion) || n(row.Fetched_Leads)) }));
  const agentRows = analytics.byAgent.slice(0, 20).map(row => ({ agent: row.agent, records: row.records, calls: row.__call_records ?? row.records, talkSeconds: row.length_in_sec, avgSeconds: decFmt.format(ratio(row.length_in_sec, row.records)), sales: row.MTN_Sales ?? 0 }));
  const qaRows = commercialQa(results, analytics, allMetrics, pbi, rateCardRows);
  const tabs: { id: Tab; label: string }[] = ['command', 'allMetrics', 'journey', 'sources', 'vendors', 'ontact', 'media', 'commercials', 'powerbi', 'explorer', 'qa'].map(id => ({ id: id as Tab, label: title(id === 'allMetrics' ? 'All Metrics' : id) }));

  return <main><aside className="sidebar"><div className="brand"><div className="brand-mark">CIQ</div><div><b>ConvertIQ</b><span>Performance Analytics</span></div></div><nav>{tabs.map(item => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav><div className="sync-panel"><ShieldCheck size={18}/><b>API-only production mode</b><span>Revenue uses the formal Mondo, BLC and MTN commercial rate card.</span></div></aside><section className="workspace">
    <header className="hero"><div><p className="eyebrow">Live API sync · rate-card revenue · corrected mapping</p><h1>ConvertIQ Performance Command Center</h1><p>Commercial revenue is calculated from billable events: Mondo sold classes, BLC Power BI activation segments, and MTN activated sales.</p></div><button className="primary" onClick={() => load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/>{loading ? 'Syncing' : 'Sync dashboard'}</button></header>
    <section className="controls card"><SlidersHorizontal size={18}/><select value={source} onChange={event => { const next = event.target.value as ApiSource; setSource(next); void load(next); }}><option value="unified">Unified Dashboard</option><option value="onvest">Onvest API</option><option value="ontact">Ontact API</option><option value="powerbi">Power BI QueryData</option></select><input type="date" value={from} onChange={event => setFrom(event.target.value)}/><input type="date" value={to} onChange={event => setTo(event.target.value)}/><select value={maxRows} onChange={event => setMaxRows(event.target.value)}><option value="1000">1,000 rows</option><option value="5000">5,000 rows</option><option value="10000">10,000 rows</option><option value="15000">15,000 rows</option></select><select value={recordLimit} onChange={event => setRecordLimit(event.target.value)}><option value="250">Show 250</option><option value="1000">Show 1,000</option><option value="2500">Show 2,500</option><option value="5000">Show 5,000</option></select><button onClick={() => load()}>Apply</button><span>{payload ? `Last sync: ${new Date(payload.generatedAt).toLocaleString()}` : 'Waiting for API sync'}</span></section>
    {error && <section className="notice">{error}</section>}
    <section className="source-grid">{results.map(result => <section className="card source-card" key={result.source}><span className={result.ok ? 'pill ok' : 'pill warn'}>{result.ok ? 'API synced' : 'Attention'}</span><h3>{result.source.toUpperCase()}</h3><p>{numFmt.format(result.rows ?? 0)} rows · {numFmt.format(result.analytics?.fieldCatalog.length ?? 0)} parameters {result.truncated ? '· capped' : ''}</p></section>)}<section className="card source-card"><span className="pill ok">Coverage</span><h3>{numFmt.format(allMetrics.length)}</h3><p>API + derived metrics visible.</p></section></section>
    {tab === 'command' && <><section className="kpi-grid"><Card title="Total Revenue" value={moneyFmt.format(commercial.totalRevenue)} sub="TP1 + BLC + MTN + Mondo" icon={WalletCards}/><Card title="Gross Profit" value={moneyFmt.format(grossProfit)} sub={`${pctFmt.format(margin)} margin`} icon={TrendingUp}/><Card title="Spend" value={moneyFmt.format(core.spend)} sub="Media cost" icon={DatabaseZap}/><Card title="BLC Revenue" value={moneyFmt.format(commercial.blcRevenue)} sub="Power BI segments × rates" icon={Layers3}/><Card title="MTN Revenue" value={moneyFmt.format(commercial.mtnRevenue)} sub="Activated sales × R200" icon={CheckCircle2}/><Card title="Mondo Revenue" value={moneyFmt.format(commercial.mondoRevenue)} sub="Sold A/B/C/D classes" icon={ListChecks}/></section><section className="grid two"><Panel title="Performance trend"><ResponsiveContainer width="100%" height={330}><AreaChart data={analytics.byDate}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area dataKey="Amount_Spent" name="Spend"/><Area dataKey="Accepted_Leads" name="Accepted"/><Area dataKey="MTN_Sales" name="MTN Sales"/><Area dataKey="count_activation" name="Activations"/></AreaChart></ResponsiveContainer></Panel><Panel title="Commercial QA"><div className="diagnostic-list">{qaRows.map(item => <article className={`diagnostic ${item.status}`} key={item.check}><AlertTriangle size={16}/><div><b>{item.check}</b><span>{item.detail}</span></div><StatusBadge status={item.status}/></article>)}</div></Panel></section></>}
    {tab === 'allMetrics' && <><section className="metric-hero card"><div><span>All metrics cockpit</span><h2>{numFmt.format(allMetrics.length)} metrics visible</h2><p>Includes live fields, formal rate-card revenue metrics, protected PII markers and Power BI canonical totals.</p></div><div className="metric-hero-grid"><article><span>API fields</span><strong>{numFmt.format(allMetrics.filter(metric => metric.source !== 'derived').length)}</strong></article><article><span>Derived</span><strong>{numFmt.format(allMetrics.filter(metric => metric.source === 'derived').length)}</strong></article><article><span>Live</span><strong>{numFmt.format(allMetrics.filter(metric => metric.status === 'live').length)}</strong></article><article><span>Protected</span><strong>{numFmt.format(allMetrics.filter(metric => metric.status === 'protected').length)}</strong></article></div></section><Panel title="Metric controls" action={<button className="secondary" onClick={() => csvDownload('convertiq-all-metrics.csv', filteredMetrics)}><Download size={14}/>Export</button>}><div className="metric-controls"><div className="inline-tools"><Search size={16}/><input placeholder="Search metric" value={fieldSearch} onChange={event => setFieldSearch(event.target.value)}/></div><select value={metricSource} onChange={event => setMetricSource(event.target.value)}><option value="all">All sources</option>{metricSources.map(item => <option key={item}>{item}</option>)}</select><select value={metricGroup} onChange={event => setMetricGroup(event.target.value)}><option value="all">All groups</option>{metricGroups.map(item => <option key={item}>{item}</option>)}</select><select value={metricStatus} onChange={event => setMetricStatus(event.target.value)}><option value="all">All statuses</option><option value="live">Live</option><option value="zero">Zero</option><option value="protected">Protected</option><option value="derived">Derived</option><option value="missing">Missing</option></select></div></Panel><Panel title="Complete metric audit table"><Table rows={filteredMetrics}/></Panel></>}
    {tab === 'journey' && <section className="grid two"><Panel title="Full-funnel waterfall"><ResponsiveContainer width="100%" height={460}><FunnelChart><Tooltip/><Funnel dataKey="value" data={journeyRows(totals, pbi)}><LabelList position="right" fill="#17202a" stroke="none" dataKey="stage"/></Funnel></FunnelChart></ResponsiveContainer></Panel><Panel title="Leakage audit"><Table rows={journeyRows(totals, pbi).map(row => ({ stage: row.stage, value: numFmt.format(row.value), stepRate: pctFmt.format(row.rate), lost: numFmt.format(row.lost), note: row.note }))}/></Panel></section>}
    {tab === 'sources' && <><section className="grid two"><Panel title="Exact source score ranking"><ResponsiveContainer width="100%" height={360}><BarChart data={exactSources.slice(0, 14)}><CartesianGrid vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="score"/></BarChart></ResponsiveContainer></Panel><Panel title="Source economics"><ResponsiveContainer width="100%" height={360}><BarChart data={exactSources.slice(0, 14)}><CartesianGrid vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="spend"/><Bar dataKey="accepted"/></BarChart></ResponsiveContainer></Panel></section><Panel title="Source performance matrix"><Table rows={exactSources.map(row => ({ source: row.name, score: decFmt.format(row.score), spend: moneyFmt.format(row.spend), fetched: numFmt.format(row.fetched), accepted: numFmt.format(row.accepted), sales: numFmt.format(row.sales), cpaAccepted: row.cpaAccepted ? moneyFmt.format(row.cpaAccepted) : '-' }))}/></Panel></>}
    {tab === 'vendors' && <section className="grid two"><Panel title="Vendor delivery matrix"><Table rows={[{ vendor: 'BLC / OnTact', delivered: totals.Total_Leads_Delivered_OnTact ?? 0, revenue: moneyFmt.format(commercial.blcRevenue) }, { vendor: 'MTN', sales: totals.MTN_Sales ?? 0, activated: totals.MTN_Activated_Sales ?? 0, revenue: moneyFmt.format(commercial.mtnRevenue) }, { vendor: 'Mondo', soldA: totals.Total_Leads_Sold_A ?? 0, soldB: totals.Total_Leads_Sold_B ?? 0, soldC: totals.Total_Leads_Sold_C ?? 0, soldD: totals.Total_Leads_Sold_D ?? 0, revenue: moneyFmt.format(commercial.mondoRevenue) }]}/></Panel><Panel title="Vendor composition"><ResponsiveContainer width="100%" height={360}><BarChart data={vendors.slice(0, 12)}><CartesianGrid vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="fetched"/><Bar dataKey="accepted"/><Bar dataKey="sales"/></BarChart></ResponsiveContainer></Panel></section>}
    {tab === 'ontact' && <><section className="kpi-grid compact"><Card title="Call Records" value={numFmt.format(core.calls)} sub="Ontact rows / records" icon={UsersRound}/><Card title="Talk Time" value={`${decFmt.format(core.talkSeconds / 3600)}h`} sub="length_in_sec" icon={Gauge}/><Card title="Answer Rate" value={pctFmt.format(ratio(core.answered, core.dialed))} sub={`${numFmt.format(core.answered)} answered`} icon={CheckCircle2}/><Card title="RPC Rate" value={pctFmt.format(ratio(core.rpc, core.answered))} sub={`${numFmt.format(core.rpc)} RPC`} icon={Target}/></section><Panel title="Agent productivity"><Table rows={agentRows}/></Panel></>}
    {tab === 'media' && <><section className="kpi-grid compact"><Card title="Impressions" value={numFmt.format(core.impressions)} sub="Media delivery" icon={Layers3}/><Card title="Clicks" value={numFmt.format(core.clicks)} sub={`${pctFmt.format(ratio(core.clicks, core.impressions))} CTR`} icon={BarChart3}/><Card title="Landing Views" value={numFmt.format(core.lpv)} sub="LPV" icon={BarChart3}/><Card title="Forms" value={numFmt.format(core.forms)} sub={`${moneyFmt.format(core.cpl)} CPL`} icon={ListChecks}/></section><Panel title="Media efficiency by day"><ResponsiveContainer width="100%" height={380}><LineChart data={mediaRows}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line dataKey="spend"/><Line dataKey="clicks"/><Line dataKey="forms"/><Line dataKey="cpl"/></LineChart></ResponsiveContainer></Panel></>}
    {tab === 'commercials' && <><section className="assumptions card"><AssumptionInput label="TP1 accepted fee" value={assumptions.acceptedFee} onChange={value => setAssumptions({ ...assumptions, acceptedFee: value })}/><AssumptionInput label="OnTact agents" value={assumptions.ontactAgents} onChange={value => setAssumptions({ ...assumptions, ontactAgents: value })}/><AssumptionInput label="Opex / agent" value={assumptions.ontactOpexPerAgent} onChange={value => setAssumptions({ ...assumptions, ontactOpexPerAgent: value })}/></section><section className="kpi-grid"><Card title="Total Revenue" value={moneyFmt.format(commercial.totalRevenue)} sub="TP1 + BLC + MTN + Mondo" icon={WalletCards}/><Card title="BLC Revenue" value={moneyFmt.format(commercial.blcRevenue)} sub="Segment weighted Power BI" icon={Layers3}/><Card title="Mondo Revenue" value={moneyFmt.format(commercial.mondoRevenue)} sub="A/B/C/D class rates" icon={BarChart3}/><Card title="MTN Revenue" value={moneyFmt.format(commercial.mtnRevenue)} sub="Activated sales × R200" icon={CheckCircle2}/><Card title="Accepted Revenue" value={moneyFmt.format(commercial.acceptedRevenue)} sub={`${numFmt.format(core.accepted)} accepted`} icon={Target}/><Card title="Break-even TP1" value={moneyFmt.format(breakEvenAcceptedFee)} sub="Accepted fee needed" icon={Gauge}/></section><Panel title="Commercial rate card revenue breakdown"><Table rows={rateCardRows}/></Panel></>}
    {tab === 'powerbi' && <section className="grid two"><Panel title="Power BI canonical summary"><Table rows={[{ metric: 'Canonical activations', value: numFmt.format(pbi.activations) }, { metric: 'Canonical capture complete', value: numFmt.format(pbi.captureComplete) }, { metric: 'Canonical nett apps', value: numFmt.format(pbi.nettApps) }, { metric: 'BLC segment revenue', value: moneyFmt.format(commercial.blcRevenue) }, { metric: 'Endpoint', value: results.find(result => result.source === 'powerbi')?.queryDataEndpoint ?? 'Unavailable' }]}/></Panel><Panel title="BLC activation segments"><Table rows={Object.entries(RATE_CARD.blc).map(([segment, config]) => ({ segment, activations: commercial.segments[segment as keyof typeof commercial.segments] ?? 0, rate: moneyFmt.format(config.rate), revenue: moneyFmt.format((commercial.segments[segment as keyof typeof commercial.segments] ?? 0) * config.rate) }))}/></Panel></section>}
    {tab === 'explorer' && <Panel title="Redacted row explorer" action={<div className="inline-tools"><Search size={16}/><input placeholder="Search rows" value={search} onChange={event => setSearch(event.target.value)}/><button className="secondary" onClick={() => csvDownload('convertiq-redacted-rows.csv', records)}><Download size={14}/>Export</button></div>}><Table rows={records} columns={analytics.columns}/></Panel>}
    {tab === 'qa' && <section className="grid two"><Panel title="QA checks"><div className="diagnostic-list">{qaRows.map(item => <article className={`diagnostic ${item.status}`} key={item.check}><ShieldCheck size={16}/><div><b>{item.check}</b><span>{item.detail}</span></div><StatusBadge status={item.status}/></article>)}</div></Panel><Panel title="Commercial rate card"><Table rows={rateCardRows}/></Panel><Panel title="Universal filter audit"><Table rows={results.map(result => ({ source: result.source, status: result.ok ? 'synced' : 'attention', rawRows: result.rawRows ?? result.upstreamCount ?? 0, filteredRows: result.filteredRows ?? result.rows ?? 0, excludedByDate: result.excludedByDate ?? 0, undatedExcluded: result.undatedRowsExcluded ?? 0, from: result.filters?.from ?? '', to: result.filters?.to ?? '', strategy: result.filters?.strategy ?? 'source-level' }))}/></Panel></section>}
  </section></main>;
}
createRoot(document.getElementById('root')!).render(<App />);
