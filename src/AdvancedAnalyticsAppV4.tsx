import { useEffect, useState } from 'react';
import AdvancedAnalyticsAppV3 from './AdvancedAnalyticsAppV3';
import FunnelLeakagePanel from './components/FunnelLeakagePanel';

type AnalyticsPayload = {
  results?: Array<{
    source?: string;
    ok?: boolean;
    analytics?: {
      records?: Record<string, unknown>[];
    };
  }>;
};

export default function AdvancedAnalyticsAppV4() {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState('Loading funnel leakage layer...');

  useEffect(() => {
    let cancelled = false;

    async function loadOnvestPipeline() {
      try {
        const response = await fetch('/api/analytics?source=onvest', { cache: 'no-store' });
        const payload = (await response.json()) as AnalyticsPayload;
        const onvest = payload.results?.find((result) => result.source === 'onvest') ?? payload.results?.[0];
        const nextRecords = onvest?.analytics?.records ?? [];

        if (!cancelled) {
          setRecords(nextRecords);
          setStatus(nextRecords.length ? 'Live Onvest pipeline records loaded for Feature 4.' : 'No Onvest preview records returned yet.');
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Could not load Onvest pipeline records.');
        }
      }
    }

    void loadOnvestPipeline();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <AdvancedAnalyticsAppV3 />
      <section className="workspace" style={{ paddingTop: 0 }}>
        <section className="card panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Feature 4 · Funnel Leakage</p>
              <h2>15-Stage Journey Leakage and Sankey-Ready Node Links</h2>
              <p>{status}</p>
            </div>
          </div>
          <FunnelLeakagePanel records={records} limit={60} />
        </section>
      </section>
    </>
  );
}
