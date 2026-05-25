import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, BarChart3, CheckCircle2, DatabaseZap, Gauge, LineChart, RefreshCw, ShieldCheck, SlidersHorizontal, UsersRound } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Funnel,
  FunnelChart,
  LabelList,
  Line,
  LineChart as RLineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import './styles.css';

type ApiSource = 'all' | 'onvest' | 'ontact';
type Tab = 'executive' | 'funnel' | 'vendors' | 'ontact' | 'fields' | 'records';

type AnalyticsResult = {
  source: string;
  ok: boolean;
  configured: boolean;
  status?: number;
  rows?: number;
  upstreamCount?: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
  analytics?: {
    fields: { numeric: string[]; text: string[] };
    totals: Record<string, number>;
    derived: Record<string, number>;
    byDate: Record<string, number | string>[];
    byVendor: Record<string, number | string>[];
    byAgent: Record<string, number | string>[];
    byStatus: Record<string, number | string>[];
    sample: Record<string, unknown>[];
  };
};

type Payload = { ok: boolean; mode: string; generatedAt: string; results: AnalyticsResult[] };

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const palette = ['#173f35', '#6f8f63', '#b7a16a', '#d8cda9', '#829a9c', '#25364b', '#8b5f3e', '#c8d7c5'];

const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);
const fmt = (value: unknown, key = '') => key.toLowerCase().includes('amount') || key.toLowerCase().includes('spend') || key.toLowerCase().startsWith('cp') ? currency.format(n(value)) : number.format(n(value));

function mergeResults(results: AnalyticsResult[]) {
  const ok = results.filter((r) => r.analytics);
  const totals: Record<string, number> = {};
  const byVendor = new Map<string, Record<string, number | string>>();
  const byDate = new Map<string, Record<string, number | string>>();
  const byAgent = new Map<string, Record<string, number | string>>();
  const byStatus = new Map<string, Record<string, number | string>>();
  const numeric = new Set<string>();
  const text = new Set<string>();
  const sample: Record<string, unknown>[] = [];

  const addMap = (map: Map<string, Record<string, number | string>>, keyName: string, row: Record<string, number | string>) => {
    const key = String(row[keyName] ?? 'Unknown');
    const bucket = map.get(key) ?? { [keyName]: key };
    for (const [field, value] of Object.entries(row)) {
      if (field === keyName) continue;
      bucket[field] = n(bucket[field]) + n(value);
    }
    map.set(key, bucket);
  };

  for (const result of ok) {
    const a = result.analytics!;
    a.fields.numeric.forEach((field) => numeric.add(field));
    a.fields.text.forEach((field) => text.add(field));
    for (const [field, value] of Object.entries(a.totals)) totals[field] = (totals[field] ?? 0) + n(value);
    a.byVendor.forEach((row) => addMap(byVendor, 'vendor', row));
    a.byDate.forEach((row) => addMap(byDate, 'date', row));
    a.byAgent.forEach((row) => addMap(byAgent, 'agent', row));
    a.byStatus.forEach((row) => addMap(byStatus, 'status', row));
    sample.push(...a.sample.map((row) => ({ source: result.source, ...row })));
  }

  const derived = {
    spend: totals.Amount_Spent ?? 0,
    fetchedLeads: totals.Fetched_Leads ?? 0,
    acceptedLeads: totals.Accepted_Leads ?? totals.Total_Leads_Delivered_OnTact ?? 0,
    qualifiedLeads: totals.Qualified_Leads ?? 0,
    sales: (totals.MTN_Sales ?? 0) + (totals.Total_Leads_Sold_A ?? 0) + (totals.Total_Leads_Sold_B ?? 0) + (totals.Total_Leads_Sold_C ?? 0) + (totals.Total_Leads_Sold_D ?? 0),
    activations: totals.MTN_Activated_Sales ?? 0,
    calls: totals.records ?? 0,
    talkSeconds: totals.length_in_sec ?? 0,
    cpl: totals.Form_Completion ? (totals.Amount_Spent ?? 0) / totals.Form_Completion : 0,
    cpaAccepted: totals.Accepted_Leads ? (totals.Amount_Spent ?? 0) / totals.Accepted_Leads : 0,
    acceptedRate: totals.Fetched_Leads ? (totals.Accepted_Leads ?? 0) / totals.Fetched_Leads : 0,
    answerRate: totals.MTN_Dialed_Leads ? (totals.MTN_Answered_Calls ?? 0) / totals.MTN_Dialed_Leads : 0
  };

  return {
    totals,
    derived,
    fields: { numeric: [...numeric].sort(), text: [...text].sort() },
    byVendor: [...byVendor.values()].sort((a, b) => n(b.records) - n(a.records)),
    byDate: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    byAgent: [...byAgent.values()].sort((a, b) => n(b.records) - n(a.records)).slice(0, 20),
    byStatus: [...byStatus.values()].sort((a, b) => n(b.records) - n(a.records)),
    sample: sample.slice(0, 200)
  };
}

