'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { apiFetch } from '../lib/api';

interface MetaResponse {
  authRequired: boolean;
  version: string;
}

const TOKEN_KEY = 'lp-token';

function readToken(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function LoginGate({ children }: { children: React.ReactNode }) {
  const { data: meta, error: metaError } = useSWR<MetaResponse>('/api/meta', (url: string) =>
    apiFetch<MetaResponse>(url),
  );

  const [authed, setAuthed] = useState<boolean | null>(null);
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!meta) return;
    if (!meta.authRequired) {
      setAuthed(true);
      return;
    }
    const stored = readToken();
    if (!stored) {
      setAuthed(false);
      return;
    }
    apiFetch('/api/workflows')
      .then(() => setAuthed(true))
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setAuthed(false);
      });
  }, [meta]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = token.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setError('');
    localStorage.setItem(TOKEN_KEY, trimmed);
    try {
      await apiFetch('/api/workflows');
      setAuthed(true);
    } catch (err) {
      localStorage.removeItem(TOKEN_KEY);
      setError((err as Error).message || 'Invalid token');
    } finally {
      setSubmitting(false);
    }
  }

  if (metaError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="card max-w-sm p-6 text-center">
          <h1 className="text-[16px] font-semibold text-fg">Server unreachable</h1>
          <p className="text-[12px] text-fg-muted mt-2">
            Could not contact the API. Make sure the backend is running.
          </p>
        </div>
      </div>
    );
  }

  if (!meta || authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[13px] text-fg-muted">
        Loading…
      </div>
    );
  }

  if (authed) return <>{children}</>;

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <form onSubmit={handleLogin} className="card w-full max-w-sm p-6 flex flex-col gap-4">
        <div>
          <h1 className="text-[18px] font-semibold text-fg">Sign in</h1>
          <p className="text-[13px] text-fg-muted mt-1">
            Enter your API token to access Light Process.
          </p>
        </div>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="API token"
          autoComplete="off"
          autoFocus
          className="input font-mono"
        />
        {error && <p className="text-[12px]" style={{ color: 'var(--color-danger)' }}>{error}</p>}
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!token.trim() || submitting}
        >
          {submitting ? 'Verifying…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}

export function signOut() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOKEN_KEY);
  window.location.reload();
}
