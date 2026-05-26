import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildFunnelLeakageRows, buildSourceFunnelLeakage, summarizeFunnelLeakage, type FunnelRecord } from '../analytics/funnelLeakage';

type Props = {
  records: FunnelRecord[];
  limit?: number;
};

type StageMetric = {
  label: string;
  aliases: string[];
  queryHints?: string[];
};

type TransitionMetric = {
  key: string;
  label: string;
  group: 'Lead + validation funnel' | 'MTN conversion funnel' | 'Power BI / ONtact-BLC commercial funnel';
  from: StageMetric;
  to: StageMetric;
};

const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });

const CORE_STAGES: StageMetric[] = [
  { label: 'Leads', aliases: ['Fetched_Leads', 'Leads', 'Total_Leads', 'Total_Leads_Fetched'] },
  { label: 'Standardised ID', aliases: ['Standardised_ID_Number', 'Standardised_ID', 'Standardized_ID_Number', 'Standardized_ID'] },
  { label: 'Standardised Phone', aliases: ['Standardised_Phone_Number', 'Standardised_Phone', 'Standardized_Phone_Number', 'Standardized_Phone'] },
  { label: 'Valid ID', aliases: ['Valid_IDNumber', 'Valid_ID_Number', 'Valid_ID', 'Valid_IDNumber_Check'] },
  { label: 'Valid Phone', aliases: ['Valid_Phone', 'Valid_Phone_Number', 'ValidPhone'] },
  { label: 'Valid Phone + ID', aliases: ['Total_Leads_WithValid_Phone_ID', 'Total_Leads_With_Valid_Phone_ID', 'Valid_Phone_ID', 'ValidPhoneID'] },
  { label: 'BLC Vetted', aliases: ['Total_Leads_Passed_BLC_Vetting', 'Total_Leads_Passed_BLCVetting', 'Total_Leads_Passed_BLC_Vetting_BLC', 'Total_Leads_Passed_BLCVetting_BLC'] },
  { label: 'BLC Dedupe Passed', aliases: ['Total_Leads_Dedupe_Passed_BLC', 'Total_Leads_Passed_BLC_Dedupe', 'Total_Leads_Passed_Dedupe_BLC', 'Total_Leads_DedupePassed_BLC'] },
  { label: 'Delivered OnTact', aliases: ['Total_Leads_Delivered_OnTact', 'Total_Leads_Delivered_Ontact', 'Total_Leads_Delivered_To_OnTact', 'Total_Leads_Attempted_To_Delivered_OnTact'] },
  { label: 'Accepted Leads', aliases: ['Accepted_Leads', 'Total_Accepted_Leads', 'Total_Leads_Accepted', 'AcceptedLeads'] },
  { label: 'MTN Dialled', aliases: ['MTN_Dialed_Leads', 'MTN_Dialled_Leads', 'MTN_Dialed', 'MTN_Dialled'] },
  { label: 'MTN Answered', aliases: ['MTN_Answered_Calls', 'MTN_Answered', 'MTN_Answered_Leads'] },
  { label: 'Right Party Contact', aliases: ['MTN_Right_Party_Contact', 'Right_Party_Contact', 'RPC', 'MTN_RPC'] },
  { label: 'MTN Sales', aliases: ['MTN_Sales', 'MTN_Sold', 'MTN_Total_Sales'] },
  { label: 'MTN Activations', aliases: ['MTN_Activated_Sales', 'MTN_Activations', 'MTN_Activated', 'MTN_Total_Activations'] }
];

