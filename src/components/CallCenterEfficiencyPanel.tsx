import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildAgentEfficiencyRows, buildDurationBuckets, summarizeCallCenterEfficiency, type DialerRecord } from '../analytics/callCenterEfficiency';

type Props = {
  records: DialerRecord[];
  limit?: number;
};

const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const dec = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 });

export default function CallCenterEfficiencyPanel({ records, limit = 40 }: Props) {
  const summary = summarizeCallCenterEfficiency(records);
  const buckets = buildDurationBuckets(records);
  const agents = buildAgentEfficiencyRows(records).slice(0, limit);

  return (
    <>
      <section className="kpi-grid compact">
        <section className="card stat">
          <div>
            <p>Optimal Call Duration</p>
            <strong>{summary.optimalBucket}</strong>
            <span>Best conversion-efficiency bucket</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Avg Talk Time</p>
            <strong>{dec.format(summary.averageTalkSeconds)}s</strong>
            <span>Median {dec.format(summary.medianTalkSeconds)}s</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Call Conversion</p>
            <strong>{pct.format(summary.conversionRate)}</strong>
            <span>{num.format(summary.totalSales)} sales from {num.format(summary.totalCalls)} calls</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Agent Review Flags</p>
            <strong>{num.format(summary.reviewAgents)}</strong>
            <span>{num.format(summary.efficientAgents)} efficient closers</span>
          </div>
        </section>
      </section>

      <section className="grid two">
        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Time-to-sale curve</h2>
              <p>Call duration buckets ranked by conversion and talk-time efficiency.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={buckets}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="calls" name="Calls" />
              <Bar dataKey="sales" name="Sales" />
              <Bar dataKey="efficiencyScore" name="Efficiency Score" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Agent efficiency outliers</h2>
              <p>Flags agents talking too long without sales, hanging up too fast, or closing efficiently.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Score</th>
                  <th>Calls</th>
                  <th>Sales</th>
                  <th>Conv.</th>
                  <th>Avg Sec</th>
                  <th>Short</th>
                  <th>Long</th>
                  <th>Flag</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.agent}>
                    <td>{agent.agent}</td>
                    <td>{agent.efficiencyScore}</td>
                    <td>{num.format(agent.calls)}</td>
                    <td>{num.format(agent.sales)}</td>
                    <td>{pct.format(agent.conversionRate)}</td>
                    <td>{dec.format(agent.averageTalkSeconds)}</td>
                    <td>{pct.format(agent.shortCallRate)}</td>
                    <td>{pct.format(agent.longCallRate)}</td>
                    <td>{agent.outlierFlag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>
    </>
  );
}
