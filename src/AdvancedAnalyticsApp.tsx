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
import LeadLifecycleTimingPanel from './components/LeadLifecycleTimingPanel';
import ProductPropensityPanel from './components/ProductPropensityPanel';
import { ApiHealthStrip, CommercialBridge, DecisionPanel, MetricFlow, SignalGrid, TabBrief, type BridgeRow, type FlowStage, type HealthSource, type SignalItem } from './components/TabExperience';

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
type Assumptions = { ontactAgents: number; ontactOpexPerAgent: number };
type Recommendation = { priority: 'High' | 'Medium' | 'Low'; area: string; action: string; reason: string };

const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const dec = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 });
const DEFAULT_ASSUMPTIONS: Assumptions = { ontactAgents: 0, ontactOpexPerAgent: 0 };

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
const pctValue = (value: number) => Number((value * 100).toFixed(1));
const boundedPctValue = (value: number) => Number((Math.max(0, Math.min(1, value)) * 100).toFixed(1));

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
  const commercial = useMemo(() => calculateCommercialRevenue(merged.totals, merged.records), [merged.totals, merged.records]);
  const ontactOpex = assumptions.ontactAgents * assumptions.ontactOpexPerAgent;
  const grossProfit = commercial.totalRevenue - core.spend - ontactOpex;
  const recommendations = useMemo(() => buildRecommendations({ marginRows: sourceMargins, propensityRows, callSummary, funnelSummary, productSummary }), [sourceMargins, propensityRows, callSummary, funnelSummary, productSummary]);
  const limit = tableLimit(depth);
  const trendRows = merged.byDate.map((row) => ({ date: row.date, spend: n(row.Amount_Spent), forms: n(row.Form_Completion), accepted: n(row.Accepted_Leads), sales: n(row.MTN_Sales), activations: n(row.MTN_Activated_Sales) + n(row.count_activation), cpaAccepted: ratio(row.Amount_Spent, row.Accepted_Leads), leadToAccepted: pctValue(ratio(row.Accepted_Leads, row.Form_Completion || row.Fetched_Leads)), salesRate: pctValue(ratio(row.MTN_Sales, row.Accepted_Leads || row.Form_Completion)) }));
  const filteredFields = merged.fieldCatalog.filter((field) => !search || `${field.source} ${field.field} ${field.group} ${field.role}`.toLowerCase().includes(search.toLowerCase())).slice(0, limit);
  const marginTableRows = sourceMargins.slice(0, limit).map((row) => ({ source: row.source, date: row.date, revenue: money.format(row.totalRevenue), spend: money.format(row.adSpend), grossProfit: money.format(row.grossProfit), margin: pct.format(row.grossMargin), roas: `${dec.format(row.roas)}x`, cpaAccepted: row.cpaAccepted ? money.format(row.cpaAccepted) : '-', band: row.profitBand }));
  const propensityTableRows = propensityRows.slice(0, limit).map((row) => ({ source: row.source, date: row.date, score: row.score, probability: pct.format(row.probability), routing: row.routingTier, quality: dec.format(row.qualityScore), conversion: dec.format(row.conversionScore), commercial: dec.format(row.commercialScore), reason: row.reason }));
  const qaRows = (payload?.results ?? []).map((result) => ({ source: sourceLabel(result.source), status: result.ok ? 'synced' : 'attention', rawRows: result.rawRows ?? result.upstreamCount ?? 0, filteredRows: result.filteredRows ?? result.rows ?? 0, previewRows: result.previewRows ?? result.analytics?.recordsReturned ?? 0, totalsUsePreviewRows: result.totalsUsePreviewRows === false ? 'No' : 'Route dependent', excludedByDate: result.excludedByDate ?? 0, undatedExcluded: result.undatedRowsExcluded ?? 0, strategy: result.filters?.strategy ?? 'source-level' }));

  const journeyStages: FlowStage[] = [
    { label: 'Media Spend', value: money.format(core.spend), sub: 'Amount_Spent from Onvest', owner: 'Offernet', tone: core.spend ? 'good' : 'watch' },
    { label: 'Fetched Leads', value: num.format(core.fetched), sub: `${money.format(core.cpl)} CPL`, owner: 'Offernet', tone: core.fetched ? 'good' : 'watch' },
    { label: 'Valid Phone + ID', value: num.format(core.valid), sub: `${pct.format(ratio(core.valid, core.fetched))} of fetched`, owner: 'Data QA', tone: toneFor(ratio(core.valid, core.fetched)) },
    { label: 'Delivered', value: num.format(core.delivered), sub: `${pct.format(ratio(core.delivered, core.valid || core.fetched))} delivery rate`, owner: 'Routing', tone: toneFor(ratio(core.delivered, core.valid || core.fetched)) },
    { label: 'Accepted', value: num.format(core.accepted), sub: `${money.format(core.cpaAccepted)} CPA accepted`, owner: 'Accepted Event', tone: core.accepted ? 'good' : 'watch' },
    { label: 'RPC', value: num.format(core.rpc), sub: `${pct.format(ratio(core.rpc, core.answered || core.dialed))} contact quality`, owner: 'OnTact', tone: toneFor(ratio(core.rpc, core.answered || core.dialed)) },
    { label: 'Sales', value: num.format(core.sales), sub: `${pct.format(ratio(core.sales, core.rpc || core.accepted))} conversion`, owner: 'Vendor / OnTact', tone: toneFor(ratio(core.sales, core.rpc || core.accepted)) },
    { label: 'Activated', value: num.format(core.activations), sub: `${pct.format(ratio(core.activations, core.sales || core.accepted))} activation yield`, owner: 'Revenue Event', tone: toneFor(ratio(core.activations, core.sales || core.accepted)) }
  ];
  const commercialRows: BridgeRow[] = [
    { label: 'BLC activation revenue', value: money.format(commercial.blcRevenue), note: 'Power BI segment activations', tone: commercial.blcRevenue ? 'good' : 'neutral' },
    { label: 'MTN activation revenue', value: money.format(commercial.mtnRevenue), note: 'MTN_Activated_Sales × R200', tone: commercial.mtnRevenue ? 'good' : 'neutral' },
    { label: 'Mondo sold revenue', value: money.format(commercial.mondoRevenue), note: 'Sold A/B/C/D rate card', tone: commercial.mondoRevenue ? 'good' : 'neutral' },
    { label: 'Media spend', value: money.format(core.spend), note: 'Deducted from gross contribution', tone: 'watch' },
    { label: 'OnTact opex', value: money.format(ontactOpex), note: 'Manual fixed opex input', tone: ontactOpex ? 'watch' : 'neutral' },
    { label: 'Net contribution', value: money.format(grossProfit), note: 'Vendor revenue less media and OnTact opex input', tone: grossProfit >= 0 ? 'good' : 'critical' }
  ];
  const commercialChartRows = [
    { line: 'BLC', revenue: commercial.blcRevenue, cost: 0, contribution: commercial.blcRevenue },
    { line: 'MTN', revenue: commercial.mtnRevenue, cost: 0, contribution: commercial.mtnRevenue },
    { line: 'Mondo', revenue: commercial.mondoRevenue, cost: 0, contribution: commercial.mondoRevenue },
    { line: 'Media spend', revenue: 0, cost: core.spend, contribution: -core.spend },
    { line: 'OnTact opex', revenue: 0, cost: ontactOpex, contribution: -ontactOpex },
    { line: 'Net', revenue: 0, cost: 0, contribution: grossProfit }
  ];
  const revenueMixRows = [
    { name: 'BLC', value: commercial.blcRevenue },
    { name: 'MTN', value: commercial.mtnRevenue },
    { name: 'Mondo', value: commercial.mondoRevenue }
  ];
  const funnelVisualRows = [
    { stage: 'Fetched', volume: core.fetched, conversion: 100 },
    { stage: 'Valid', volume: core.valid, conversion: boundedPctValue(ratio(core.valid, core.fetched)) },
    { stage: 'Delivered', volume: core.delivered, conversion: boundedPctValue(ratio(core.delivered, core.valid || core.fetched)) },
    { stage: 'Accepted', volume: core.accepted, conversion: boundedPctValue(ratio(core.accepted, core.delivered || core.fetched)) },
    { stage: 'Answered', volume: core.answered, conversion: boundedPctValue(ratio(core.answered, core.dialed || core.accepted)) },
    { stage: 'RPC', volume: core.rpc, conversion: boundedPctValue(ratio(core.rpc, core.answered || core.dialed)) },
    { stage: 'Sales', volume: core.sales, conversion: boundedPctValue(ratio(core.sales, core.rpc || core.accepted)) },
    { stage: 'Activated', volume: core.activations, conversion: boundedPctValue(ratio(core.activations, core.sales || core.accepted)) }
  ];
  const conversionVisualRows = [
    { metric: 'Valid / Fetched', rate: boundedPctValue(ratio(core.valid, core.fetched)), leakage: boundedPctValue(1 - ratio(core.valid, core.fetched)) },
    { metric: 'Delivered / Valid', rate: boundedPctValue(ratio(core.delivered, core.valid || core.fetched)), leakage: boundedPctValue(1 - ratio(core.delivered, core.valid || core.fetched)) },
    { metric: 'Accepted / Delivered', rate: boundedPctValue(ratio(core.accepted, core.delivered || core.fetched)), leakage: boundedPctValue(1 - ratio(core.accepted, core.delivered || core.fetched)) },
    { metric: 'Answered / Dialled', rate: boundedPctValue(ratio(core.answered, core.dialed || core.accepted)), leakage: boundedPctValue(1 - ratio(core.answered, core.dialed || core.accepted)) },
    { metric: 'RPC / Answered', rate: boundedPctValue(ratio(core.rpc, core.answered || core.dialed)), leakage: boundedPctValue(1 - ratio(core.rpc, core.answered || core.dialed)) },
    { metric: 'Activated / Sales', rate: boundedPctValue(ratio(core.activations, core.sales || core.accepted)), leakage: boundedPctValue(1 - ratio(core.activations, core.sales || core.accepted)) }
  ];
  const sourceVisualRows = sourceMargins.slice(0, 12).map((row) => ({ source: row.source, revenue: row.totalRevenue, spend: row.adSpend, profit: row.grossProfit, roas: Number(row.roas.toFixed(2)) }));
  const vendorRevenueRows = [
    { vendor: 'BLC', revenue: commercial.blcRevenue },
    { vendor: 'MTN', revenue: commercial.mtnRevenue },
    { vendor: 'Mondo', revenue: commercial.mondoRevenue }
  ];
  const rateCardVisualRows = commercial.rows.map((row) => ({ segment: row.segment, brand: row.brand, volume: row.volume, revenue: row.revenue })).filter((row) => row.revenue || row.volume).slice(0, 14);
  const qaVisualRows = (payload?.results ?? []).map((result) => ({ source: sourceLabel(result.source), raw: result.rawRows ?? result.upstreamCount ?? 0, filtered: result.filteredRows ?? result.rows ?? 0, preview: result.previewRows ?? result.analytics?.recordsReturned ?? 0, fields: result.analytics?.fieldCatalog?.length ?? 0 }));
  const healthSources: HealthSource[] = (payload?.results ?? []).map((result) => ({ label: sourceLabel(result.source), status: result.ok ? 'Synced' : 'Attention', rows: num.format(result.filteredRows ?? result.rows ?? 0), fields: num.format(result.analytics?.fieldCatalog?.length ?? 0), tone: result.ok ? 'good' : 'critical' }));
  const topRecommendation = recommendations[0];
  const commandTone = grossProfit < 0 || topRecommendation?.priority === 'High' ? 'critical' : topRecommendation?.priority === 'Medium' ? 'watch' : 'good';
  const commandDecision = grossProfit < 0 ? 'Protect margin before scaling' : topRecommendation?.action ?? 'Continue monitoring';
  const commandReason = grossProfit < 0 ? `${money.format(grossProfit)} contribution after media and OnTact opex input.` : `${topRecommendation?.area ?? 'Data readiness'}: ${topRecommendation?.reason ?? 'No major risk detected.'}`;
  const journeyDecisionTone = funnelSummary.criticalLeaks > 0 ? 'critical' : funnelSummary.highestLeakageRate > 0.35 ? 'watch' : 'good';
  const journeySignals: SignalItem[] = [
    { label: 'Lead-gen engine', value: pct.format(ratio(core.accepted, core.fetched)), note: 'Fetched to accepted yield', tone: toneFor(ratio(core.accepted, core.fetched), 0.18, 0.08) },
    { label: 'Contactability', value: pct.format(ratio(core.answered, core.dialed)), note: 'Answered from dialled', tone: toneFor(ratio(core.answered, core.dialed), 0.28, 0.14) },
    { label: 'RPC quality', value: pct.format(ratio(core.rpc, core.answered)), note: 'Right-party contact from answered', tone: toneFor(ratio(core.rpc, core.answered), 0.45, 0.22) },
    { label: 'Activation yield', value: pct.format(ratio(core.activations, core.sales || core.accepted)), note: 'Activated from sales/accepted base', tone: toneFor(ratio(core.activations, core.sales || core.accepted), 0.55, 0.25) }
  ];
  const tabs: { id: Tab; label: string }[] = [
    { id: 'command', label: 'Command' }, { id: 'journey', label: 'Journey Map' }, { id: 'ontact', label: 'OnTact' }, { id: 'offernet', label: 'Offernet' }, { id: 'vendors', label: 'All Vendors' }, { id: 'pnl', label: 'Profit & Loss' }, { id: 'qa', label: 'QA / Trust' }
  ];

  return <main><aside className="sidebar"><div className="brand"><div className="brand-mark">CIQ</div><div><b>ConvertIQ</b><span>Advanced Analytics</span></div></div><nav>{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav><div className="sync-panel"><ShieldCheck size={18}/><b>One production app</b><span>Tab-by-tab operating views with API source logic preserved.</span></div></aside><section className="workspace">
    <header className="hero"><div><p className="eyebrow">Predictive · prescriptive · API synced · no demo data</p><h1>ConvertIQ Advanced Performance Analytics</h1><p>A single operating layer for source profitability, lead propensity, OnTact efficiency, funnel leakage, product intelligence and commercial P&L.</p></div><button className="primary" onClick={() => load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/>{loading ? 'Syncing' : 'Sync dashboard'}</button></header>
    <section className="controls card"><SlidersHorizontal size={18}/><input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/><input type="date" value={to} onChange={(event) => setTo(event.target.value)}/><select value={depth} onChange={(event) => setDepth(event.target.value as Depth)}><option value="executive">Executive depth</option><option value="analytical">Analytical depth</option><option value="complete">Complete metric depth</option></select><div className="inline-tools"><Search size={15}/><input placeholder="Search fields / metrics" value={search} onChange={(event) => setSearch(event.target.value)}/></div><button onClick={() => load()}>Apply</button><span>{payload ? `Last sync: ${new Date(payload.generatedAt).toLocaleString()}` : 'Waiting for API sync'}</span></section>
    {error && <section className="notice">{error}</section>}
    <ApiHealthStrip sources={healthSources} lastSync={payload ? new Date(payload.generatedAt).toLocaleString() : 'Waiting for API sync'} />

    {tab === 'command' && <><TabBrief eyebrow="Executive command" title="Boardroom view of commercial health" summary="This tab answers whether the vendor revenue engine is profitable, scalable and operationally healthy before the user drills into journey, Offernet, OnTact or vendors." points={[{ label: 'Vendor Revenue', value: money.format(commercial.totalRevenue), note: 'BLC + MTN + Mondo' }, { label: 'Margin', value: pct.format(ratio(grossProfit, commercial.totalRevenue)), note: 'after media + opex' }, { label: 'Priority', value: recommendations[0]?.priority ?? 'Low', note: recommendations[0]?.area }]} /><DecisionPanel title="Executive action" decision={commandDecision} reason={commandReason} tone={commandTone}><div className="mini-stack"><b>{topRecommendation?.priority ?? 'Low'} priority</b><span>{topRecommendation?.area ?? 'Data readiness'}</span><small>{topRecommendation?.reason ?? 'Live data is being collected.'}</small></div></DecisionPanel><section className="kpi-grid"><Card title="Vendor Revenue" value={money.format(commercial.totalRevenue)} sub="BLC + MTN + Mondo" icon={WalletCards}/><Card title="True Source ROAS" value={`${dec.format(marginSummary.roas)}x`} sub={`${pct.format(marginSummary.grossMargin)} source margin`} icon={TrendingUp}/><Card title="Avg Propensity" value={dec.format(propensitySummary.avgScore)} sub={`${num.format(propensitySummary.scaleNow)} scale now · ${num.format(propensitySummary.priority)} priority`} icon={Target}/><Card title="Funnel Conversion" value={pct.format(funnelSummary.overallConversionRate)} sub={funnelSummary.highestLeakageStage} icon={Filter}/><Card title="OnTact Conversion" value={pct.format(callSummary.conversionRate)} sub={`${callSummary.optimalBucket} optimal call duration`} icon={PhoneCall}/><Card title="Best Product" value={String(productSummary.bestProductScore)} sub={productSummary.bestProduct} icon={Layers3}/></section><section className="grid two"><Panel title="Revenue mix visual" sub="Vendor revenue contribution by commercial stream."><ResponsiveContainer width="100%" height={330}><BarChart data={revenueMixRows}><CartesianGrid vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="value" name="Revenue"/></BarChart></ResponsiveContainer></Panel><Panel title="Commercial contribution bridge" sub="Vendor revenue, cost and contribution lines in one operating view."><ResponsiveContainer width="100%" height={330}><BarChart data={commercialChartRows}><CartesianGrid vertical={false}/><XAxis dataKey="line"/><YAxis/><Tooltip/><Bar dataKey="revenue" name="Revenue"/><Bar dataKey="cost" name="Cost"/><Bar dataKey="contribution" name="Contribution"/></BarChart></ResponsiveContainer></Panel></section><CommercialBridge title="Executive commercial bridge" sub="Commercial performance is now summarised before deeper source and vendor drilldowns." rows={commercialRows}/><section className="grid two"><Panel title="Executive performance trend" sub="Spend, forms, accepted leads, sales and activations over time"><ResponsiveContainer width="100%" height={340}><AreaChart data={trendRows}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area dataKey="spend" name="Spend"/><Area dataKey="forms" name="Forms"/><Area dataKey="accepted" name="Accepted"/><Area dataKey="sales" name="Sales"/><Area dataKey="activations" name="Activations"/></AreaChart></ResponsiveContainer></Panel><Panel title="Unit economics trend" sub="CPA accepted and conversion-rate movement over time."><ResponsiveContainer width="100%" height={340}><LineChart data={trendRows}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line dataKey="cpaAccepted" name="CPA Accepted"/><Line dataKey="leadToAccepted" name="Lead → Accepted %"/><Line dataKey="salesRate" name="Sales Rate %"/></LineChart></ResponsiveContainer></Panel></section><Panel title="Prescriptive recommendations" sub="Actions generated from margin, propensity, call-efficiency, funnel leakage and product signals"><div className="diagnostic-list">{recommendations.map((item, index) => <article className={`diagnostic ${item.priority === 'High' ? 'critical' : item.priority === 'Medium' ? 'watch' : 'good'}`} key={`${item.area}-${index}`}><AlertTriangle size={16}/><div><b>{item.action}</b><span>{item.area}: {item.reason}</span></div><strong>{item.priority}</strong></article>)}</div></Panel></>}

    {tab === 'journey' && <><TabBrief eyebrow="Journey map" title="Clean funnel leakage and ownership view" summary="This tab is the touchpoint map: where the lead is generated, validated, routed, accepted, contacted, sold and activated." points={[{ label: 'Weakest stage', value: funnelSummary.highestLeakageStage, note: pct.format(funnelSummary.highestLeakageRate) }, { label: 'Overall conversion', value: pct.format(funnelSummary.overallConversionRate) }, { label: 'Critical leaks', value: num.format(funnelSummary.criticalLeaks) }]} /><DecisionPanel title="Journey priority" decision={funnelSummary.criticalLeaks > 0 ? `Fix ${funnelSummary.highestLeakageStage}` : 'Journey stable'} reason={`${pct.format(funnelSummary.highestLeakageRate)} leakage at the current weakest stage. Use this tab to isolate whether the issue is lead quality, routing, contactability or activation.`} tone={journeyDecisionTone}/><SignalGrid title="Journey health split" sub="Separates the funnel into lead-gen, contactability, RPC quality and activation yield." items={journeySignals}/><MetricFlow title="Touchpoint flow" sub="Each step shows volume, owner and stage health." stages={journeyStages}/><section className="grid two"><Panel title="Funnel volume chart" sub="Stage volumes from fetched through activation."><ResponsiveContainer width="100%" height={360}><BarChart data={funnelVisualRows}><CartesianGrid vertical={false}/><XAxis dataKey="stage"/><YAxis/><Tooltip/><Bar dataKey="volume" name="Volume"/></BarChart></ResponsiveContainer></Panel><Panel title="Conversion and leakage chart" sub="Stage rate versus drop-off, shown as percentages."><ResponsiveContainer width="100%" height={360}><BarChart data={conversionVisualRows}><CartesianGrid vertical={false}/><XAxis dataKey="metric"/><YAxis/><Tooltip/><Bar dataKey="rate" name="Conversion %"/><Bar dataKey="leakage" name="Leakage %"/></BarChart></ResponsiveContainer></Panel></section><FunnelLeakagePanel records={onvestRecords} limit={limit}/><LeadLifecycleTimingPanel records={merged.records} limit={limit}/><Panel title="Journey trend" sub="Source pipeline volumes over time"><ResponsiveContainer width="100%" height={360}><LineChart data={trendRows}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line dataKey="forms"/><Line dataKey="accepted"/><Line dataKey="sales"/><Line dataKey="activations"/></LineChart></ResponsiveContainer></Panel></>}

    {tab === 'ontact' && <><TabBrief eyebrow="OnTact conversion" title="Call-centre productivity and conversion quality" summary="This tab isolates the dialler leg: dialled, answered, RPC, sales, agent productivity and product propensity." points={[{ label: 'Answer rate', value: pct.format(ratio(core.answered, core.dialed)) }, { label: 'RPC rate', value: pct.format(ratio(core.rpc, core.answered)) }, { label: 'Conversion', value: pct.format(callSummary.conversionRate), note: callSummary.optimalBucket }]} /><section className="kpi-grid"><Card title="Dialled" value={num.format(core.dialed)} sub="MTN_Dialed_Leads" icon={PhoneCall}/><Card title="Answered" value={num.format(core.answered)} sub={`${pct.format(ratio(core.answered, core.dialed))} answer rate`} icon={CheckCircle2}/><Card title="RPC" value={num.format(core.rpc)} sub={`${pct.format(ratio(core.rpc, core.answered))} RPC rate`} icon={Target}/><Card title="Sales" value={num.format(core.sales)} sub={`${pct.format(ratio(core.sales, core.rpc || core.answered))} conversion`} icon={TrendingUp}/></section><section className="grid two"><Panel title="OnTact funnel visual" sub="Dialled, answered, RPC and sales volumes."><ResponsiveContainer width="100%" height={330}><BarChart data={[{ stage: 'Dialled', value: core.dialed }, { stage: 'Answered', value: core.answered }, { stage: 'RPC', value: core.rpc }, { stage: 'Sales', value: core.sales }]}><CartesianGrid vertical={false}/><XAxis dataKey="stage"/><YAxis/><Tooltip/><Bar dataKey="value" name="Volume"/></BarChart></ResponsiveContainer></Panel><Panel title="OnTact rate visual" sub="Answer, RPC and conversion rates."><ResponsiveContainer width="100%" height={330}><BarChart data={[{ metric: 'Answer', rate: pctValue(ratio(core.answered, core.dialed)) }, { metric: 'RPC', rate: pctValue(ratio(core.rpc, core.answered)) }, { metric: 'Sales', rate: pctValue(ratio(core.sales, core.rpc || core.answered)) }]}><CartesianGrid vertical={false}/><XAxis dataKey="metric"/><YAxis/><Tooltip/><Bar dataKey="rate" name="Rate %"/></BarChart></ResponsiveContainer></Panel></section><CallCenterEfficiencyPanel records={ontactRecords} limit={limit}/><ProductPropensityPanel records={ontactRecords} limit={limit}/><section className="grid two"><Panel title="Agent productivity"><Table rows={merged.byAgent.slice(0, limit)}/></Panel><Panel title="Status mix"><Table rows={merged.byStatus.slice(0, limit)}/></Panel></section></>}

    {tab === 'offernet' && <><TabBrief eyebrow="Offernet media engine" title="Accepted-lead volume, cost and source quality" summary="This tab focuses on media spend, fetched leads, accepted leads, CPA accepted, source quality and routing priority. Accepted fee has been removed as a revenue input." points={[{ label: 'Spend', value: money.format(core.spend) }, { label: 'Accepted CPA', value: money.format(core.cpaAccepted) }, { label: 'Best source', value: marginSummary.bestSource.slice(0, 24) }]} /><section className="kpi-grid"><Card title="Spend" value={money.format(core.spend)} sub="Amount_Spent" icon={DatabaseZap}/><Card title="CPL" value={money.format(core.cpl)} sub="Spend ÷ forms/fetched" icon={Gauge}/><Card title="CPA Accepted" value={money.format(core.cpaAccepted)} sub="Spend ÷ Accepted_Leads" icon={Target}/><Card title="Best Source" value={marginSummary.bestSource.slice(0, 22)} sub="Highest vendor gross profit" icon={TrendingUp}/><Card title="Priority Sources" value={num.format(propensitySummary.scaleNow + propensitySummary.priority)} sub="Propensity score ≥ 70" icon={UsersRound}/><Card title="Loss Sources" value={num.format(marginSummary.lossMakingSources)} sub={marginSummary.worstSource} icon={AlertTriangle}/></section><CommercialBridge title="Offernet source bridge" sub="Media spend is assessed against downstream vendor revenue and source margin. Accepted leads remain a cost/quality stage only." rows={commercialRows.filter((row) => ['Media spend', 'Net contribution'].includes(row.label))}/><section className="grid two"><Panel title="Paid media efficiency trend"><ResponsiveContainer width="100%" height={360}><LineChart data={trendRows}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Line dataKey="spend"/><Line dataKey="forms"/><Line dataKey="accepted"/><Line dataKey="cpaAccepted"/></LineChart></ResponsiveContainer></Panel><Panel title="Source profitability visual"><ResponsiveContainer width="100%" height={360}><BarChart data={sourceVisualRows}><CartesianGrid vertical={false}/><XAxis dataKey="source"/><YAxis/><Tooltip/><Bar dataKey="revenue" name="Vendor Revenue"/><Bar dataKey="spend" name="Spend"/><Bar dataKey="profit" name="Profit"/></BarChart></ResponsiveContainer></Panel></section><section className="grid two"><Panel title="True margin matrix" action={<button className="secondary" onClick={() => csv('convertiq-source-margin.csv', marginTableRows as unknown as Record<string, unknown>[])}><Download size={14}/>Export</button>}><Table rows={marginTableRows}/></Panel><Panel title="Predictive source routing"><Table rows={propensityTableRows}/></Panel></section></>}

    {tab === 'vendors' && <><TabBrief eyebrow="Vendor economics" title="Vendor-specific payout and product performance" summary="This tab separates BLC, MTN and Mondo so payout logic does not blur into one generic revenue number." points={[{ label: 'BLC', value: money.format(commercial.blcRevenue) }, { label: 'MTN', value: money.format(commercial.mtnRevenue) }, { label: 'Mondo', value: money.format(commercial.mondoRevenue) }]} /><section className="kpi-grid"><Card title="Mondo Revenue" value={money.format(commercial.mondoRevenue)} sub="Sold A/B/C/D rate card" icon={BarChart3}/><Card title="MTN Revenue" value={money.format(commercial.mtnRevenue)} sub="Activated sales × R200" icon={CheckCircle2}/><Card title="BLC Revenue" value={money.format(commercial.blcRevenue)} sub="Power BI segment activations" icon={Layers3}/><Card title="Products Scored" value={num.format(productSummary.totalProducts)} sub={`${num.format(productSummary.scaleProducts)} scale products`} icon={Target}/></section><CommercialBridge title="Vendor revenue bridge" sub="Revenue is split by each vendor's commercial event and rate-card logic." rows={commercialRows.filter((row) => ['BLC activation revenue', 'MTN activation revenue', 'Mondo sold revenue'].includes(row.label))}/><section className="grid two"><Panel title="Vendor revenue comparison"><ResponsiveContainer width="100%" height={350}><BarChart data={vendorRevenueRows}><CartesianGrid vertical={false}/><XAxis dataKey="vendor"/><YAxis/><Tooltip/><Bar dataKey="revenue" name="Revenue"/></BarChart></ResponsiveContainer></Panel><Panel title="Rate-card segment mix"><ResponsiveContainer width="100%" height={350}><BarChart data={rateCardVisualRows}><CartesianGrid vertical={false}/><XAxis dataKey="segment"/><YAxis/><Tooltip/><Bar dataKey="volume" name="Volume"/><Bar dataKey="revenue" name="Revenue"/></BarChart></ResponsiveContainer></Panel></section><ProductPropensityPanel records={ontactRecords} limit={limit}/><Panel title="Vendor source composition"><Table rows={merged.byVendor.slice(0, limit)}/></Panel></>}

    {tab === 'pnl' && <><TabBrief eyebrow="Profit and loss" title="Commercial truth layer" summary="This tab ties vendor revenue, media spend and OnTact opex inputs into one contribution view. Accepted fee has been removed." points={[{ label: 'Vendor revenue', value: money.format(commercial.totalRevenue) }, { label: 'Gross profit', value: money.format(grossProfit) }, { label: 'Margin', value: pct.format(ratio(grossProfit, commercial.totalRevenue)) }]} /><section className="assumptions card"><AssumptionInput label="OnTact agents" value={assumptions.ontactAgents} onChange={(value) => setAssumptions({ ...assumptions, ontactAgents: value })}/><AssumptionInput label="Opex / agent" value={assumptions.ontactOpexPerAgent} onChange={(value) => setAssumptions({ ...assumptions, ontactOpexPerAgent: value })}/></section><section className="kpi-grid"><Card title="Vendor Revenue" value={money.format(commercial.totalRevenue)} sub="BLC + MTN + Mondo" icon={WalletCards}/><Card title="Gross Profit" value={money.format(grossProfit)} sub={`${pct.format(ratio(grossProfit, commercial.totalRevenue))} margin`} icon={TrendingUp}/><Card title="Media Spend" value={money.format(core.spend)} sub="Amount_Spent" icon={DatabaseZap}/><Card title="OnTact Opex" value={money.format(ontactOpex)} sub="Input assumption" icon={PhoneCall}/></section><CommercialBridge title="P&L commercial bridge" sub="Vendor revenue minus media and manually entered fixed OnTact opex." rows={commercialRows}/><section className="grid two"><Panel title="P&L waterfall"><ResponsiveContainer width="100%" height={360}><BarChart data={commercialChartRows}><CartesianGrid vertical={false}/><XAxis dataKey="line"/><YAxis/><Tooltip/><Bar dataKey="revenue" name="Revenue"/><Bar dataKey="cost" name="Cost"/><Bar dataKey="contribution" name="Contribution"/></BarChart></ResponsiveContainer></Panel><Panel title="Revenue split"><ResponsiveContainer width="100%" height={360}><BarChart data={revenueMixRows}><CartesianGrid vertical={false}/><XAxis dataKey="name"/><YAxis/><Tooltip/><Bar dataKey="value" name="Revenue"/></BarChart></ResponsiveContainer></Panel></section><Panel title="Commercial rate-card breakdown"><Table rows={commercial.rows.map((row) => ({ ...row, rate: money.format(row.rate), revenue: money.format(row.revenue) }))}/></Panel></>}

    {tab === 'qa' && <><TabBrief eyebrow="QA and trust" title="API sync, metric catalogue and source confidence" summary="This tab exists to prove what is live, what was filtered, and which fields are available to the dashboard." points={[{ label: 'Live records', value: num.format(merged.records.length) }, { label: 'API fields', value: num.format(merged.fieldCatalog.length) }, { label: 'Sources', value: num.format(payload?.results.length ?? 0) }]} /><section className="kpi-grid"><Card title="Live Records" value={num.format(merged.records.length)} sub="Combined preview records" icon={DatabaseZap}/><Card title="API Fields" value={num.format(merged.fieldCatalog.length)} sub="Available metric catalogue" icon={ListChecks}/><Card title="Source Margin Rows" value={num.format(sourceMargins.length)} sub="Feature 2" icon={WalletCards}/><Card title="Propensity Rows" value={num.format(propensityRows.length)} sub="Feature 1" icon={Target}/></section><section className="grid two"><Panel title="Row coverage visual"><ResponsiveContainer width="100%" height={340}><BarChart data={qaVisualRows}><CartesianGrid vertical={false}/><XAxis dataKey="source"/><YAxis/><Tooltip/><Bar dataKey="raw" name="Raw"/><Bar dataKey="filtered" name="Filtered"/><Bar dataKey="preview" name="Preview"/></BarChart></ResponsiveContainer></Panel><Panel title="Field coverage visual"><ResponsiveContainer width="100%" height={340}><BarChart data={qaVisualRows}><CartesianGrid vertical={false}/><XAxis dataKey="source"/><YAxis/><Tooltip/><Bar dataKey="fields" name="Fields"/></BarChart></ResponsiveContainer></Panel></section><Panel title="API sync and filter audit"><Table rows={qaRows}/></Panel><Panel title="Metric catalogue"><Table rows={filteredFields.map((field) => ({ source: field.source, field: field.rawField ?? field.field, group: field.group, role: field.role, status: field.pii ? 'protected' : 'available', nonNull: field.nonNull ?? 0, total: field.total ?? '' }))}/></Panel></>}
  </section></main>;
}
