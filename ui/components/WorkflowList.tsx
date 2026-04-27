'use client';

import { useState } from 'react';
import { useApi } from '../lib/useApi';
import { EmptyState } from './EmptyState';
import { RunForm } from './RunForm';

interface WorkflowSummary {
  id: string;
  name: string;
  nodeCount: number;
  linkCount: number;
}

export function WorkflowList() {
  const { data: workflows = [], error } = useApi<WorkflowSummary[]>(
    '/api/workflows',
    { refreshInterval: 10000 },
  );
  const [openForm, setOpenForm] = useState<string | null>(null);

  if (error) return <EmptyState>Failed to load: {(error as Error).message}</EmptyState>;
  if (workflows.length === 0) return <EmptyState>No workflows registered.</EmptyState>;

  return (
    <ul>
      {workflows.map((wf, i) => {
        const open = openForm === wf.id;
        const last = i === workflows.length - 1;
        return (
          <li
            key={wf.id}
            className={last && !open ? '' : 'border-b border-border'}
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[14px] font-medium truncate text-fg">
                    {wf.name}
                  </span>
                  <span className="text-[11px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-muted font-mono">
                    {wf.id}
                  </span>
                </div>
                <div className="text-[12px] mt-0.5 text-fg-muted">
                  {wf.nodeCount} {wf.nodeCount === 1 ? 'node' : 'nodes'}
                  <span className="text-border-strong"> · </span>
                  {wf.linkCount} {wf.linkCount === 1 ? 'link' : 'links'}
                </div>
              </div>
              <button
                onClick={() => setOpenForm(open ? null : wf.id)}
                className={open ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
              >
                {open ? 'Cancel' : 'Run'}
              </button>
            </div>
            {open && (
              <div className="px-4 py-4 border-t border-border bg-surface-2">
                <RunForm
                  workflowId={wf.id}
                  onClose={() => setOpenForm(null)}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
