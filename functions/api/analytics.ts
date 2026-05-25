export interface Env {
  ONVEST_API_URL?: string;
  ONVEST_API_PATH?: string;
  ONVEST_API_USERNAME?: string;
  ONVEST_API_PASSWORD?: string;
  ONVEST_API_QUERY_KEY?: string;
  ONVEST_API_AUTH_MODE?: string;
  ONVEST_API_QUERY_PARAM?: string;
  ONTACT_API_URL?: string;
  ONTACT_API_PATH?: string;
  ONTACT_API_USERNAME?: string;
  ONTACT_API_PASSWORD?: string;
  ONTACT_API_QUERY_KEY?: string;
  ONTACT_API_AUTH_MODE?: string;
  ONTACT_API_QUERY_PARAM?: string;
  POWERBI_QUERYDATA_URL?: string;
  POWERBI_RESOURCE_KEY?: string;
}

type ApiSourceName = 'onvest' | 'ontact';
type SourceName = ApiSourceName | 'powerbi';
type JsonRow = Record<string, unknown>;
type FieldProfile = { field: string; group: string; role: string; type: string; numeric: boolean; pii: boolean; nonNull: number; total?: number; sampleValues: string[] };
type DateFilter = { applied: boolean; from: string; to: string; defaultWindowApplied: boolean };

const DEFAULT_WINDOW_DAYS = 30;
const DEFAULT_MAX_ROWS = 5000;
const ABSOLUTE_MAX_ROWS = 15000;
const DEFAULT_RECORD_LIMIT = 1000;
const ABSOLUTE_RECORD_LIMIT = 5000;
const DEFAULT_POWERBI_QUERYDATA_URL = 'https://wabi-south-africa-north-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true';
const DEFAULT_POWERBI_RESOURCE_KEY = '4d7a85aa-c545-4d45-b3a6-719c3c805af7';
const POWERBI_DATASET_ID = '59cef14d-8dd0-4016-a349-c227162a0fee';
const POWERBI_REPORT_ID = 'fe973424-23fd-433a-a81f-0f08416228ef';
const POWERBI_MODEL_ID = 598641;
const DATE_KEYS = ['from', 'to', 'start', 'end', 'date_from', 'date_to'];
const ROW_DATE_FIELDS = ['date', 'call_date', 'entry_date', 'modify_date', 'last_local_call_time', 'activation', 'capture_complete', 'nett_app', 'date_created'];
const PII_FIELDS = new Set(['phone_number', 'alt_phone', 'email', 'vendor_lead_code', 'first_name', 'last_name', 'middle_initial', 'address1', 'address2', 'address3', 'postal_code', 'date_of_birth', 'security_phrase']);
const IDENTIFIER_FIELDS = new Set(['uniqueid', 'lead_id', 'list_id', 'campaign_id', 'source_id', 'entry_list_id', 'dataset_id', 'report_id', 'model_id']);

const SOURCE_CONFIG: Record<ApiSourceName, { url: keyof Env; path: keyof Env; username: keyof Env; password: keyof Env; queryKey: keyof Env; authMode: keyof Env; queryParam: keyof Env }> = {
  onvest: { url: 'ONVEST_API_URL', path: 'ONVEST_API_PATH', username: 'ONVEST_API_USERNAME', password: 'ONVEST_API_PASSWORD', queryKey: 'ONVEST_API_QUERY_KEY', authMode: 'ONVEST_API_AUTH_MODE', queryParam: 'ONVEST_API_QUERY_PARAM' },
  ontact: { url: 'ONTACT_API_URL', path: 'ONTACT_API_PATH', username: 'ONTACT_API_USERNAME', password: 'ONTACT_API_PASSWORD', queryKey: 'ONTACT_API_QUERY_KEY', authMode: 'ONTACT_API_AUTH_MODE', queryParam: 'ONTACT_API_QUERY_PARAM' }
};

