import { useEffect, useState } from 'react';
import AdvancedAnalyticsAppV2 from './AdvancedAnalyticsAppV2';
import CallCenterEfficiencyPanel from './components/CallCenterEfficiencyPanel';

type AnalyticsPayload = {
  results?: Array<{
    source?: string;
    ok?: boolean;
    analytics?: {
      records?: Record<string, unknown>[];
    };
  }>;
};

export default function AdvancedAnalyticsAppV3() {
  const [records, setRecords] = useState<Record<string, unknown>[]>([]);
  const [status, setStatus] = useState('Loading call-centre efficiency layer...');

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
          setStatus(nextRecords.length ? 'Live OnTact telemetry loaded for Feature 3.' : 'No OnTact preview records returned yet.');
        }
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Could not load OnTact telemetry.');
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
      <AdvancedAnalyticsAppV2 />
      <section className="workspace" style={{ paddingTop: 0 }}>
        <section className="card panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Feature 3 · Call Center Efficiency</p>
              <h2>Time-to-Sale and Agent Efficiency Layer</h2>
              <p>{status}</p>
            </div>
          </div>
          <CallCenterEfficiencyPanel records={records} limit={60} />
        </section>
      </section>
    </>
  );
}
