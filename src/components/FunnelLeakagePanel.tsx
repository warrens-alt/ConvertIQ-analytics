import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildFunnelLeakageRows, buildSourceFunnelLeakage, summarizeFunnelLeakage, type FunnelRecord } from '../analytics/funnelLeakage';

type Props = {
  records: FunnelRecord[];
  limit?: number;
};

const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const money = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });

export default function FunnelLeakagePanel({ records, limit = 40 }: Props) {
  const summary = summarizeFunnelLeakage(records);
  const rows = buildFunnelLeakageRows(records);
  const sourceRows = buildSourceFunnelLeakage(records).slice(0, limit);
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