const json = (body: unknown, init: ResponseInit = {}) => new Response(JSON.stringify(body, null, 2), { ...init, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...init.headers } });
const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const safeNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};
const numericLike = (value: unknown) => typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && /^-?[\d,.]+$/.test(value.trim()));
const toDate = (value: unknown): string | null => {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};
const valueType = (value: unknown) => value === null || value === undefined || value === '' ? 'empty' : numericLike(value) ? 'number' : toDate(value) ? 'date' : typeof value;
const clampLimit = (value: string | null, fallback: number, max: number) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), max) : fallback;
};
const getMaxRows = (query: URLSearchParams) => clampLimit(query.get('maxRows') ?? query.get('limit'), DEFAULT_MAX_ROWS, ABSOLUTE_MAX_ROWS);
const getRecordLimit = (query: URLSearchParams) => clampLimit(query.get('recordLimit'), DEFAULT_RECORD_LIMIT, ABSOLUTE_RECORD_LIMIT);

const dateBoundsFromQuery = (query: URLSearchParams): DateFilter => {
  const hadDate = DATE_KEYS.some((key) => query.has(key));
  let from = query.get('from') || query.get('start') || query.get('date_from') || '';
  let to = query.get('to') || query.get('end') || query.get('date_to') || '';
  if (!hadDate) {
    const toValue = new Date();
    const fromValue = new Date(toValue);
    fromValue.setUTCDate(toValue.getUTCDate() - DEFAULT_WINDOW_DAYS);
    from = isoDate(fromValue);
    to = isoDate(toValue);
  }
  return { applied: Boolean(from || to), from, to, defaultWindowApplied: !hadDate };
};
const rowDate = (row: JsonRow) => {
  for (const field of ROW_DATE_FIELDS) {
    const parsed = toDate(row[field]);
    if (parsed) return parsed;
  }
  return null;
};
const filterRowsByDate = (rows: JsonRow[], filter: DateFilter) => {
  if (!filter.applied) return { rows, excluded: 0, undated: 0 };
  let excluded = 0;
  let undated = 0;
  const filtered = rows.filter((row) => {
    const date = rowDate(row);
    if (!date) { excluded += 1; undated += 1; return false; }
    const keep = (!filter.from || date >= filter.from) && (!filter.to || date <= filter.to);
    if (!keep) excluded += 1;
    return keep;
  });
  return { rows: filtered, excluded, undated };
};
const extractRows = (payload: unknown): unknown[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (Array.isArray(p.data)) return p.data;
    if (Array.isArray(p.rows)) return p.rows;
    if (Array.isArray(p.results)) return p.results;
  }
  return [];
};

