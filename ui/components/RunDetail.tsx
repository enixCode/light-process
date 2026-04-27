'use client';

import { fmtDuration, fmtTime } from '../lib/format';
import { useApi } from '../lib/useApi';
import { EmptyState } from './EmptyState';
import { StatusPill } from './StatusPill';

interface NodeResult {
  id: string;
  name: string;
  status: string;
  durationMs?: number | null;
}

interface RunRecord {
  id: string;
  workflowName: string;
  status: string;
  startedAt: number;
  durationMs: number | null;
  input: unknown;
  output: Record<string, unknown> | null;
  error: string | null;
  nodes: NodeResult[];
}

interface Props {
  runId: string;
}

export function RunDetail({ runId }: Props) {
  const { data: run, error } = useApi<RunRecord>(
    `/api/runs/${encodeURIComponent(runId)}`,
    {
      refreshInterval: (latest) => (latest?.status === 'running' ? 1500 : 0),
    },
  );

  if (error) return <EmptyState variant="page">Run not found or evicted.</EmptyState>;
  if (!run) return <EmptyState variant="page">Loading...</EmptyState>;

  const dur = run.durationMs != null ? run.durationMs : Date.now() - run.startedAt;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-[22px] font-semibold tracking-tight text-fg">
            {run.workflowName}
          </h1>
          <StatusPill status={run.status} />
        </div>
        <div className="text-[12px] flex items-center gap-3 text-fg-muted">
          <span className="font-mono">{run.id}</span>
          <span className="text-border-strong">·</span>
          <span>Started {fmtTime(run.startedAt)}</span>
          <span className="text-border-strong">·</span>
          <span className="font-mono">{fmtDuration(dur)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Metric label="Duration" value={fmtDuration(dur)} />
        <Metric label="Nodes" value={String(run.nodes.length)} />
        <Metric label="Status" value={run.status} />
      </div>

      <div className="card mb-6">
        <div className="px-4 py-3 border-b border-border">
          <h2 className="text-[13px] font-semibold text-fg">Timeline</h2>
        </div>
        {run.nodes.length === 0 ? (
          <div className="text-[13px] px-4 py-6 text-fg-muted">
            No nodes executed yet.
          </div>
        ) : (
          <ul>
            {run.nodes.map((n, i) => {
              const last = i === run.nodes.length - 1;
              return (
                <li
                  key={n.id}
                  className={`flex items-center gap-3 px-4 py-3 ${
                    last ? '' : 'border-b border-border'
                  }`}
                >
                  <span className="text-[11px] w-6 text-center text-muted font-mono">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span className="text-[13px] flex-1 text-fg">{n.name}</span>
                  <StatusPill status={n.status} />
                  <span className="text-[12px] min-w-[70px] text-right text-fg-muted font-mono">
                    {fmtDuration(n.durationMs)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {run.error && (
        <div
          className="px-4 py-3 rounded mb-6 text-[13px] text-danger"
          style={{
            background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
            border: '1px solid color-mix(in srgb, var(--color-danger) 40%, var(--color-border))',
          }}
        >
          <div className="font-semibold mb-1">Error</div>
          <div className="font-mono text-[12px]">{run.error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Panel title="Input">
          <pre className="pre">{JSON.stringify(run.input, null, 2)}</pre>
        </Panel>
        <Panel title="Output">
          {run.output ? (
            <pre className="pre">{JSON.stringify(run.output, null, 2)}</pre>
          ) : (
            <div className="text-[13px] px-1 py-4 text-fg-muted">Pending...</div>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="label-muted mb-1">{label}</div>
      <div
        className="text-[18px] font-semibold text-fg font-mono"
        style={{ letterSpacing: '-0.01em' }}
      >
        {value}
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[12px] font-semibold mb-2 text-fg">{title}</h3>
      {children}
    </section>
  );
}
