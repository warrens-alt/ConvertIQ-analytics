import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, BarChart3, CheckCircle2, DatabaseZap, Download, Filter, Gauge, Layers3, ListChecks, PhoneCall, RefreshCw, Search, ShieldCheck, SlidersHorizontal, Target, TrendingUp, UsersRound, WalletCards, type LucideIcon } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { calculateCommercialRevenue } from './commercialRateCard';
import { buildSourceMarginRows, summarizeSourceMargins, type SourceMarginRow } from './analytics/sourceMargin';
import { buildSourcePropensityRows, summarizePropensity, type SourcePropensityRow } from './analytics/sourcePropensity';
import { summarizeCallCenterEfficiency } from './analytics/callCenterEfficiency';
import { summarizeFunnelLeakage } from './analytics/funnelLeakage';
import { buildProductPropensityRows, summarizeProductPropensity } from './analytics/productPropensity';
import CallCenterEfficiencyPanel from './components/CallCenterEfficiencyPanel';
import FunnelLeakagePanel from './components/FunnelLeakagePanel';
import ProductPropensityPanel from './components/ProductPropensityPanel';
import { CommercialBridge, MetricFlow, SignalGrid, TabBrief, type BridgeRow, type FlowStage, type SignalItem } from './components/TabExperience';

type AtomicSource = 'onvest' | 'ontact' | 'powerbi';
type Tab = 'command' | 'journey' | 'ontact' | 'offernet' | 'vendors' | 'pnl' | 'qa';
type Depth = 'executive' | 'analytical' | 'complete';
type Analytics = {
  totals?: Record<string, number>;
  byDate?: Record<string, unknown>[];
  byVendor?: Record<string, unknown>[];
  byAgent?: Record<string, unknown>[];
  byStatus?: Record<string, unknown>[];
  fieldCatalog?: Array<{ field: string; group: string; role: string; pii?: boolean; nonNull?: number; total?: number; numeric?: boolean; source?: string; rawField?: string }>;
  records?: Record<string, unknown>[];
  recordsReturned?: number;
};
type Result = {
  source: string;
  ok: boolean;
  configured?: boolean;
  rows?: number;
  previewRows?: number;
  rawRows?: number;
  filteredRows?: number;
  excludedByDate?: number;
  undatedRowsExcluded?: number;
  upstreamCount?: number;
  totalsUsePreviewRows?: boolean;
  error?: string;
  filters?: { from?: string; to?: string; strategy?: string; applied?: boolean };
  analytics?: Analytics;
};
type Payload = { ok: boolean; mode: string; generatedAt: string; results: Result[] };
type Assumptions = { acceptedFee: number; ontactAgents: number; ontactOpexPerAgent: number };
type Recommendation = { priority: 'High' | 'Medium' | 'Low'; area: string; action: string; reason: string };

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const dec = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 });
const DEFAULT_ASSUMPTIONS: Assumptions = { acceptedFee: 35, ontactAgents: 0, ontactOpexPerAgent: 0 };

const n = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
};
const ratio = (top: unknown, bottom: unknown): number => {
  const denominator = n(bottom);
  return denominator ? n(top) / denominator : 0;
};
const sourceLabel = (source: string) => source === 'onvest' ? 'Onvest Pipeline' : source === 'ontact' ? 'OnTact Dialler' : source === 'powerbi' ? 'Power BI Activations' : source;
const tableLimit = (depth: Depth) => depth === 'executive' ? 20 : depth === 'analytical' ? 60 : 180;
const isPayload = (value: unknown): value is Payload => Boolean(value && typeof value === 'object' && Array.isArray((value as Payload).results));
const toneFor = (value: number, good = 0.7, watch = 0.35): 'good' | 'watch' | 'critical' => value >= good ? 'good' : value >= watch ? 'watch' : 'critical';

