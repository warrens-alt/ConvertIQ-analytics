export type DialerRecord = Record<string, unknown>;

export type AgentEfficiencyRow = {
  agent: string;
  records: number;
  calls: number;
  sales: number;
  activatedSales: number;
  totalTalkSeconds: number;
  averageTalkSeconds: number;
  medianTalkSeconds: number;
  shortCallRate: number;
  longCallRate: number;
  answerRate: number;
  conversionRate: number;
  talkSecondsPerSale: number;
  efficiencyScore: number;
  outlierFlag: 'Efficient closer' | 'Too short / low contact' | 'Too long / low conversion' | 'Needs review' | 'Normal';
  recommendation: string;
};

export type DurationBucketRow = {
  bucket: string;
  minSeconds: number;
  maxSeconds: number;
  calls: number;
  sales: number;
  conversionRate: number;
  averageTalkSeconds: number;
  efficiencyScore: number;
};

export type CallCenterEfficiencySummary = {
  optimalBucket: string;
  optimalMinSeconds: number;
  optimalMaxSeconds: number;
  averageTalkSeconds: number;
  medianTalkSeconds: number;
  conversionRate: number;
  totalCalls: number;
  totalSales: number;
  efficientAgents: number;
  reviewAgents: number;
};

const SALE_PATTERN = /(sale|sold|activated|activation|approved|contract|success|mtn_sale|delivered_sale)/i;
const ANSWER_PATTERN = /(answer|rpc|sale|sold|activated|callback|contact|human|right party)/i;

const n = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
};

const ratio = (top: unknown, bottom: unknown): number => {
  const denominator = n(bottom);
  return denominator ? n(top) / denominator : 0;
};

const clamp = (value: number, min = 0, max = 100): number => Math.max(min, Math.min(max, value));
const scoreAgainst = (value: number, target: number, lowerIsBetter = false): number => clamp(target ? (lowerIsBetter ? target / Math.max(value, 0.00001) : value / target) * 100 : 0);

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
};

const isDialerRecord = (record: DialerRecord): boolean => Boolean(record.call_date || record.length_in_sec || record.status || record.call_result || record.agent || record.user);
const agentName = (record: DialerRecord): string => String(record.agent ?? record.user ?? record.full_name ?? record.owner ?? 'Unassigned');
const statusText = (record: DialerRecord): string => `${record.status ?? ''} ${record.call_result ?? ''} ${record.comments ?? ''}`;
const isSale = (record: DialerRecord): boolean => SALE_PATTERN.test(statusText(record)) || n(record.MTN_Sales) > 0 || n(record.MTN_Activated_Sales) > 0;
const isAnswered = (record: DialerRecord): boolean => ANSWER_PATTERN.test(statusText(record)) || n(record.length_in_sec) >= 30;

function bucketFor(seconds: number) {
  if (seconds < 15) return { bucket: '0-14s', minSeconds: 0, maxSeconds: 14 };
  if (seconds < 30) return { bucket: '15-29s', minSeconds: 15, maxSeconds: 29 };
  if (seconds < 60) return { bucket: '30-59s', minSeconds: 30, maxSeconds: 59 };
  if (seconds < 120) return { bucket: '60-119s', minSeconds: 60, maxSeconds: 119 };
  if (seconds < 180) return { bucket: '120-179s', minSeconds: 120, maxSeconds: 179 };
  if (seconds < 300) return { bucket: '180-299s', minSeconds: 180, maxSeconds: 299 };
  return { bucket: '300s+', minSeconds: 300, maxSeconds: Number.POSITIVE_INFINITY };
}

function outlierFlag(row: Omit<AgentEfficiencyRow, 'outlierFlag' | 'recommendation'>): AgentEfficiencyRow['outlierFlag'] {
  if (row.conversionRate >= 0.12 && row.talkSecondsPerSale > 0 && row.talkSecondsPerSale <= 420) return 'Efficient closer';
  if (row.shortCallRate >= 0.55 && row.conversionRate < 0.04) return 'Too short / low contact';
  if (row.longCallRate >= 0.35 && row.conversionRate < 0.05) return 'Too long / low conversion';
  if (row.efficiencyScore < 40) return 'Needs review';
  return 'Normal';
}

function recommendation(flag: AgentEfficiencyRow['outlierFlag']): string {
  switch (flag) {
    case 'Efficient closer': return 'Prioritise higher-propensity leads and use as benchmark for coaching.';
    case 'Too short / low contact': return 'Audit dial behaviour, opening script and premature dispositioning.';
    case 'Too long / low conversion': return 'Coach qualification discipline and reduce low-intent call time.';
    case 'Needs review': return 'Review call mix, lead quality, script adherence and product fit.';
    default: return 'Maintain current routing and monitor weekly trend.';
  }
}