const classifyVendor = (row: JsonRow) => {
  const source = String(row.offershop_source ?? row.owner ?? row.campaign_id ?? row.list_id ?? row.company_name ?? row.query ?? '').toLowerCase();
  const comments = String(row.comments ?? '').toLowerCase();
  if (source.includes('power bi')) return 'Power BI';
  if (source.includes('mondo') || comments.includes('mondo')) return 'Mondo';
  if (source.includes('mtn') || comments.includes('mtn')) return 'MTN';
  if (source.includes('blc') || comments.includes('vodacom') || comments.includes('segment ->')) return 'BLC';
  if (source.includes('fb.com')) return 'Meta';
  if (source.includes('ontact')) return 'Ontact';
  return source ? source.split('|')[0].replace(/^www\./, '') : 'Unclassified';
};
const statusFamily = (status: unknown) => {
  const value = String(status ?? '').toUpperCase();
  if (!value) return 'Unknown';
  if (['SALE', 'SOLD', 'ACTIVATED', 'DELIVERED'].some((x) => value.includes(x))) return 'Sale / Delivered';
  if (['A', 'B', 'C', 'D'].includes(value)) return 'Mondo Grade';
  if (['N', 'NA', 'ADC', 'DROP', 'BUSY', 'AB', 'ALTNUM'].includes(value)) return 'No Sale / No Contact';
  if (['DONEM', 'CALLBK', 'CBHOLD', 'CALLBACK'].some((x) => value.includes(x))) return 'Callback';
  return value;
};
const fieldGroup = (field: string, source: SourceName) => {
  if (PII_FIELDS.has(field)) return 'PII / redacted';
  if (source === 'powerbi') return field.startsWith('count_') || field.startsWith('total_') ? 'Power BI measures' : ROW_DATE_FIELDS.includes(field) ? 'Power BI date fields' : 'Power BI dimensions';
  if (ROW_DATE_FIELDS.includes(field)) return 'Date / time';
  if (source === 'ontact') {
    if (IDENTIFIER_FIELDS.has(field)) return 'Ontact identifiers';
    if (['status', 'call_result', 'term_reason', 'alt_dial', 'processed', 'user_group'].includes(field)) return 'Call outcome';
    if (['user', 'agent', 'owner'].includes(field)) return 'Agent / ownership';
    if (['start_epoch', 'end_epoch', 'length_in_sec', 'called_count', 'rank', 'gmt_offset_now', 'called_since_last_reset'].includes(field)) return 'Call activity metrics';
    return 'Lead record attributes';
  }
  if (field === 'offershop_source') return 'Source / channel';
  if (['Amount_Spent', 'Impressions', 'Reach', 'Ad_Recall', 'Engagement', 'Video_Views', 'Page_Like', 'Clicks', 'Outbound_Clicks', 'Conversation_Started', 'Landing_Page_View', 'Add_to_cart', 'Initiate_Checkout', 'Form_Completion'].includes(field)) return 'Media performance';
  if (field.startsWith('Standardised_') || field.startsWith('Valid_') || field === 'Total_Leads_WithValid_Phone_ID') return 'Standardisation / validation';
  if (field.includes('_BLC') || field.includes('OnTact')) return 'BLC / OnTact delivery';
  if (field.includes('_MTN') || field.startsWith('MTN_')) return 'MTN flow';
  if (field.includes('_Mondo') || field.includes('_AllProviders') || field.includes('_DailyDuplicate') || ['Total_Mondo_Grade_Passed_Lead', 'Total_Leads_A', 'Total_Leads_B', 'Total_Leads_U'].includes(field)) return 'Mondo flow';
  if (field.startsWith('Naga_')) return 'Naga flow';
  if (field.startsWith('DebtResc')) return 'Debt Rescue flow';
  if (field.includes('Sold') || field.includes('Sales') || field.includes('Activated') || field.includes('Qualified') || field.includes('Accepted')) return 'Conversion / sales';
  return 'Lead funnel';
};
const fieldRole = (field: string, source: SourceName) => PII_FIELDS.has(field) ? 'redacted identifier' : ROW_DATE_FIELDS.includes(field) || field.includes('_date') || field.endsWith('_time') ? 'date/time' : IDENTIFIER_FIELDS.has(field) ? 'identifier' : source === 'powerbi' && (field.startsWith('count_') || field.startsWith('total_')) ? 'measure' : ['offershop_source', 'campaign_id', 'status', 'call_result', 'agent', 'user', 'owner', 'segment', 'team_name', 'full_name'].includes(field) ? 'dimension' : 'metric';
const isAdditiveMetric = (field: string, source: SourceName) => !PII_FIELDS.has(field) && !IDENTIFIER_FIELDS.has(field) && !ROW_DATE_FIELDS.includes(field) && !(source === 'ontact' && ['phone_code', 'gmt_offset_now', 'rank', 'start_epoch', 'end_epoch'].includes(field));

