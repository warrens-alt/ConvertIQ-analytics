export type LifecycleRecord = Record<string, unknown>;

export type LifecycleStageKey = 'fetched' | 'delivered' | 'sold' | 'captured' | 'nettApp' | 'activated';

export type LifecycleStage = {
  key: LifecycleStageKey;
  label: string;
  timestampAliases: string[];
  volumeAliases: string[];
};

export type LifecycleEntity = {
  entityKey: string;
  source: string;
  grain: 'lead-level' | 'aggregate-daily' | 'record-level';
  fetchedAt?: string;
  deliveredAt?: string;
  soldAt?: string;
  capturedAt?: string;
  nettAppAt?: string;
  activatedAt?: string;
  availableStages: number;
};

export type LifecycleLagRow = {
  step: string;
  from: LifecycleStageKey;
  to: LifecycleStageKey;
  count: number;
  avgHours: number;
  medianHours: number;
  minHours: number;
  maxHours: number;
};

export type LifecycleCoverageRow = {
  stage: string;
  key: LifecycleStageKey;
  timestampedRecords: number;
  volume: number;
  coverageRate: number;
};

export type LifecycleSummary = {
  entities: LifecycleEntity[];
  lagRows: LifecycleLagRow[];
  coverageRows: LifecycleCoverageRow[];
  leadLevelEntities: number;
  aggregateEntities: number;
  linkedEntities: number;
  completeLifecycleEntities: number;
};

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  { key: 'fetched', label: 'Fetched Lead', timestampAliases: ['fetched_at', 'fetched_timestamp', 'lead_created_at', 'created_at', 'date_created', 'entry_date', 'date'], volumeAliases: ['Fetched_Leads', 'Leads', 'Total_Leads', 'Form_Completion'] },
  { key: 'delivered', label: 'Delivered Lead', timestampAliases: ['delivered_at', 'delivered_timestamp', 'delivery_date', 'lead_delivered_at', 'entry_date', 'modify_date', 'date'], volumeAliases: ['Total_Leads_Delivered_OnTact', 'Total_Leads_Delivered_MTN', 'Total_Leads_Delivered_Mondo', 'DebtRescue_LeadDelivered', 'Naga_FileDroppedOnFTP'] },
  { key: 'sold', label: 'Sold Lead', timestampAliases: ['sold_at', 'sale_at', 'sale_date', 'sold_timestamp', 'call_date', 'date'], volumeAliases: ['MTN_Sales', 'Total_Leads_Sold_A', 'Total_Leads_Sold_B', 'Total_Leads_Sold_C', 'Total_Leads_Sold_D', 'Total_Leads_Sold_Other', 'count_sale', 'count_sales'] },
  { key: 'captured', label: 'Captured Lead', timestampAliases: ['captured_at', 'capture_at', 'capture_date', 'capture_complete', 'date_created', 'created_at'], volumeAliases: ['Captures', 'Capture', 'count_capture_complete', 'count_capture', 'count_captures', 'count_date_created', 'total_capture_complete'] },
  { key: 'nettApp', label: 'Nett App', timestampAliases: ['nett_app_at', 'nett_app', 'net_app_at', 'net_app', 'nett_app_date'], volumeAliases: ['Nett_Apps', 'Net_Apps', 'count_nett_app', 'count_nett_apps', 'count_net_apps', 'total_nett_apps', 'total_net_apps'] },
  { key: 'activated', label: 'Activation', timestampAliases: ['activated_at', 'activation_at', 'activation_date', 'activation', 'activated_timestamp'], volumeAliases: ['Activations', 'BLC_Activations', 'MTN_Activated_Sales', 'count_activation', 'count_activations', 'total_activations'] }
];

const n = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
};

const parseDate = (value: unknown): string | undefined => {
  if (!value) return undefined;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
};

const firstTimestamp = (record: LifecycleRecord, aliases: string[]): string | undefined => {
  for (const alias of aliases) {
    const timestamp = parseDate(record[alias]);
    if (timestamp) return timestamp;
  }
  return undefined;
};

const volumeFor = (record: LifecycleRecord, aliases: string[]): number => aliases.reduce((sum, alias) => sum + n(record[alias]), 0);

const statusText = (record: LifecycleRecord) => `${record.status ?? ''} ${record.call_result ?? ''} ${record.disposition ?? ''} ${record.comments ?? ''}`.toLowerCase();
const saleLike = (record: LifecycleRecord): boolean => /(sale|sold|activated|activation|approved|success|contract)/i.test(statusText(record));