export function buildDurationBuckets(records: DialerRecord[]): DurationBucketRow[] {
  const grouped = new Map<string, { bucket: string; minSeconds: number; maxSeconds: number; calls: number; sales: number; totalSeconds: number }>();

  records.filter(isDialerRecord).forEach((record) => {
    const seconds = n(record.length_in_sec);
    const bucket = bucketFor(seconds);
    const current = grouped.get(bucket.bucket) ?? { ...bucket, calls: 0, sales: 0, totalSeconds: 0 };
    current.calls += 1;
    current.sales += isSale(record) ? 1 : 0;
    current.totalSeconds += seconds;
    grouped.set(bucket.bucket, current);
  });

  return [...grouped.values()]
    .map((row) => ({
      bucket: row.bucket,
      minSeconds: row.minSeconds,
      maxSeconds: row.maxSeconds,
      calls: row.calls,
      sales: row.sales,
      conversionRate: ratio(row.sales, row.calls),
      averageTalkSeconds: ratio(row.totalSeconds, row.calls),
      efficiencyScore: Math.round(scoreAgainst(ratio(row.sales, row.calls), 0.12) * 0.7 + scoreAgainst(ratio(row.totalSeconds, row.sales || row.calls), 300, true) * 0.3)
    }))
    .sort((a, b) => a.minSeconds - b.minSeconds);
}

export function buildAgentEfficiencyRows(records: DialerRecord[]): AgentEfficiencyRow[] {
  const grouped = new Map<string, DialerRecord[]>();
  records.filter(isDialerRecord).forEach((record) => {
    const key = agentName(record);
    const current = grouped.get(key) ?? [];
    current.push(record);
    grouped.set(key, current);
  });

  return [...grouped.entries()].map(([agent, rows]) => {
    const durations = rows.map((row) => n(row.length_in_sec));
    const calls = rows.length;
    const sales = rows.filter(isSale).length;
    const answered = rows.filter(isAnswered).length;
    const totalTalkSeconds = durations.reduce((sum, value) => sum + value, 0);
    const averageTalkSeconds = ratio(totalTalkSeconds, calls);
    const medianTalkSeconds = median(durations);
    const shortCallRate = ratio(durations.filter((seconds) => seconds < 30).length, calls);
    const longCallRate = ratio(durations.filter((seconds) => seconds >= 300).length, calls);
    const answerRate = ratio(answered, calls);
    const conversionRate = ratio(sales, calls);
    const talkSecondsPerSale = sales ? totalTalkSeconds / sales : 0;
    const activatedSales = rows.reduce((sum, row) => sum + n(row.MTN_Activated_Sales), 0);
    const efficiencyScore = Math.round(
      scoreAgainst(answerRate, 0.35) * 0.2 +
      scoreAgainst(conversionRate, 0.08) * 0.35 +
      scoreAgainst(shortCallRate, 0.35, true) * 0.2 +
      scoreAgainst(talkSecondsPerSale || averageTalkSeconds, 360, true) * 0.25
    );
    const partial = { agent, records: calls, calls, sales, activatedSales, totalTalkSeconds, averageTalkSeconds, medianTalkSeconds, shortCallRate, longCallRate, answerRate, conversionRate, talkSecondsPerSale, efficiencyScore };
    const flag = outlierFlag(partial);

    return {
      ...partial,
      outlierFlag: flag,
      recommendation: recommendation(flag)
    } satisfies AgentEfficiencyRow;
  }).sort((a, b) => b.efficiencyScore - a.efficiencyScore);
}

export function summarizeCallCenterEfficiency(records: DialerRecord[]): CallCenterEfficiencySummary {
  const dialerRecords = records.filter(isDialerRecord);
  const durations = dialerRecords.map((record) => n(record.length_in_sec));
  const totalCalls = dialerRecords.length;
  const totalSales = dialerRecords.filter(isSale).length;
  const buckets = buildDurationBuckets(dialerRecords);
  const viableBuckets = buckets.filter((bucket) => bucket.calls >= Math.max(5, totalCalls * 0.02));
  const optimal = (viableBuckets.length ? viableBuckets : buckets).sort((a, b) => b.efficiencyScore - a.efficiencyScore)[0];
  const agents = buildAgentEfficiencyRows(dialerRecords);

  return {
    optimalBucket: optimal?.bucket ?? 'No calls',
    optimalMinSeconds: optimal?.minSeconds ?? 0,
    optimalMaxSeconds: optimal?.maxSeconds === Number.POSITIVE_INFINITY ? 999999 : optimal?.maxSeconds ?? 0,
    averageTalkSeconds: ratio(durations.reduce((sum, value) => sum + value, 0), totalCalls),
    medianTalkSeconds: median(durations),
    conversionRate: ratio(totalSales, totalCalls),
    totalCalls,
    totalSales,
    efficientAgents: agents.filter((agent) => agent.outlierFlag === 'Efficient closer').length,
    reviewAgents: agents.filter((agent) => agent.outlierFlag !== 'Efficient closer' && agent.outlierFlag !== 'Normal').length
  };
}