const incrementBucket = (map: Map<string, Record<string, number | string>>, keyName: string, key: string) => {
  const bucket = map.get(key) ?? { [keyName]: key, records: 0 };
  bucket.records = safeNumber(bucket.records) + 1;
  map.set(key, bucket);
  return bucket;
};
const buildFieldCatalog = (rows: JsonRow[], source: SourceName) => {
  const order: string[] = [];
  const profiles = new Map<string, FieldProfile>();
  const ensure = (field: string) => {
    let profile = profiles.get(field);
    if (!profile) {
      order.push(field);
      profile = { field, group: fieldGroup(field, source), role: fieldRole(field, source), type: 'empty', numeric: false, pii: PII_FIELDS.has(field), nonNull: 0, sampleValues: [] };
      profiles.set(field, profile);
    }
    return profile;
  };
  rows.forEach((row) => Object.entries(row).forEach(([field, value]) => {
    const profile = ensure(field);
    const type = valueType(value);
    if (type === 'empty') return;
    profile.nonNull += 1;
    if (profile.type === 'empty') profile.type = type;
    if (type === 'number' && isAdditiveMetric(field, source)) { profile.numeric = true; profile.total = (profile.total ?? 0) + safeNumber(value); }
    const sample = profile.pii ? '[redacted]' : String(value).slice(0, 120);
    if (sample && !profile.sampleValues.includes(sample) && profile.sampleValues.length < 3) profile.sampleValues.push(sample);
  }));
  return order.map((field) => profiles.get(field)!);
};
const sanitizeRecords = (rows: JsonRow[], fields: string[], limit: number) => rows.slice(0, limit).map((row) => {
  const record: Record<string, unknown> = {};
  fields.forEach((field) => { record[field] = PII_FIELDS.has(field) ? '[redacted]' : row[field] ?? ''; });
  return record;
});
const aggregateRows = (rows: JsonRow[], source: SourceName, recordLimit: number) => {
  const fieldCatalog = buildFieldCatalog(rows, source);
  const columns = fieldCatalog.map((field) => field.field);
  const totals: Record<string, number> = { records: rows.length };
  const numericKeys = new Set<string>();
  const textKeys = new Set<string>();
  const byDate = new Map<string, Record<string, number | string>>();
  const byVendor = new Map<string, Record<string, number | string>>();
  const byAgent = new Map<string, Record<string, number | string>>();
  const byStatus = new Map<string, Record<string, number | string>>();
  rows.forEach((row) => {
    const dateBucket = incrementBucket(byDate, 'date', rowDate(row) ?? 'Undated');
    const vendorBucket = incrementBucket(byVendor, 'vendor', classifyVendor(row));
    const agentBucket = incrementBucket(byAgent, 'agent', String(row.agent ?? row.user ?? row.full_name ?? 'Unassigned'));
    const statusBucket = incrementBucket(byStatus, 'status', statusFamily(row.status ?? row.call_result ?? row.query));
    if (row.call_date || row.uniqueid) totals.__call_records = (totals.__call_records ?? 0) + 1;
    Object.entries(row).forEach(([field, value]) => {
      if (PII_FIELDS.has(field)) { textKeys.add(field); return; }
      if (numericLike(value)) {
        numericKeys.add(field);
        if (!isAdditiveMetric(field, source)) return;
        const amount = safeNumber(value);
        totals[field] = (totals[field] ?? 0) + amount;
        dateBucket[field] = safeNumber(dateBucket[field]) + amount;
        vendorBucket[field] = safeNumber(vendorBucket[field]) + amount;
        agentBucket[field] = safeNumber(agentBucket[field]) + amount;
        statusBucket[field] = safeNumber(statusBucket[field]) + amount;
      } else textKeys.add(field);
    });
  });
  const derived = {
    spend: totals.Amount_Spent ?? 0,
    fetchedLeads: totals.Fetched_Leads ?? 0,
    acceptedLeads: totals.Accepted_Leads ?? totals.Total_Leads_Delivered_OnTact ?? 0,
    qualifiedLeads: totals.Qualified_Leads ?? 0,
    sales: (totals.MTN_Sales ?? 0) + (totals.Total_Leads_Sold_A ?? 0) + (totals.Total_Leads_Sold_B ?? 0) + (totals.Total_Leads_Sold_C ?? 0) + (totals.Total_Leads_Sold_D ?? 0) + (totals.Total_Leads_Sold_Other ?? 0),
    activations: (totals.MTN_Activated_Sales ?? 0) + Math.max(totals.count_activation ?? 0, totals.total_activations ?? 0),
    calls: totals.__call_records ?? 0,
    talkSeconds: totals.length_in_sec ?? 0,
    cpl: totals.Form_Completion ? (totals.Amount_Spent ?? 0) / totals.Form_Completion : 0,
    cpaAccepted: totals.Accepted_Leads ? (totals.Amount_Spent ?? 0) / totals.Accepted_Leads : 0
  };
  return { fields: { numeric: [...numericKeys].sort(), text: [...textKeys].sort() }, fieldCatalog, columns, totals, derived, byDate: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))), byVendor: [...byVendor.values()].sort((a, b) => safeNumber(b.records) - safeNumber(a.records)), byAgent: [...byAgent.values()].sort((a, b) => safeNumber(b.records) - safeNumber(a.records)).slice(0, 50), byStatus: [...byStatus.values()].sort((a, b) => safeNumber(b.records) - safeNumber(a.records)), records: sanitizeRecords(rows, columns, recordLimit), recordsReturned: Math.min(rows.length, recordLimit), recordLimit };
};

