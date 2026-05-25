import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'public/data/attached-snapshot.json');

const INPUTS = {
  onvest: '/Users/warrenstear/Downloads/Pasted text.txt',
  ontact: '/Users/warrenstear/Downloads/Pasted text (2).txt',
  powerbiLogs: [
    '/Users/warrenstear/Downloads/Pasted text (3).txt',
    '/Users/warrenstear/Downloads/Pasted text (4).txt',
    '/Users/warrenstear/Downloads/Pasted text (5).txt'
  ]
};

const PII_FIELDS = new Set([
  'phone_number',
  'alt_phone',
  'email',
  'vendor_lead_code',
  'first_name',
  'last_name',
  'middle_initial',
  'address1',
  'address2',
  'address3',
  'postal_code',
  'date_of_birth',
  'security_phrase'
]);

const safeNumber = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const numericLike = (value) =>
  typeof value === 'number' || (typeof value === 'string' && value.trim() !== '' && /^-?[\d,.]+$/.test(value.trim()));

const toDate = (value) => {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const getValueType = (value) => {
  if (value === null || value === undefined || value === '') return 'empty';
  if (numericLike(value)) return 'number';
  if (toDate(value)) return 'date';
  return typeof value;
};

const classifyVendor = (row) => {
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

const statusFamily = (status) => {
  const value = String(status ?? '').toUpperCase();
  if (!value) return 'Unknown';
  if (['SALE', 'SOLD', 'ACTIVATED', 'DELIVERED'].some((x) => value.includes(x))) return 'Sale / Delivered';
  if (['A', 'B', 'C', 'D'].includes(value)) return 'Mondo Grade';
  if (['N', 'NA', 'ADC', 'DROP', 'BUSY', 'AB', 'ALTNUM'].includes(value)) return 'No Sale / No Contact';
  if (['DONEM', 'CALLBK', 'CBHOLD', 'CALLBACK'].some((x) => value.includes(x))) return 'Callback';
  return value;
};

const fieldGroup = (field, source) => {
  if (PII_FIELDS.has(field)) return 'PII / redacted';
  if (source === 'powerbi') {
    if (['query', 'dataset_id', 'report_id', 'model_id', 'visual_id', 'endpoint', 'source_file'].includes(field)) return 'Power BI query context';
    if (['selected_field', 'native_label', 'entity', 'company_filter', 'query_signature'].includes(field)) return 'Power BI query parameters';
    if (['date_filter_field', 'date_from', 'date_to'].includes(field)) return 'Power BI date filters';
    if (['aggregation_function', 'data_volume', 'window_count', 'select_count'].includes(field)) return 'Power BI visual metrics';
    return 'Power BI data model';
  }
  if (['date', 'call_date', 'entry_date', 'modify_date', 'last_local_call_time'].includes(field)) return 'Date / time';
  if (source === 'ontact') {
    if (['uniqueid', 'lead_id', 'list_id', 'campaign_id', 'source_id', 'entry_list_id'].includes(field)) return 'Ontact identifiers';
    if (['status', 'call_result', 'term_reason', 'alt_dial', 'processed', 'user_group'].includes(field)) return 'Call outcome';
    if (['user', 'agent', 'owner'].includes(field)) return 'Agent / ownership';
    if (['start_epoch', 'end_epoch', 'length_in_sec', 'called_count', 'rank', 'gmt_offset_now', 'called_since_last_reset'].includes(field)) return 'Call activity metrics';
    return 'Lead record attributes';
  }
  if (field === 'offershop_source') return 'Source / channel';
  if (['Amount_Spent', 'Impressions', 'Reach', 'Ad_Recall', 'Engagement', 'Video_Views', 'Page_Like', 'Clicks', 'Outbound_Clicks', 'Conversation_Started', 'Landing_Page_View', 'Add_to_cart', 'Initiate_Checkout', 'Form_Completion'].includes(field)) return 'Media performance';
  if (field.startsWith('Standardised_') || field.startsWith('Valid_') || field === 'Total_Leads_WithValid_Phone_ID') return 'Standardisation / validation';
  if (field.includes('_BLC') || field.includes('OnTact')) return 'BLC / OnTact delivery';
  if (field.includes('_MTN') || field.startsWith('MTN_') || ['Total_Leads_Device', 'Total_Leads_FWA', 'Total_Leads_SimOnly'].includes(field)) return 'MTN flow';
  if (field.includes('_Mondo') || field.includes('_AllProviders') || field.includes('_DailyDuplicate') || ['Total_Mondo_Grade_Passed_Lead', 'Total_Leads_A', 'Total_Leads_B', 'Total_Leads_U'].includes(field)) return 'Mondo flow';
  if (field.startsWith('Naga_')) return 'Naga flow';
  if (field.startsWith('DebtResc')) return 'Debt Rescue flow';
  if (field.includes('Sold') || field.includes('Sales') || field.includes('Activated') || field.includes('Qualified') || field.includes('Accepted')) return 'Conversion / sales';
  return 'Lead funnel';
};

const fieldRole = (field, source) => {
  if (PII_FIELDS.has(field)) return 'redacted identifier';
  if (field === 'date' || field.includes('_date') || field.endsWith('_time')) return 'date/time';
  if (source === 'powerbi') {
    if (['aggregation_function', 'window_count', 'data_volume', 'select_count'].includes(field)) return 'query metric';
    if (['query', 'dataset_id', 'report_id', 'model_id', 'visual_id', 'endpoint', 'source_file'].includes(field)) return 'metadata';
    return 'dimension';
  }
  if (source === 'ontact' && ['uniqueid', 'lead_id', 'list_id', 'campaign_id', 'source_id', 'entry_list_id'].includes(field)) return 'identifier';
  if (['offershop_source', 'campaign_id', 'status', 'call_result', 'agent', 'user', 'owner'].includes(field)) return 'dimension';
  return 'metric';
};

const incrementBucket = (map, keyName, key) => {
  const bucket = map.get(key) ?? { [keyName]: key, records: 0 };
  bucket.records = safeNumber(bucket.records) + 1;
  map.set(key, bucket);
  return bucket;
};

const buildFieldCatalog = (rows, source) => {
  const order = [];
  const profiles = new Map();
  const ensure = (field) => {
    let profile = profiles.get(field);
    if (!profile) {
      order.push(field);
      profile = {
        field,
        group: fieldGroup(field, source),
        role: fieldRole(field, source),
        type: 'empty',
        numeric: false,
        pii: PII_FIELDS.has(field),
        nonNull: 0,
        sampleValues: []
      };
      profiles.set(field, profile);
    }
    return profile;
  };

  for (const row of rows) {
    for (const [field, value] of Object.entries(row)) {
      const profile = ensure(field);
      const type = getValueType(value);
      if (type === 'empty') continue;
      profile.nonNull += 1;
      if (profile.type === 'empty') profile.type = type;
      if (type === 'number' && !profile.pii) {
        profile.numeric = true;
        profile.total = (profile.total ?? 0) + safeNumber(value);
      }
      const sample = profile.pii ? '[redacted]' : String(value).slice(0, 120);
      if (sample && !profile.sampleValues.includes(sample) && profile.sampleValues.length < 3) profile.sampleValues.push(sample);
    }
  }

  return order.map((field) => profiles.get(field));
};

const sanitizeRecords = (rows, fields, limit) =>
  rows.slice(0, limit).map((row) => {
    const record = {};
    for (const field of fields) record[field] = PII_FIELDS.has(field) ? '[redacted]' : row[field] ?? '';
    return record;
  });

const aggregateRows = (rows, source, recordLimit = 1000) => {
  const fieldCatalog = buildFieldCatalog(rows, source);
  const columns = fieldCatalog.map((field) => field.field);
  const numericKeys = new Set();
  const textKeys = new Set();
  const totals = { records: rows.length, __call_records: 0 };
  const byDate = new Map();
  const byVendor = new Map();
  const byAgent = new Map();
  const byStatus = new Map();

  for (const row of rows) {
    const date = toDate(row.date ?? row.call_date ?? row.entry_date ?? row.modify_date ?? row.activation ?? row.capture_complete ?? row.nett_app ?? row.date_created) ?? 'Undated';
    const vendor = classifyVendor(row);
    const agent = String(row.agent ?? row.user ?? row.full_name ?? 'Unassigned');
    const status = statusFamily(row.status ?? row.call_result ?? row.query);
    const dateBucket = incrementBucket(byDate, 'date', date);
    const vendorBucket = incrementBucket(byVendor, 'vendor', vendor);
    const agentBucket = incrementBucket(byAgent, 'agent', agent);
    const statusBucket = incrementBucket(byStatus, 'status', status);
    if (row.call_date || row.uniqueid) totals.__call_records += 1;

    for (const [field, value] of Object.entries(row)) {
      if (PII_FIELDS.has(field)) {
        textKeys.add(field);
        continue;
      }
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

  return {
    fields: { numeric: [...numericKeys].sort(), text: [...textKeys].sort() },
    fieldCatalog,
    columns,
    totals,
    derived: {},
    byDate: [...byDate.values()].sort((a, b) => String(a.date).localeCompare(String(b.date))),
    byVendor: [...byVendor.values()].sort((a, b) => safeNumber(b.records) - safeNumber(a.records)),
    byAgent: [...byAgent.values()].sort((a, b) => safeNumber(b.records) - safeNumber(a.records)).slice(0, 50),
    byStatus: [...byStatus.values()].sort((a, b) => safeNumber(b.records) - safeNumber(a.records)),
    records: sanitizeRecords(rows, columns, recordLimit),
    recordsReturned: Math.min(rows.length, recordLimit),
    recordLimit
  };
};

const recoverJsonObjectsFromDataArray = (text) => {
  const dataStart = text.indexOf('"data"');
  const arrStart = text.indexOf('[', dataStart);
  const objects = [];
  let depth = 0;
  let start = -1;
  for (let i = arrStart + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth += 1;
    }
    if (ch === '}') {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        objects.push(JSON.parse(text.slice(start, i + 1)));
        start = -1;
      }
    }
  }
  return objects;
};

const readShellString = (text, start) => {
  let index = start;
  let isAnsi = false;
  if (text[index] === '$' && text[index + 1] === "'") {
    isAnsi = true;
    index += 2;
  } else if (text[index] === "'") {
    index += 1;
  } else {
    return null;
  }

  let value = '';
  let escaped = false;
  for (; index < text.length; index += 1) {
    const ch = text[index];
    if (escaped) {
      value += isAnsi && ch === 'n' ? '\n' : isAnsi && ch === 't' ? '\t' : ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === "'") return { value, end: index + 1 };
    value += ch;
  }
  return null;
};

const collect = (node, predicate, out = []) => {
  if (!node || typeof node !== 'object') return out;
  if (predicate(node)) out.push(node);
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') collect(value, predicate, out);
  }
  return out;
};

const extractPowerBiBodies = (file) => {
  const text = fs.readFileSync(file, 'utf8');
  const bodies = [];
  let pos = 0;
  while ((pos = text.indexOf('--data-raw', pos)) >= 0) {
    let stringStart = pos + '--data-raw'.length;
    while (/\s/.test(text[stringStart])) stringStart += 1;
    const parsed = readShellString(text, stringStart);
    if (parsed && parsed.value.trim().startsWith('{')) {
      try {
        bodies.push(JSON.parse(parsed.value));
      } catch {
        // Ignore telemetry or incomplete bodies that are not Power BI querydata JSON.
      }
    }
    pos = stringStart + 1;
  }
  return bodies;
};

const functionName = (fn) => {
  if (fn === 3) return 'min';
  if (fn === 4) return 'max';
  if (fn === 5) return 'count_non_null';
  return 'dimension';
};

const dateLiteral = (value) => String(value ?? '').match(/datetime'([^']+)'/)?.[1]?.slice(0, 10) ?? '';

