'use client';

import { useRouter } from 'next/navigation';
import { fmtDuration, fmtTime } from '../lib/format';
import { useApi } from '../lib/useApi';
import { EmptyState } from './EmptyState';
import { StatusPill } from './StatusPill';

interface RunSummary {
  id: string;
  workflowName: string;
  status: string;
  startedAt: number;
  durationMs: number | null;
  currentNode?: string;
}

export function RunsList() {
  const router = useRouter();
  const { data: runs = [], error } = useApi<RunSummary[]>('/api/runs?limit=50', {
    refreshInterval: (latest) =>
      latest?.some((r) => r.status === 'running') ? 2000 : 10000,
  });

  if (error) return <EmptyState>Connection lost: {(error as Error).message}</EmptyState>;
  if (runs.length === 0) return <EmptyState>No runs yet.</EmptyState>;

  return (
    <ul>
      {runs.map((r, i) => {
        const dur = r.durationMs != null ? r.durationMs : Date.now() - r.startedAt;
        const last = i === runs.length - 1;
        return (
          <li
            key={r.id}
            onClick={() => router.push(`/runs/?id=${encodeURIComponent(r.id)}`)}
            className={`cursor-pointer flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2 transition-colors duration-120 ${
              last ? '' : 'border-b border-border'
            }`}
          >
            <div className="min-w-0">
              <div className="text-[14px] font-medium truncate text-fg">
                {r.workflowName}
              </div>
              <div className="text-[12px] mt-0.5 flex items-center gap-2 text-fg-muted">
                <span className="font-mono">{fmtTime(r.startedAt)}</span>
                <span className="text-border-strong">·</span>
                <span className="font-mono">{fmtDuration(dur)}</span>
                {r.currentNode && (
                  <>
                    <span className="text-border-strong">·</span>
                    <span>{r.currentNode}</span>
                  </>
                )}
              </div>
            </div>
            <StatusPill status={r.status} />
          </li>
        );
      })}
    </ul>
  );
}
