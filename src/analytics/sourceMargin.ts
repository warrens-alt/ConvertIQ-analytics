export type RawAnalyticsRow = Record<string, unknown>;

export type SourceMarginRow = {
  date: string;
  source: string;
  adSpend: number;
  fetchedLeads: number;
  acceptedLeads: number;
  formCompletions: number;
  impressions: number;
  clicks: number;
  landingPageViews: number;
  mondoSoldA: number;
  mondoSoldB: number;
  mondoSoldC: number;
  mondoSoldD: number;
  mtnActivatedSales: number;
  mondoRevenue: number;
  blcRevenue: number;
  mtnRevenue: number;
  totalRevenue: number;
  grossProfit: number;
  grossMargin: number;
  roas: number;
  cplForm: number;
  cpaAccepted: number;
  ctr: number;
  leadToAcceptedRate: number;
  profitBand: 'High Margin' | 'Healthy' | 'Low Margin' | 'Loss Making' | 'No Revenue';
};

const RATE_CARD = {
  mondoA: 75,
  mondoB: 17,
  mondoC: 10,
  mondoD: 10,
  mtnActivation: 200,
  blc: {
    Charcoal: 550,
    Orange: 700,
    Blue: 900,
    Green: 1100,
    Purple: 1500
  }
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

const normalizeDate = (value: unknown): string => {
  const parsed = value ? new Date(String(value)) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return 'Unassigned';
  return parsed.toISOString().slice(0, 10);
};

const sourceKey = (row: RawAnalyticsRow): string => String(row.offershop_source ?? row.source ?? row.campaign_id ?? row.__source ?? 'Unclassified');

const profitBand = (margin: number, revenue: number): SourceMarginRow['profitBand'] => {
  if (!revenue) return 'No Revenue';
  if (margin >= 0.35) return 'High Margin';
  if (margin >= 0.15) return 'Healthy';
  if (margin >= 0) return 'Low Margin';
  return 'Loss Making';
};

type MutableMarginRow = Omit<SourceMarginRow, 'mondoRevenue' | 'mtnRevenue' | 'totalRevenue' | 'grossProfit' | 'grossMargin' | 'roas' | 'cplForm' | 'cpaAccepted' | 'ctr' | 'leadToAcceptedRate' | 'profitBand'> & { blcRevenue: number };

const emptyRow = (date: string, source: string): MutableMarginRow => ({
  date,
  source,
  adSpend: 0,
  fetchedLeads: 0,
  acceptedLeads: 0,
  formCompletions: 0,
  impressions: 0,
  clicks: 0,
  landingPageViews: 0,
  mondoSoldA: 0,
  mondoSoldB: 0,
  mondoSoldC: 0,
  mondoSoldD: 0,
  mtnActivatedSales: 0,
  blcRevenue: 0
});

export function buildSourceMarginRows(records: RawAnalyticsRow[]): SourceMarginRow[] {
  const grouped = new Map<string, MutableMarginRow>();

  records
    .filter((row) => row.__source === 'onvest' || row.offershop_source || row.Amount_Spent || row.Fetched_Leads)
    .forEach((row) => {
      const date = normalizeDate(row.date ?? row.call_date ?? row.entry_date);
      const source = sourceKey(row);
      const key = `${date}||${source}`;
      const current = grouped.get(key) ?? emptyRow(date, source);

      current.adSpend += n(row.Amount_Spent);
      current.fetchedLeads += n(row.Fetched_Leads);
      current.acceptedLeads += n(row.Accepted_Leads);
      current.formCompletions += n(row.Form_Completion);
      current.impressions += n(row.Impressions);
      current.clicks += n(row.Clicks);
      current.landingPageViews += n(row.Landing_Page_View);
      current.mondoSoldA += n(row.Total_Leads_Sold_A);
      current.mondoSoldB += n(row.Total_Leads_Sold_B);
      current.mondoSoldC += n(row.Total_Leads_Sold_C);
      current.mondoSoldD += n(row.Total_Leads_Sold_D);
      current.mtnActivatedSales += n(row.MTN_Activated_Sales);

      grouped.set(key, current);
    });

  return [...grouped.values()]
    .map((row) => {
      const mondoRevenue = row.mondoSoldA * RATE_CARD.mondoA + row.mondoSoldB * RATE_CARD.mondoB + row.mondoSoldC * RATE_CARD.mondoC + row.mondoSoldD * RATE_CARD.mondoD;
      const mtnRevenue = row.mtnActivatedSales * RATE_CARD.mtnActivation;
      const totalRevenue = mondoRevenue + mtnRevenue + row.blcRevenue;
      const grossProfit = totalRevenue - row.adSpend;
      const grossMargin = ratio(grossProfit, totalRevenue);
      const roas = ratio(totalRevenue, row.adSpend);

      return {
        ...row,
        mondoRevenue,
        mtnRevenue,
        totalRevenue,
        grossProfit,
        grossMargin,
        roas,
        cplForm: ratio(row.adSpend, row.formCompletions),
        cpaAccepted: ratio(row.adSpend, row.acceptedLeads),
        ctr: ratio(row.clicks, row.impressions),
        leadToAcceptedRate: ratio(row.acceptedLeads, row.fetchedLeads),
        profitBand: profitBand(grossMargin, totalRevenue)
      } satisfies SourceMarginRow;
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);
}

export function summarizeSourceMargins(rows: SourceMarginRow[]) {
  const totalRevenue = rows.reduce((sum, row) => sum + row.totalRevenue, 0);
  const adSpend = rows.reduce((sum, row) => sum + row.adSpend, 0);
  const grossProfit = rows.reduce((sum, row) => sum + row.grossProfit, 0);
  const positiveSources = rows.filter((row) => row.grossProfit > 0).length;
  const lossMakingSources = rows.filter((row) => row.grossProfit < 0).length;
  const bestSource = rows[0]?.source ?? 'No source';
  const worstSource = [...rows].sort((a, b) => a.grossProfit - b.grossProfit)[0]?.source ?? 'No source';

  return {
    totalRevenue,
    adSpend,
    grossProfit,
    grossMargin: ratio(grossProfit, totalRevenue),
    roas: ratio(totalRevenue, adSpend),
    positiveSources,
    lossMakingSources,
    bestSource,
    worstSource
  };
}
