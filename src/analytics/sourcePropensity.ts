import type { SourceMarginRow, RawAnalyticsRow } from './sourceMargin';

export type SourcePropensityRow = {
  date: string;
  source: string;
  score: number;
  probability: number;
  routingTier: 'Scale source and route to best agents' | 'Priority budget and dialler allocation' | 'Standard allocation' | 'Low priority / monitor';
  highValueSignal: number;
  validRate: number;
  vettingRate: number;
  acceptedRate: number;
  answerRate: number;
  rpcRate: number;
  salesRate: number;
  efficiencyScore: number;
  qualityScore: number;
  conversionScore: number;
  commercialScore: number;
  reason: string;
};

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
const average = (values: number[]): number => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

const routingTier = (score: number): SourcePropensityRow['routingTier'] => {
  if (score >= 85) return 'Scale source and route to best agents';
  if (score >= 70) return 'Priority budget and dialler allocation';
  if (score >= 40) return 'Standard allocation';
  return 'Low priority / monitor';
};

function sourceSignalRows(records: RawAnalyticsRow[]) {
  const map = new Map<string, Record<string, number | string>>();
  records
    .filter((row) => row.__source === 'onvest' || row.offershop_source || row.Fetched_Leads)
    .forEach((row) => {
      const date = row.date ? new Date(String(row.date)).toISOString().slice(0, 10) : 'Unassigned';
      const source = String(row.offershop_source ?? row.source ?? 'Unclassified');
      const key = `${date}||${source}`;
      const bucket = map.get(key) ?? { date, source };
      Object.entries(row).forEach(([field, value]) => {
        if (field.startsWith('__') || field === 'date' || field === 'offershop_source' || field === 'source') return;
        if (typeof value === 'number' || (typeof value === 'string' && /^-?[\d,.]+$/.test(value.trim()))) {
          bucket[field] = n(bucket[field]) + n(value);
        }
      });
      map.set(key, bucket);
    });
  return [...map.values()];
}

export function buildSourcePropensityRows(records: RawAnalyticsRow[], marginRows: SourceMarginRow[]): SourcePropensityRow[] {
  const marginByKey = new Map(marginRows.map((row) => [`${row.date}||${row.source}`, row]));

  return sourceSignalRows(records).map((row) => {
    const source = String(row.source ?? 'Unclassified');
    const date = String(row.date ?? 'Unassigned');
    const margin = marginByKey.get(`${date}||${source}`);

    const fetched = n(row.Fetched_Leads);
    const valid = n(row.Total_Leads_WithValid_Phone_ID) || Math.min(n(row.Valid_IDNumber), n(row.Valid_Phone));
    const blcVetted = n(row.Total_Leads_Passed_BLC_Vetting);
    const accepted = n(row.Accepted_Leads);
    const dialed = n(row.MTN_Dialed_Leads);
    const answered = n(row.MTN_Answered_Calls);
    const rpc = n(row.MTN_Right_Party_Contact);
    const sales = n(row.MTN_Sales) + n(row.Total_Leads_Sold_A) + n(row.Total_Leads_Sold_B) + n(row.Total_Leads_Sold_C) + n(row.Total_Leads_Sold_D);
    const highValueSignal = n(row.Total_Leads_Sold_A) + n(row.MTN_Activated_Sales);

    const validRate = ratio(valid, fetched);
    const vettingRate = ratio(blcVetted, valid || fetched);
    const acceptedRate = ratio(accepted, fetched || valid);
    const answerRate = ratio(answered, dialed);
    const rpcRate = ratio(rpc, answered);
    const salesRate = ratio(sales, rpc || accepted || fetched);

    const qualityScore = average([scoreAgainst(validRate, 0.85), scoreAgainst(vettingRate, 0.2), scoreAgainst(acceptedRate, 0.18)]);
    const conversionScore = average([scoreAgainst(answerRate, 0.35), scoreAgainst(rpcRate, 0.55), scoreAgainst(salesRate, 0.12)]);
    const efficiencyScore = average([scoreAgainst(margin?.cplForm ?? 0, 80, true), scoreAgainst(margin?.cpaAccepted ?? 0, 180, true), scoreAgainst(margin?.roas ?? 0, 1.2)]);
    const commercialScore = average([scoreAgainst(margin?.grossMargin ?? 0, 0.25), scoreAgainst(margin?.grossProfit ?? 0, 1), scoreAgainst(highValueSignal, 1)]);

    const finalScore = Math.round(clamp(qualityScore * 0.3 + conversionScore * 0.25 + efficiencyScore * 0.2 + commercialScore * 0.25));
    const strongest = [
      ['quality', qualityScore],
      ['conversion', conversionScore],
      ['efficiency', efficiencyScore],
      ['commercial', commercialScore]
    ].sort((a, b) => Number(b[1]) - Number(a[1]))[0]?.[0] ?? 'quality';

    return {
      date,
      source,
      score: finalScore,
      probability: finalScore / 100,
      routingTier: routingTier(finalScore),
      highValueSignal,
      validRate,
      vettingRate,
      acceptedRate,
      answerRate,
      rpcRate,
      salesRate,
      efficiencyScore,
      qualityScore,
      conversionScore,
      commercialScore,
      reason: `Primary driver: ${strongest}. Score uses validation, vetting, accepted leads, dialler conversion, margin and high-value outcome signals.`
    } satisfies SourcePropensityRow;
  }).sort((a, b) => b.score - a.score);
}

export function summarizePropensity(rows: SourcePropensityRow[]) {
  const avgScore = rows.length ? rows.reduce((sum, row) => sum + row.score, 0) / rows.length : 0;
  return {
    avgScore,
    scaleNow: rows.filter((row) => row.score >= 85).length,
    priority: rows.filter((row) => row.score >= 70 && row.score < 85).length,
    monitor: rows.filter((row) => row.score < 40).length,
    bestSource: rows[0]?.source ?? 'No source',
    weakestSource: [...rows].sort((a, b) => a.score - b.score)[0]?.source ?? 'No source'
  };
}