function mergeResults(results: Result[]) {
  const records: Record<string, unknown>[] = [];
  const totals: Record<string, number> = { records: 0 };
  const byDate = new Map<string, Record<string, unknown>>();
  const byVendor = new Map<string, Record<string, unknown>>();
  const byAgent = new Map<string, Record<string, unknown>>();
  const byStatus = new Map<string, Record<string, unknown>>();
  const fieldCatalog: NonNullable<Analytics['fieldCatalog']> = [];
  const addBucket = (map: Map<string, Record<string, unknown>>, keyName: string, row: Record<string, unknown>) => {
    const key = String(row[keyName] ?? 'Unknown');
    const bucket = map.get(key) ?? { [keyName]: key, records: 0 };
    Object.entries(row).forEach(([field, value]) => {
      if (field === keyName) return;
      if (typeof value === 'number' || (typeof value === 'string' && /^-?[\d,.]+$/.test(value.trim()))) bucket[field] = n(bucket[field]) + n(value);
    });
    map.set(key, bucket);
  };
  results.filter((result) => result.ok && result.analytics).forEach((result) => {
    const analytics = result.analytics!;
    Object.entries(analytics.totals ?? {}).forEach(([field, value]) => { totals[field] = (totals[field] ?? 0) + n(value); });
    fieldCatalog.push(...(analytics.fieldCatalog ?? []).map((field) => ({ ...field, source: result.source, rawField: field.field, field: `${result.source}.${field.field}` })));
    records.push(...(analytics.records ?? []).map((record) => ({ __source: result.source, ...record })));
    (analytics.byDate ?? []).forEach((row) => addBucket(byDate, 'date', row));
    (analytics.byVendor ?? []).forEach((row) => addBucket(byVendor, 'vendor', row));
    (analytics.byAgent ?? []).forEach((row) => addBucket(byAgent, 'agent', row));
    (analytics.byStatus ?? []).forEach((row) => addBucket(byStatus, 'status', row));
  });
  totals.records = records.length;
  return { records, totals, fieldCatalog, byDate: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))), byVendor: [...byVendor.values()].sort((a, b) => n(b.records) - n(a.records)), byAgent: [...byAgent.values()].sort((a, b) => n(b.records) - n(a.records)), byStatus: [...byStatus.values()].sort((a, b) => n(b.records) - n(a.records)) };
}

function coreMetrics(totals: Record<string, number>, powerBiRecords: Record<string, unknown>[]) {
  const pbiActivations = powerBiRecords.filter((row) => row.query === 'activation_dates').reduce((sum, row) => sum + n(row.count_activation), 0);
  const mondoSales = n(totals.Total_Leads_Sold_A) + n(totals.Total_Leads_Sold_B) + n(totals.Total_Leads_Sold_C) + n(totals.Total_Leads_Sold_D) + n(totals.Total_Leads_Sold_Other);
  const delivered = n(totals.Total_Leads_Delivered_OnTact) + n(totals.Total_Leads_Delivered_MTN) + n(totals.Total_Leads_Delivered_Mondo) + n(totals.DebtRescue_LeadDelivered) + n(totals.Naga_FileDroppedOnFTP);
  const accepted = n(totals.Accepted_Leads);
  const sales = n(totals.MTN_Sales) + mondoSales;
  return { spend: n(totals.Amount_Spent), impressions: n(totals.Impressions), clicks: n(totals.Clicks), landingViews: n(totals.Landing_Page_View), forms: n(totals.Form_Completion), fetched: n(totals.Fetched_Leads), valid: n(totals.Total_Leads_WithValid_Phone_ID) || Math.min(n(totals.Valid_IDNumber), n(totals.Valid_Phone)), delivered, accepted, sales, activations: n(totals.MTN_Activated_Sales) + pbiActivations, dialed: n(totals.MTN_Dialed_Leads), answered: n(totals.MTN_Answered_Calls), rpc: n(totals.MTN_Right_Party_Contact), cpl: ratio(totals.Amount_Spent, n(totals.Form_Completion) || n(totals.Fetched_Leads)), cpaAccepted: ratio(totals.Amount_Spent, accepted) };
}

