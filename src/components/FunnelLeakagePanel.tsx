import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildFunnelLeakageRows, buildSourceFunnelLeakage, summarizeFunnelLeakage, type FunnelRecord } from '../analytics/funnelLeakage';

type Props = {
  records: FunnelRecord[];
  limit?: number;
};

const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });

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
  const raw = record.date ?? record.call_date ?? record.entry_date ?? record.created_at ?? record.report_date;
  const parsed = raw ? new Date(String(raw)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Unassigned';
  return parsed.toISOString().slice(0, 10);
};

const validPhoneIdVolume = (record: FunnelRecord): number => {
  const direct = n(record.Total_Leads_WithValid_Phone_ID);
  if (direct) return direct;
  return Math.min(n(record.Valid_IDNumber), n(record.Valid_Phone));
};

const blcVettedVolume = (record: FunnelRecord): number => {
  return n(record.Total_Leads_Passed_BLC_Vetting) ||
    n(record.Total_Leads_Passed_BLCVetting) ||
    n(record.Total_Leads_Passed_BLC_Vetting_BLC) ||
    n(record.Total_Leads_Passed_BLCVetting_BLC);
};

const buildBlcVettingTrendRows = (records: FunnelRecord[]) => {
  const grouped = new Map<string, { date: string; validPhoneId: number; retained: number }>();

  records.forEach((record) => {
    const date = dateKey(record);
    const current = grouped.get(date) ?? { date, validPhoneId: 0, retained: 0 };
    current.validPhoneId += validPhoneIdVolume(record);
    current.retained += blcVettedVolume(record);
    grouped.set(date, current);
  });

  return [...grouped.values()]
    .map((row) => ({
      date: row.date,
      validPhoneId: row.validPhoneId,
      retained: row.retained,
      dropoff: Math.max(row.validPhoneId - row.retained, 0),
      retainedRate: ratio(row.retained, row.validPhoneId),
      dropoffRate: ratio(Math.max(row.validPhoneId - row.retained, 0), row.validPhoneId)
    }))
    .filter((row) => row.date !== 'Unassigned' || row.validPhoneId || row.retained)
    .sort((a, b) => a.date.localeCompare(b.date));
};

export default function FunnelLeakagePanel({ records, limit = 40 }: Props) {
  const summary = summarizeFunnelLeakage(records);
  const rows = buildFunnelLeakageRows(records);
  const sourceRows = buildSourceFunnelLeakage(records).slice(0, limit);
  const blcVettingTrendRows = buildBlcVettingTrendRows(records);
  const blcVettingTotals = blcVettingTrendRows.reduce((acc, row) => {
    acc.validPhoneId += row.validPhoneId;
    acc.retained += row.retained;
    acc.dropoff += row.dropoff;
    return acc;
  }, { validPhoneId: 0, retained: 0, dropoff: 0 });
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
            <h2>Valid Phone + ID → BLC Vetted trend</h2>
            <p>Retained volume versus drop-off volume over time. Retained = Total_Leads_Passed_BLC_Vetting; drop-off = Total_Leads_WithValid_Phone_ID minus retained.</p>
          </div>
        </div>
        <section className="kpi-grid compact">
          <section className="card stat">
            <div>
              <p>Valid Phone + ID</p>
              <strong>{num.format(blcVettingTotals.validPhoneId)}</strong>
              <span>Input volume to BLC vetting</span>
            </div>
          </section>
          <section className="card stat">
            <div>
              <p>BLC Vetted / Retained</p>
              <strong>{num.format(blcVettingTotals.retained)}</strong>
              <span>{pct.format(ratio(blcVettingTotals.retained, blcVettingTotals.validPhoneId))} retained</span>
            </div>
          </section>
          <section className="card stat">
            <div>
              <p>Drop-off Volume</p>
              <strong>{num.format(blcVettingTotals.dropoff)}</strong>
              <span>{pct.format(ratio(blcVettingTotals.dropoff, blcVettingTotals.validPhoneId))} dropped</span>
            </div>
          </section>
        </section>
        <ResponsiveContainer width="100%" height={380}>
          <LineChart data={blcVettingTrendRows}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Line dataKey="retained" name="Retained / BLC Vetted" />
            <Line dataKey="dropoff" name="Drop-off from Valid Phone + ID" />
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
