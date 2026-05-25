export interface Env {
  ONVEST_API_URL?: string;
  ONVEST_API_USERNAME?: string;
  ONVEST_API_PASSWORD?: string;
  ONTACT_API_URL?: string;
  ONTACT_API_USERNAME?: string;
  ONTACT_API_PASSWORD?: string;
}

type SourceName = 'onvest' | 'ontact';
type JsonRow = Record<string, unknown>;

const SOURCE_CONFIG: Record<SourceName, { url: keyof Env; username: keyof Env; password: keyof Env }> = {
  onvest: { url: 'ONVEST_API_URL', username: 'ONVEST_API_USERNAME', password: 'ONVEST_API_PASSWORD' },
  ontact: { url: 'ONTACT_API_URL', username: 'ONTACT_API_USERNAME', password: 'ONTACT_API_PASSWORD' }
};

const PII_FIELDS = new Set([
  'phone_number', 'alt_phone', 'email', 'vendor_lead_code', 'first_name', 'last_name', 'middle_initial', 'address1', 'address2', 'address3', 'postal_code', 'date_of_birth', 'security_phrase'
]);

const DATE_KEYS = ['from', 'to', 'start', 'end', 'date_from', 'date_to'];
const DEFAULT_WINDOW_DAYS = 7;
const DEFAULT_MAX_ROWS = 5000;
const ABSOLUTE_MAX_ROWS = 15000;

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers
    }
  });

const safeNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const numericLike = (value: unknown) =>
  typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && /^-?[\d,.]+$/.test(value.trim()));

const toDate = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);

const classifyVendor = (row: JsonRow): string => {
  const source = String(row.offershop_source ?? row.owner ?? row.campaign_id ?? row.list_id ?? '').toLowerCase();
  const comments = String(row.comments ?? '').toLowerCase();
  if (source.includes('mondo') || comments.includes('mondo')) return 'Mondo';
  if (source.includes('mtn') || comments.includes('mtn')) return 'MTN';
  if (source.includes('blc') || comments.includes('vodacom') || comments.includes('segment ->')) return 'BLC';
  if (source.includes('fb.com')) return 'Meta';
  if (source.includes('ontact')) return 'Ontact';
  return source ? source.split('|')[0].replace(/^www\./, '') : 'Unclassified';
};

const statusFamily = (status: unknown): string => {
  const value = String(status ?? '').toUpperCase();
  if (!value) return 'Unknown';
  if (['SALE', 'SOLD', 'ACTIVATED', 'DELIVERED'].some((x) => value.includes(x))) return 'Sale / Delivered';
  if (['A', 'B', 'C', 'D'].includes(value)) return 'Mondo Grade';
  if (['N', 'NA', 'ADC', 'DROP', 'BUSY', 'AB', 'ALTNUM'].includes(value)) return 'No Sale / No Contact';
  if (['DONEM', 'CALLBK', 'CBHOLD', 'CALLBACK'].some((x) => value.includes(x))) return 'Callback';
  return value;
};

const getMaxRows = (query: URLSearchParams) => {
  const parsed = Number(query.get('maxRows') ?? query.get('limit') ?? DEFAULT_MAX_ROWS);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_ROWS;
  return Math.min(Math.floor(parsed), ABSOLUTE_MAX_ROWS);
};

