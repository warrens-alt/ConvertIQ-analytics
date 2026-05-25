import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, DatabaseZap, RefreshCw, ShieldCheck, SlidersHorizontal, Table2, Search, Columns3, Gauge, UsersRound } from 'lucide-react';
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
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import './styles.css';

type ApiSource = 'onvest' | 'ontact';
type Tab = 'overview' | 'parameters' | 'rows' | 'funnel' | 'vendors' | 'operations';

type FieldProfile = {
  field: string;
  group: string;
  role: string;
  type: string;
  numeric: boolean;
  pii: boolean;
  nonNull: number;
  total?: number;
  sampleValues: string[];
};

type AnalyticsResult = {
  source: string;
  ok: boolean;
  configured: boolean;
  status?: number;
  rows?: number;
  upstreamCount?: number;
  truncated?: boolean;
  maxRows?: number;
  recordLimit?: number;
  defaultWindowApplied?: boolean;
  error?: string;
  analytics?: {
    fields: { numeric: string[]; text: string[] };
    fieldCatalog: FieldProfile[];
    columns: string[];
    totals: Record<string, number>;
    derived: Record<string, number>;
    byDate: Record<string, number | string>[];
    byVendor: Record<string, number | string>[];
    byAgent: Record<string, number | string>[];
    byStatus: Record<string, number | string>[];
    records: Record<string, unknown>[];
    recordsReturned: number;
    recordLimit: number;
  };
};

type Payload = { ok: boolean; mode: string; generatedAt: string; results: AnalyticsResult[] };

const currency = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const palette = ['#173f35', '#6f8f63', '#b7a16a', '#d8cda9', '#829a9c', '#25364b', '#8b5f3e', '#c8d7c5'];

const n = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : Number(value) || 0);
const fmt = (value: unknown, key = '') => key.toLowerCase().includes('amount') || key.toLowerCase().includes('spend') || key.toLowerCase().startsWith('cp') ? currency.format(n(value)) : number.format(n(value));

function isPayload(value: unknown): value is Payload {
  if (!value || typeof value !== 'object') return false;
  const maybe = value as Partial<Payload>;
  return typeof maybe.ok === 'boolean' && typeof maybe.generatedAt === 'string' && Array.isArray(maybe.results);
}

function StatCard({ title, value, sub, icon: Icon }: { title: string; value: string; sub: string; icon: React.ElementType }) {
  return <section className="card stat-card"><div className="stat-icon"><Icon size={18}/></div><div><p>{title}</p><strong>{value}</strong><span>{sub}</span></div></section>;
}