function buildRecommendations(args: { marginRows: SourceMarginRow[]; propensityRows: SourcePropensityRow[]; callSummary: ReturnType<typeof summarizeCallCenterEfficiency>; funnelSummary: ReturnType<typeof summarizeFunnelLeakage>; productSummary: ReturnType<typeof summarizeProductPropensity>; }): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const bestMargin = args.marginRows[0];
  const lossSource = [...args.marginRows].sort((a, b) => a.grossProfit - b.grossProfit)[0];
  const bestPropensity = args.propensityRows[0];
  if (bestMargin && bestMargin.grossProfit > 0) recommendations.push({ priority: 'High', area: 'Source margin', action: `Scale ${bestMargin.source}`, reason: `${money.format(bestMargin.grossProfit)} gross profit and ${dec.format(bestMargin.roas)}x ROAS.` });
  if (lossSource && lossSource.grossProfit < 0) recommendations.push({ priority: 'High', area: 'Budget control', action: `Review spend on ${lossSource.source}`, reason: `${money.format(lossSource.grossProfit)} gross profit with ${pct.format(lossSource.grossMargin)} margin.` });
  if (bestPropensity && bestPropensity.score >= 70) recommendations.push({ priority: 'High', area: 'Predictive routing', action: `Prioritise ${bestPropensity.source}`, reason: `Propensity score ${bestPropensity.score}; ${bestPropensity.routingTier}.` });
  if (args.callSummary.reviewAgents > 0) recommendations.push({ priority: 'Medium', area: 'OnTact coaching', action: 'Review flagged agents', reason: `${num.format(args.callSummary.reviewAgents)} agents flagged for short-call, long-call or low-conversion behaviour.` });
  if (args.funnelSummary.criticalLeaks > 0) recommendations.push({ priority: 'High', area: 'Funnel leakage', action: `Fix ${args.funnelSummary.highestLeakageStage}`, reason: `${pct.format(args.funnelSummary.highestLeakageRate)} leakage at the weakest stage.` });
  if (args.productSummary.scaleProducts > 0) recommendations.push({ priority: 'Medium', area: 'Product routing', action: `Scale ${args.productSummary.bestProduct}`, reason: `Best product score ${args.productSummary.bestProductScore}.` });
  return recommendations.length ? recommendations : [{ priority: 'Low', area: 'Data readiness', action: 'Continue collecting live API records', reason: 'No strong prescriptive action was triggered yet.' }];
}

