export type FunnelRecord = Record<string, unknown>;

export type FunnelStageDefinition = {
  stage: string;
  field: string;
  owner: 'Offernet' | 'Validation' | 'BLC' | 'OnTact' | 'MTN' | 'Mondo' | 'Vendors' | 'Commercial' | 'Fulfilment';
};

export type FunnelLeakageRow = {
  fromStage: string;
  toStage: string;
  apiFieldFrom: string;
  apiFieldTo: string;
  ownerFrom: string;
  ownerTo: string;
  volumeFrom: number;
  volumeTo: number;
  retained: number;
  dropoff: number;
  dropoffRate: number;
  conversionRate: number;
  costPerFromStage: number;
  costPerToStage: number;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'No Volume';
};

export type SankeyNode = {
  name: string;
  value: number;
  owner: string;
};

export type SankeyLink = {
  source: string;
  target: string;
  value: number;
  dropoff: number;
  dropoffRate: number;
  conversionRate: number;
};

export type FunnelLeakageSummary = {
  totalSpend: number;
  firstStageVolume: number;
  finalStageVolume: number;
  overallConversionRate: number;
  totalDropoff: number;
  highestLeakageStage: string;
  highestLeakageRate: number;
  criticalLeaks: number;
  sankeyNodes: SankeyNode[];
  sankeyLinks: SankeyLink[];
};

export const DEFAULT_FUNNEL_STAGES: FunnelStageDefinition[] = [
  { stage: 'Fetched Leads', field: 'Fetched_Leads', owner: 'Offernet' },
  { stage: 'Standardised ID', field: 'Standardised_ID_Number', owner: 'Validation' },
  { stage: 'Standardised Phone', field: 'Standardised_Phone_Number', owner: 'Validation' },
  { stage: 'Valid ID', field: 'Valid_IDNumber', owner: 'Validation' },
  { stage: 'Valid Phone', field: 'Valid_Phone', owner: 'Validation' },
  { stage: 'Valid Phone + ID', field: 'Total_Leads_WithValid_Phone_ID', owner: 'Validation' },
  { stage: 'BLC Vetted', field: 'Total_Leads_Passed_BLC_Vetting', owner: 'BLC' },
  { stage: 'BLC Dedupe Passed', field: 'Total_Leads_Dedupe_Passed_BLC', owner: 'BLC' },
  { stage: 'Delivered OnTact', field: 'Total_Leads_Delivered_OnTact', owner: 'OnTact' },
  { stage: 'Accepted Leads', field: 'Accepted_Leads', owner: 'Commercial' },
  { stage: 'MTN Dialled', field: 'MTN_Dialed_Leads', owner: 'MTN' },
  { stage: 'MTN Answered', field: 'MTN_Answered_Calls', owner: 'MTN' },
  { stage: 'Right Party Contact', field: 'MTN_Right_Party_Contact', owner: 'MTN' },
  { stage: 'MTN Sales', field: 'MTN_Sales', owner: 'MTN' },
  { stage: 'MTN Activations', field: 'MTN_Activated_Sales', owner: 'Fulfilment' }
];

const n = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
};

const ratio = (top: unknown, bottom: unknown): number => {
  const denominator = n(bottom);
  return denominator ? n(top) / denominator : 0;
};

const severity = (dropoffRate: number, volumeFrom: number): FunnelLeakageRow['severity'] => {
  if (!volumeFrom) return 'No Volume';
  if (dropoffRate >= 0.65) return 'Critical';
  if (dropoffRate >= 0.4) return 'High';
  if (dropoffRate >= 0.2) return 'Medium';
  return 'Low';
};

export function aggregateFunnelTotals(records: FunnelRecord[], stages = DEFAULT_FUNNEL_STAGES) {
  const totals: Record<string, number> = { Amount_Spent: 0 };

  records
    .filter((record) => record.__source === 'onvest' || record.Fetched_Leads || record.offershop_source)
    .forEach((record) => {
      totals.Amount_Spent += n(record.Amount_Spent);
      stages.forEach((stage) => {
        totals[stage.field] = (totals[stage.field] ?? 0) + n(record[stage.field]);
      });
    });

  return totals;
}