const COMMERCIAL_STAGES = {
  delivered: CORE_STAGES[8],
  blcSales: {
    label: 'ONtact/BLC Sales',
    aliases: ['BLC_Sales', 'Ontact_BLC_Sales', 'ONtact_BLC_Sales', 'Total_BLC_Sales', 'BLC_Total_Sales', 'count_sale', 'count_sales', 'sales_count'],
    queryHints: ['sale', 'sales', 'ontact', 'blc']
  },
  captures: {
    label: 'Captures',
    aliases: ['Captures', 'Capture', 'BLC_Captures', 'Total_Captures', 'Captured_Applications', 'Captured_Apps', 'count_capture', 'count_captures', 'captures_count'],
    queryHints: ['capture', 'captures']
  },
  netApps: {
    label: 'Net Apps',
    aliases: ['Net_Apps', 'Nett_Apps', 'NetApps', 'NettApps', 'BLC_Net_Apps', 'BLC_Nett_Apps', 'Total_Net_Apps', 'Total_Nett_Apps', 'count_net_apps', 'count_nett_apps', 'net_apps_count', 'nett_apps_count'],
    queryHints: ['net', 'nett', 'app', 'apps']
  },
  activations: {
    label: 'Activations',
    aliases: ['Activations', 'BLC_Activations', 'Total_Activations', 'Activated_Sales', 'MTN_Activated_Sales', 'count_activation', 'count_activations', 'activation_count', 'activations_count'],
    queryHints: ['activation', 'activations', 'activated']
  }
} satisfies Record<string, StageMetric>;

const makeSequentialTransitions = (stages: StageMetric[], group: TransitionMetric['group']) => stages.slice(0, -1).map((from, index) => {
  const to = stages[index + 1];
  return {
    key: `${group}__${from.label}__${to.label}`,
    label: `${from.label} → ${to.label}`,
    group,
    from,
    to
  } satisfies TransitionMetric;
});

const CORE_TRANSITIONS = makeSequentialTransitions(CORE_STAGES.slice(0, 10), 'Lead + validation funnel');
const MTN_TRANSITIONS = makeSequentialTransitions(CORE_STAGES.slice(9), 'MTN conversion funnel');
const COMMERCIAL_TRANSITIONS: TransitionMetric[] = [
  { key: 'commercial__Delivered OnTact__ONtact/BLC Sales', label: 'Delivered OnTact → ONtact/BLC Sales', group: 'Power BI / ONtact-BLC commercial funnel', from: COMMERCIAL_STAGES.delivered, to: COMMERCIAL_STAGES.blcSales },
  { key: 'commercial__ONtact/BLC Sales__Captures', label: 'ONtact/BLC Sales → Captures', group: 'Power BI / ONtact-BLC commercial funnel', from: COMMERCIAL_STAGES.blcSales, to: COMMERCIAL_STAGES.captures },
  { key: 'commercial__Captures__Net Apps', label: 'Captures → Net Apps', group: 'Power BI / ONtact-BLC commercial funnel', from: COMMERCIAL_STAGES.captures, to: COMMERCIAL_STAGES.netApps },
  { key: 'commercial__Net Apps__Activations', label: 'Net Apps → Activations', group: 'Power BI / ONtact-BLC commercial funnel', from: COMMERCIAL_STAGES.netApps, to: COMMERCIAL_STAGES.activations },
  { key: 'commercial__Captures__Activations', label: 'Captures → Activations', group: 'Power BI / ONtact-BLC commercial funnel', from: COMMERCIAL_STAGES.captures, to: COMMERCIAL_STAGES.activations },
  { key: 'commercial__ONtact/BLC Sales__Activations', label: 'ONtact/BLC Sales → Activations', group: 'Power BI / ONtact-BLC commercial funnel', from: COMMERCIAL_STAGES.blcSales, to: COMMERCIAL_STAGES.activations }
];

const TRANSITIONS: TransitionMetric[] = [...CORE_TRANSITIONS, ...MTN_TRANSITIONS, ...COMMERCIAL_TRANSITIONS];
const TRANSITION_GROUPS: TransitionMetric['group'][] = ['Lead + validation funnel', 'MTN conversion funnel', 'Power BI / ONtact-BLC commercial funnel'];
const DEFAULT_TRANSITION_KEY = 'Lead + validation funnel__Valid Phone + ID__BLC Vetted';

const n = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
};

const ratio = (top: unknown, bottom: unknown): number => {
  const denominator = n(bottom);
  return denominator ? n(top) / denominator : 0;
};

