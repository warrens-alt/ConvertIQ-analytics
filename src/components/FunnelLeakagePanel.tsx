import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildFunnelLeakageRows, buildSourceFunnelLeakage, summarizeFunnelLeakage, type FunnelRecord } from '../analytics/funnelLeakage';

type Props = { records: FunnelRecord[]; limit?: number };
type StageGroup = 'Lead + validation funnel' | 'MTN conversion funnel' | 'Power BI / ONtact-BLC commercial funnel';
type StageMetric = { key: string; label: string; group: StageGroup; aliases: string[]; queryHints?: string[] };
type AnalyticsPayload = { results?: Array<{ analytics?: { records?: FunnelRecord[] } }> };

type TrendRow = { date: string; fromVolume: number; retained: number; rawRetained: number; dropoff: number; retainedRate: number; dropoffRate: number };

const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const GROUPS: StageGroup[] = ['Lead + validation funnel', 'MTN conversion funnel', 'Power BI / ONtact-BLC commercial funnel'];

const STAGES: StageMetric[] = [
  ['leads', 'Leads', 'Lead + validation funnel', ['Fetched_Leads', 'Leads', 'Total_Leads', 'Total_Leads_Fetched']],
  ['standardised-id', 'Standardised ID', 'Lead + validation funnel', ['Standardised_ID_Number', 'Standardised_ID', 'Standardized_ID_Number', 'Standardized_ID']],
  ['standardised-phone', 'Standardised Phone', 'Lead + validation funnel', ['Standardised_Phone_Number', 'Standardised_Phone', 'Standardized_Phone_Number', 'Standardized_Phone']],
  ['valid-id', 'Valid ID', 'Lead + validation funnel', ['Valid_IDNumber', 'Valid_ID_Number', 'Valid_ID', 'Valid_IDNumber_Check']],
  ['valid-phone', 'Valid Phone', 'Lead + validation funnel', ['Valid_Phone', 'Valid_Phone_Number', 'ValidPhone']],
  ['valid-phone-id', 'Valid Phone + ID', 'Lead + validation funnel', ['Total_Leads_WithValid_Phone_ID', 'Total_Leads_With_Valid_Phone_ID', 'Valid_Phone_ID', 'ValidPhoneID']],
  ['blc-vetted', 'BLC Vetted', 'Lead + validation funnel', ['Total_Leads_Passed_BLC_Vetting', 'Total_Leads_Passed_BLCVetting', 'Total_Leads_Passed_BLC_Vetting_BLC', 'Total_Leads_Passed_BLCVetting_BLC']],
  ['blc-dedupe-passed', 'BLC Dedupe Passed', 'Lead + validation funnel', ['Total_Leads_Dedupe_Passed_BLC', 'Total_Leads_Passed_BLC_Dedupe', 'Total_Leads_Passed_Dedupe_BLC', 'Total_Leads_DedupePassed_BLC']],
  ['delivered-ontact', 'Delivered OnTact', 'Lead + validation funnel', ['Total_Leads_Delivered_OnTact', 'Total_Leads_Delivered_Ontact', 'Total_Leads_Delivered_To_OnTact', 'Total_Leads_Attempted_To_Delivered_OnTact']],
  ['accepted-leads', 'Accepted Leads', 'Lead + validation funnel', ['Accepted_Leads', 'Total_Accepted_Leads', 'Total_Leads_Accepted', 'AcceptedLeads']],
  ['mtn-dialled', 'MTN Dialled', 'MTN conversion funnel', ['MTN_Dialed_Leads', 'MTN_Dialled_Leads', 'MTN_Dialed', 'MTN_Dialled']],
  ['mtn-answered', 'MTN Answered', 'MTN conversion funnel', ['MTN_Answered_Calls', 'MTN_Answered', 'MTN_Answered_Leads']],
  ['right-party-contact', 'Right Party Contact', 'MTN conversion funnel', ['MTN_Right_Party_Contact', 'Right_Party_Contact', 'RPC', 'MTN_RPC']],
  ['mtn-sales', 'MTN Sales', 'MTN conversion funnel', ['MTN_Sales', 'MTN_Sold', 'MTN_Total_Sales']],
  ['mtn-activations', 'MTN Activations', 'MTN conversion funnel', ['MTN_Activated_Sales', 'MTN_Activations', 'MTN_Activated', 'MTN_Total_Activations', 'count_activation', 'count_activations', 'total_activations'], ['activation', 'activations', 'activated']],
  ['ontact-blc-sales', 'ONtact/BLC Sales', 'Power BI / ONtact-BLC commercial funnel', ['BLC_Sales', 'Ontact_BLC_Sales', 'ONtact_BLC_Sales', 'Total_BLC_Sales', 'BLC_Total_Sales', 'count_sale', 'count_sales', 'sales_count'], ['sale', 'sales', 'ontact', 'blc']],
  ['captures', 'Captures', 'Power BI / ONtact-BLC commercial funnel', ['Captures', 'Capture', 'BLC_Captures', 'Total_Captures', 'Captured_Applications', 'Captured_Apps', 'count_capture', 'count_captures', 'count_capture_complete', 'count_date_created', 'total_capture_complete', 'Total_Capture_Complete', 'captures_count'], ['capture', 'captures', 'capture_complete', 'date_created']],
  ['net-apps', 'Net Apps', 'Power BI / ONtact-BLC commercial funnel', ['Net_Apps', 'Nett_Apps', 'NetApps', 'NettApps', 'BLC_Net_Apps', 'BLC_Nett_Apps', 'Total_Net_Apps', 'Total_Nett_Apps', 'count_net_apps', 'count_nett_apps', 'count_nett_app', 'total_nett_apps', 'total_net_apps', 'net_apps_count', 'nett_apps_count'], ['net', 'nett', 'app', 'apps', 'nett_app']],
  ['activations', 'Activations', 'Power BI / ONtact-BLC commercial funnel', ['Activations', 'BLC_Activations', 'Total_Activations', 'Activated_Sales', 'MTN_Activated_Sales', 'count_activation', 'count_activations', 'total_activations', 'activation_count', 'activations_count'], ['activation', 'activations', 'activated']]
].map(([key, label, group, aliases, queryHints]) => ({ key, label, group, aliases, queryHints } as StageMetric));