const buildPowerBiCatalog = () => {
  const rows = [];
  const seen = new Set();
  for (const sourceFile of INPUTS.powerbiLogs) {
    const bodies = extractPowerBiBodies(sourceFile);
    bodies.forEach((body, bodyIndex) => {
      const command = body.queries?.[0]?.Query?.Commands?.[0]?.SemanticQueryDataShapeCommand;
      const query = command?.Query;
      const app = body.queries?.[0]?.ApplicationContext;
      if (!query || !app) return;

      const selects = query.Select ?? [];
      const comparisons = collect(query.Where, (node) => node.Comparison?.Left?.Column?.Property);
      const dateComparison = comparisons.find((node) => ['activation', 'capture_complete', 'nett_app', 'date_created'].includes(node.Comparison.Left.Column.Property));
      const contains = collect(query.Where, (node) => node.Contains?.Left?.Column?.Property === 'company_name')[0];
      const windows = collect(command.Binding?.DataReduction, (node) => node.Window?.Count);
      const visualId = app.Sources?.[0]?.VisualId ?? '';
      const datasetId = app.DatasetId ?? '';
      const reportId = app.Sources?.[0]?.ReportId ?? '';
      const modelId = body.modelId ?? '';
      const dateField = dateComparison?.Comparison?.Left?.Column?.Property ?? '';
      const dateValues = comparisons
        .filter((node) => node.Comparison?.Left?.Column?.Property === dateField)
        .map((node) => dateLiteral(node.Comparison?.Right?.Literal?.Value))
        .filter(Boolean);

      selects.forEach((select, selectIndex) => {
        const selectedField = select.Column?.Property ?? select.Aggregation?.Expression?.Column?.Property ?? '';
        const aggregation = functionName(select.Aggregation?.Function);
        const nativeLabel = select.NativeReferenceName ?? selectedField;
        const signature = [visualId, selectedField, aggregation, nativeLabel, dateField, windows[0]?.Window?.Count ?? ''].join('|');
        if (seen.has(signature)) return;
        seen.add(signature);
        rows.push({
          query: 'powerbi_query_catalog',
          endpoint: 'https://wabi-south-africa-north-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true',
          dataset_id: datasetId,
          report_id: reportId,
          model_id: modelId,
          visual_id: visualId,
          source_file: path.basename(sourceFile),
          query_index: bodyIndex + 1,
          select_index: selectIndex + 1,
          entity: query.From?.[0]?.Entity ?? '',
          selected_field: selectedField,
          native_label: nativeLabel,
          aggregation_function: aggregation,
          date_filter_field: dateField,
          date_from: dateValues[0] ?? '',
          date_to: dateValues[1] ?? '',
          company_filter: contains?.Contains?.Right?.Literal?.Value?.replaceAll("'", '') ?? '',
          data_volume: command.Binding?.DataReduction?.DataVolume ?? '',
          window_count: windows[0]?.Window?.Count ?? '',
          select_count: selects.length,
          query_signature: signature
        });
      });
    });
  }
  return rows;
};

