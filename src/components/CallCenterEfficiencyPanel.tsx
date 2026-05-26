import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { buildAgentEfficiencyRows, buildDurationBuckets, summarizeCallCenterEfficiency, type DialerRecord } from '../analytics/callCenterEfficiency';

type Props = {
  records: DialerRecord[];
  limit?: number;
};

type DialerFilters = {
  agent: string;
  campaign: string;
  list: string;
  status: string;
  duration: string;
  contact: string;
  hour: string;
  search: string;
};

const num = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 0 });
const pct = new Intl.NumberFormat('en-ZA', { style: 'percent', maximumFractionDigits: 1 });
const dec = new Intl.NumberFormat('en-ZA', { maximumFractionDigits: 1 });

const DEFAULT_FILTERS: DialerFilters = {
  agent: 'all',
  campaign: 'all',
  list: 'all',
  status: 'all',
  duration: 'all',
  contact: 'all',
  hour: 'all',
  search: ''
};

const SALE_PATTERN = /(sale|sold|activated|activation|approved|contract|success|mtn_sale|delivered_sale)/i;
const ANSWER_PATTERN = /(answer|answered|rpc|sale|sold|activated|callback|contact|human|right party|right_party)/i;
const RPC_PATTERN = /(rpc|right party|right_party|contacted|qualified|sale|sold|activated|approved)/i;

const n = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
};

const ratio = (top: unknown, bottom: unknown): number => {
  const denominator = n(bottom);
  return denominator ? n(top) / denominator : 0;
};

const clean = (value: unknown): string => String(value ?? '').trim();
const field = (record: DialerRecord, keys: string[]): string => {
  for (const key of keys) {
    const value = clean(record[key]);
    if (value) return value;
  }
  return '';
};

const agentName = (record: DialerRecord): string => field(record, ['agent', 'user', 'full_name', 'owner']) || 'Unassigned';
const campaignName = (record: DialerRecord): string => field(record, ['campaign_id', 'campaign', 'source_campaign']) || 'Unassigned';
const listName = (record: DialerRecord): string => field(record, ['list_id', 'entry_list_id', 'list']) || 'Unassigned';
const statusName = (record: DialerRecord): string => field(record, ['status', 'call_result', 'disposition']) || 'Unassigned';
const statusText = (record: DialerRecord): string => `${record.status ?? ''} ${record.call_result ?? ''} ${record.disposition ?? ''} ${record.comments ?? ''} ${record.term_reason ?? ''}`;
const isSale = (record: DialerRecord): boolean => SALE_PATTERN.test(statusText(record)) || n(record.MTN_Sales) > 0 || n(record.MTN_Activated_Sales) > 0;
const isAnswered = (record: DialerRecord): boolean => ANSWER_PATTERN.test(statusText(record)) || n(record.length_in_sec) >= 30;
const isRpc = (record: DialerRecord): boolean => RPC_PATTERN.test(statusText(record)) || n(record.MTN_Right_Party_Contact) > 0;

const durationBucket = (seconds: number): string => {
  if (seconds < 15) return '0-14s';
  if (seconds < 30) return '15-29s';
  if (seconds < 60) return '30-59s';
  if (seconds < 120) return '60-119s';
  if (seconds < 180) return '120-179s';
  if (seconds < 300) return '180-299s';
  return '300s+';
};

const hourBucket = (record: DialerRecord): string => {
  const raw = clean(record.call_date ?? record.date ?? record.entry_date ?? record.start_time);
  const parsed = raw ? new Date(raw) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Unknown';
  return `${String(parsed.getHours()).padStart(2, '0')}:00`;
};

