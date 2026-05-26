export type ProductRecord = Record<string, unknown>;

export type ParsedProductIntent = {
  segment: string;
  deviceModel: string;
  packageName: string;
  network: string;
  productFamily: string;
  productKey: string;
};

export type ProductPropensityRow = ParsedProductIntent & {
  records: number;
  calls: number;
  sales: number;
  activations: number;
  totalTalkSeconds: number;
  averageTalkSeconds: number;
  conversionRate: number;
  activationRate: number;
  talkSecondsPerSale: number;
  propensityScore: number;
  recommendation: 'Scale product routing' | 'Prioritise with best agents' | 'Standard routing' | 'Monitor / low intent';
};

export type ProductAgentRow = {
  agent: string;
  productKey: string;
  records: number;
  sales: number;
  conversionRate: number;
  averageTalkSeconds: number;
};

export type ProductPropensitySummary = {
  totalProducts: number;
  totalTaggedRecords: number;
  bestProduct: string;
  bestProductScore: number;
  scaleProducts: number;
  lowIntentProducts: number;
};

const SEGMENT_RE = /(?:segment|colour|color)\s*(?:->|:|=)\s*([^|;\n\r]+)/i;
const DEVICE_RE = /(?:device_model|device model|device|handset|model)\s*(?:->|:|=)\s*([^|;\n\r]+)/i;
const PACKAGE_RE = /(?:package_name|package name|package|plan|bundle|deal)\s*(?:->|:|=)\s*([^|;\n\r]+)/i;
const NETWORK_RE = /(?:network|provider|brand)\s*(?:->|:|=)\s*([^|;\n\r]+)/i;
const SALE_PATTERN = /(sale|sold|activated|activation|approved|contract|success|mtn_sale|delivered_sale)/i;

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

const clean = (value: unknown): string => String(value ?? '').trim().replace(/\s+/g, ' ');
const firstMatch = (text: string, regex: RegExp): string => clean(text.match(regex)?.[1] ?? '');
const isSale = (record: ProductRecord): boolean => SALE_PATTERN.test(`${record.status ?? ''} ${record.call_result ?? ''} ${record.comments ?? ''}`) || n(record.MTN_Sales) > 0 || n(record.MTN_Activated_Sales) > 0;
const agentName = (record: ProductRecord): string => String(record.agent ?? record.user ?? record.full_name ?? record.owner ?? 'Unassigned');

function inferProductFamily(deviceModel: string, packageName: string, network: string): string {
  const text = `${deviceModel} ${packageName} ${network}`.toLowerCase();
  if (text.includes('data')) return 'Data package';
  if (text.includes('combo')) return 'Combo package';
  if (text.includes('airtime')) return 'Airtime package';
  if (text.includes('iphone') || text.includes('samsung') || text.includes('htc') || text.includes('huawei') || text.includes('xiaomi') || text.includes('oppo')) return 'Device contract';
  if (text.includes('sim')) return 'SIM only';
  return 'Unclassified product';
}

function productKey(intent: ParsedProductIntent): string {
  const parts = [intent.network, intent.segment, intent.deviceModel, intent.packageName].map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Unclassified product';
}

export function parseProductIntent(record: ProductRecord): ParsedProductIntent {
  const comments = clean(record.comments ?? record.product ?? record.product_name ?? record.package_name ?? '');
  const segment = clean(record.segment ?? firstMatch(comments, SEGMENT_RE) || 'Unclassified segment');
  const deviceModel = clean(record.device_model ?? firstMatch(comments, DEVICE_RE) || 'Unknown device');
  const packageName = clean(record.package_name ?? firstMatch(comments, PACKAGE_RE) || 'Unknown package');
  const network = clean(record.network ?? record.provider ?? firstMatch(comments, NETWORK_RE) || inferNetworkFromText(comments));
  const productFamily = inferProductFamily(deviceModel, packageName, network);
  const intent = { segment, deviceModel, packageName, network, productFamily, productKey: '' };
  intent.productKey = productKey(intent);
  return intent;
}

