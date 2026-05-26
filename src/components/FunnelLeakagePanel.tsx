import { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildFunnelLeakageRows, buildSourceFunnelLeakage, summarizeFunnelLeakage, type FunnelRecord } from '../analytics/funnelLeakage';

type Props = {
  records: FunnelRecord[];
  limit?: number;
};

type StageGroup = 'Lead + validation funnel' | 'MTN conversion funnel' | 'Power BI / ONtact-BLC commercial funnel';

type StageMetric = {
  key: string;
  label: string;
  group: StageGroup;
  aliases: string[];
  queryHints?: string[];
};

type AnalyticsPayload = {
  results?: Array<{
    source?: string;
    analytics?: {
      records?: FunnelRecord[];
    };
  }>;
};

const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });

const STAGE_GROUPS: StageGroup[] = ['Lead + validation funnel', 'MTN conversion funnel', 'Power BI / ONtact-BLC commercial funnel'];

const STAGE_METRICS: StageMetric[] = [
  { key: 'leads', label: 'Leads', group: 'Lead + validation funnel', aliases: ['Fetched_Leads', 'Leads', 'Total_Leads', 'Total_Leads_Fetched'] },
  { key: 'standardised-id', label: 'Standardised ID', group: 'Lead + validation funnel', aliases: ['Standardised_ID_Number', 'Standardised_ID', 'Standardized_ID_Number', 'Standardized_ID'] },
  { key: 'standardised-phone', label: 'Standardised Phone', group: 'Lead + validation funnel', aliases: ['Standardised_Phone_Number', 'Standardised_Phone', 'Standardized_Phone_Number', 'Standardized_Phone'] },
  { key: 'valid-id', label: 'Valid ID', group: 'Lead + validation funnel', aliases: ['Valid_IDNumber', 'Valid_ID_Number', 'Valid_ID', 'Valid_IDNumber_Check'] },
  { key: 'valid-phone', label: 'Valid Phone', group: 'Lead + validation funnel', aliases: ['Valid_Phone', 'Valid_Phone_Number', 'ValidPhone'] },
  { key: 'valid-phone-id', label: 'Valid Phone + ID', group: 'Lead + validation funnel', aliases: ['Total_Leads_WithValid_Phone_ID', 'Total_Leads_With_Valid_Phone_ID', 'Valid_Phone_ID', 'ValidPhoneID'] },
  { key: 'blc-vetted', label: 'BLC Vetted', group: 'Lead + validation funnel', aliases: ['Total_Leads_Passed_BLC_Vetting', 'Total_Leads_Passed_BLCVetting', 'Total_Leads_Passed_BLC_Vetting_BLC', 'Total_Leads_Passed_BLCVetting_BLC'] },
  { key: 'blc-dedupe-passed', label: 'BLC Dedupe Passed', group: 'Lead + validation funnel', aliases: ['Total_Leads_Dedupe_Passed_BLC', 'Total_Leads_Passed_BLC_Dedupe', 'Total_Leads_Passed_Dedupe_BLC', 'Total_Leads_DedupePassed_BLC'] },
  { key: 'delivered-ontact', label: 'Delivered OnTact', group: 'Lead + validation funnel', aliases: ['Total_Leads_Delivered_OnTact', 'Total_Leads_Delivered_Ontact', 'Total_Leads_Delivered_To_OnTact', 'Total_Leads_Attempted_To_Delivered_OnTact'] },
  { key: 'accepted-leads', label: 'Accepted Leads', group: 'Lead + validation funnel', aliases: ['Accepted_Leads', 'Total_Accepted_Leads', 'Total_Leads_Accepted', 'AcceptedLeads'] },
  { key: 'mtn-dialled', label: 'MTN Dialled', group: 'MTN conversion funnel', aliases: ['MTN_Dialed_Leads', 'MTN_Dialled_Leads', 'MTN_Dialed', 'MTN_Dialled'] },
  { key: 'mtn-answered', label: 'MTN Answered', group: 'MTN conversion funnel', aliases: ['MTN_Answered_Calls', 'MTN_Answered', 'MTN_Answered_Leads'] },
  { key: 'right-party-contact', label: 'Right Party Contact', group: 'MTN conversion funnel', aliases: ['MTN_Right_Party_Contact', 'Right_Party_Contact', 'RPC', 'MTN_RPC'] },
  { key: 'mtn-sales', label: 'MTN Sales', group: 'MTN conversion funnel', aliases: ['MTN_Sales', 'MTN_Sold', 'MTN_Total_Sales'] },
  { key: 'mtn-activations', label: 'MTN Activations', group: 'MTN conversion funnel', aliases: ['MTN_Activated_Sales', 'MTN_Activations', 'MTN_Activated', 'MTN_Total_Activations'] },
  {
    key: 'ontact-blc-sales',
    label: 'ONtact/BLC Sales',
    group: 'Power BI / ONtact-BLC commercial funnel',
    aliases: ['BLC_Sales', 'Ontact_BLC_Sales', 'ONtact_BLC_Sales', 'Total_BLC_Sales', 'BLC_Total_Sales', 'count_sale', 'count_sales', 'sales_count'],
    queryHints: ['sale', 'sales', 'ontact', 'blc']
  },
  {
    key: 'captures',
    label: 'Captures',
    group: 'Power BI / ONtact-BLC commercial funnel',
    aliases: ['Captures', 'Capture', 'BLC_Captures', 'Total_Captures', 'Captured_Applications', 'Captured_Apps', 'count_capture', 'count_captures', 'captures_count'],
    queryHints: ['capture', 'captures']
  },
  {
    key: 'net-apps',
    label: 'Net Apps',
    group: 'Power BI / ONtact-BLC commercial funnel',
    aliases: ['Net_Apps', 'Nett_Apps', 'NetApps', 'NettApps', 'BLC_Net_Apps', 'BLC_Nett_Apps', 'Total_Net_Apps', 'Total_Nett_Apps', 'count_net_apps', 'count_nett_apps', 'net_apps_count', 'nett_apps_count'],
    queryHints: ['net', 'nett', 'app', 'apps']
  },
  {
    key: 'activations',
    label: 'Activations',
    group: 'Power BI / ONtact-BLC commercial funnel',
    aliases: ['Activations', 'BLC_Activations', 'Total_Activations', 'Activated_Sales', 'MTN_Activated_Sales', 'count_activation', 'count_activations', 'activation_count', 'activations_count'],
    queryHints: ['activation', 'activations', 'activated']
  }
];

