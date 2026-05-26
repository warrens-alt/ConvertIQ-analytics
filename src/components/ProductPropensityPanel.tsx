import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildProductAgentRows, buildProductPropensityRows, summarizeProductPropensity, type ProductRecord } from '../analytics/productPropensity';

type Props = {
  records: ProductRecord[];
  limit?: number;
};

const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const dec = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 });

export default function ProductPropensityPanel({ records, limit = 40 }: Props) {
  const rows = buildProductPropensityRows(records);
  const summary = summarizeProductPropensity(rows);
  const agentRows = buildProductAgentRows(records).slice(0, limit);
  const chartRows = rows.slice(0, 18).map((row) => ({
    product: row.productKey,
    score: row.propensityScore,
    records: row.records,
    sales: row.sales,
    conversionRate: row.conversionRate
  }));

  return (
    <>
      <section className="kpi-grid compact">
        <section className="card stat">
          <div>
            <p>Tagged Products</p>
            <strong>{num.format(summary.totalProducts)}</strong>
            <span>{num.format(summary.totalTaggedRecords)} tagged records</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Best Product Score</p>
            <strong>{summary.bestProductScore}</strong>
            <span>{summary.bestProduct}</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Scale Products</p>
            <strong>{num.format(summary.scaleProducts)}</strong>
            <span>Propensity score ≥ 85</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Low-Intent Products</p>
            <strong>{num.format(summary.lowIntentProducts)}</strong>
            <span>Propensity score below 40</span>
          </div>
        </section>
      </section>

      <section className="grid two">
        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Product propensity ranking</h2>
              <p>Products ranked by conversion, activation signal, volume and time efficiency.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={420}>
            <BarChart data={chartRows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="product" interval={0} angle={-28} textAnchor="end" height={130} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="score" name="Propensity Score" />
              <Bar dataKey="sales" name="Sales" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Product performance table</h2>
              <p>Specific device/package/network conversion and routing recommendation.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>Score</th>
                  <th>Records</th>
                  <th>Sales</th>
                  <th>Conv.</th>
                  <th>Avg Sec</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((row) => (
                  <tr key={row.productKey}>
                    <td>{row.productKey}</td>
                    <td>{row.propensityScore}</td>
                    <td>{num.format(row.records)}</td>
                    <td>{num.format(row.sales)}</td>
                    <td>{pct.format(row.conversionRate)}</td>
                    <td>{dec.format(row.averageTalkSeconds)}</td>
                    <td>{row.recommendation}</td>
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
            <h2>Best agent/product combinations</h2>
            <p>Which agents convert which devices, packages or product segments best.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Agent</th>
                <th>Product</th>
                <th>Records</th>
                <th>Sales</th>
                <th>Conversion</th>
                <th>Avg Sec</th>
              </tr>
            </thead>
            <tbody>
              {agentRows.map((row) => (
                <tr key={`${row.agent}-${row.productKey}`}>
                  <td>{row.agent}</td>
                  <td>{row.productKey}</td>
                  <td>{num.format(row.records)}</td>
                  <td>{num.format(row.sales)}</td>
                  <td>{pct.format(row.conversionRate)}</td>
                  <td>{dec.format(row.averageTalkSeconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