export function buildFunnelLeakageRows(records: FunnelRecord[], stages = DEFAULT_FUNNEL_STAGES): FunnelLeakageRow[] {
  const totals = aggregateFunnelTotals(records, stages);
  const spend = totals.Amount_Spent ?? 0;

  return stages.slice(0, -1).map((from, index) => {
    const to = stages[index + 1];
    const volumeFrom = totals[from.field] ?? 0;
    const rawVolumeTo = totals[to.field] ?? 0;
    const volumeTo = Math.min(rawVolumeTo, volumeFrom || rawVolumeTo);
    const dropoff = Math.max(volumeFrom - volumeTo, 0);
    const dropoffRate = ratio(dropoff, volumeFrom);
    const conversionRate = ratio(volumeTo, volumeFrom);

    return {
      fromStage: from.stage,
      toStage: to.stage,
      apiFieldFrom: from.field,
      apiFieldTo: to.field,
      ownerFrom: from.owner,
      ownerTo: to.owner,
      volumeFrom,
      volumeTo,
      retained: volumeTo,
      dropoff,
      dropoffRate,
      conversionRate,
      costPerFromStage: ratio(spend, volumeFrom),
      costPerToStage: ratio(spend, volumeTo),
      severity: severity(dropoffRate, volumeFrom)
    } satisfies FunnelLeakageRow;
  });
}

export function summarizeFunnelLeakage(records: FunnelRecord[], stages = DEFAULT_FUNNEL_STAGES): FunnelLeakageSummary {
  const rows = buildFunnelLeakageRows(records, stages);
  const totals = aggregateFunnelTotals(records, stages);
  const firstStage = stages[0];
  const finalStage = stages[stages.length - 1];
  const firstStageVolume = totals[firstStage.field] ?? 0;
  const finalStageVolume = totals[finalStage.field] ?? 0;
  const highestLeak = [...rows].sort((a, b) => b.dropoffRate - a.dropoffRate)[0];
  const sankeyNodes: SankeyNode[] = stages.map((stage) => ({
    name: stage.stage,
    value: totals[stage.field] ?? 0,
    owner: stage.owner
  }));
  const sankeyLinks: SankeyLink[] = rows.map((row) => ({
    source: row.fromStage,
    target: row.toStage,
    value: row.retained,
    dropoff: row.dropoff,
    dropoffRate: row.dropoffRate,
    conversionRate: row.conversionRate
  }));

  return {
    totalSpend: totals.Amount_Spent ?? 0,
    firstStageVolume,
    finalStageVolume,
    overallConversionRate: ratio(finalStageVolume, firstStageVolume),
    totalDropoff: Math.max(firstStageVolume - finalStageVolume, 0),
    highestLeakageStage: highestLeak ? `${highestLeak.fromStage} → ${highestLeak.toStage}` : 'No leakage detected',
    highestLeakageRate: highestLeak?.dropoffRate ?? 0,
    criticalLeaks: rows.filter((row) => row.severity === 'Critical').length,
    sankeyNodes,
    sankeyLinks
  };
}

export function buildSourceFunnelLeakage(records: FunnelRecord[], stages = DEFAULT_FUNNEL_STAGES) {
  const grouped = new Map<string, FunnelRecord[]>();

  records
    .filter((record) => record.__source === 'onvest' || record.Fetched_Leads || record.offershop_source)
    .forEach((record) => {
      const source = String(record.offershop_source ?? record.source ?? 'Unclassified');
      const current = grouped.get(source) ?? [];
      current.push(record);
      grouped.set(source, current);
    });

  return [...grouped.entries()]
    .map(([source, sourceRecords]) => ({
      source,
      ...summarizeFunnelLeakage(sourceRecords, stages)
    }))
    .sort((a, b) => b.totalDropoff - a.totalDropoff);
}
