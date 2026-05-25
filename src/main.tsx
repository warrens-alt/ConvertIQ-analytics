import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarChart3, DatabaseZap, Gauge, RefreshCw, Search, ShieldCheck, SlidersHorizontal, UsersRound } from 'lucide-react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Funnel, FunnelChart, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import './styles.css';
import './unified.css';

type ApiSource = 'unified' | 'onvest' | 'ontact' | 'powerbi';
type AtomicSource = 'onvest' | 'ontact' | 'powerbi';
type Tab = 'overview' | 'parameters' | 'rows' | 'funnel' | 'vendors' | 'operations' | 'powerbi';

type FieldProfile = { source?: string; field: string; rawField?: string; group: string; role: string; type: string; numeric: boolean; pii: boolean; nonNull: number; total?: number; sampleValues: string[] };
type Analytics = { fields: { numeric: string[]; text: string[] }; fieldCatalog: FieldProfile[]; columns: string[]; totals: Record<string, number>; derived: Record<string, number>; byDate: Record<string, number | string>[]; byVendor: Record<string, number | string>[]; byAgent: Record<string, number | string>[]; byStatus: Record<string, number | string>[]; records: Record<string, unknown>[]; recordsReturned: number; recordLimit: number };
type AnalyticsResult = { source: string; ok: boolean; configured: boolean; status?: number; type?: string; rows?: number; upstreamCount?: number; truncated?: boolean; maxRows?: number; recordLimit?: number; defaultWindowApplied?: boolean; error?: string; reportTitle?: string; queryDataEndpoint?: string; analytics?: Analytics };
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
    const analytics = result.analytics!;
    analytics.fields.numeric.forEach((field) => numeric.add(field));
    analytics.fields.text.forEach((field) => text.add(field));
    for (const [field, value] of Object.entries(analytics.totals)) totals[field] = (totals[field] ?? 0) + n(value);
    fields.push(...analytics.fieldCatalog.map((field) => ({ ...field, source: result.source, rawField: field.field, field: `${result.source}.${field.field}` })));
    analytics.columns.forEach((column) => columns.add(column));
    records.push(...analytics.records.map((record) => ({ __source: result.source, ...record })));
    analytics.byDate.forEach((row) => addNumericRow(byDate, 'date', row));
    analytics.byVendor.forEach((row) => addNumericRow(byVendor, 'vendor', row));
    analytics.byAgent.forEach((row) => addNumericRow(byAgent, 'agent', row));
    analytics.byStatus.forEach((row) => addNumericRow(byStatus, 'status', row));
  }

  const derived = {
    spend: totals.Amount_Spent ?? 0,
    fetchedLeads: totals.Fetched_Leads ?? 0,
    acceptedLeads: totals.Accepted_Leads ?? totals.Total_Leads_Delivered_OnTact ?? 0,
    qualifiedLeads: totals.Qualified_Leads ?? 0,
    sales: (totals.MTN_Sales ?? 0) + (totals.Total_Leads_Sold_A ?? 0) + (totals.Total_Leads_Sold_B ?? 0) + (totals.Total_Leads_Sold_C ?? 0) + (totals.Total_Leads_Sold_D ?? 0),
    activations: (totals.MTN_Activated_Sales ?? 0) + (totals.count_activation ?? 0) + (totals.total_activations ?? 0),
    captureComplete: totals.total_capture_complete ?? totals.count_capture_complete ?? 0,
    nettApps: totals.count_nett_app ?? totals.total_nett_apps ?? 0,
    calls: totals.length_in_sec ? totals.records ?? 0 : 0,
    talkSeconds: totals.length_in_sec ?? 0,
    cpl: totals.Form_Completion ? (totals.Amount_Spent ?? 0) / totals.Form_Completion : 0,
    cpaAccepted: totals.Accepted_Leads ? (totals.Amount_Spent ?? 0) / totals.Accepted_Leads : 0,
    acceptedRate: totals.Fetched_Leads ? (totals.Accepted_Leads ?? 0) / totals.Fetched_Leads : 0,
    answerRate: totals.MTN_Dialed_Leads ? (totals.MTN_Answered_Calls ?? 0) / totals.MTN_Dialed_Leads : 0
  };

  return { fields: { numeric: [...numeric].sort(), text: [...text].sort() }, fieldCatalog: fields, columns: [...columns], totals, derived, byDate: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))), byVendor: [...byVendor.values()].sort((a, b) => n(b.records) - n(a.records)), byAgent: [...byAgent.values()].sort((a, b) => n(b.records) - n(a.records)).slice(0, 50), byStatus: [...byStatus.values()].sort((a, b) => n(b.records) - n(a.records)), records: records.slice(0, 5000), recordsReturned: records.length, recordLimit: records.length };
}