function Card({ title, value, sub, icon: Icon }: { title: string; value: string; sub: string; icon: LucideIcon }) {
  return <section className="card stat"><div className="stat-icon"><Icon size={18}/></div><div><p>{title}</p><strong>{value}</strong><span>{sub}</span></div></section>;
}
function Panel({ title, sub, children, action }: { title: string; sub?: string; children: ReactNode; action?: ReactNode }) {
  return <section className="card panel"><div className="panel-head"><div><h2>{title}</h2>{sub && <p>{sub}</p>}</div>{action}</div>{children}</section>;
}
function Table({ rows }: { rows: Record<string, unknown>[] }) {
  const keys = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).slice(0, 80);
  if (!rows.length) return <div className="empty-state"><b>No rows returned</b><span>Sync the live API or adjust filters.</span></div>;
  return <div className="table-wrap"><table><thead><tr>{keys.map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{keys.map((key) => <td key={key}>{String(row[key] ?? '')}</td>)}</tr>)}</tbody></table></div>;
}
function AssumptionInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="assumption"><span>{label}</span><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value) || 0)} /></label>;
}
function csv(name: string, rows: Record<string, unknown>[]) {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const data = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdvancedAnalyticsApp() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [tab, setTab] = useState<Tab>('command');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [depth, setDepth] = useState<Depth>('analytical');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [assumptions, setAssumptions] = useState<Assumptions>(DEFAULT_ASSUMPTIONS);

  async function fetchSource(source: AtomicSource): Promise<Result> {
    const params = new URLSearchParams({ source });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const response = await fetch(`/api/analytics?${params}`, { cache: 'no-store' });
    const data = await response.json();
    if (!isPayload(data)) throw new Error(`${source} returned an unexpected payload.`);
    return data.results[0] ?? { source, ok: false, error: `${source} returned no result.` };
  }
  async function load() {
    setLoading(true);
    setError('');
    const sources: AtomicSource[] = ['onvest', 'ontact', 'powerbi'];
    const settled = await Promise.allSettled(sources.map((source) => fetchSource(source)));
    const results = settled.map((result, index): Result => result.status === 'fulfilled' ? result.value : { source: sources[index], ok: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason) });
    const nextPayload = { ok: results.every((result) => result.ok), mode: 'integrated-advanced-analytics', generatedAt: new Date().toISOString(), results };
    setPayload(nextPayload);
    if (!nextPayload.ok) setError(results.filter((result) => !result.ok).map((result) => `${sourceLabel(result.source)}: ${result.error ?? 'sync failed'}`).join(' | '));
    setLoading(false);
  }
  useEffect(() => { void load(); }, []);

  const merged = useMemo(() => mergeResults(payload?.results ?? []), [payload]);
  const onvestRecords = useMemo(() => merged.records.filter((record) => record.__source === 'onvest'), [merged.records]);
  const ontactRecords = useMemo(() => merged.records.filter((record) => record.__source === 'ontact'), [merged.records]);
  const powerBiRecords = useMemo(() => merged.records.filter((record) => record.__source === 'powerbi'), [merged.records]);
  const core = useMemo(() => coreMetrics(merged.totals, powerBiRecords), [merged.totals, powerBiRecords]);
  const sourceMargins = useMemo(() => buildSourceMarginRows(merged.records), [merged.records]);
  const marginSummary = useMemo(() => summarizeSourceMargins(sourceMargins), [sourceMargins]);
  const propensityRows = useMemo(() => buildSourcePropensityRows(merged.records, sourceMargins), [merged.records, sourceMargins]);
  const propensitySummary = useMemo(() => summarizePropensity(propensityRows), [propensityRows]);
  const callSummary = useMemo(() => summarizeCallCenterEfficiency(ontactRecords), [ontactRecords]);
  const funnelSummary = useMemo(() => summarizeFunnelLeakage(onvestRecords), [onvestRecords]);
  const productRows = useMemo(() => buildProductPropensityRows(ontactRecords), [ontactRecords]);
  const productSummary = useMemo(() => summarizeProductPropensity(productRows), [productRows]);
  const commercial = useMemo(() => calculateCommercialRevenue(merged.totals, merged.records, assumptions.acceptedFee), [merged.totals, merged.records, assumptions.acceptedFee]);
  const ontactOpex = assumptions.ontactAgents * assumptions.ontactOpexPerAgent;
  const grossProfit = commercial.totalRevenue - core.spend - ontactOpex;
  const recommendations = useMemo(() => buildRecommendations({ marginRows: sourceMargins, propensityRows, callSummary, funnelSummary, productSummary }), [sourceMargins, propensityRows, callSummary, funnelSummary, productSummary]);
  const limit = tableLimit(depth);
  const trendRows = merged.byDate.map((row) => ({ date: row.date, spend: n(row.Amount_Spent), forms: n(row.Form_Completion), accepted: n(row.Accepted_Leads), sales: n(row.MTN_Sales), activations: n(row.MTN_Activated_Sales) + n(row.count_activation) }));
  const filteredFields = merged.fieldCatalog.filter((field) => !search || `${field.source} ${field.field} ${field.group} ${field.role}`.toLowerCase().includes(search.toLowerCase())).slice(0, limit);
  const marginTableRows = sourceMargins.slice(0, limit).map((row) => ({ source: row.source, date: row.date, revenue: money.format(row.totalRevenue), spend: money.format(row.adSpend), grossProfit: money.format(row.grossProfit), margin: pct.format(row.grossMargin), roas: `${dec.format(row.roas)}x`, cpaAccepted: row.cpaAccepted ? money.format(row.cpaAccepted) : '-', band: row.profitBand }));
  const propensityTableRows = propensityRows.slice(0, limit).map((row) => ({ source: row.source, date: row.date, score: row.score, probability: pct.format(row.probability), routing: row.routingTier, quality: dec.format(row.qualityScore), conversion: dec.format(row.conversionScore), commercial: dec.format(row.commercialScore), reason: row.reason }));
  const qaRows = (payload?.results ?? []).map((result) => ({ source: sourceLabel(result.source), status: result.ok ? 'synced' : 'attention', rawRows: result.rawRows ?? result.upstreamCount ?? 0, filteredRows: result.filteredRows ?? result.rows ?? 0, previewRows: result.previewRows ?? result.analytics?.recordsReturned ?? 0, totalsUsePreviewRows: result.totalsUsePreviewRows === false ? 'No' : 'Route dependent', excludedByDate: result.excludedByDate ?? 0, undatedExcluded: result.undatedRowsExcluded ?? 0, strategy: result.filters?.strategy ?? 'source-level' }));

  const journeyStages: FlowStage[] = [
    { label: 'Media Spend', value: money.format(core.spend), sub: 'Amount_Spent from Onvest', owner: 'Offernet', tone: core.spend ? 'good' : 'watch' },
    { label: 'Fetched Leads', value: num.format(core.fetched), sub: `${money.format(core.cpl)} CPL`, owner: 'Offernet', tone: core.fetched ? 'good' : 'watch' },
    { label: 'Valid Phone + ID', value: num.format(core.valid), sub: `${pct.format(ratio(core.valid, core.fetched))} of fetched`, owner: 'Data QA', tone: toneFor(ratio(core.valid, core.fetched)) },
    { label: 'Delivered', value: num.format(core.delivered), sub: `${pct.format(ratio(core.delivered, core.valid || core.fetched))} delivery rate`, owner: 'Routing', tone: toneFor(ratio(core.delivered, core.valid || core.fetched)) },
    { label: 'Accepted', value: num.format(core.accepted), sub: `${money.format(core.cpaAccepted)} CPA accepted`, owner: 'Offernet TP1', tone: core.accepted ? 'good' : 'watch' },
    { label: 'RPC', value: num.format(core.rpc), sub: `${pct.format(ratio(core.rpc, core.answered || core.dialed))} contact quality`, owner: 'OnTact', tone: toneFor(ratio(core.rpc, core.answered || core.dialed)) },
    { label: 'Sales', value: num.format(core.sales), sub: `${pct.format(ratio(core.sales, core.rpc || core.accepted))} conversion`, owner: 'Vendor / OnTact', tone: toneFor(ratio(core.sales, core.rpc || core.accepted)) },
    { label: 'Activated', value: num.format(core.activations), sub: `${pct.format(ratio(core.activations, core.sales || core.accepted))} activation yield`, owner: 'TP2', tone: toneFor(ratio(core.activations, core.sales || core.accepted)) }
  ];
  const commercialRows: BridgeRow[] = [
    { label: 'TP1 accepted revenue', value: money.format(commercial.acceptedRevenue), note: `${num.format(core.accepted)} accepted × ${money.format(assumptions.acceptedFee)}`, tone: 'good' },
    { label: 'BLC activation revenue', value: money.format(commercial.blcRevenue), note: 'Power BI segment activations', tone: commercial.blcRevenue ? 'good' : 'neutral' },
    { label: 'MTN activation revenue', value: money.format(commercial.mtnRevenue), note: 'MTN_Activated_Sales × R200', tone: commercial.mtnRevenue ? 'good' : 'neutral' },
    { label: 'Mondo sold revenue', value: money.format(commercial.mondoRevenue), note: 'Sold A/B/C/D rate card', tone: commercial.mondoRevenue ? 'good' : 'neutral' },
    { label: 'Media spend', value: money.format(core.spend), note: 'Deducted from gross contribution', tone: 'watch' },
    { label: 'Net contribution', value: money.format(grossProfit), note: 'Revenue less spend and OnTact opex input', tone: grossProfit >= 0 ? 'good' : 'critical' }
  ];
  const syncSignals: SignalItem[] = [...(payload?.results ?? []).map((result) => ({ label: sourceLabel(result.source), value: result.ok ? 'Synced' : 'Attention', note: `${num.format(result.filteredRows ?? result.rows ?? 0)} rows · ${num.format(result.analytics?.fieldCatalog?.length ?? 0)} fields`, tone: result.ok ? 'good' as const : 'critical' as const })), { label: 'Advanced layers', value: '5/5 active', note: `${num.format(propensityRows.length)} propensity · ${num.format(sourceMargins.length)} margin rows`, tone: 'good' as const }];
  const tabs: { id: Tab; label: string }[] = [
    { id: 'command', label: 'Command' }, { id: 'journey', label: 'Journey Map' }, { id: 'ontact', label: 'OnTact' }, { id: 'offernet', label: 'Offernet' }, { id: 'vendors', label: 'All Vendors' }, { id: 'pnl', label: 'Profit & Loss' }, { id: 'qa', label: 'QA / Trust' }
  ];

  return <main><aside className="sidebar"><div className="brand"><div className="brand-mark">CIQ</div><div><b>ConvertIQ</b><span>Advanced Analytics</span></div></div><nav>{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav><div className="sync-panel"><ShieldCheck size={18}/><b>One production app</b><span>Tab-by-tab operating views with API source logic preserved.</span></div></aside><section className="workspace">
    <header className="hero"><div><p className="eyebrow">Predictive · prescriptive · API synced · no demo data</p><h1>ConvertIQ Advanced Performance Analytics</h1><p>A single operating layer for source profitability, lead propensity, OnTact efficiency, funnel leakage, product intelligence and commercial P&L.</p></div><button className="primary" onClick={() => load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/>{loading ? 'Syncing' : 'Sync dashboard'}</button></header>
    <section className="controls card"><SlidersHorizontal size={18}/><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/><select value={depth} onChange={(event) => setDepth(event.target.value as Depth)}><option value="executive">Executive depth</option><option value="analytical">Analytical depth</option><option value="complete">Complete metric depth</option></select><div className="inline-tools"><Search size={15}/><input placeholder="Search fields / metrics" value={search} onChange={(event) => setSearch(event.target.value)}/></div><button onClick={() => load()}>Apply</button><span>{payload ? `Last sync: ${new Date(payload.generatedAt).toLocaleString()}` : 'Waiting for API sync'}</span></section>
    {error && <section className="notice">{error}</section>}
    <SignalGrid title="Live source confidence" sub="Every tab below is driven from the same source-level API responses and preview rows." items={syncSignals}/>

    {tab === 'command' && <><TabBrief eyebrow="Executive command" title="Boardroom view of commercial health" summary="This tab answers whether the full engine is profitable, scalable and operationally healthy before the user drills into journey, Offernet, OnTact or vendors." points={[{ label: 'Revenue', value: money.format(commercial.totalRevenue), note: 'TP1 + TP2' }, { label: 'Margin', value: pct.format(ratio(grossProfit, commercial.totalRevenue)), note: 'after media + opex' }, { label: 'Priority', value: recommendations[0]?.priority ?? 'Low', note: recommendations[0]?.area }]} /><section className="kpi-grid"><Card title="Total Revenue" value={money.format(commercial.totalRevenue)} sub="TP1 + BLC + MTN + Mondo" icon={WalletCards}/><Card title="True Source ROAS" value={`${dec.format(marginSummary.roas)}x`} sub={`${pct.format(marginSummary.grossMargin)} source margin`} icon={TrendingUp}/><Card title="Avg Propensity" value={dec.format(propensitySummary.avgScore)} sub={`${num.format(propensitySummary.scaleNow)} scale now · ${num.format(propensitySummary.priority)} priority`} icon={Target}/><Card title="Funnel Conversion" value={pct.format(funnelSummary.overallConversionRate)} sub={funnelSummary.highestLeakageStage} icon={Filter}/><Card title="OnTact Conversion" value={pct.format(callSummary.conversionRate)} sub={`${callSummary.optimalBucket} optimal call duration`} icon={PhoneCall}/><Card title="Best Product" value={String(productSummary.bestProductScore)} sub={productSummary.bestProduct} icon={Layers3}/></section><MetricFlow title="End-to-end operating flow" sub="The full conversion engine from spend to activation." stages={journeyStages}/><section className="grid two"><Panel title="Executive performance trend" sub="Spend, forms, accepted leads, sales and activations over time"><ResponsiveContainer width="100%" height={340}><AreaChart data={trendRows}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area dataKey="spend" name="Spend"/><Area dataKey="forms" name="Forms"/><Area dataKey="accepted" name="Accepted"/><Area dataKey="sales" name="Sales"/><Area dataKey="activations" name="Activations"/></AreaChart></ResponsiveContainer></Panel><Panel title="Prescriptive recommendations" sub="Actions generated from margin, propensity, call-efficiency, funnel leakage and product signals"><div className="diagnostic-list">{recommendations.map((item, index) => <article className={`diagnostic ${item.priority === 'High' ? 'critical' : item.priority === 'Medium' ? 'watch' : 'good'}`} key={`${item.area}-${index}`}><AlertTriangle size={16}/><div><b>{item.action}</b><span>{item.area}: {item.reason}</span></div><strong>{item.priority}</strong></article>)}</div></Panel></section></>}

    {tab === 'journey' && <><TabBrief eyebrow="Journey map" title="Clean funnel leakage and ownership view" summary="This tab is the touchpoint map: where the lead is generated, validated, routed, accepted, contacted, sold and activated." points={[{ label: 'Weakest stage', value: funnelSummary.highestLeakageStage, note: pct.format(funnelSummary.highestLeakageRate) }, { label: 'Overall conversion', value: pct.format(funnelSummary.overallConversionRate) }, { label: 'Critical leaks', value: num.format(funnelSummary.criticalLeaks) }]} /><MetricFlow title="Touchpoint flow" sub="Each step shows volume, owner and stage health." stages={journeyStages}/><FunnelLeakagePanel records={onvestRecords} limit={limit}/><Panel title="Journey trend" sub="Source pipeline volumes over time"><ResponsiveContainer width="100%" height={360}><LineChart data={trendRows}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line dataKey="forms"/><Line dataKey="accepted"/><Line dataKey="sales"/><Line dataKey="activations"/></LineChart></ResponsiveContainer></Panel></>}

    {tab === 'ontact' && <><TabBrief eyebrow="OnTact conversion" title="Call-centre productivity and conversion quality" summary="This tab isolates the dialler leg: dialled, answered, RPC, sales, agent productivity and product propensity." points={[{ label: 'Answer rate', value: pct.format(ratio(core.answered, core.dialed)) }, { label: 'RPC rate', value: pct.format(ratio(core.rpc, core.answered)) }, { label: 'Conversion', value: pct.format(callSummary.conversionRate), note: callSummary.optimalBucket }]} /><section className="kpi-grid"><Card title="Dialled" value={num.format(core.dialed)} sub="MTN_Dialed_Leads" icon={PhoneCall}/><Card title="Answered" value={num.format(core.answered)} sub={`${pct.format(ratio(core.answered, core.dialed))} answer rate`} icon={CheckCircle2}/><Card title="RPC" value={num.format(core.rpc)} sub={`${pct.format(ratio(core.rpc, core.answered))} RPC rate`} icon={Target}/><Card title="Sales" value={num.format(core.sales)} sub={`${pct.format(ratio(core.sales, core.rpc || core.answered))} conversion`} icon={TrendingUp}/></section><CallCenterEfficiencyPanel records={ontactRecords} limit={limit}/><ProductPropensityPanel records={ontactRecords} limit={limit}/><section className="grid two"><Panel title="Agent productivity"><Table rows={merged.byAgent.slice(0, limit)}/></Panel><Panel title="Status mix"><Table rows={merged.byStatus.slice(0, limit)}/></Panel></section></>}

    {tab === 'offernet' && <><TabBrief eyebrow="Offernet media engine" title="Accepted-lead economics and source quality" summary="This tab focuses on TP1: media spend, fetched leads, accepted leads, CPA accepted, source profitability and routing priority." points={[{ label: 'Spend', value: money.format(core.spend) }, { label: 'Accepted CPA', value: money.format(core.cpaAccepted) }, { label: 'Best source', value: marginSummary.bestSource.slice(0, 24) }]} /><section className="kpi-grid"><Card title="Spend" value={money.format(core.spend)} sub="Amount_Spent" icon={DatabaseZap}/><Card title="CPL" value={money.format(core.cpl)} sub="Spend ÷ forms/fetched" icon={Gauge}/><Card title="CPA Accepted" value={money.format(core.cpaAccepted)} sub="Spend ÷ Accepted_Leads" icon={Target}/><Card title="Best Source" value={marginSummary.bestSource.slice(0, 22)} sub="Highest gross profit" icon={TrendingUp}/><Card title="Priority Sources" value={num.format(propensitySummary.scaleNow + propensitySummary.priority)} sub="Propensity score ≥ 70" icon={UsersRound}/><Card title="Loss Sources" value={num.format(marginSummary.lossMakingSources)} sub={marginSummary.worstSource} icon={AlertTriangle}/></section><CommercialBridge title="Offernet TP1 bridge" sub="Media spend is assessed against accepted lead revenue and source margin before TP2 upside." rows={commercialRows.filter((row) => ['TP1 accepted revenue', 'Media spend', 'Net contribution'].includes(row.label))}/><section className="grid two"><Panel title="Paid media efficiency trend"><ResponsiveContainer width="100%" height={360}><LineChart data={trendRows}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line dataKey="spend"/><Line dataKey="forms"/><Line dataKey="accepted"/></LineChart></ResponsiveContainer></Panel><Panel title="True margin matrix" action={<button className="secondary" onClick={() => csv('convertiq-source-margin.csv', marginTableRows as unknown as Record<string, unknown>[])}><Download size={14}/>Export</button>}><Table rows={marginTableRows}/></Panel></section><Panel title="Predictive source routing"><Table rows={propensityTableRows}/></Panel></>}

    {tab === 'vendors' && <><TabBrief eyebrow="Vendor economics" title="Vendor-specific payout and product performance" summary="This tab separates BLC, MTN and Mondo so payout logic does not blur into one generic revenue number." points={[{ label: 'BLC', value: money.format(commercial.blcRevenue) }, { label: 'MTN', value: money.format(commercial.mtnRevenue) }, { label: 'Mondo', value: money.format(commercial.mondoRevenue) }]} /><section className="kpi-grid"><Card title="Mondo Revenue" value={money.format(commercial.mondoRevenue)} sub="Sold A/B/C/D rate card" icon={BarChart3}/><Card title="MTN Revenue" value={money.format(commercial.mtnRevenue)} sub="Activated sales × R200" icon={CheckCircle2}/><Card title="BLC Revenue" value={money.format(commercial.blcRevenue)} sub="Power BI segment activations" icon={Layers3}/><Card title="Products Scored" value={num.format(productSummary.totalProducts)} sub={`${num.format(productSummary.scaleProducts)} scale products`} icon={Target}/></section><CommercialBridge title="Vendor revenue bridge" sub="Revenue is split by each vendor's commercial event and rate-card logic." rows={commercialRows.filter((row) => ['BLC activation revenue', 'MTN activation revenue', 'Mondo sold revenue'].includes(row.label))}/><ProductPropensityPanel records={ontactRecords} limit={limit}/><Panel title="Vendor source composition"><Table rows={merged.byVendor.slice(0, limit)}/></Panel></>}

    {tab === 'pnl' && <><TabBrief eyebrow="Profit and loss" title="Commercial truth layer" summary="This tab ties revenue, media spend and OnTact opex inputs into one contribution view." points={[{ label: 'Revenue', value: money.format(commercial.totalRevenue) }, { label: 'Gross profit', value: money.format(grossProfit) }, { label: 'Margin', value: pct.format(ratio(grossProfit, commercial.totalRevenue)) }]} /><section className="assumptions card"><AssumptionInput label="TP1 accepted fee" value={assumptions.acceptedFee} onChange={(value) => setAssumptions({ ...assumptions, acceptedFee: value })}/><AssumptionInput label="OnTact agents" value={assumptions.ontactAgents} onChange={(value) => setAssumptions({ ...assumptions, ontactAgents: value })}/><AssumptionInput label="Opex / agent" value={assumptions.ontactOpexPerAgent} onChange={(value) => setAssumptions({ ...assumptions, ontactOpexPerAgent: value })}/></section><section className="kpi-grid"><Card title="Revenue" value={money.format(commercial.totalRevenue)} sub="Total commercial revenue" icon={WalletCards}/><Card title="Gross Profit" value={money.format(grossProfit)} sub={`${pct.format(ratio(grossProfit, commercial.totalRevenue))} margin`} icon={TrendingUp}/><Card title="Media Spend" value={money.format(core.spend)} sub="Amount_Spent" icon={DatabaseZap}/><Card title="OnTact Opex" value={money.format(ontactOpex)} sub="Input assumption" icon={PhoneCall}/></section><CommercialBridge title="P&L commercial bridge" sub="TP1 + TP2 revenue minus media and manually entered fixed OnTact opex." rows={commercialRows}/><section className="grid two"><Panel title="P&L waterfall"><ResponsiveContainer width="100%" height={360}><BarChart data={[{ line: 'Accepted Rev', value: commercial.acceptedRevenue }, { line: 'BLC Rev', value: commercial.blcRevenue }, { line: 'MTN Rev', value: commercial.mtnRevenue }, { line: 'Mondo Rev', value: commercial.mondoRevenue }, { line: 'Media Spend', value: -core.spend }, { line: 'OnTact Opex', value: -ontactOpex }, { line: 'Gross Profit', value: grossProfit }]}><CartesianGrid vertical={false}/><XAxis dataKey="line"/><YAxis/><Tooltip/><Bar dataKey="value"/></BarChart></ResponsiveContainer></Panel><Panel title="Source margin leaderboard"><Table rows={marginTableRows}/></Panel></section><Panel title="Commercial rate-card breakdown"><Table rows={commercial.rows.map((row) => ({ ...row, rate: money.format(row.rate), revenue: money.format(row.revenue) }))}/></Panel></>}

    {tab === 'qa' && <><TabBrief eyebrow="QA and trust" title="API sync, metric catalogue and source confidence" summary="This tab exists to prove what is live, what was filtered, and which fields are available to the dashboard." points={[{ label: 'Live records', value: num.format(merged.records.length) }, { label: 'API fields', value: num.format(merged.fieldCatalog.length) }, { label: 'Sources', value: num.format(payload?.results.length ?? 0) }]} /><section className="kpi-grid"><Card title="Live Records" value={num.format(merged.records.length)} sub="Combined preview records" icon={DatabaseZap}/><Card title="API Fields" value={num.format(merged.fieldCatalog.length)} sub="Available metric catalogue" icon={ListChecks}/><Card title="Source Margin Rows" value={num.format(sourceMargins.length)} sub="Feature 2" icon={WalletCards}/><Card title="Propensity Rows" value={num.format(propensityRows.length)} sub="Feature 1" icon={Target}/></section><Panel title="API sync and filter audit"><Table rows={qaRows}/></Panel><Panel title="Metric catalogue"><Table rows={filteredFields.map((field) => ({ source: field.source, field: field.rawField ?? field.field, group: field.group, role: field.role, status: field.pii ? 'protected' : 'available', nonNull: field.nonNull ?? 0, total: field.total ?? '' }))}/></Panel></>}
  </section></main>;
}