function StatCard({ title, value, sub, icon: Icon }: { title: string; value: string; sub: string; icon: React.ElementType }) {
  return <section className="card stat-card"><div className="stat-icon"><Icon size={18}/></div><div><p>{title}</p><strong>{value}</strong><span>{sub}</span></div></section>;
}

function App() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [source, setSource] = useState<ApiSource>('all');
  const [tab, setTab] = useState<Tab>('executive');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      if (source !== 'all') params.set('source', source);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/analytics?${params}`);
      const data = await res.json();
      setPayload(data);
      if (!data.ok) setError('One or more API sources need attention. Check configuration/status cards below.');
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  const model = useMemo(() => mergeResults(payload?.results ?? []), [payload]);
  const tabs: { id: Tab; label: string }[] = [
    { id: 'executive', label: 'Executive' }, { id: 'funnel', label: 'Journey Funnel' }, { id: 'vendors', label: 'Vendors' },
    { id: 'ontact', label: 'Ontact Ops' }, { id: 'fields', label: 'Metric Dictionary' }, { id: 'records', label: 'Records' }
  ];

  const funnel = [
    { name: 'Fetched', value: model.derived.fetchedLeads },
    { name: 'Valid ID + Phone', value: model.totals.Total_Leads_WithValid_Phone_ID ?? model.derived.fetchedLeads },
    { name: 'Dedupe Passed', value: (model.totals.Total_Leads_Dedupe_Passed_BLC ?? 0) + (model.totals.Total_Leads_Dedupe_Passed_MTN ?? 0) + (model.totals.Total_Leads_Dedupe_Passed_Mondo ?? 0) },
    { name: 'Delivered / Accepted', value: model.derived.acceptedLeads },
    { name: 'Qualified / RPC', value: model.derived.qualifiedLeads || model.totals.MTN_Right_Party_Contact || 0 },
    { name: 'Sales', value: model.derived.sales },
    { name: 'Activated', value: model.derived.activations }
  ].filter((x) => x.value > 0);

  const importantFields = ['Fetched_Leads','Valid_IDNumber','Valid_Phone','Total_Leads_WithValid_Phone_ID','Total_Leads_Passed_BLC_Vetting','Total_Leads_Dedupe_Passed_BLC','Total_Leads_Delivered_OnTact','Total_Leads_Is_MTN_Lead','Total_Leads_Dedupe_Passed_MTN','Total_Leads_Delivered_MTN','Total_Mondo_Grade_Passed_Lead','Total_Leads_Dedupe_Passed_Mondo','Total_Leads_Delivered_Mondo','Accepted_Leads','Qualified_Leads','MTN_Dialed_Leads','MTN_Answered_Calls','MTN_Right_Party_Contact','MTN_Sales','MTN_Delivered_Sales','MTN_Activated_Sales','Amount_Spent','Impressions','Clicks','Outbound_Clicks','Landing_Page_View','Form_Completion'];

  return <main>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">CIQ</div><div><b>ConvertIQ</b><span>Analytics command center</span></div></div>
      <nav>{tabs.map((t) => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</nav>
      <div className="sync-panel"><ShieldCheck size={18}/><b>Secure live API sync</b><span>Credentials stay in Cloudflare environment variables. The browser only calls /api/analytics.</span></div>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <div><p className="eyebrow">Live API analytics · no database</p><h1>Onvest × Ontact Performance Dashboard</h1><p className="subcopy">Tracks every numeric parameter detected in the API payload and converts it into executive KPIs, funnel movement, vendor performance and call-centre operational views.</p></div>
        <button className="primary" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/> {loading ? 'Syncing' : 'Sync API'}</button>
      </header>

      <section className="controls card"><SlidersHorizontal size={18}/><select value={source} onChange={(e) => setSource(e.target.value as ApiSource)}><option value="all">All sources</option><option value="onvest">Onvest only</option><option value="ontact">Ontact only</option></select><input type="date" value={from} onChange={(e) => setFrom(e.target.value)}/><input type="date" value={to} onChange={(e) => setTo(e.target.value)}/><button onClick={load}>Apply filters</button><span>{payload ? `Last sync: ${new Date(payload.generatedAt).toLocaleString()}` : 'Not synced yet'}</span></section>
      {error && <section className="notice">{error}</section>}

      <section className="source-grid">
        {(payload?.results ?? []).map((r) => <section className="card source-card" key={r.source}><span className={r.ok ? 'pill ok' : 'pill warn'}>{r.ok ? 'Connected' : 'Attention'}</span><h3>{r.source.toUpperCase()}</h3><p>{r.ok ? `${number.format(r.rows ?? 0)} rows synced · ${number.format(r.upstreamCount ?? r.rows ?? 0)} upstream count` : r.error}</p></section>)}
      </section>

      {tab === 'executive' && <>
        <section className="kpi-grid">
          <StatCard title="Media Spend" value={currency.format(model.derived.spend)} sub="Amount_Spent from API" icon={DatabaseZap}/>
          <StatCard title="Fetched Leads" value={number.format(model.derived.fetchedLeads)} sub="Top-of-funnel lead volume" icon={UsersRound}/>
          <StatCard title="Accepted Leads" value={number.format(model.derived.acceptedLeads)} sub={`Acceptance rate ${pct.format(model.derived.acceptedRate)}`} icon={CheckCircle2}/>
          <StatCard title="Sales / Activations" value={`${number.format(model.derived.sales)} / ${number.format(model.derived.activations)}`} sub="Vendor conversion output" icon={Gauge}/>
          <StatCard title="Cost per Form" value={currency.format(model.derived.cpl)} sub="Spend / Form_Completion" icon={Activity}/>
          <StatCard title="Cost per Accepted" value={currency.format(model.derived.cpaAccepted)} sub="Spend / Accepted_Leads" icon={BarChart3}/>
        </section>
        <section className="grid two"><ChartCard title="Daily performance trend"><ResponsiveContainer width="100%" height={320}><AreaChart data={model.byDate}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area dataKey="Amount_Spent" name="Spend"/><Area dataKey="Fetched_Leads" name="Fetched"/><Area dataKey="Accepted_Leads" name="Accepted"/></AreaChart></ResponsiveContainer></ChartCard><ChartCard title="Vendor distribution"><ResponsiveContainer width="100%" height={320}><PieChart><Pie data={model.byVendor} dataKey="records" nameKey="vendor" outerRadius={110} label>{model.byVendor.map((_, i) => <Cell key={i} fill={palette[i % palette.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard></section>
      </>}

      {tab === 'funnel' && <section className="grid two"><ChartCard title="Journey waterfall"><ResponsiveContainer width="100%" height={420}><FunnelChart><Tooltip/><Funnel dataKey="value" data={funnel} isAnimationActive><LabelList position="right" fill="#173f35" stroke="none" dataKey="name"/></Funnel></FunnelChart></ResponsiveContainer></ChartCard><MetricTable title="Funnel source metrics" rows={importantFields.filter((f) => model.totals[f] !== undefined).map((f) => ({ metric: f, value: fmt(model.totals[f], f) }))}/></section>}

      {tab === 'vendors' && <section className="grid two"><ChartCard title="Vendor volume"><ResponsiveContainer width="100%" height={420}><BarChart data={model.byVendor}><CartesianGrid vertical={false}/><XAxis dataKey="vendor"/><YAxis/><Tooltip/><Bar dataKey="Fetched_Leads" name="Fetched"/><Bar dataKey="Accepted_Leads" name="Accepted"/><Bar dataKey="MTN_Activated_Sales" name="Activated"/></BarChart></ResponsiveContainer></ChartCard><DataTable rows={model.byVendor} title="Vendor metric matrix"/></section>}

      {tab === 'ontact' && <section className="grid two"><ChartCard title="Agent productivity"><ResponsiveContainer width="100%" height={420}><BarChart data={model.byAgent}><CartesianGrid vertical={false}/><XAxis dataKey="agent"/><YAxis/><Tooltip/><Bar dataKey="records" name="Records / Calls"/><Bar dataKey="length_in_sec" name="Talk seconds"/></BarChart></ResponsiveContainer></ChartCard><ChartCard title="Call status mix"><ResponsiveContainer width="100%" height={420}><RLineChart data={model.byStatus}><CartesianGrid vertical={false}/><XAxis dataKey="status"/><YAxis/><Tooltip/><Line dataKey="records" name="Records" strokeWidth={3}/></RLineChart></ResponsiveContainer></ChartCard><DataTable rows={model.byAgent} title="Agent detail"/><DataTable rows={model.byStatus} title="Status detail"/></section>}

      {tab === 'fields' && <section className="grid two"><MetricTable title={`Numeric metrics detected (${model.fields.numeric.length})`} rows={model.fields.numeric.map((field) => ({ metric: field, value: fmt(model.totals[field], field) }))}/><MetricTable title={`Text / dimension fields detected (${model.fields.text.length})`} rows={model.fields.text.map((field) => ({ metric: field, value: 'Dimension / filter' }))}/></section>}

      {tab === 'records' && <DataTable rows={model.sample} title="Sanitised sample records"/>}
    </section>
  </main>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="card chart-card"><h2>{title}</h2>{children}</section>; }
function MetricTable({ title, rows }: { title: string; rows: { metric: string; value: string }[] }) { return <section className="card table-card"><h2>{title}</h2><div className="table-wrap"><table><tbody>{rows.map((r) => <tr key={r.metric}><td>{r.metric}</td><td>{r.value}</td></tr>)}</tbody></table></div></section>; }
function DataTable({ title, rows }: { title: string; rows: Record<string, unknown>[] }) { const keys = Array.from(new Set(rows.flatMap((r) => Object.keys(r)))).slice(0, 18); return <section className="card table-card wide"><h2>{title}</h2><div className="table-wrap"><table><thead><tr>{keys.map((k) => <th key={k}>{k}</th>)}</tr></thead><tbody>{rows.slice(0, 100).map((row, i) => <tr key={i}>{keys.map((k) => <td key={k}>{String(row[k] ?? '')}</td>)}</tr>)}</tbody></table></div></section>; }

createRoot(document.getElementById('root')!).render(<App />);