const onvestPayload = JSON.parse(fs.readFileSync(INPUTS.onvest, 'utf8'));
const onvestRows = onvestPayload.data.filter((row) => row && typeof row === 'object');
const ontactText = fs.readFileSync(INPUTS.ontact, 'utf8');
const ontactRows = recoverJsonObjectsFromDataArray(ontactText);
const ontactUpstreamCount = Number(ontactText.match(/"count"\s*:\s*(\d+)/)?.[1] ?? 0);
const powerbiRows = buildPowerBiCatalog();

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(
  OUT,
  `${JSON.stringify({
    ok: true,
    mode: 'attached-sanitized-snapshot',
    generatedAt: new Date().toISOString(),
    results: [
      {
        source: 'onvest',
        ok: true,
        configured: true,
        type: 'attached-json-snapshot',
        rows: onvestRows.length,
        upstreamCount: onvestPayload.count ?? onvestRows.length,
        recordLimit: 1000,
        analytics: aggregateRows(onvestRows, 'onvest', 1000)
      },
      {
        source: 'ontact',
        ok: true,
        configured: true,
        type: 'attached-partial-json-snapshot',
        rows: ontactRows.length,
        upstreamCount: ontactUpstreamCount || ontactRows.length,
        truncated: ontactUpstreamCount > ontactRows.length,
        recordLimit: 1000,
        analytics: aggregateRows(ontactRows, 'ontact', 1000)
      },
      {
        source: 'powerbi',
        ok: true,
        configured: true,
        type: 'attached-querydata-catalog',
        rows: powerbiRows.length,
        upstreamCount: powerbiRows.length,
        recordLimit: 1000,
        reportTitle: 'Rubix Reports Power BI Production Data',
        queryDataEndpoint: 'https://wabi-south-africa-north-a-primary-api.analysis.windows.net/public/reports/querydata?synchronous=true',
        analytics: aggregateRows(powerbiRows, 'powerbi', 1000)
      }
    ]
  }, null, 2)}\n`
);

console.log(`Wrote ${path.relative(ROOT, OUT)}`);
console.log(`Onvest rows: ${onvestRows.length}`);
console.log(`Ontact recovered rows: ${ontactRows.length} of ${ontactUpstreamCount || 'unknown'} attached upstream count`);
console.log(`Power BI query catalog rows: ${powerbiRows.length}`);