const dateKey = (record: FunnelRecord): string => {
  const raw = record.date ?? record.call_date ?? record.entry_date ?? record.created_at ?? record.report_date ?? record.activation_date ?? record.capture_date;
  const parsed = raw ? new Date(String(raw)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Unassigned';
  return parsed.toISOString().slice(0, 10);
};

const recordMatchesQueryHints = (record: FunnelRecord, metric: StageMetric): boolean => {
  if (!metric.queryHints?.length) return true;
  const queryText = String(record.query ?? record.metric ?? record.report ?? record.event ?? record.stage ?? '').toLowerCase();
  if (!queryText) return true;
  return metric.queryHints.some((hint) => queryText.includes(hint));
};

const metricValue = (record: FunnelRecord, metric: StageMetric): number => {
  if (!recordMatchesQueryHints(record, metric)) return 0;

  for (const alias of metric.aliases) {
    const value = n(record[alias]);
    if (value) return value;
  }

  if (metric.label === 'Valid Phone + ID') {
    return Math.min(n(record.Valid_IDNumber), n(record.Valid_Phone));
  }

  return 0;
};

const buildTransitionTrendRows = (records: FunnelRecord[], transition: TransitionMetric) => {
  const grouped = new Map<string, { date: string; fromVolume: number; retained: number }>();

  records.forEach((record) => {
    const fromValue = metricValue(record, transition.from);
    const toValue = metricValue(record, transition.to);
    if (!fromValue && !toValue) return;

    const date = dateKey(record);
    const current = grouped.get(date) ?? { date, fromVolume: 0, retained: 0 };
    current.fromVolume += fromValue;
    current.retained += toValue;
    grouped.set(date, current);
  });

  return [...grouped.values()]
    .map((row) => {
      const retained = Math.min(row.retained, row.fromVolume || row.retained);
      const dropoff = Math.max(row.fromVolume - retained, 0);
      return {
        date: row.date,
        fromVolume: row.fromVolume,
        retained,
        rawRetained: row.retained,
        dropoff,
        retainedRate: ratio(retained, row.fromVolume),
        dropoffRate: ratio(dropoff, row.fromVolume)
      };
    })
    .filter((row) => row.date !== 'Unassigned' || row.fromVolume || row.retained)
    .sort((a, b) => a.date.localeCompare(b.date));
};

export default function FunnelLeakagePanel({ records, limit = 40 }: Props) {
  const [selectedTransitionKey, setSelectedTransitionKey] = useState(DEFAULT_TRANSITION_KEY);
  const selectedTransition = TRANSITIONS.find((transition) => transition.key === selectedTransitionKey) ?? TRANSITIONS[5];
  const summary = summarizeFunnelLeakage(records);
  const rows = buildFunnelLeakageRows(records);
  const sourceRows = buildSourceFunnelLeakage(records).slice(0, limit);
  const transitionTrendRows = useMemo(() => buildTransitionTrendRows(records, selectedTransition), [records, selectedTransition]);
  const transitionTotals = transitionTrendRows.reduce((acc, row) => {
    acc.fromVolume += row.fromVolume;
    acc.retained += row.retained;
    acc.dropoff += row.dropoff;
    return acc;
  }, { fromVolume: 0, retained: 0, dropoff: 0 });
  const chartRows = rows.map((row) => ({
    stage: `${row.fromStage} → ${row.toStage}`,
    retained: row.retained,
    dropoff: row.dropoff,
    conversionRate: row.conversionRate,
    dropoffRate: row.dropoffRate
  }));

  return (
    <>
      <section className="kpi-grid compact">
        <section className="card stat">
          <div>
            <p>Overall Conversion</p>
            <strong>{pct.format(summary.overallConversionRate)}</strong>
            <span>{num.format(summary.finalStageVolume)} from {num.format(summary.firstStageVolume)}</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Total Drop-off</p>
            <strong>{num.format(summary.totalDropoff)}</strong>
            <span>Across full 15-stage journey</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Highest Leakage</p>
            <strong>{pct.format(summary.highestLeakageRate)}</strong>
            <span>{summary.highestLeakageStage}</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Cost at First Stage</p>
            <strong>{money.format(summary.firstStageVolume ? summary.totalSpend / summary.firstStageVolume : 0)}</strong>
            <span>{num.format(summary.criticalLeaks)} critical leakage nodes</span>
          </div>
        </section>
      </section>

      <section className="card panel">
        <div className="panel-head">
          <div>
            <h2>Funnel stage retention trend</h2>
            <p>Choose any lead, MTN, Power BI or ONtact/BLC transition to trend retained volume versus drop-off volume over time.</p>
          </div>
          <label className="dialer-filter-control funnel-stage-select">
            <span>Funnel transition</span>
            <select value={selectedTransitionKey} onChange={(event) => setSelectedTransitionKey(event.target.value)}>
              {TRANSITION_GROUPS.map((group) => (
                <optgroup key={group} label={group}>
                  {TRANSITIONS.filter((transition) => transition.group === group).map((transition) => (
                    <option key={transition.key} value={transition.key}>{transition.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
        </div>
        <section className="kpi-grid compact">
          <section className="card stat">
            <div>
              <p>{selectedTransition.from.label}</p>
              <strong>{num.format(transitionTotals.fromVolume)}</strong>
              <span>Input volume</span>
            </div>
          </section>
          <section className="card stat">
            <div>
              <p>{selectedTransition.to.label} / Retained</p>
              <strong>{num.format(transitionTotals.retained)}</strong>
              <span>{pct.format(ratio(transitionTotals.retained, transitionTotals.fromVolume))} retained</span>
            </div>
          </section>
          <section className="card stat">
            <div>
              <p>Drop-off Volume</p>
              <strong>{num.format(transitionTotals.dropoff)}</strong>
              <span>{pct.format(ratio(transitionTotals.dropoff, transitionTotals.fromVolume))} dropped</span>
            </div>
          </section>
        </section>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={transitionTrendRows}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line dataKey="retained" name={`Retained / ${selectedTransition.to.label}`} />
            <Line dataKey="dropoff" name={`Drop-off from ${selectedTransition.from.label}`} />
          </LineChart>
        </ResponsiveContainer>
      </section>

      <section className="grid two">
        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Funnel leakage curve</h2>
              <p>Retained volume versus drop-off volume between each consecutive stage.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={chartRows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="stage" interval={0} angle={-28} textAnchor="end" height={120} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="retained" name="Retained" />
              <Bar dataKey="dropoff" name="Drop-off" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Sankey-ready node links</h2>
              <p>Node-to-node structure for Journey Map Sankey visualisation.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>From Vol.</th>
                  <th>To Vol.</th>
                  <th>Drop-off</th>
                  <th>Drop-off %</th>
                  <th>Conv. %</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.fromStage}-${row.toStage}`}>
                    <td>{row.fromStage}</td>
                    <td>{row.toStage}</td>
                    <td>{num.format(row.volumeFrom)}</td>
                    <td>{num.format(row.volumeTo)}</td>
                    <td>{num.format(row.dropoff)}</td>
                    <td>{pct.format(row.dropoffRate)}</td>
                    <td>{pct.format(row.conversionRate)}</td>
                    <td>{row.severity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="card panel">
        <div className="panel-head">
          <div>
            <h2>Source-level leakage summary</h2>
            <p>Which marketing sources create the largest absolute leakage across the full funnel.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Source</th>
                <th>Fetched</th>
                <th>Final Stage</th>
                <th>Total Drop-off</th>
                <th>Overall Conv.</th>
                <th>Highest Leakage</th>
                <th>Highest Leakage %</th>
              </tr>
            </thead>
            <tbody>
              {sourceRows.map((row) => (
                <tr key={row.source}>
                  <td>{row.source}</td>
                  <td>{num.format(row.firstStageVolume)}</td>
                  <td>{num.format(row.finalStageVolume)}</td>
                  <td>{num.format(row.totalDropoff)}</td>
                  <td>{pct.format(row.overallConversionRate)}</td>
                  <td>{row.highestLeakageStage}</td>
                  <td>{pct.format(row.highestLeakageRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