const DEFAULT_FROM_STAGE_KEY = 'valid-phone-id';
const DEFAULT_TO_STAGE_KEY = 'blc-vetted';

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

  if (metric.key === 'valid-phone-id') {
    return Math.min(n(record.Valid_IDNumber), n(record.Valid_Phone));
  }

  return 0;
};

const fetchSupplementalRecords = async (source: 'ontact' | 'powerbi'): Promise<FunnelRecord[]> => {
  const response = await fetch(`/api/analytics?source=${source}`, { cache: 'no-store' });
  const payload = await response.json() as AnalyticsPayload;
  const result = payload.results?.[0];
  return (result?.analytics?.records ?? []).map((record) => ({ __source: source, ...record }));
};

const buildCustomTrendRows = (records: FunnelRecord[], fromStage: StageMetric, toStage: StageMetric) => {
  const grouped = new Map<string, { date: string; fromVolume: number; retained: number }>();

  records.forEach((record) => {
    const fromValue = metricValue(record, fromStage);
    const toValue = metricValue(record, toStage);
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

function StageSelect({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="dialer-filter-control funnel-stage-select">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {STAGE_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {STAGE_METRICS.filter((metric) => metric.group === group).map((metric) => (
              <option key={metric.key} value={metric.key}>{metric.label}</option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

export default function FunnelLeakagePanel({ records, limit = 40 }: Props) {
  const [fromStageKey, setFromStageKey] = useState(DEFAULT_FROM_STAGE_KEY);
  const [toStageKey, setToStageKey] = useState(DEFAULT_TO_STAGE_KEY);
  const [supplementalRecords, setSupplementalRecords] = useState<FunnelRecord[]>([]);
  const [supplementalStatus, setSupplementalStatus] = useState<'loading' | 'loaded' | 'failed'>('loading');
  const fromStage = STAGE_METRICS.find((metric) => metric.key === fromStageKey) ?? STAGE_METRICS[5];
  const toStage = STAGE_METRICS.find((metric) => metric.key === toStageKey) ?? STAGE_METRICS[6];

  useEffect(() => {
    let active = true;
    setSupplementalStatus('loading');
    Promise.all([fetchSupplementalRecords('ontact'), fetchSupplementalRecords('powerbi')])
      .then((chunks) => {
        if (!active) return;
        setSupplementalRecords(chunks.flat());
        setSupplementalStatus('loaded');
      })
      .catch(() => {
        if (!active) return;
        setSupplementalRecords([]);
        setSupplementalStatus('failed');
      });
    return () => {
      active = false;
    };
  }, []);

  const trendRecords = useMemo(() => [...records, ...supplementalRecords], [records, supplementalRecords]);
  const summary = summarizeFunnelLeakage(records);
  const rows = buildFunnelLeakageRows(records);
  const sourceRows = buildSourceFunnelLeakage(records).slice(0, limit);
  const customTrendRows = useMemo(() => buildCustomTrendRows(trendRecords, fromStage, toStage), [trendRecords, fromStage, toStage]);
  const customTotals = customTrendRows.reduce((acc, row) => {
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
            <h2>Custom funnel retention trend</h2>
            <p>Select any From stage and any To stage from the lead, MTN, Power BI or ONtact/BLC metric catalogue.</p>
          </div>
          <div className="funnel-stage-selectors">
            <StageSelect label="From stage" value={fromStageKey} onChange={setFromStageKey} />
            <StageSelect label="To stage" value={toStageKey} onChange={setToStageKey} />
          </div>
        </div>
        <section className="kpi-grid compact">
          <section className="card stat">
            <div>
              <p>{fromStage.label}</p>
              <strong>{num.format(customTotals.fromVolume)}</strong>
              <span>Input volume · {num.format(trendRecords.length)} trend records</span>
            </div>
          </section>
          <section className="card stat">
            <div>
              <p>{toStage.label} / Retained</p>
              <strong>{num.format(customTotals.retained)}</strong>
              <span>{pct.format(ratio(customTotals.retained, customTotals.fromVolume))} retained</span>
            </div>
          </section>
          <section className="card stat">
            <div>
              <p>Drop-off Volume</p>
              <strong>{num.format(customTotals.dropoff)}</strong>
              <span>{pct.format(ratio(customTotals.dropoff, customTotals.fromVolume))} dropped · supplemental {supplementalStatus}</span>
            </div>
          </section>
        </section>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={customTrendRows}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line dataKey="retained" name={`Retained / ${toStage.label}`} />
            <Line dataKey="dropoff" name={`Drop-off from ${fromStage.label}`} />
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