const buildUpstreamUrl = (base: string, path: string | undefined) => {
  const url = new URL(base);
  if (path && path.trim()) url.pathname = `${url.pathname.replace(/\/$/, '')}/${path.trim().replace(/^\//, '')}`;
  return url;
};
const attachQueryDefaults = (upstream: URL, query: URLSearchParams, maxRows: number, filter: DateFilter) => {
  for (const [key, value] of query.entries()) if (!['source', 'recordLimit'].includes(key)) upstream.searchParams.set(key === 'maxRows' ? 'limit' : key, value);
  upstream.searchParams.set('limit', String(maxRows));
  upstream.searchParams.set('page_size', String(maxRows));
  upstream.searchParams.set('max', String(maxRows));
  if (filter.from) ['from', 'start', 'date_from'].forEach((key) => upstream.searchParams.set(key, filter.from));
  if (filter.to) ['to', 'end', 'date_to'].forEach((key) => upstream.searchParams.set(key, filter.to));
};
const authHeadersAndQuery = (env: Env, source: ApiSourceName, upstream: URL) => {
  const config = SOURCE_CONFIG[source];
  const username = env[config.username];
  const secret = env[config.password] || env[config.queryKey];
  const mode = String(env[config.authMode] || 'basic').toLowerCase();
  const queryParam = env[config.queryParam] || 'key';
  const headers: Record<string, string> = { accept: 'application/json' };
  if (!secret) return { headers, configured: false, reason: `Missing ${source} API password/query key secret.` };
  if (mode === 'bearer') headers.authorization = `Bearer ${secret}`;
  else if (mode === 'query') upstream.searchParams.set(queryParam, secret);
  else if (mode === 'x-api-key') headers['x-api-key'] = secret;
  else if (username) headers.authorization = `Basic ${btoa(`${username}:${secret}`)}`;
  else headers['x-api-key'] = secret;
  return { headers, configured: true, reason: undefined };
};

const fetchSource = async (source: ApiSourceName, env: Env, query: URLSearchParams) => {
  const config = SOURCE_CONFIG[source];
  const base = env[config.url];
  if (!base) return { source, ok: false, configured: false, error: `Missing ${source} API URL.` };
  const maxRows = getMaxRows(query);
  const recordLimit = getRecordLimit(query);
  const filter = dateBoundsFromQuery(query);
  const upstream = buildUpstreamUrl(base, env[config.path]);
  attachQueryDefaults(upstream, query, maxRows, filter);
  const auth = authHeadersAndQuery(env, source, upstream);
  if (!auth.configured) return { source, ok: false, configured: false, error: auth.reason };
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(upstream.toString(), { headers: auth.headers });
    const text = await response.text();
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { return { source, ok: false, configured: true, status: response.status, error: 'Upstream did not return JSON.', preview: text.slice(0, 250), startedAt, completedAt: new Date().toISOString() }; }
    const rawRows = extractRows(payload);
    const rawObjects = rawRows.filter((row): row is JsonRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
    const filtered = filterRowsByDate(rawObjects, filter);
    const rows = filtered.rows.slice(0, maxRows);
    const upstreamCount = payload && typeof payload === 'object' && 'count' in payload ? Number((payload as { count?: unknown }).count) : rawRows.length;
    return { source, ok: response.ok, configured: true, status: response.status, startedAt, completedAt: new Date().toISOString(), upstreamCount: Number.isFinite(upstreamCount) ? upstreamCount : rawRows.length, rawRows: rawObjects.length, filteredRows: filtered.rows.length, excludedByDate: filtered.excluded, undatedRowsExcluded: filtered.undated, rows: rows.length, truncated: filtered.rows.length > rows.length, maxRows, recordLimit, defaultWindowApplied: filter.defaultWindowApplied, filters: { ...filter, strategy: 'row-level-date-post-filter-before-aggregation' }, analytics: aggregateRows(rows, source, recordLimit) };
  } catch (error) {
    return { source, ok: false, configured: true, error: error instanceof Error ? error.message : String(error), startedAt, completedAt: new Date().toISOString() };
  }
};