const n = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' ? Number(v.replace(/[^0-9.-]/g, '')) || 0 : 0;
const ratio = (a: unknown, b: unknown) => n(b) ? n(a) / n(b) : 0;
const text = (v: unknown) => String(v ?? '').toLowerCase();
const dateKey = (r: FunnelRecord) => {
  const raw = r.date ?? r.call_date ?? r.entry_date ?? r.created_at ?? r.report_date ?? r.activation ?? r.activation_date ?? r.capture_complete ?? r.capture_date ?? r.nett_app ?? r.net_app ?? r.date_created;
  const d = raw ? new Date(String(raw)) : null;
  return !d || Number.isNaN(d.getTime()) ? 'Unassigned' : d.toISOString().slice(0, 10);
};
const hintMatches = (r: FunnelRecord, m: StageMetric) => {
  if (!m.queryHints?.length) return true;
  const q = text(r.query ?? r.metric ?? r.report ?? r.event ?? r.stage);
  return !q || m.queryHints.some((hint) => q.includes(hint));
};
const metricValue = (r: FunnelRecord, m: StageMetric) => {
  if (!hintMatches(r, m)) return 0;
  for (const alias of m.aliases) {
    const value = n(r[alias]);
    if (value) return value;
  }
  return m.key === 'valid-phone-id' ? Math.min(n(r.Valid_IDNumber), n(r.Valid_Phone)) : 0;
};
const fetchSupplementalRecords = async (source: 'ontact' | 'powerbi'): Promise<FunnelRecord[]> => {
  const response = await fetch(`/api/analytics?source=${source}`, { cache: 'no-store' });
  const payload = await response.json() as AnalyticsPayload;
  return (payload.results?.[0]?.analytics?.records ?? []).map((record) => ({ __source: source, ...record }));
};
const buildTrend = (records: FunnelRecord[], from: StageMetric, to: StageMetric): TrendRow[] => {
  const grouped = new Map<string, { date: string; fromVolume: number; retained: number }>();
  records.forEach((record) => {
    const fromValue = metricValue(record, from);
    const toValue = metricValue(record, to);
    if (!fromValue && !toValue) return;
    const date = dateKey(record);
    const current = grouped.get(date) ?? { date, fromVolume: 0, retained: 0 };
    current.fromVolume += fromValue;
    current.retained += toValue;
    grouped.set(date, current);
  });
  return [...grouped.values()].map((row) => {
    const retained = Math.min(row.retained, row.fromVolume || row.retained);
    const dropoff = Math.max(row.fromVolume - retained, 0);
    return { date: row.date, fromVolume: row.fromVolume, retained, rawRetained: row.retained, dropoff, retainedRate: ratio(retained, row.fromVolume), dropoffRate: ratio(dropoff, row.fromVolume) };
  }).filter((row) => row.date !== 'Unassigned' || row.fromVolume || row.retained).sort((a, b) => a.date.localeCompare(b.date));
};

function StageSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="dialer-filter-control funnel-stage-select"><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}>{GROUPS.map((group) => <optgroup key={group} label={group}>{STAGES.filter((stage) => stage.group === group).map((stage) => <option key={stage.key} value={stage.key}>{stage.label}</option>)}</optgroup>)}</select></label>;
}

export default function FunnelLeakagePanel({ records, limit = 40 }: Props) {
  const [fromStageKey, setFromStageKey] = useState('valid-phone-id');
  const [toStageKey, setToStageKey] = useState('blc-vetted');
  const [supplementalRecords, setSupplementalRecords] = useState<FunnelRecord[]>([]);
  const [supplementalStatus, setSupplementalStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const fromStage = STAGES.find((stage) => stage.key === fromStageKey) ?? STAGES[5];
  const toStage = STAGES.find((stage) => stage.key === toStageKey) ?? STAGES[6];

  useEffect(() => {
    let active = true;
    setSupplementalStatus('loading');
    Promise.all([fetchSupplementalRecords('ontact'), fetchSupplementalRecords('powerbi')])
      .then((chunks) => { if (active) { setSupplementalRecords(chunks.flat()); setSupplementalStatus('loaded'); } })
      .catch(() => { if (active) { setSupplementalRecords([]); setSupplementalStatus('failed'); } });
    return () => { active = false; };
  }, []);

  const trendRecords = useMemo(() => [...records, ...supplementalRecords], [records, supplementalRecords]);
  const summary = summarizeFunnelLeakage(records);
  const rows = buildFunnelLeakageRows(records);
  const sourceRows = buildSourceFunnelLeakage(records).slice(0, limit);
  const customTrendRows = useMemo(() => buildTrend(trendRecords, fromStage, toStage), [trendRecords, fromStage, toStage]);
  const customTotals = customTrendRows.reduce((acc, row) => ({ fromVolume: acc.fromVolume + row.fromVolume, retained: acc.retained + row.retained, dropoff: acc.dropoff + row.dropoff }), { fromVolume: 0, retained: 0, dropoff: 0 });
  const chartRows = rows.map((row) => ({ stage: `${row.fromStage} → ${row.toStage}`, retained: row.retained, dropoff: row.dropoff }));

  return <>
    <section className="kpi-grid compact">
      <section className="card stat"><div><p>Overall Conversion</p><strong>{pct.format(summary.overallConversionRate)}</strong><span>{num.format(summary.finalStageVolume)} from {num.format(summary.firstStageVolume)}</span></div></section>
      <section className="card stat"><div><p>Total Drop-off</p><strong>{num.format(summary.totalDropoff)}</strong><span>Across full 15-stage journey</span></div></section>
      <section className="card stat"><div><p>Highest Leakage</p><strong>{pct.format(summary.highestLeakageRate)}</strong><span>{summary.highestLeakageStage}</span></div></section>
      <section className="card stat"><div><p>Cost at First Stage</p><strong>{money.format(summary.firstStageVolume ? summary.totalSpend / summary.firstStageVolume : 0)}</strong><span>{num.format(summary.criticalLeaks)} critical leakage nodes</span></div></section>
    </section>

    <section className="card panel">
      <div className="panel-head"><div><h2>Custom funnel retention trend</h2><p>Select any From stage and any To stage. Power BI daily captures, nett apps and activations now map to their exact returned fields.</p></div><div className="funnel-stage-selectors"><StageSelect label="From stage" value={fromStageKey} onChange={setFromStageKey} /><StageSelect label="To stage" value={toStageKey} onChange={setToStageKey} /></div></div>
      <section className="kpi-grid compact">
        <section className="card stat"><div><p>{fromStage.label}</p><strong>{num.format(customTotals.fromVolume)}</strong><span>Input volume · {num.format(trendRecords.length)} trend records</span></div></section>
        <section className="card stat"><div><p>{toStage.label} / Retained</p><strong>{num.format(customTotals.retained)}</strong><span>{pct.format(ratio(customTotals.retained, customTotals.fromVolume))} retained</span></div></section>
        <section className="card stat"><div><p>Drop-off Volume</p><strong>{num.format(customTotals.dropoff)}</strong><span>{pct.format(ratio(customTotals.dropoff, customTotals.fromVolume))} dropped · supplemental {supplementalStatus}</span></div></section>
      </section>
      <ResponsiveContainer width="100%" height={380}><LineChart data={customTrendRows}><CartesianGrid vertical={false} /><XAxis dataKey="date" /><YAxis /><Tooltip /><Line dataKey="retained" name={`Retained / ${toStage.label}`} /><Line dataKey="dropoff" name={`Drop-off from ${fromStage.label}`} /></LineChart></ResponsiveContainer>
    </section>

    <section className="grid two">
      <section className="card panel"><div className="panel-head"><div><h2>Funnel leakage curve</h2><p>Retained volume versus drop-off volume between each consecutive stage.</p></div></div><ResponsiveContainer width="100%" height={420}><BarChart data={chartRows}><CartesianGrid vertical={false} /><XAxis dataKey="stage" interval={0} angle={-28} textAnchor="end" height={120} /><YAxis /><Tooltip /><Bar dataKey="retained" name="Retained" /><Bar dataKey="dropoff" name="Drop-off" /></BarChart></ResponsiveContainer></section>
      <section className="card panel"><div className="panel-head"><div><h2>Sankey-ready node links</h2><p>Node-to-node structure for Journey Map Sankey visualisation.</p></div></div><div className="table-wrap"><table><thead><tr><th>From</th><th>To</th><th>From Vol.</th><th>To Vol.</th><th>Drop-off</th><th>Drop-off %</th><th>Conv. %</th><th>Severity</th></tr></thead><tbody>{rows.map((row) => <tr key={`${row.fromStage}-${row.toStage}`}><td>{row.fromStage}</td><td>{row.toStage}</td><td>{num.format(row.volumeFrom)}</td><td>{num.format(row.volumeTo)}</td><td>{num.format(row.dropoff)}</td><td>{pct.format(row.dropoffRate)}</td><td>{pct.format(row.conversionRate)}</td><td>{row.severity}</td></tr>)}</tbody></table></div></section>
    </section>

    <section className="card panel"><div className="panel-head"><div><h2>Source-level leakage summary</h2><p>Which marketing sources create the largest absolute leakage across the full funnel.</p></div></div><div className="table-wrap"><table><thead><tr><th>Source</th><th>Fetched</th><th>Final Stage</th><th>Total Drop-off</th><th>Overall Conv.</th><th>Highest Leakage</th><th>Highest Leakage %</th></tr></thead><tbody>{sourceRows.map((row) => <tr key={row.source}><td>{row.source}</td><td>{num.format(row.firstStageVolume)}</td><td>{num.format(row.finalStageVolume)}</td><td>{num.format(row.totalDropoff)}</td><td>{pct.format(row.overallConversionRate)}</td><td>{row.highestLeakageStage}</td><td>{pct.format(row.highestLeakageRate)}</td></tr>)}</tbody></table></div></section>
  </>;
}