function inferNetworkFromText(text: string): string {
  const lowered = text.toLowerCase();
  if (lowered.includes('vodacom')) return 'Vodacom';
  if (lowered.includes('mtn')) return 'MTN';
  if (lowered.includes('telkom')) return 'Telkom';
  if (lowered.includes('cell c') || lowered.includes('cellc')) return 'Cell C';
  return 'Unknown network';
}

function recommendation(score: number): ProductPropensityRow['recommendation'] {
  if (score >= 85) return 'Scale product routing';
  if (score >= 70) return 'Prioritise with best agents';
  if (score >= 40) return 'Standard routing';
  return 'Monitor / low intent';
}

export function buildProductPropensityRows(records: ProductRecord[]): ProductPropensityRow[] {
  const grouped = new Map<string, { intent: ParsedProductIntent; rows: ProductRecord[] }>();

  records
    .filter((record) => record.comments || record.product || record.package_name || record.device_model || record.segment)
    .forEach((record) => {
      const intent = parseProductIntent(record);
      const current = grouped.get(intent.productKey) ?? { intent, rows: [] };
      current.rows.push(record);
      grouped.set(intent.productKey, current);
    });

  return [...grouped.values()].map(({ intent, rows }) => {
    const recordsCount = rows.length;
    const sales = rows.filter(isSale).length;
    const activations = rows.reduce((sum, row) => sum + n(row.MTN_Activated_Sales), 0);
    const totalTalkSeconds = rows.reduce((sum, row) => sum + n(row.length_in_sec), 0);
    const averageTalkSeconds = ratio(totalTalkSeconds, recordsCount);
    const conversionRate = ratio(sales, recordsCount);
    const activationRate = ratio(activations, recordsCount);
    const talkSecondsPerSale = sales ? totalTalkSeconds / sales : 0;
    const propensityScore = Math.round(
      scoreAgainst(conversionRate, 0.1) * 0.45 +
      scoreAgainst(activationRate, 0.05) * 0.2 +
      scoreAgainst(recordsCount, 30) * 0.15 +
      scoreAgainst(talkSecondsPerSale || averageTalkSeconds, 360, true) * 0.2
    );

    return {
      ...intent,
      records: recordsCount,
      calls: recordsCount,
      sales,
      activations,
      totalTalkSeconds,
      averageTalkSeconds,
      conversionRate,
      activationRate,
      talkSecondsPerSale,
      propensityScore,
      recommendation: recommendation(propensityScore)
    } satisfies ProductPropensityRow;
  }).sort((a, b) => b.propensityScore - a.propensityScore);
}

export function buildProductAgentRows(records: ProductRecord[]): ProductAgentRow[] {
  const grouped = new Map<string, { agent: string; productKey: string; rows: ProductRecord[] }>();

  records
    .filter((record) => record.comments || record.product || record.package_name || record.device_model || record.segment)
    .forEach((record) => {
      const intent = parseProductIntent(record);
      const agent = agentName(record);
      const key = `${agent}||${intent.productKey}`;
      const current = grouped.get(key) ?? { agent, productKey: intent.productKey, rows: [] };
      current.rows.push(record);
      grouped.set(key, current);
    });

  return [...grouped.values()].map(({ agent, productKey, rows }) => {
    const sales = rows.filter(isSale).length;
    const totalTalkSeconds = rows.reduce((sum, row) => sum + n(row.length_in_sec), 0);
    return {
      agent,
      productKey,
      records: rows.length,
      sales,
      conversionRate: ratio(sales, rows.length),
      averageTalkSeconds: ratio(totalTalkSeconds, rows.length)
    } satisfies ProductAgentRow;
  }).sort((a, b) => b.conversionRate - a.conversionRate || b.sales - a.sales);
}

export function summarizeProductPropensity(rows: ProductPropensityRow[]): ProductPropensitySummary {
  return {
    totalProducts: rows.length,
    totalTaggedRecords: rows.reduce((sum, row) => sum + row.records, 0),
    bestProduct: rows[0]?.productKey ?? 'No tagged product',
    bestProductScore: rows[0]?.propensityScore ?? 0,
    scaleProducts: rows.filter((row) => row.propensityScore >= 85).length,
    lowIntentProducts: rows.filter((row) => row.propensityScore < 40).length
  };
}