const pbiSelectColumn = (source: string, property: string, label: string) => ({ Column: { Expression: { SourceRef: { Source: source } }, Property: property }, Name: `blue_label_reporting wow_data.${property}`, NativeReferenceName: label });
const pbiCount = (source: string, property: string, label: string) => ({ Aggregation: { Expression: { Column: { Expression: { SourceRef: { Source: source } }, Property: property } }, Function: 5 }, Name: `CountNonNull(blue_label_reporting wow_data.${property})`, NativeReferenceName: label });
const pbiDateRange = (source: string, property: string, from: string, to: string) => ({ Condition: { And: { Left: { Comparison: { ComparisonKind: 2, Left: { Column: { Expression: { SourceRef: { Source: source } }, Property: property } }, Right: { Literal: { Value: `datetime'${from}T00:00:00'` } } } }, Right: { Comparison: { ComparisonKind: 3, Left: { Column: { Expression: { SourceRef: { Source: source } }, Property: property } }, Right: { Literal: { Value: `datetime'${to}T23:59:59'` } } } } } } });
const pbiNotNull = (source: string, property: string) => ({ Condition: { Not: { Expression: { Comparison: { ComparisonKind: 0, Left: { Column: { Expression: { SourceRef: { Source: source } }, Property: property } }, Right: { Literal: { Value: 'null' } } } } } } });
const pbiCompanyFilter = (source: string) => ({ Condition: { Contains: { Left: { Column: { Expression: { SourceRef: { Source: source } }, Property: 'company_name' } }, Right: { Literal: { Value: "'ONtact'" } } } } });
const makePowerBiBody = (selects: unknown[], dateProperty: string, from: string, to: string, visualId: string) => ({ version: '1.0.0', queries: [{ Query: { Commands: [{ SemanticQueryDataShapeCommand: { Query: { Version: 2, From: [{ Name: 'b', Entity: 'blue_label_reporting wow_data', Type: 0 }], Select: selects, Where: [pbiDateRange('b', dateProperty, from, to), pbiNotNull('b', dateProperty), pbiCompanyFilter('b')] }, Binding: { Primary: { Groupings: [{ Projections: selects.map((_, index) => index) }] }, DataReduction: { DataVolume: 3, Primary: { Top: {} } }, Version: 1 }, ExecutionMetricsKind: 1 } }] }, QueryId: '', ApplicationContext: { DatasetId: POWERBI_DATASET_ID, Sources: [{ ReportId: POWERBI_REPORT_ID, VisualId: visualId }] } }], cancelQueries: [], modelId: POWERBI_MODEL_ID });
const primitive = (value: unknown) => ['string', 'number', 'boolean'].includes(typeof value) || value === null;
const extractPowerBiRows = (payload: unknown, columns: string[], queryName: string) => {
  const rows: JsonRow[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (!Array.isArray(node) && Array.isArray((node as Record<string, unknown>).C)) {
      const values = (node as { C: unknown[] }).C;
      if (values.length > 0 && values.length <= columns.length && values.every(primitive)) {
        const row: JsonRow = { query: queryName, dataset_id: POWERBI_DATASET_ID, report_id: POWERBI_REPORT_ID, model_id: POWERBI_MODEL_ID };
        columns.forEach((column, index) => { row[column] = values[index] ?? ''; });
        rows.push(row);
      }
    }
    Object.values(node as Record<string, unknown>).forEach((value) => { if (value && typeof value === 'object') visit(value); });
  };
  visit(payload);
  const seen = new Set<string>();
  return rows.filter((row) => { const key = JSON.stringify(row); if (seen.has(key)) return false; seen.add(key); return true; });
};
const fetchPowerBiQuery = async (env: Env, queryName: string, columns: string[], body: unknown) => {
  const endpoint = env.POWERBI_QUERYDATA_URL || DEFAULT_POWERBI_QUERYDATA_URL;
  const resourceKey = env.POWERBI_RESOURCE_KEY || DEFAULT_POWERBI_RESOURCE_KEY;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { accept: 'application/json, text/plain, */*', 'content-type': 'application/json;charset=UTF-8', origin: 'https://app.powerbi.com', referer: 'https://app.powerbi.com/', 'x-powerbi-resourcekey': resourceKey },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let payload: unknown;
  try { payload = JSON.parse(text); } catch { return { ok: false, status: response.status, rows: [] as JsonRow[], error: `Power BI ${queryName} did not return JSON`, preview: text.slice(0, 250) }; }
  return { ok: response.ok, status: response.status, rows: extractPowerBiRows(payload, columns, queryName), error: response.ok ? undefined : `Power BI ${queryName} returned ${response.status}` };
};