const applySafeQueryDefaults = (upstream: URL, query: URLSearchParams, maxRows: number) => {
  let hasDate = DATE_KEYS.some((key) => query.has(key));
  for (const [key, value] of query.entries()) {
    if (['from', 'to', 'start', 'end', 'date_from', 'date_to', 'limit', 'maxRows'].includes(key)) upstream.searchParams.set(key === 'maxRows' ? 'limit' : key, value);
  }

  upstream.searchParams.set('limit', String(maxRows));
  upstream.searchParams.set('page_size', String(maxRows));
  upstream.searchParams.set('max', String(maxRows));

  if (!hasDate) {
    const to = new Date();
    const from = new Date(to);
    from.setUTCDate(to.getUTCDate() - DEFAULT_WINDOW_DAYS);
    const fromValue = isoDate(from);
    const toValue = isoDate(to);
    upstream.searchParams.set('from', fromValue);
    upstream.searchParams.set('to', toValue);
    upstream.searchParams.set('start', fromValue);
    upstream.searchParams.set('end', toValue);
    upstream.searchParams.set('date_from', fromValue);
    upstream.searchParams.set('date_to', toValue);
    hasDate = true;
  }

  return { defaultWindowApplied: !DATE_KEYS.some((key) => query.has(key)) && hasDate };
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

const incrementBucket = (map: Map<string, Record<string, number | string>>, keyName: string, key: string) => {
  const bucket = map.get(key) ?? { [keyName]: key, records: 0 };
  bucket.records = safeNumber(bucket.records) + 1;
  map.set(key, bucket);
  return bucket;
};

const aggregateRows = (rows: JsonRow[]) => {
  const numericKeys = new Set<string>();
  const textKeys = new Set<string>();
  const totals: Record<string, number> = { records: rows.length };
  const byDate = new Map<string, Record<string, number | string>>();
  const byVendor = new Map<string, Record<string, number | string>>();
  const byAgent = new Map<string, Record<string, number | string>>();
  const byStatus = new Map<string, Record<string, number | string>>();

  for (const row of rows) {
    const date = toDate(row.date ?? row.call_date ?? row.entry_date ?? row.modify_date) ?? 'Undated';
    const vendor = classifyVendor(row);
    const agent = String(row.agent ?? row.user ?? 'Unassigned');
    const status = statusFamily(row.status ?? row.call_result);
    const dateBucket = incrementBucket(byDate, 'date', date);
    const vendorBucket = incrementBucket(byVendor, 'vendor', vendor);
    const agentBucket = incrementBucket(byAgent, 'agent', agent);
    const statusBucket = incrementBucket(byStatus, 'status', status);

    for (const [field, value] of Object.entries(row)) {
      if (PII_FIELDS.has(field)) continue;
      if (numericLike(value)) {
        const amount = safeNumber(value);
        numericKeys.add(field);
        totals[field] = (totals[field] ?? 0) + amount;
        dateBucket[field] = safeNumber(dateBucket[field]) + amount;
        vendorBucket[field] = safeNumber(vendorBucket[field]) + amount;
        agentBucket[field] = safeNumber(agentBucket[field]) + amount;
        statusBucket[field] = safeNumber(statusBucket[field]) + amount;
      } else {
        textKeys.add(field);
      }
    }
  }

  const derived = {
    spend: totals.Amount_Spent ?? 0,
    fetchedLeads: totals.Fetched_Leads ?? 0,
    acceptedLeads: totals.Accepted_Leads ?? totals.Total_Leads_Delivered_OnTact ?? 0,
    qualifiedLeads: totals.Qualified_Leads ?? 0,
    sales: (totals.MTN_Sales ?? 0) + (totals.Total_Leads_Sold_A ?? 0) + (totals.Total_Leads_Sold_B ?? 0) + (totals.Total_Leads_Sold_C ?? 0) + (totals.Total_Leads_Sold_D ?? 0),
    activations: totals.MTN_Activated_Sales ?? 0,
    calls: rows.filter((r) => r.call_date || r.uniqueid).length,
    talkSeconds: totals.length_in_sec ?? 0,
    answerRate: totals.MTN_Dialed_Leads ? (totals.MTN_Answered_Calls ?? 0) / totals.MTN_Dialed_Leads : 0,
    acceptedRate: totals.Fetched_Leads ? (totals.Accepted_Leads ?? 0) / totals.Fetched_Leads : 0,
    cpl: totals.Form_Completion ? (totals.Amount_Spent ?? 0) / totals.Form_Completion : 0,
    cpaAccepted: totals.Accepted_Leads ? (totals.Amount_Spent ?? 0) / totals.Accepted_Leads : 0
  };

  return {
    fields: { numeric: [...numericKeys].sort(), text: [...textKeys].sort() },
    totals,
    derived,
    byDate: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    byVendor: [...byVendor.values()].sort((a, b) => safeNumber(b.records) - safeNumber(a.records)),
    byAgent: [...byAgent.values()].sort((a, b) => safeNumber(b.records) - safeNumber(a.records)).slice(0, 50),
    byStatus: [...byStatus.values()].sort((a, b) => safeNumber(b.records) - safeNumber(a.records)),
    sample: rows.slice(0, 25).map((row) => {
      const copy = { ...row };
      for (const field of PII_FIELDS) delete copy[field];
      return copy;
    })
  };
};

const fetchSource = async (source: SourceName, env: Env, query: URLSearchParams) => {
  const config = SOURCE_CONFIG[source];
  const base = env[config.url];
  const username = env[config.username];
  const password = env[config.password];
  if (!base || !username || !password) {
    return { source, ok: false, configured: false, error: `Missing ${source} Cloudflare environment variables.` };
  }

  const maxRows = getMaxRows(query);
  const upstream = new URL(base);
  const safety = applySafeQueryDefaults(upstream, query, maxRows);
  const auth = btoa(`${username}:${password}`);
  const startedAt = new Date().toISOString();

  try {
    const response = await fetch(upstream.toString(), {
      headers: { accept: 'application/json', authorization: `Basic ${auth}` }
    });
    const text = await response.text();
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return { source, ok: false, configured: true, status: response.status, error: 'Upstream did not return JSON.', preview: text.slice(0, 250) };
    }

    const rawRows = extractRows(payload);
    const objects = rawRows
      .slice(0, maxRows)
      .filter((row): row is JsonRow => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
    const upstreamCount = payload && typeof payload === 'object' && 'count' in payload ? Number((payload as { count?: unknown }).count) : rawRows.length;

    return {
      source,
      ok: response.ok,
      configured: true,
      status: response.status,
      startedAt,
      completedAt: new Date().toISOString(),
      upstreamCount: Number.isFinite(upstreamCount) ? upstreamCount : rawRows.length,
      rows: objects.length,
      truncated: rawRows.length > objects.length,
      maxRows,
      defaultWindowApplied: safety.defaultWindowApplied,
      analytics: aggregateRows(objects)
    };
  } catch (error) {
    return { source, ok: false, configured: true, error: error instanceof Error ? error.message : String(error) };
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const sourceParam = url.searchParams.get('source');

  if (sourceParam === 'all') {
    return json({
      ok: false,
      mode: 'resource-safe-live-api-sync-no-database',
      generatedAt: new Date().toISOString(),
      results: [{ source: 'all', ok: false, configured: true, error: 'Combined live sync is disabled in Pages Function mode to avoid Cloudflare 1102 CPU limits. Request source=onvest or source=ontact separately.' }]
    }, { status: 400 });
  }

  const source: SourceName = sourceParam === 'ontact' ? 'ontact' : 'onvest';
  const result = await fetchSource(source, env, url.searchParams);
  return json({ ok: result.ok, mode: 'resource-safe-live-api-sync-no-database', generatedAt: new Date().toISOString(), results: [result] });
};
