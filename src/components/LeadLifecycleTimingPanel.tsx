import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { summarizeLeadLifecycle, type LifecycleRecord } from '../analytics/leadLifecycleTiming';

type Props = { records: LifecycleRecord[]; limit?: number };

const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });

const shortDate = (value?: string) => value ? new Date(value).toLocaleString() : '-';
const days = (hours: number) => hours >= 24 ? `${dec.format(hours / 24)}d` : `${dec.format(hours)}h`;

export default function LeadLifecycleTimingPanel({ records, limit = 40 }: Props) {
  const summary = summarizeLeadLifecycle(records);
  const lagRows = summary.lagRows.map((row) => ({
    step: row.step,
    avgHours: Number(row.avgHours.toFixed(1)),
    medianHours: Number(row.medianHours.toFixed(1)),
    count: row.count
  }));
  const coverageRows = summary.coverageRows.map((row) => ({
    stage: row.stage,
    timestamped: row.timestampedRecords,
    volume: row.volume,
    coverage: Number((row.coverageRate * 100).toFixed(1))
  }));
  const sampleRows = summary.entities.slice(0, limit);

  return (
    <section className="card panel lifecycle-panel">
      <div className="panel-head">
        <div>
          <h2>Lead lifecycle timing</h2>
          <p>Tracks fetched, delivered, sold, captured, nett app and activation timestamps where the API exposes timestamp or date fields. Lead-level rows use stable IDs; Power BI daily rows are marked as aggregate timing.</p>
        </div>
      </div>

      <section className="kpi-grid compact">
        <section className="card stat"><div><p>Lead-level entities</p><strong>{num.format(summary.leadLevelEntities)}</strong><span>Rows with lead/customer identifiers</span></div></section>
        <section className="card stat"><div><p>Aggregate date entities</p><strong>{num.format(summary.aggregateEntities)}</strong><span>Daily Power BI / aggregate records</span></div></section>
        <section className="card stat"><div><p>Linked lifecycle records</p><strong>{num.format(summary.linkedEntities)}</strong><span>Entities with at least 2 timestamps</span></div></section>
        <section className="card stat"><div><p>Complete lifecycle</p><strong>{num.format(summary.completeLifecycleEntities)}</strong><span>Fetched through activation available</span></div></section>
      </section>

      <section className="grid two">
        <section className="card panel">
          <div className="panel-head"><div><h2>Lag by lifecycle step</h2><p>Average and median elapsed time between available timestamps.</p></div></div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={lagRows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="step" interval={0} angle={-24} textAnchor="end" height={95} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="avgHours" name="Avg hours" />
              <Bar dataKey="medianHours" name="Median hours" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card panel">
          <div className="panel-head"><div><h2>Timestamp coverage</h2><p>Which lifecycle events currently have timestamp coverage in the combined API records.</p></div></div>
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={coverageRows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="stage" interval={0} angle={-24} textAnchor="end" height={95} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="timestamped" name="Timestamped records" />
              <Bar dataKey="coverage" name="Coverage %" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </section>

      <section className="grid two">
        <section className="card panel">
          <div className="panel-head"><div><h2>Lag QA table</h2><p>Count, average, median, minimum and maximum lag per lifecycle step.</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Step</th><th>Count</th><th>Avg</th><th>Median</th><th>Min</th><th>Max</th></tr></thead>
              <tbody>{summary.lagRows.map((row) => <tr key={row.step}><td>{row.step}</td><td>{num.format(row.count)}</td><td>{days(row.avgHours)}</td><td>{days(row.medianHours)}</td><td>{days(row.minHours)}</td><td>{days(row.maxHours)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="card panel">
          <div className="panel-head"><div><h2>Lifecycle sample</h2><p>Timestamp availability by linked lead/entity. Aggregate rows are expected where only daily Power BI dates exist.</p></div></div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Entity</th><th>Source</th><th>Grain</th><th>Fetched</th><th>Delivered</th><th>Sold</th><th>Captured</th><th>Nett App</th><th>Activated</th></tr></thead>
              <tbody>{sampleRows.map((row) => <tr key={row.entityKey}><td>{row.entityKey}</td><td>{row.source}</td><td>{row.grain}</td><td>{shortDate(row.fetchedAt)}</td><td>{shortDate(row.deliveredAt)}</td><td>{shortDate(row.soldAt)}</td><td>{shortDate(row.capturedAt)}</td><td>{shortDate(row.nettAppAt)}</td><td>{shortDate(row.activatedAt)}</td></tr>)}</tbody>
            </table>
          </div>
        </section>
      </section>
    </section>
  );
}