const fetchPowerBi = async (env: Env, query: URLSearchParams) => {
  const filter = dateBoundsFromQuery(query);
  const from = filter.from || '2024-01-01';
  const to = filter.to || isoDate(new Date());
  const recordLimit = getRecordLimit(query);
  const startedAt = new Date().toISOString();
  const requests = [
    { name: 'segment_activations', columns: ['segment', 'count_activation'], body: makePowerBiBody([pbiSelectColumn('b', 'segment', 'Segment'), pbiCount('b', 'activation', 'Count of activation')], 'activation', from, to, 'segment-activations') },
    { name: 'team_activations', columns: ['team_name', 'count_activation'], body: makePowerBiBody([pbiSelectColumn('b', 'team_name', 'Team'), pbiCount('b', 'activation', 'Count of activation')], 'activation', from, to, 'team-activations') },
    { name: 'agent_activations', columns: ['full_name', 'team_name', 'total_activations'], body: makePowerBiBody([pbiSelectColumn('b', 'full_name', 'Agent'), pbiSelectColumn('b', 'team_name', 'Team'), pbiCount('b', 'contract_key', 'Total Activations')], 'activation', from, to, 'agent-activations') },
    { name: 'activation_dates', columns: ['activation', 'count_activation'], body: makePowerBiBody([pbiSelectColumn('b', 'activation', 'Activation'), pbiCount('b', 'activation', 'Count of activation')], 'activation', from, to, 'activation-dates') },
    { name: 'segment_capture_complete', columns: ['segment', 'count_capture_complete'], body: makePowerBiBody([pbiSelectColumn('b', 'segment', 'Segment'), pbiCount('b', 'capture_complete', 'Count of capture_complete')], 'capture_complete', from, to, 'segment-capture-complete') },
    { name: 'team_capture_complete', columns: ['team_name', 'count_capture_complete'], body: makePowerBiBody([pbiSelectColumn('b', 'team_name', 'Team'), pbiCount('b', 'capture_complete', 'Count of capture_complete')], 'capture_complete', from, to, 'team-capture-complete') },
    { name: 'agent_capture_complete', columns: ['full_name', 'total_capture_complete'], body: makePowerBiBody([pbiSelectColumn('b', 'full_name', 'Agent'), pbiCount('b', 'contract_key', 'Total Capture Complete')], 'capture_complete', from, to, 'agent-capture-complete') },
    { name: 'capture_complete_dates', columns: ['capture_complete', 'count_capture_complete'], body: makePowerBiBody([pbiSelectColumn('b', 'capture_complete', 'Capture Complete'), pbiCount('b', 'capture_complete', 'Count of capture_complete')], 'capture_complete', from, to, 'capture-complete-dates') },
    { name: 'segment_nett_apps', columns: ['segment', 'count_nett_app'], body: makePowerBiBody([pbiSelectColumn('b', 'segment', 'Segment'), pbiCount('b', 'nett_app', 'Count of nett_app')], 'nett_app', from, to, 'segment-nett-apps') },
    { name: 'team_nett_apps', columns: ['team_name', 'count_nett_app'], body: makePowerBiBody([pbiSelectColumn('b', 'team_name', 'Team'), pbiCount('b', 'nett_app', 'Count of nett_app')], 'nett_app', from, to, 'team-nett-apps') },
    { name: 'agent_nett_apps', columns: ['full_name', 'team_name', 'total_nett_apps'], body: makePowerBiBody([pbiSelectColumn('b', 'full_name', 'Agent'), pbiSelectColumn('b', 'team_name', 'Team'), pbiCount('b', 'contract_key', 'Total Nett Apps')], 'nett_app', from, to, 'agent-nett-apps') },
    { name: 'nett_app_dates', columns: ['nett_app', 'count_nett_app'], body: makePowerBiBody([pbiSelectColumn('b', 'nett_app', 'Nett App'), pbiCount('b', 'nett_app', 'Count of nett_app')], 'nett_app', from, to, 'nett-app-dates') },
    { name: 'date_created_on_capture_complete', columns: ['date_created', 'count_date_created'], body: makePowerBiBody([pbiSelectColumn('b', 'date_created', 'Date Created'), pbiCount('b', 'date_created', 'Count of date_created')], 'capture_complete', from, to, 'date-created-capture-complete') }
  ];
  try {
    const responses = await Promise.all(requests.map((request) => fetchPowerBiQuery(env, request.name, request.columns, request.body)));
    const rawRows = responses.flatMap((response) => response.rows);
    const rows = rawRows.slice(0, recordLimit);
    const failures = responses.filter((response) => !response.ok);
    return { source: 'powerbi', ok: failures.length === 0, configured: true, type: 'querydata', status: failures[0]?.status ?? 200, startedAt, completedAt: new Date().toISOString(), upstreamCount: rawRows.length, rawRows: rawRows.length, filteredRows: rawRows.length, excludedByDate: 0, undatedRowsExcluded: 0, rows: rows.length, recordLimit, defaultWindowApplied: filter.defaultWindowApplied, filters: { from, to, applied: true, defaultWindowApplied: filter.defaultWindowApplied, strategy: 'powerbi-querydata-date-filter-inside-request-body' }, usingDefaultQuerydataUrl: !env.POWERBI_QUERYDATA_URL, usingDefaultResourceKey: !env.POWERBI_RESOURCE_KEY, queryDataEndpoint: env.POWERBI_QUERYDATA_URL || DEFAULT_POWERBI_QUERYDATA_URL, reportTitle: 'Rubix Reports Power BI Production Data', reportId: POWERBI_REPORT_ID, datasetId: POWERBI_DATASET_ID, error: failures.length ? failures.map((failure) => failure.error).join(' | ') : undefined, analytics: aggregateRows(rows, 'powerbi', recordLimit) };
  } catch (error) {
    return { source: 'powerbi', ok: false, configured: true, type: 'querydata', error: error instanceof Error ? error.message : String(error), startedAt, completedAt: new Date().toISOString(), filters: { ...filter, strategy: 'powerbi-querydata-date-filter-inside-request-body' }, analytics: aggregateRows([], 'powerbi', recordLimit) };
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const sourceParam = url.searchParams.get('source');
  if (sourceParam === 'all') return json({ ok: false, mode: 'resource-safe-live-api-sync-no-database-universal-filtering', generatedAt: new Date().toISOString(), results: [{ source: 'all', ok: false, configured: true, error: 'Combined server-side live sync is disabled to avoid Cloudflare CPU limits. Request source=onvest, source=ontact or source=powerbi separately. The frontend unifies these client-side.' }] }, { status: 400 });
  const source: SourceName = sourceParam === 'ontact' ? 'ontact' : sourceParam === 'powerbi' ? 'powerbi' : 'onvest';
  const result = source === 'powerbi' ? await fetchPowerBi(env, url.searchParams) : await fetchSource(source, env, url.searchParams);
  return json({ ok: result.ok, mode: 'resource-safe-live-api-sync-no-database-universal-filtering', generatedAt: new Date().toISOString(), results: [result] });
};
