export const RATE_CARD = {
  mondo: {
    Total_Leads_Sold_A: { brand: 'Mondo', segment: 'Class_A', rate: 75 },
    Total_Leads_Sold_B: { brand: 'Mondo', segment: 'Class_B', rate: 17 },
    Total_Leads_Sold_C: { brand: 'Mondo', segment: 'Class_C', rate: 10 },
    Total_Leads_Sold_D: { brand: 'Mondo', segment: 'Class_D', rate: 10 }
  },
  blc: {
    Charcoal: { brand: 'BLC', billableEvent: 'Activation', rate: 550 },
    Orange: { brand: 'BLC', billableEvent: 'Activation', rate: 700 },
    Blue: { brand: 'BLC', billableEvent: 'Activation', rate: 900 },
    Green: { brand: 'BLC', billableEvent: 'Activation', rate: 1100 },
    Purple: { brand: 'BLC', billableEvent: 'Activation', rate: 1500 }
  },
  mtn: {
    MTN_Activated_Sales: { brand: 'MTN', segment: 'Activation', rate: 200 }
  }
} as const;

export type BlcSegment = keyof typeof RATE_CARD.blc;

const amount = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') return Number(value.replace(/[^0-9.-]/g, '')) || 0;
  return 0;
};

export const normaliseBlcSegment = (value: unknown): BlcSegment | '' => {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('charcoal')) return 'Charcoal';
  if (text.includes('orange')) return 'Orange';
  if (text.includes('blue')) return 'Blue';
  if (text.includes('green')) return 'Green';
  if (text.includes('purple')) return 'Purple';
  return '';
};

export const getPowerBiBlcSegments = (records: Record<string, unknown>[]) => {
  const segments: Partial<Record<BlcSegment, number>> = {};
  records
    .filter((record) => record.__source === 'powerbi' && record.query === 'segment_activations')
    .forEach((record) => {
      const segment = normaliseBlcSegment(record.segment);
      if (!segment) return;
      segments[segment] = (segments[segment] ?? 0) + amount(record.count_activation);
    });
  return segments;
};

export const calculateMondoRevenue = (totals: Record<string, unknown>) => {
  return Object.entries(RATE_CARD.mondo).reduce((sum, [field, config]) => {
    return sum + amount(totals[field]) * config.rate;
  }, 0);
};

export const calculateMtnRevenue = (totals: Record<string, unknown>) => {
  return amount(totals.MTN_Activated_Sales) * RATE_CARD.mtn.MTN_Activated_Sales.rate;
};

export const calculateBlcRevenue = (segments: Partial<Record<BlcSegment, number>>) => {
  return Object.entries(RATE_CARD.blc).reduce((sum, [segment, config]) => {
    return sum + amount(segments[segment as BlcSegment]) * config.rate;
  }, 0);
};

export const buildCommercialRateCardRows = (totals: Record<string, unknown>, segments: Partial<Record<BlcSegment, number>>, acceptedFee: number) => {
  return [
    {
      brand: 'TP1',
      billableEvent: 'Accepted_Leads',
      segment: 'Accepted',
      volume: amount(totals.Accepted_Leads),
      rate: acceptedFee,
      revenue: amount(totals.Accepted_Leads) * acceptedFee
    },
    ...Object.entries(RATE_CARD.mondo).map(([field, config]) => ({
      brand: config.brand,
      billableEvent: field,
      segment: config.segment,
      volume: amount(totals[field]),
      rate: config.rate,
      revenue: amount(totals[field]) * config.rate
    })),
    {
      brand: RATE_CARD.mtn.MTN_Activated_Sales.brand,
      billableEvent: 'MTN_Activated_Sales',
      segment: RATE_CARD.mtn.MTN_Activated_Sales.segment,
      volume: amount(totals.MTN_Activated_Sales),
      rate: RATE_CARD.mtn.MTN_Activated_Sales.rate,
      revenue: amount(totals.MTN_Activated_Sales) * RATE_CARD.mtn.MTN_Activated_Sales.rate
    },
    ...Object.entries(RATE_CARD.blc).map(([segment, config]) => ({
      brand: config.brand,
      billableEvent: config.billableEvent,
      segment,
      volume: amount(segments[segment as BlcSegment]),
      rate: config.rate,
      revenue: amount(segments[segment as BlcSegment]) * config.rate
    }))
  ];
};

export const calculateCommercialRevenue = (totals: Record<string, unknown>, powerBiRecords: Record<string, unknown>[], acceptedFee: number) => {
  const segments = getPowerBiBlcSegments(powerBiRecords);
  const acceptedRevenue = amount(totals.Accepted_Leads) * acceptedFee;
  const mondoRevenue = calculateMondoRevenue(totals);
  const mtnRevenue = calculateMtnRevenue(totals);
  const blcRevenue = calculateBlcRevenue(segments);
  return {
    acceptedRevenue,
    mondoRevenue,
    mtnRevenue,
    blcRevenue,
    totalRevenue: acceptedRevenue + mondoRevenue + mtnRevenue + blcRevenue,
    segments,
    rows: buildCommercialRateCardRows(totals, segments, acceptedFee)
  };
};