function StatCard({ title, value, sub, icon: Icon }: { title: string; value: string; sub: string; icon: React.ElementType }) {
  return <section className="card stat-card"><div className="stat-icon"><Icon size={18}/></div><div><p>{title}</p><strong>{value}</strong><span>{sub}</span></div></section>;
}

function App() {
  const [payload, setPayload] = useState<Payload | null>(null);
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

  const load = async (nextSource: ApiSource = source) => {
    setLoading(true); setError('');
    try {
      const targets: AtomicSource[] = nextSource === 'unified' ? ['onvest', 'ontact', 'powerbi'] : [nextSource];
      const responses = await Promise.all(targets.map((target) => fetchOne(target, nextSource)));
      const combined: Payload = { ok: responses.every((response) => response.ok), mode: nextSource === 'unified' ? 'unified-client-side-live-sync' : responses[0]?.mode ?? 'single-source-live-sync', generatedAt: new Date().toISOString(), results: responses.flatMap((response) => response.results) };
      setPayload(combined);
      if (!combined.ok) setError(combined.results.filter((result) => !result.ok).map((result) => `${result.source}: ${result.error || 'needs attention'}`).join(' | ') || 'One or more sources need attention.');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load('unified'); }, []);

  const results = payload?.results ?? [];
  const result = source === 'unified' ? undefined : results.find((item) => item.source === source) ?? results[0];
  const analytics = source === 'unified' ? mergeAnalytics(results) : result?.analytics ?? emptyAnalytics();
  const totals = analytics.totals;
  const derived = analytics.derived;
  const fields = analytics.fieldCatalog;
  const records = analytics.records;
  const columns = analytics.columns;
  const isUnified = source === 'unified';
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
    { id: 'overview', label: 'Unified Overview' }, { id: 'parameters', label: 'All Parameters' }, { id: 'rows', label: 'All Rows' },
    { id: 'funnel', label: 'Journey Funnel' }, { id: 'vendors', label: 'Vendors' }, { id: 'operations', label: 'Operations' }, { id: 'powerbi', label: 'Power BI Data' }
  ];

  const sourceTitle = isUnified ? 'Unified ConvertIQ Analytics Dashboard' : source === 'onvest' ? 'Onvest Dashboard API' : source === 'ontact' ? 'Ontact Analytics API' : 'Power BI QueryData';
  const sourceCopy = isUnified ? 'One command-center view combining Onvest funnel/media metrics, Ontact call-centre records, and Power BI QueryData. Power BI is pulled as data, not embedded as an iframe.' : isPowerBi ? 'Power BI is now treated as a data source. The dashboard calls the Power BI querydata endpoint and transforms the returned rows into charts, totals, parameters and row tables.' : 'Every API parameter is profiled, grouped, totalled where numeric, and shown in the row explorer. Sensitive lead fields are redacted but still listed in the parameter registry.';

  const funnel = [
    { name: 'Fetched', value: n(derived.fetchedLeads) }, { name: 'Valid ID + Phone', value: n(totals.Total_Leads_WithValid_Phone_ID) || n(derived.fetchedLeads) },
    { name: 'BLC Passed', value: n(totals.Total_Leads_Passed_BLC_Vetting) }, { name: 'BLC Delivered OnTact', value: n(totals.Total_Leads_Delivered_OnTact) },
    { name: 'MTN Delivered', value: n(totals.Total_Leads_Delivered_MTN) }, { name: 'Mondo Delivered', value: n(totals.Total_Leads_Delivered_Mondo) },
    { name: 'Accepted', value: n(derived.acceptedLeads) }, { name: 'Qualified', value: n(derived.qualifiedLeads) },
    { name: 'Sales', value: n(derived.sales) }, { name: 'Activations', value: n(derived.activations) }
  ].filter((item) => item.value > 0);

  const sourceBreakdown = results.map((item) => ({ source: item.source, rows: item.rows ?? 0, parameters: item.analytics?.fieldCatalog.length ?? 0, records: item.analytics?.records.length ?? 0 }));
  const powerBiRows = source === 'unified' ? records.filter((row) => row.__source === 'powerbi') : records;
  const powerBiByQuery = Array.from(powerBiRows.reduce((map, row) => { const key = String(row.query ?? 'unknown'); const bucket = map.get(key) ?? { query: key, records: 0, count_activation: 0, total_activations: 0, total_capture_complete: 0, count_nett_app: 0 }; bucket.records += 1; bucket.count_activation += n(row.count_activation); bucket.total_activations += n(row.total_activations); bucket.total_capture_complete += n(row.total_capture_complete); bucket.count_nett_app += n(row.count_nett_app); map.set(key, bucket); return map; }, new Map<string, Record<string, number | string>>()).values());

  return <main>
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">CIQ</div><div><b>ConvertIQ</b><span>Analytics command center</span></div></div>
      <nav>{tabs.map((item) => <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
      <div className="sync-panel"><ShieldCheck size={18}/><b>Unified source layer</b><span>Onvest, Ontact and Power BI QueryData are unified into one dashboard.</span></div>
    </aside>

    <section className="workspace">
      <header className="topbar"><div><p className="eyebrow">Unified live analytics · source registry</p><h1>{sourceTitle}</h1><p className="subcopy">{sourceCopy}</p></div><button className="primary" onClick={() => load()} disabled={loading}><RefreshCw size={16} className={loading ? 'spin' : ''}/> {loading ? 'Syncing' : 'Sync dashboard'}</button></header>
      <section className="controls card"><SlidersHorizontal size={18}/><select value={source} onChange={(e) => { const next = e.target.value as ApiSource; setSource(next); if (next === 'powerbi') setTab('powerbi'); load(next); }}><option value="unified">Unified Dashboard</option><option value="onvest">Onvest Dashboard API</option><option value="ontact">Ontact Analytics API</option><option value="powerbi">Power BI QueryData</option></select><input type="date" value={from} onChange={(e) => setFrom(e.target.value)}/><input type="date" value={to} onChange={(e) => setTo(e.target.value)}/><select value={maxRows} onChange={(e) => setMaxRows(e.target.value)}><option value="1000">Process 1,000 rows</option><option value="5000">Process 5,000 rows</option><option value="10000">Process 10,000 rows</option><option value="15000">Process 15,000 rows</option></select><select value={recordLimit} onChange={(e) => setRecordLimit(e.target.value)}><option value="250">Show 250 rows</option><option value="1000">Show 1,000 rows</option><option value="2500">Show 2,500 rows</option><option value="5000">Show 5,000 rows</option></select><button onClick={() => load()}>Apply</button><span>{payload ? `Last sync: ${new Date(payload.generatedAt).toLocaleString()}` : 'Not synced yet'}</span></section>
      {error && <section className="notice">{error}</section>}
      {results.some((item) => item.defaultWindowApplied) && <section className="notice soft">No date range was selected, so each API request used a safe recent window where applicable. Select dates to inspect a specific period.</section>}
      {results.some((item) => item.truncated) && <section className="notice soft">Large response protected: at least one source was capped. Use date filters to narrow the period.</section>}

      <section className="source-grid">{results.map((item) => <section className="card source-card" key={item.source}><span className={item.ok ? 'pill ok' : 'pill warn'}>{item.ok ? 'Connected' : 'Attention'}</span><h3>{item.source.toUpperCase()}</h3><p>{item.source === 'powerbi' ? `${number.format(item.rows ?? 0)} Power BI QueryData rows pulled.` : item.ok ? `${number.format(item.rows ?? 0)} rows processed · ${number.format(item.upstreamCount ?? item.rows ?? 0)} upstream rows` : item.error || 'Waiting for sync'}</p></section>)}<section className="card source-card"><span className="pill ok">Unified Registry</span><h3>{number.format(fields.length)}</h3><p>{number.format(fields.filter((field) => field.numeric).length)} numeric · {number.format(fields.filter((field) => field.pii).length)} redacted sensitive fields</p></section><section className="card source-card"><span className="pill ok">Unified Rows</span><h3>{number.format(records.length)}</h3><p>Sanitised records combined across API sources.</p></section></section>

      {tab === 'overview' && <><section className="kpi-grid"><StatCard title="Media Spend" value={currency.format(n(derived.spend))} sub="Onvest Amount_Spent" icon={DatabaseZap}/><StatCard title="Fetched Leads" value={number.format(n(derived.fetchedLeads))} sub="Onvest Fetched_Leads" icon={UsersRound}/><StatCard title="Accepted Leads" value={number.format(n(derived.acceptedLeads))} sub={`Acceptance ${pct.format(n(derived.acceptedRate))}`} icon={Gauge}/><StatCard title="Sales / Activations" value={`${number.format(n(derived.sales))} / ${number.format(n(derived.activations))}`} sub="Includes Power BI QueryData activations" icon={BarChart3}/></section><section className="grid two"><ChartCard title="Unified daily trend"><ResponsiveContainer width="100%" height={320}><AreaChart data={analytics.byDate}><CartesianGrid vertical={false}/><XAxis dataKey="date"/><YAxis/><Tooltip/><Area dataKey="Amount_Spent" name="Spend"/><Area dataKey="Fetched_Leads" name="Fetched"/><Area dataKey="Accepted_Leads" name="Accepted"/><Area dataKey="count_activation" name="Power BI Activations"/><Area dataKey="records" name="Records"/></AreaChart></ResponsiveContainer></ChartCard><ChartCard title="Source composition"><ResponsiveContainer width="100%" height={320}><BarChart data={sourceBreakdown}><CartesianGrid vertical={false}/><XAxis dataKey="source"/><YAxis/><Tooltip/><Bar dataKey="rows" name="Rows"/><Bar dataKey="parameters" name="Parameters"/></BarChart></ResponsiveContainer></ChartCard></section></>}
      {tab === 'parameters' && <section className="card table-card wide"><div className="section-head"><div><h2>Unified parameter registry</h2><p>{number.format(filteredFields.length)} visible of {number.format(fields.length)} detected fields across all selected sources.</p></div><div className="inline-tools"><Search size={16}/><input placeholder="Search source, parameter or group..." value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)}/><select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>{groups.map((group) => <option key={group} value={group}>{group}</option>)}</select></div></div><div className="table-wrap"><table><thead><tr><th>#</th><th>Source</th><th>Parameter</th><th>Group</th><th>Role</th><th>Type</th><th>Numeric</th><th>PII</th><th>Non-null rows</th><th>Total</th><th>Sample values</th></tr></thead><tbody>{filteredFields.map((field, index) => <tr key={`${field.source}-${field.field}`}><td>{index + 1}</td><td>{field.source ?? source}</td><td>{field.rawField ?? field.field}</td><td>{field.group}</td><td>{field.role}</td><td>{field.type}</td><td>{field.numeric ? 'Yes' : 'No'}</td><td>{field.pii ? 'Redacted' : 'No'}</td><td>{number.format(field.nonNull)}</td><td>{field.numeric ? fmt(field.total, field.field) : ''}</td><td>{field.sampleValues.join(' | ')}</td></tr>)}</tbody></table></div></section>}
      {tab === 'rows' && <section className="card table-card wide"><div className="section-head"><div><h2>Unified row explorer</h2><p>{number.format(filteredRecords.length)} visible rows · {number.format(columns.length)} columns. Sensitive fields are redacted.</p></div><div className="inline-tools"><Search size={16}/><input placeholder="Search rows..." value={rowSearch} onChange={(e) => setRowSearch(e.target.value)}/></div></div><DataTable rows={filteredRecords} columns={columns} title=""/></section>}
      {tab === 'funnel' && <section className="grid two"><ChartCard title="Unified journey waterfall"><ResponsiveContainer width="100%" height={420}><FunnelChart><Tooltip/><Funnel dataKey="value" data={funnel} isAnimationActive><LabelList position="right" fill="#173f35" stroke="none" dataKey="name"/></Funnel></FunnelChart></ResponsiveContainer></ChartCard><MetricTable title="All numeric totals" rows={analytics.fields.numeric.map((field) => ({ metric: field, value: fmt(totals[field], field) }))}/></section>}
      {tab === 'vendors' && <section className="grid two"><ChartCard title="Vendor / source volume"><ResponsiveContainer width="100%" height={420}><BarChart data={analytics.byVendor}><CartesianGrid vertical={false}/><XAxis dataKey="vendor"/><YAxis/><Tooltip/><Bar dataKey="records" name="Records"/><Bar dataKey="Fetched_Leads" name="Fetched"/><Bar dataKey="Accepted_Leads" name="Accepted"/><Bar dataKey="count_activation" name="Power BI Activations"/></BarChart></ResponsiveContainer></ChartCard><DataTable rows={analytics.byVendor} title="Vendor / source metric matrix"/></section>}
      {tab === 'operations' && <section className="grid two"><ChartCard title="Agent productivity"><ResponsiveContainer width="100%" height={420}><BarChart data={analytics.byAgent}><CartesianGrid vertical={false}/><XAxis dataKey="agent"/><YAxis/><Tooltip/><Bar dataKey="records" name="Records / Calls"/><Bar dataKey="length_in_sec" name="Talk seconds"/><Bar dataKey="total_activations" name="Power BI Activations"/></BarChart></ResponsiveContainer></ChartCard><DataTable rows={analytics.byStatus} title="Status / outcome breakdown"/></section>}
      {tab === 'powerbi' && <section className="grid two"><ChartCard title="Power BI data by query"><ResponsiveContainer width="100%" height={420}><BarChart data={powerBiByQuery}><CartesianGrid vertical={false}/><XAxis dataKey="query"/><YAxis/><Tooltip/><Bar dataKey="count_activation" name="Activation Count"/><Bar dataKey="total_activations" name="Total Activations"/><Bar dataKey="total_capture_complete" name="Capture Complete"/><Bar dataKey="count_nett_app" name="Nett Apps"/></BarChart></ResponsiveContainer></ChartCard><DataTable rows={powerBiRows} title="Power BI QueryData rows"/></section>}
    </section>
  </main>;
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) { return <section className="card chart-card"><h2>{title}</h2>{children}</section>; }
function MetricTable({ title, rows }: { title: string; rows: { metric: string; value: string }[] }) { return <section className="card table-card"><h2>{title}</h2><div className="table-wrap"><table><tbody>{rows.map((row) => <tr key={row.metric}><td>{row.metric}</td><td>{row.value}</td></tr>)}</tbody></table></div></section>; }
function DataTable({ title, rows, columns }: { title: string; rows: Record<string, unknown>[]; columns?: string[] }) { const keys = (columns && columns.length ? columns : Array.from(new Set(rows.flatMap((row) => Object.keys(row))))).slice(0, 120); return <section className={title ? 'card table-card wide' : 'table-card-inner'}>{title && <h2>{title}</h2>}<div className="table-wrap rows-table"><table><thead><tr>{keys.map((key) => <th key={key}>{key}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{keys.map((key) => <td key={key}>{String(row[key] ?? '')}</td>)}</tr>)}</tbody></table></div></section>; }

createRoot(document.getElementById('root')!).render(<App />);
