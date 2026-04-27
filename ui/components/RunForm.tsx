'use client';

import Form from '@rjsf/core';
import type { RJSFSchema } from '@rjsf/utils';
import validator from '@rjsf/validator-ajv8';
import { useMemo, useState } from 'react';
import { useSWRConfig } from 'swr';
import { apiFetch } from '../lib/api';
import { mergeEntryInputsSchema } from '../lib/schema';
import { useApi } from '../lib/useApi';

interface Props {
  workflowId: string;
  onClose: () => void;
}

type WorkflowJson = Parameters<typeof mergeEntryInputsSchema>[0];

export function RunForm({ workflowId, onClose }: Props) {
  const { mutate } = useSWRConfig();
  const { data: workflow, isLoading } = useApi<WorkflowJson>(
    `/api/workflows/${encodeURIComponent(workflowId)}?full=true`,
  );
  const schema = useMemo<RJSFSchema | null>(
    () => (workflow ? mergeEntryInputsSchema(workflow) : null),
    [workflow],
  );

  const [fallback, setFallback] = useState('{}');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function submitJson(input: Record<string, unknown>) {
    setSubmitting(true);
    setError('');
    try {
      await apiFetch(`/api/workflows/${encodeURIComponent(workflowId)}/run`, {
        method: 'POST',
        body: JSON.stringify(input),
      });
      await mutate('/api/runs?limit=50');
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function submitFallback() {
    let input: unknown;
    try {
      input = JSON.parse(fallback || '{}');
    } catch {
      setError('Invalid JSON');
      return;
    }
    if (typeof input !== 'object' || Array.isArray(input) || input === null) {
      setError('Input must be a JSON object');
      return;
    }
    await submitJson(input as Record<string, unknown>);
  }

  if (isLoading) {
    return <div className="text-[12px] text-fg-muted">Loading schema...</div>;
  }

  const errorBanner = error && (
    <div
      className="text-[12.5px] px-3 py-2 rounded mb-3 text-danger"
      style={{
        background: 'color-mix(in srgb, var(--color-danger) 8%, transparent)',
        border: '1px solid color-mix(in srgb, var(--color-danger) 40%, var(--color-border))',
      }}
    >
      {error}
    </div>
  );

  const actions = (
    <div className="flex gap-2 mt-4">
      <button
        type="submit"
        disabled={submitting}
        className="btn btn-primary btn-sm"
        onClick={schema ? undefined : submitFallback}
      >
        {submitting ? 'Running...' : 'Run workflow'}
      </button>
      <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
        Cancel
      </button>
    </div>
  );

  return (
    <div>
      {errorBanner}
      {schema ? (
        <Form
          schema={schema}
          validator={validator}
          onSubmit={({ formData }) => submitJson(formData as Record<string, unknown>)}
          disabled={submitting}
        >
          {actions}
        </Form>
      ) : (
        <div>
          <label className="label">Input (JSON)</label>
          <textarea
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            placeholder='{"key": "value"}'
            className="input"
          />
          {actions}
        </div>
      )}
    </div>
  );
}
