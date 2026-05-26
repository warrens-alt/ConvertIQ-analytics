import type { ReactNode } from 'react';

export type FlowTone = 'good' | 'watch' | 'critical' | 'neutral';

export type FlowStage = {
  label: string;
  value: string;
  sub: string;
  owner: string;
  tone?: FlowTone;
};

export type BridgeRow = {
  label: string;
  value: string;
  note: string;
  tone?: FlowTone;
};

export type SignalItem = {
  label: string;
  value: string;
  note: string;
  tone?: FlowTone;
};

export type HealthSource = {
  label: string;
  status: string;
  rows: string;
  fields: string;
  tone?: FlowTone;
};

type BriefPoint = {
  label: string;
  value: string;
  note?: string;
};

export function ApiHealthStrip({ sources, lastSync }: { sources: HealthSource[]; lastSync: string }) {
  return (
    <section className="api-health-strip card">
      <div className="api-health-title">
        <span>Live API health</span>
        <strong>{lastSync}</strong>
      </div>
      <div className="api-health-sources">
        {sources.map((source) => (
          <article className={source.tone ?? 'neutral'} key={source.label}>
            <b>{source.label}</b>
            <span>{source.status}</span>
            <small>{source.rows} rows · {source.fields} fields</small>
          </article>
        ))}
      </div>
    </section>
  );
}

export function DecisionPanel({
  title,
  decision,
  reason,
  tone = 'neutral',
  children
}: {
  title: string;
  decision: string;
  reason: string;
  tone?: FlowTone;
  children?: ReactNode;
}) {
  return (
    <section className={`decision-panel card ${tone}`}>
      <div>
        <span>Recommended decision</span>
        <h2>{title}</h2>
        <strong>{decision}</strong>
        <p>{reason}</p>
      </div>
      {children && <div className="decision-panel-side">{children}</div>}
    </section>
  );
}

export function TabBrief({ eyebrow, title, summary, points }: { eyebrow: string; title: string; summary: string; points: BriefPoint[] }) {
  return (
    <section className="tab-brief card">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{summary}</p>
      </div>
      <div className="tab-brief-points">
        {points.map((point) => (
          <article key={point.label}>
            <small>{point.label}</small>
            <strong>{point.value}</strong>
            {point.note && <em>{point.note}</em>}
          </article>
        ))}
      </div>
    </section>
  );
}

export function MetricFlow({ title, sub, stages }: { title: string; sub: string; stages: FlowStage[] }) {
  return (
    <section className="card metric-flow">
      <div className="metric-flow-head">
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>
        <span>{stages.length} stages</span>
      </div>
      <div className="metric-flow-grid">
        {stages.map((stage, index) => (
          <article className={`flow-stage ${stage.tone ?? 'neutral'}`} key={`${stage.label}-${index}`}>
            <header>
              <small>{String(index + 1).padStart(2, '0')}</small>
              <span>{stage.owner}</span>
            </header>
            <h3>{stage.label}</h3>
            <strong>{stage.value}</strong>
            <p>{stage.sub}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CommercialBridge({ title, sub, rows }: { title: string; sub: string; rows: BridgeRow[] }) {
  return (
    <section className="card commercial-bridge">
      <div className="commercial-bridge-copy">
        <span>Commercial bridge</span>
        <h2>{title}</h2>
        <p>{sub}</p>
      </div>
      <div className="commercial-bridge-grid">
        {rows.map((row) => (
          <article className={row.tone ?? 'neutral'} key={row.label}>
            <small>{row.label}</small>
            <strong>{row.value}</strong>
            <em>{row.note}</em>
          </article>
        ))}
      </div>
    </section>
  );
}

export function SignalGrid({ title, sub, items, footer }: { title: string; sub: string; items: SignalItem[]; footer?: ReactNode }) {
  return (
    <section className="card signal-grid-panel">
      <div className="signal-grid-head">
        <div>
          <h2>{title}</h2>
          <p>{sub}</p>
        </div>
        {footer}
      </div>
      <div className="signal-grid">
        {items.map((item) => (
          <article className={`signal-card ${item.tone ?? 'neutral'}`} key={item.label}>
            <small>{item.label}</small>
            <strong>{item.value}</strong>
            <span>{item.note}</span>
          </article>
        ))}
      </div>
    </section>
  );
}