function App() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [source, setSource] = useState<ApiSource>('onvest');
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

  const load = async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams();
      params.set('source', source);
      params.set('maxRows', maxRows);
      params.set('recordLimit', recordLimit);
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`/api/analytics?${params}`);
      const data: unknown = await res.json();
      if (!isPayload(data)) throw new Error('The API route returned an unexpected payload shape.');
      setPayload(data);
      if (!data.ok) setError(data.results[0]?.error || 'The selected API source needs attention.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  const result = payload?.results?.[0];
  const analytics = result?.analytics;
  const totals = analytics?.totals ?? {};
  const derived = analytics?.derived ?? {};
  const fields = analytics?.fieldCatalog ?? [];
  const records = analytics?.records ?? [];
  const columns = analytics?.columns ?? [];

  const groups = useMemo(() => ['all', ...Array.from(new Set(fields.map((field) => field.group))).sort()], [fields]);
  const filteredFields = useMemo(() => {
    const q = fieldSearch.toLowerCase();
    return fields.filter((field) =>
      (groupFilter === 'all' || field.group === groupFilter) &&
      (!q || field.field.toLowerCase().includes(q) || field.group.toLowerCase().includes(q) || field.role.toLowerCase().includes(q))
    );
  }, [fields, fieldSearch, groupFilter]);

  const filteredRecords = useMemo(() => {
    const q = rowSearch.toLowerCase();
    if (!q) return records;
    return records.filter((record) => Object.values(record).some((value) => String(value ?? '').toLowerCase().includes(q))).slice(0, 250);
  }, [records, rowSearch]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'parameters', label: 'All Parameters' },
    { id: 'rows', label: 'All Rows' },
    { id: 'funnel', label: 'Journey Funnel' },
    { id: 'vendors', label: 'Vendors' },
    { id: 'operations', label: 'Operations' }
  ];

  const funnel = [
    { name: 'Fetched', value: n(derived.fetchedLeads) },
    { name: 'Valid ID + Phone', value: n(totals.Total_Leads_WithValid_Phone_ID) || n(derived.fetchedLeads) },
    { name: 'BLC Passed', value: n(totals.Total_Leads_Passed_BLC_Vetting) },
    { name: 'BLC Delivered OnTact', value: n(totals.Total_Leads_Delivered_OnTact) },
    { name: 'MTN Delivered', value: n(totals.Total_Leads_Delivered_MTN) },
    { name: 'Mondo Delivered', value: n(totals.Total_Leads_Delivered_Mondo) },
    { name: 'Accepted', value: n(derived.acceptedLeads) },
    { name: 'Qualified', value: n(derived.qualifiedLeads) },
    { name: 'Sales', value: n(derived.sales) },
    { name: 'Activated', value: n(derived.activations) }
  ].filter((x) => x.value > 0);

  return <main>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">CIQ</div><div><b>ConvertIQ</b><span>Analytics command center</span></div></div>
      <nav>{tabs.map((t) => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>{t.label}</button>)}</nav>
      <div className="sync-panel"><ShieldCheck size={18}/><b>Full parameter mode</b><span>Lists every field detected in the selected API payload and shows sanitised row-level records.</span></div>
    </aside>

    <section className="workspace">
      <header className="topbar">
        <div>
          <p className="eyebrow">Live API analytics · full parameter registry</p>
          <h1>{source === 'onvest' ? 'Onvest Dashboard API' : 'Ontact Analytics API'}</h1>
          <p className="subcopy">Every API parameter is profiled, grouped, totalled where numeric, and shown in the row explorer. Sensitive lead fields are redacted but still listed in the parameter registry.</p>
        </div>
        <button className="primary" onClick={load} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/> {loading ? 'Syncing' : 'Sync API'}</button>
      </header>

      <section className="controls card">
        <SlidersHorizontal size={18}/>
        <select value={source} onChange={(e) => setSource(e.target.value as ApiSource)}><option value="onvest">Onvest Dashboard API</option><option value="ontact">Ontact Analytics API</option></select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}/>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}/>
        <select value={maxRows} onChange={(e) => setMaxRows(e.target.value)}><option value="1000">Process 1,000 rows</option><option value="5000">Process 5,000 rows</option><option value="10000">Process 10,000 rows</option><option value="15000">Process 15,000 rows</option></select>
        <select value={recordLimit} onChange={(e) => setRecordLimit(e.target.value)}><option value="250">Show 250 rows</option><option value="1000">Show 1,000 rows</option><option value="2500">Show 2,500 rows</option><option value="5000">Show 5,000 rows</option></select>
        <button onClick={load}>Apply</button>
        <span>{payload ? `Last sync: ${new Date(payload.generatedAt).toLocaleString()}` : 'Not synced yet'}</span>
      </section>

      {error && <section className="notice">{error}</section>}
      {result?.defaultWindowApplied && <section className="notice soft">No date range was selected, so the request used a safe recent window. Select dates to inspect a specific period.</section>}
      {result?.truncated && <section className="notice soft">Large response protected: processed {number.format(result.rows ?? 0)} of {number.format(result.upstreamCount ?? 0)} upstream rows.</section>}

      <section className="source-grid">
        <section className="card source-card"><span className={result?.ok ? 'pill ok' : 'pill warn'}>{result?.ok ? 'Connected' : 'Attention'}</span><h3>{source.toUpperCase()}</h3><p>{result?.ok ? `${number.format(result.rows ?? 0)} rows processed · ${number.format(result.upstreamCount ?? result.rows ?? 0)} upstream rows` : result?.error || 'Waiting for sync'}</p></section>
        <section className="card source-card"><span className="pill ok">Parameters</span><h3>{number.format(fields.length)}</h3><p>{number.format(fields.filter((f) => f.numeric).length)} numeric · {number.format(fields.filter((f) => f.pii).length)} redacted sensitive fields</p></section>
        <section className="card source-card"><span className="pill ok">Rows</span><h3>{number.format(records.length)}</h3><p>Sanitised records returned for table inspection.</p></section>
      </section>

      {tab === 'overview' && <>
        <section className="kpi-grid">
          <StatCard title="Media Spend" value={currency.format(n(derived.spend))} sub="Amount_Spent" icon={DatabaseZap}/>
          <StatCard title="Fetched Leads" value={number.format(n(derived.fetchedLeads))} sub="Fetched_Leads" icon={UsersRound}/>
          <StatCard title="Accepted Leads" value={number.format(n(derived.acceptedLeads))} sub={`Acceptance ${pct.format(n(derived.acceptedRate))}`} icon={Gauge}/>
          <StatCard title="Sales / Activations" value={`${number.format(n(derived.sales))} / ${number.format(n(derived.activations))}`} sub="Vendor conversion output" icon={BarChart3}/>
        </section>
        <section className="grid two">
          <ChartCard title="Daily numeric trend"><ResponsiveContainer width="100%" height={320}><AreaChart data={analytics?.byDate ?? []}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area dataKey="Amount_Spent" name="Spend"/><Area dataKey="Fetched_Leads" name="Fetched"/><Area dataKey="Accepted_Leads" name="Accepted"/><Area dataKey="records" name="Records"/></AreaChart></ResponsiveContainer></ChartCard>
          <ChartCard title="Parameter groups"><ResponsiveContainer width="100%" height={320}><PieChart><Pie data={groups.filter((g) => g !== 'all').map((g) => ({ group: g, value: fields.filter((f) => f.group === g).length }))} dataKey="value" nameKey="group" outerRadius={110} label>{groups.map((_, i) => <Cell key={i} fill={palette[i % palette.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></ChartCard>
        </section>
      </>}

      {tab === 'parameters' && <section className="card table-card wide">
        <div className="section-head"><div><h2>All parameters / fields</h2><p>{number.format(filteredFields.length)} visible of {number.format(fields.length)} detected fields.</p></div><div className="inline-tools"><Search size={16}/><input placeholder="Search parameter..." value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)}/><select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>{groups.map((g) => <option key={g} value={g}>{g}</option>)}</select></div></div>
        <div className="table-wrap"><table><thead><tr><th>#</th><th>Parameter</th><th>Group</th><th>Role</th><th>Type</th><th>Numeric</th><th>PII</th><th>Non-null rows</th><th>Total</th><th>Sample values</th></tr></thead><tbody>{filteredFields.map((field, index) => <tr key={field.field}><td>{index + 1}</td><td>{field.field}</td><td>{field.group}</td><td>{field.role}</td><td>{field.type}</td><td>{field.numeric ? 'Yes' : 'No'}</td><td>{field.pii ? 'Redacted' : 'No'}</td><td>{number.format(field.nonNull)}</td><td>{field.numeric ? fmt(field.total, field.field) : ''}</td><td>{field.sampleValues.join(' | ')}</td></tr>)}</tbody></table></div>
      </section>}

      {tab === 'rows' && <section className="card table-card wide">
        <div className="section-head"><div><h2>All rows / records</h2><p>{number.format(filteredRecords.length)} visible rows · {number.format(columns.length)} columns. Sensitive fields are redacted.</p></div><div className="inline-tools"><Search size={16}/><input placeholder="Search rows..." value={rowSearch} onChange={(e) => setRowSearch(e.target.value)}/></div></div>
        <DataTable rows={filteredRecords} columns={columns} title=""/>
      </section>}

      {tab === 'funnel' && <section className="grid two">
        <ChartCard title="Journey waterfall"><ResponsiveContainer width="100%" height={420}><FunnelChart><Tooltip/><Funnel dataKey="value" data={funnel} isAnimationActive><LabelList position="right" fill="#173f35" stroke="none" dataKey="name"/></Funnel></FunnelChart></ResponsiveContainer></ChartCard>
        <MetricTable title="All numeric totals" rows={(analytics?.fields.numeric ?? []).map((field) => ({ metric: field, value: fmt(totals[field], field) }))}/>
      </section>}

      {tab === 'vendors' && <section className="grid two">
        <ChartCard title="Vendor / source volume"><ResponsiveContainer width="100%" height={420}><BarChart data={analytics?.byVendor ?? []}><CartesianGrid vertical={false}/><XAxis dataKey="vendor"/><YAxis/><Tooltip/><Bar dataKey="records" name="Records"/><Bar dataKey="Fetched_Leads" name="Fetched"/><Bar dataKey="Accepted_Leads" name="Accepted"/></BarChart></ResponsiveContainer></ChartCard>
        <DataTable rows={analytics?.byVendor ?? []} title="Vendor / source metric matrix"/>
      </section>}

      {tab === 'operations' && <section className="grid two">
        <ChartCard title="Agent productivity"><ResponsiveContainer width="100%" height={420}><BarChart data={analytics?.byAgent ?? []}><CartesianGrid vertical={false}/><XAxis dataKey="agent"/><YAxis/><Tooltip/><Bar dataKey="records" name="Records / Calls"/><Bar dataKey="length_in_sec" name="Talk seconds"/></BarChart></ResponsiveContainer></ChartCard>
        <DataTable rows={analytics?.byStatus ?? []} title="Status / outcome breakdown"/>
      </section>}
    </section>
  </main>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="card chart-card"><h2>{title}</h2>{children}</section>;
}

function MetricTable({ title, rows }: { title: string; rows: { metric: string; value: string }[] }) {
  return <section className="card table-card"><h2>{title}</h2><div className="table-wrap"><table><tbody>{rows.map((r) => <tr key={r.metric}><td>{r.metric}</td><td>{r.value}</td></tr>)}</tbody></table></div></section>;
}

function DataTable({ title, rows, columns }: { title: string; rows: Record<string, unknown>[]; columns?: string[] }) {
  const keys = (columns && columns.length ? columns : Array.from(new Set(rows.flatMap((r) => Object.keys(r))))).slice(0, 120);
  return <section className={title ? 'card table-card wide' : 'table-card-inner'}>{title && <h2>{title}</h2>}<div className="table-wrap rows-table"><table><thead><tr>{keys.map((k) => <th key={k}>{k}</th>)}</tr></thead><tbody>{rows.map((row, i) => <tr key={i}>{keys.map((k) => <td key={k}>{String(row[k] ?? '')}</td>)}</tr>)}</tbody></table></div></section>;
}

createRoot(document.getElementById('root')!).render(<App />);
