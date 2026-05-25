export interface Env {
  ONVEST_API_URL?: string;
  ONVEST_API_USERNAME?: string;
  ONVEST_API_PASSWORD?: string;
  ONTACT_API_URL?: string;
  ONTACT_API_USERNAME?: string;
  ONTACT_API_PASSWORD?: string;
}

type SourceName = 'onvest' | 'ontact';

const SOURCE_CONFIG: Record<SourceName, { url: keyof Env; username: keyof Env; password: keyof Env }> = {
  onvest: { url: 'ONVEST_API_URL', username: 'ONVEST_API_USERNAME', password: 'ONVEST_API_PASSWORD' },
  ontact: { url: 'ONTACT_API_URL', username: 'ONTACT_API_USERNAME', password: 'ONTACT_API_PASSWORD' }
};

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

const toDate = (value: unknown): string | null => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const classifyVendor = (row: Record<string, unknown>): string => {
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

const aggregateRows = (rows: Record<string, unknown>[]) => {
  const numericKeys = new Set<string>();
  const textKeys = new Set<string>();
  const byDate = new Map<string, Record<string, number | string>>();
  const byVendor = new Map<string, Record<string, number | string>>();
  const byAgent = new Map<string, Record<string, number | string>>();
  const byStatus = new Map<string, Record<string, number | string>>();

  const add = (map: Map<string, Record<string, number | string>>, key: string, row: Record<string, unknown>, dimensions: Record<string, string>) => {
    const bucket = map.get(key) ?? { ...dimensions, records: 0 };
    bucket.records = safeNumber(bucket.records) + 1;
    for (const [field, value] of Object.entries(row)) {
      if (field === 'phone_number' || field === 'email' || field === 'vendor_lead_code' || field === 'first_name' || field === 'last_name') continue;
      const n = safeNumber(value);
      const numericLike = typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && /^-?[\d,.]+$/.test(value.trim()));
      if (numericLike) {
        numericKeys.add(field);
        bucket[field] = safeNumber(bucket[field]) + n;
      } else {
        textKeys.add(field);
      }
    }
    map.set(key, bucket);
  };

  for (const row of rows) {
    const date = toDate(row.date ?? row.call_date ?? row.entry_date ?? row.modify_date) ?? 'Undated';
    const vendor = classifyVendor(row);
    const agent = String(row.agent ?? row.user ?? 'Unassigned');
    const status = statusFamily(row.status ?? row.call_result);
    add(byDate, date, row, { date });
    add(byVendor, vendor, row, { vendor });
    add(byAgent, agent, row, { agent });
    add(byStatus, status, row, { status });
  }

  const totals: Record<string, number> = { records: rows.length };
  for (const key of numericKeys) totals[key] = rows.reduce((sum, row) => sum + safeNumber(row[key]), 0);

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
    acceptedRate: (totals.Fetched_Leads ?? 0) ? (totals.Accepted_Leads ?? 0) / totals.Fetched_Leads : 0,
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
    sample: rows.slice(0, 50).map((row) => {
      const copy = { ...row };
      delete copy.phone_number;
      delete copy.email;
      delete copy.vendor_lead_code;
      delete copy.first_name;
      delete copy.last_name;
      delete copy.alt_phone;
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

  const upstream = new URL(base);
  for (const [key, value] of query.entries()) {
    if (['from', 'to', 'start', 'end', 'date_from', 'date_to', 'limit'].includes(key)) upstream.searchParams.set(key, value);
  }

  const auth = btoa(`${username}:${password}`);
  const startedAt = new Date().toISOString();
  try {
    const response = await fetch(upstream.toString(), {
      headers: { accept: 'application/json', authorization: `Basic ${auth}` }
    });
    const text = await response.text();
    let payload: any;
    try {
      payload = JSON.parse(text);
    } catch {
      return { source, ok: false, configured: true, status: response.status, error: 'Upstream did not return JSON.', preview: text.slice(0, 250) };
    }
    const rows = Array.isArray(payload) ? payload : Array.isArray(payload.data) ? payload.data : Array.isArray(payload.rows) ? payload.rows : [];
    const objects = rows.filter((row: unknown): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row));
    return {
      source,
      ok: response.ok,
      configured: true,
      status: response.status,
      startedAt,
      completedAt: new Date().toISOString(),
      upstreamCount: payload.count ?? objects.length,
      rows: objects.length,
      analytics: aggregateRows(objects)
    };
  } catch (error) {
    return { source, ok: false, configured: true, error: error instanceof Error ? error.message : String(error) };
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const sourceParam = url.searchParams.get('source');
  const sources: SourceName[] = sourceParam === 'onvest' || sourceParam === 'ontact' ? [sourceParam] : ['onvest', 'ontact'];
  const results = await Promise.all(sources.map((source) => fetchSource(source, env, url.searchParams)));
  return json({ ok: results.every((result) => result.ok), mode: 'live-api-sync-no-database', generatedAt: new Date().toISOString(), results });
};
