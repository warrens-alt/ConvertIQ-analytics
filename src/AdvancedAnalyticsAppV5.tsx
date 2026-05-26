import { useEffect, useState } from 'react';
import AdvancedAnalyticsAppV4 from './AdvancedAnalyticsAppV4';
import ProductPropensityPanel from './components/ProductPropensityPanel';

type AnalyticsPayload = {
  results?: Array<{
    source?: string;
    ok?: boolean;
    analytics?: {
      records?: Record<string, unknown>[];
    };
  }>;
};

export default function AdvancedAnalyticsAppV5() {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState('Loading product propensity layer...');

  useEffect(() => {
    let cancelled = false;

    async function loadOntactTelemetry() {
      try {
        const response = await fetch('/api/analytics?source=ontact', { cache: 'no-store' });
        const payload = (await response.json()) as AnalyticsPayload;
        const ontact = payload.results?.find((result) => result.source === 'ontact') ?? payload.results?.[0];
        const nextRecords = ontact?.analytics?.records ?? [];

        if (!cancelled) {
          setRecords(nextRecords);
          setStatus(nextRecords.length ? 'Live OnTact product/comment records loaded for Feature 5.' : 'No OnTact preview records returned yet.');
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Could not load OnTact product records.');
        }
      }
    }

    void loadOntactTelemetry();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <AdvancedAnalyticsAppV4 />
      <section className="workspace" style={{ paddingTop: 0 }}>
        <section className="card panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Feature 5 · Product Propensity</p>
              <h2>Product, Device and Package Conversion Intelligence</h2>
              <p>{status}</p>
            </div>
          </div>
          <ProductPropensityPanel records={records} limit={60} />
        </section>
      </section>
    </>
  );
}