const leadKey = (record: LifecycleRecord, index: number): { key: string; grain: LifecycleEntity['grain'] } => {
  const source = String(record.__source ?? record.source ?? 'unknown');
  const stable = record.lead_id ?? record.vendor_lead_code ?? record.source_id ?? record.application_id ?? record.customer_id ?? record.phone_number ?? record.email;
  if (stable) return { key: `${source}:${String(stable)}`, grain: 'lead-level' };
  const date = String(record.date ?? record.activation ?? record.capture_complete ?? record.nett_app ?? record.date_created ?? 'undated');
  return { key: `${source}:aggregate:${date}:${record.offershop_source ?? record.query ?? index}`, grain: 'aggregate-daily' };
};

const stageTimestamp = (record: LifecycleRecord, stage: LifecycleStage): string | undefined => {
  if (stage.key === 'sold' && record.__source === 'ontact' && !saleLike(record)) return undefined;
  const timestamp = firstTimestamp(record, stage.timestampAliases);
  if (timestamp) {
    if (stage.key === 'fetched') return timestamp;
    if (volumeFor(record, stage.volumeAliases) > 0 || ['delivered', 'sold'].includes(stage.key) || record.__source === 'ontact' || record.__source === 'powerbi') return timestamp;
  }
  return undefined;
};

const hoursBetween = (from?: string, to?: string): number | undefined => {
  if (!from || !to) return undefined;
  const start = new Date(from).getTime();
  const end = new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return undefined;
  return (end - start) / 36e5;
};

const median = (values: number[]): number => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const timestampField = (entity: LifecycleEntity, key: LifecycleStageKey): string | undefined => {
  const value = entity[`${key}At` as keyof LifecycleEntity];
  return typeof value === 'string' ? value : undefined;
};

export function summarizeLeadLifecycle(records: LifecycleRecord[]): LifecycleSummary {
  const grouped = new Map<string, LifecycleEntity>();
  const coverageRows: LifecycleCoverageRow[] = LIFECYCLE_STAGES.map((stage) => ({ stage: stage.label, key: stage.key, timestampedRecords: 0, volume: 0, coverageRate: 0 }));

  records.forEach((record, index) => {
    const { key, grain } = leadKey(record, index);
    const entity = grouped.get(key) ?? { entityKey: key, source: String(record.__source ?? record.source ?? 'unknown'), grain, availableStages: 0 };

    LIFECYCLE_STAGES.forEach((stage, stageIndex) => {
      const timestamp = stageTimestamp(record, stage);
      const volume = volumeFor(record, stage.volumeAliases);
      coverageRows[stageIndex].volume += volume;
      if (timestamp) {
        coverageRows[stageIndex].timestampedRecords += 1;
        const field = `${stage.key}At` as keyof LifecycleEntity;
        const current = entity[field] as string | undefined;
        if (!current || new Date(timestamp).getTime() < new Date(current).getTime()) {
          (entity as Record<string, unknown>)[field] = timestamp;
        }
      }
    });

    grouped.set(key, entity);
  });

  const entities = [...grouped.values()].map((entity) => {
    const availableStages = LIFECYCLE_STAGES.reduce((count, stage) => count + (timestampField(entity, stage.key) ? 1 : 0), 0);
    return { ...entity, availableStages };
  }).sort((a, b) => b.availableStages - a.availableStages);

  coverageRows.forEach((row) => {
    row.coverageRate = records.length ? row.timestampedRecords / records.length : 0;
  });

  const pairs: Array<{ step: string; from: LifecycleStageKey; to: LifecycleStageKey }> = [
    { step: 'Fetched → Delivered', from: 'fetched', to: 'delivered' },
    { step: 'Delivered → Sold', from: 'delivered', to: 'sold' },
    { step: 'Sold → Captured', from: 'sold', to: 'captured' },
    { step: 'Captured → Nett App', from: 'captured', to: 'nettApp' },
    { step: 'Nett App → Activation', from: 'nettApp', to: 'activated' },
    { step: 'Fetched → Activation', from: 'fetched', to: 'activated' }
  ];

  const lagRows = pairs.map((pair) => {
    const values = entities
      .map((entity) => hoursBetween(timestampField(entity, pair.from), timestampField(entity, pair.to)))
      .filter((value): value is number => typeof value === 'number');
    return {
      step: pair.step,
      from: pair.from,
      to: pair.to,
      count: values.length,
      avgHours: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0,
      medianHours: median(values),
      minHours: values.length ? Math.min(...values) : 0,
      maxHours: values.length ? Math.max(...values) : 0
    };
  });

  return {
    entities,
    lagRows,
    coverageRows,
    leadLevelEntities: entities.filter((entity) => entity.grain === 'lead-level').length,
    aggregateEntities: entities.filter((entity) => entity.grain !== 'lead-level').length,
    linkedEntities: entities.filter((entity) => entity.availableStages >= 2).length,
    completeLifecycleEntities: entities.filter((entity) => entity.fetchedAt && entity.deliveredAt && entity.soldAt && entity.capturedAt && entity.nettAppAt && entity.activatedAt).length
  };
}