const optionValues = (records: DialerRecord[], getter: (record: DialerRecord) => string, max = 120): string[] => {
  const values = [...new Set(records.map(getter).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return values.slice(0, max);
};

const matchesFilter = (record: DialerRecord, filters: DialerFilters): boolean => {
  if (filters.agent !== 'all' && agentName(record) !== filters.agent) return false;
  if (filters.campaign !== 'all' && campaignName(record) !== filters.campaign) return false;
  if (filters.list !== 'all' && listName(record) !== filters.list) return false;
  if (filters.status !== 'all' && statusName(record) !== filters.status) return false;
  if (filters.duration !== 'all' && durationBucket(n(record.length_in_sec)) !== filters.duration) return false;
  if (filters.hour !== 'all' && hourBucket(record) !== filters.hour) return false;

  if (filters.contact === 'answered' && !isAnswered(record)) return false;
  if (filters.contact === 'unanswered' && isAnswered(record)) return false;
  if (filters.contact === 'rpc' && !isRpc(record)) return false;
  if (filters.contact === 'sale' && !isSale(record)) return false;
  if (filters.contact === 'no-sale' && isSale(record)) return false;

  if (filters.search) {
    const haystack = Object.values(record).join(' ').toLowerCase();
    if (!haystack.includes(filters.search.toLowerCase())) return false;
  }

  return true;
};

const aggregateRows = (records: DialerRecord[], getter: (record: DialerRecord) => string, label: string) => {
  const grouped = new Map<string, { name: string; calls: number; answered: number; rpc: number; sales: number; avgSeconds: number; totalSeconds: number }>();
  records.forEach((record) => {
    const name = getter(record) || 'Unassigned';
    const current = grouped.get(name) ?? { name, calls: 0, answered: 0, rpc: 0, sales: 0, avgSeconds: 0, totalSeconds: 0 };
    current.calls += 1;
    current.answered += isAnswered(record) ? 1 : 0;
    current.rpc += isRpc(record) ? 1 : 0;
    current.sales += isSale(record) ? 1 : 0;
    current.totalSeconds += n(record.length_in_sec);
    current.avgSeconds = ratio(current.totalSeconds, current.calls);
    grouped.set(name, current);
  });

  return [...grouped.values()]
    .map((row) => ({
      [label]: row.name,
      calls: row.calls,
      answered: row.answered,
      rpc: row.rpc,
      sales: row.sales,
      answerRate: ratio(row.answered, row.calls),
      rpcRate: ratio(row.rpc, row.answered || row.calls),
      conversionRate: ratio(row.sales, row.rpc || row.answered || row.calls),
      avgSeconds: row.avgSeconds
    }))
    .sort((a, b) => n(b.calls) - n(a.calls));
};

const exportCsv = (name: string, rows: Record<string, unknown>[]) => {
  const headers = Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const data = [headers, ...rows.map((row) => headers.map((header) => row[header] ?? ''))]
    .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
    .join('\n');
  const url = URL.createObjectURL(new Blob([data], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
};

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return (
    <label className="dialer-filter-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="all">All</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export default function CallCenterEfficiencyPanel({ records, limit = 40 }: Props) {
  const [filters, setFilters] = useState<DialerFilters>(DEFAULT_FILTERS);

  const agentOptions = useMemo(() => optionValues(records, agentName), [records]);
  const campaignOptions = useMemo(() => optionValues(records, campaignName), [records]);
  const listOptions = useMemo(() => optionValues(records, listName), [records]);
  const statusOptions = useMemo(() => optionValues(records, statusName), [records]);
  const hourOptions = useMemo(() => optionValues(records, hourBucket, 30), [records]);
  const durationOptions = ['0-14s', '15-29s', '30-59s', '60-119s', '120-179s', '180-299s', '300s+'];

  const filteredRecords = useMemo(() => records.filter((record) => matchesFilter(record, filters)), [records, filters]);
  const summary = summarizeCallCenterEfficiency(filteredRecords);
  const buckets = buildDurationBuckets(filteredRecords);
  const agents = buildAgentEfficiencyRows(filteredRecords).slice(0, limit);
  const campaignRows = useMemo(() => aggregateRows(filteredRecords, campaignName, 'campaign').slice(0, limit), [filteredRecords, limit]);
  const listRows = useMemo(() => aggregateRows(filteredRecords, listName, 'list').slice(0, limit), [filteredRecords, limit]);
  const statusRows = useMemo(() => aggregateRows(filteredRecords, statusName, 'status').slice(0, limit), [filteredRecords, limit]);
  const hourlyRows = useMemo(() => aggregateRows(filteredRecords, hourBucket, 'hour').sort((a, b) => String(a.hour).localeCompare(String(b.hour))).slice(0, limit), [filteredRecords, limit]);
  const detailRows = filteredRecords.slice(0, limit).map((record) => ({
    callDate: clean(record.call_date ?? record.date ?? record.entry_date),
    agent: agentName(record),
    campaign: campaignName(record),
    list: listName(record),
    status: statusName(record),
    seconds: n(record.length_in_sec),
    duration: durationBucket(n(record.length_in_sec)),
    hour: hourBucket(record),
    answered: isAnswered(record) ? 'Yes' : 'No',
    rpc: isRpc(record) ? 'Yes' : 'No',
    sale: isSale(record) ? 'Yes' : 'No'
  }));

  const answered = filteredRecords.filter(isAnswered).length;
  const rpc = filteredRecords.filter(isRpc).length;
  const sales = filteredRecords.filter(isSale).length;
  const totalSeconds = filteredRecords.reduce((sum, record) => sum + n(record.length_in_sec), 0);
  const filterCount = Object.entries(filters).filter(([key, value]) => key !== 'search' ? value !== 'all' : Boolean(value)).length;

  const update = (key: keyof DialerFilters, value: string) => setFilters((current) => ({ ...current, [key]: value }));

  return (
    <>
      <section className="card panel dialer-filter-panel">
        <div className="panel-head">
          <div>
            <h2>Advanced Dialer Filters</h2>
            <p>Slice OnTact records by agent, campaign, list, status, contact outcome, duration, hour and keyword. All charts below recalculate from the filtered records.</p>
          </div>
          <button className="secondary" onClick={() => setFilters(DEFAULT_FILTERS)}>Reset filters</button>
        </div>
        <div className="dialer-filter-grid">
          <FilterSelect label="Agent" value={filters.agent} options={agentOptions} onChange={(value) => update('agent', value)} />
          <FilterSelect label="Campaign" value={filters.campaign} options={campaignOptions} onChange={(value) => update('campaign', value)} />
          <FilterSelect label="List ID" value={filters.list} options={listOptions} onChange={(value) => update('list', value)} />
          <FilterSelect label="Status" value={filters.status} options={statusOptions} onChange={(value) => update('status', value)} />
          <FilterSelect label="Duration" value={filters.duration} options={durationOptions} onChange={(value) => update('duration', value)} />
          <FilterSelect label="Hour" value={filters.hour} options={hourOptions} onChange={(value) => update('hour', value)} />
          <label className="dialer-filter-control">
            <span>Contact outcome</span>
            <select value={filters.contact} onChange={(event) => update('contact', event.target.value)}>
              <option value="all">All</option>
              <option value="answered">Answered proxy</option>
              <option value="unanswered">Unanswered proxy</option>
              <option value="rpc">RPC / qualified proxy</option>
              <option value="sale">Sale / activation proxy</option>
              <option value="no-sale">No sale proxy</option>
            </select>
          </label>
          <label className="dialer-filter-control dialer-search-control">
            <span>Keyword search</span>
            <input value={filters.search} placeholder="Phone, status, comment, campaign..." onChange={(event) => update('search', event.target.value)} />
          </label>
        </div>
        <div className="dialer-filter-summary">
          <span>{num.format(filteredRecords.length)} of {num.format(records.length)} records shown</span>
          <span>{num.format(filterCount)} active filters</span>
          <button className="secondary" onClick={() => exportCsv('convertiq-filtered-dialer.csv', detailRows)}>Export filtered sample</button>
        </div>
      </section>

      <section className="kpi-grid compact">
        <section className="card stat">
          <div>
            <p>Filtered Calls</p>
            <strong>{num.format(filteredRecords.length)}</strong>
            <span>{num.format(records.length)} raw OnTact preview records</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Answered Proxy</p>
            <strong>{pct.format(ratio(answered, filteredRecords.length))}</strong>
            <span>{num.format(answered)} answered-like records</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>RPC Proxy</p>
            <strong>{pct.format(ratio(rpc, answered || filteredRecords.length))}</strong>
            <span>{num.format(rpc)} right-party/qualified records</span>
          </div>
        </section>
        <section className="card stat">
          <div>
            <p>Sales Proxy</p>
            <strong>{pct.format(ratio(sales, rpc || answered || filteredRecords.length))}</strong>
            <span>{num.format(sales)} sale/activation-like records</span>
          </div>
        </section>
      </section>

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
            <p>Total Talk Time</p>
            <strong>{dec.format(totalSeconds / 60)}m</strong>
            <span>{num.format(summary.reviewAgents)} review flags · {num.format(summary.efficientAgents)} efficient closers</span>
          </div>
        </section>
      </section>

      <section className="grid two">
        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Filtered Dialer Funnel</h2>
              <p>Record-level proxy funnel: calls, answered, RPC and sales.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={[{ stage: 'Calls', value: filteredRecords.length }, { stage: 'Answered', value: answered }, { stage: 'RPC', value: rpc }, { stage: 'Sales', value: sales }]}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="stage" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" name="Records" />
            </BarChart>
          </ResponsiveContainer>
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Hourly dialer performance</h2>
              <p>Filtered call volume, answered proxy, RPC proxy and sales proxy by hour.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={330}>
            <BarChart data={hourlyRows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="hour" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="calls" name="Calls" />
              <Bar dataKey="answered" name="Answered" />
              <Bar dataKey="rpc" name="RPC" />
              <Bar dataKey="sales" name="Sales" />
            </BarChart>
          </ResponsiveContainer>
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
              <h2>Status distribution</h2>
              <p>Filtered call statuses with answer, RPC and sales proxy context.</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={360}>
            <BarChart data={statusRows}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="status" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="calls" name="Calls" />
              <Bar dataKey="answered" name="Answered" />
              <Bar dataKey="sales" name="Sales" />
            </BarChart>
          </ResponsiveContainer>
        </section>
      </section>

      <section className="grid two">
        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Campaign performance</h2>
              <p>Filtered campaign-level dialer performance.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Calls</th>
                  <th>Answered</th>
                  <th>RPC</th>
                  <th>Sales</th>
                  <th>Answer Rate</th>
                  <th>RPC Rate</th>
                  <th>Conv.</th>
                </tr>
              </thead>
              <tbody>
                {campaignRows.map((row) => (
                  <tr key={String(row.campaign)}>
                    <td>{String(row.campaign)}</td>
                    <td>{num.format(n(row.calls))}</td>
                    <td>{num.format(n(row.answered))}</td>
                    <td>{num.format(n(row.rpc))}</td>
                    <td>{num.format(n(row.sales))}</td>
                    <td>{pct.format(n(row.answerRate))}</td>
                    <td>{pct.format(n(row.rpcRate))}</td>
                    <td>{pct.format(n(row.conversionRate))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>List performance</h2>
              <p>Filtered list-level performance for batch/source QA.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>List</th>
                  <th>Calls</th>
                  <th>Answered</th>
                  <th>RPC</th>
                  <th>Sales</th>
                  <th>Answer Rate</th>
                  <th>RPC Rate</th>
                  <th>Avg Sec</th>
                </tr>
              </thead>
              <tbody>
                {listRows.map((row) => (
                  <tr key={String(row.list)}>
                    <td>{String(row.list)}</td>
                    <td>{num.format(n(row.calls))}</td>
                    <td>{num.format(n(row.answered))}</td>
                    <td>{num.format(n(row.rpc))}</td>
                    <td>{num.format(n(row.sales))}</td>
                    <td>{pct.format(n(row.answerRate))}</td>
                    <td>{pct.format(n(row.rpcRate))}</td>
                    <td>{dec.format(n(row.avgSeconds))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      <section className="grid two">
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

        <section className="card panel">
          <div className="panel-head">
            <div>
              <h2>Filtered dialer detail</h2>
              <p>Sample rows after current filters. Export uses the same filtered sample shown here.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Call Date</th>
                  <th>Agent</th>
                  <th>Campaign</th>
                  <th>List</th>
                  <th>Status</th>
                  <th>Sec</th>
                  <th>Hour</th>
                  <th>Answered</th>
                  <th>RPC</th>
                  <th>Sale</th>
                </tr>
              </thead>
              <tbody>
                {detailRows.map((row, index) => (
                  <tr key={`${row.callDate}-${row.agent}-${index}`}>
                    <td>{row.callDate}</td>
                    <td>{row.agent}</td>
                    <td>{row.campaign}</td>
                    <td>{row.list}</td>
                    <td>{row.status}</td>
                    <td>{num.format(row.seconds)}</td>
                    <td>{row.hour}</td>
                    <td>{row.answered}</td>
                    <td>{row.rpc}</td>
                    <td>{row.sale}</td>
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
