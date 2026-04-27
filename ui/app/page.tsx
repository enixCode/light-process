'use client';

import { LoginGate, signOut } from '../components/LoginGate';
import { RunsList } from '../components/RunsList';
import { WorkflowList } from '../components/WorkflowList';
import { useApi } from '../lib/useApi';

interface MetaResponse {
  authRequired: boolean;
  version: string;
}

export default function Dashboard() {
  return (
    <LoginGate>
      <DashboardContent />
    </LoginGate>
  );
}

function DashboardContent() {
  const { data: meta } = useApi<MetaResponse>('/api/meta');

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <Logo />
            <span className="font-semibold text-[15px] text-fg">Light Process</span>
            {meta?.version && (
              <span
                className="text-[11px] px-1.5 py-0.5 rounded bg-surface-2 text-fg-muted font-mono border border-border"
              >
                v{meta.version}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span
              className="badge text-success"
              style={{ borderColor: 'color-mix(in srgb, var(--color-success) 30%, var(--color-border))' }}
            >
              <span className="badge-dot" />
              <span>Connected</span>
            </span>
            {meta?.authRequired && (
              <button onClick={signOut} className="btn btn-ghost btn-sm">
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-[22px] font-semibold tracking-tight text-fg">Dashboard</h1>
          <p className="text-[13px] mt-1 text-fg-muted">
            Manage workflows and monitor executions.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-6">
          <Section title="Workflows" description="Registered DAG definitions">
            <WorkflowList />
          </Section>
          <Section title="Recent runs" description="Last 50 executions">
            <RunsList />
          </Section>
        </div>
      </main>
    </>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-fg">{title}</h2>
          <p className="text-[12px] text-fg-muted">{description}</p>
        </div>
      </div>
      <div className="card">{children}</div>
    </section>
  );
}

function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="6" height="6" rx="1" fill="var(--color-accent)" />
      <rect x="16" y="2" width="6" height="6" rx="1" fill="var(--color-fg)" opacity="0.6" />
      <rect x="9" y="16" width="6" height="6" rx="1" fill="var(--color-fg)" opacity="0.6" />
      <path d="M5 8 L12 16 M19 8 L12 16" stroke="var(--color-fg-muted)" strokeWidth="1" />
    </svg>
  );
}
