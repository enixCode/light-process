'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LoginGate } from '../../components/LoginGate';
import { RunDetail } from '../../components/RunDetail';

function RunDetailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id') || '';

  return (
    <>
      <header className="border-b border-border bg-surface">
        <div className="max-w-[1200px] mx-auto px-6 h-14 flex items-center gap-4">
          <button onClick={() => router.push('/')} className="btn btn-ghost btn-sm">
            &larr; Back
          </button>
          <span className="text-[14px] font-semibold text-fg">Light Process</span>
          <span className="text-[12px] text-fg-muted">/ Runs</span>
        </div>
      </header>
      <main className="max-w-[1200px] mx-auto px-6 py-8">
        <RunDetail runId={id} />
      </main>
    </>
  );
}

export default function RunsPage() {
  return (
    <LoginGate>
      <Suspense
        fallback={
          <div className="text-[13px] text-center py-16 text-fg-muted">Loading...</div>
        }
      >
        <RunDetailPage />
      </Suspense>
    </LoginGate>
  );
}
