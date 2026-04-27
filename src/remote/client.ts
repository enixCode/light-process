import type { RemoteConfig } from './config.js';

export interface WorkflowSummary {
  id: string;
  name: string;
  nodeCount: number;
  linkCount: number;
  entryNodes: string[];
}

function headers(remote: RemoteConfig): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (remote.apiKey) h.Authorization = `Bearer ${remote.apiKey}`;
  return h;
}

async function request<T>(remote: RemoteConfig, method: string, path: string, body?: unknown): Promise<T> {
  const url = remote.url.replace(/\/$/, '') + path;
  const res = await fetch(url, {
    method,
    headers: headers(remote),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

export async function listWorkflows(remote: RemoteConfig): Promise<WorkflowSummary[]> {
  return request<WorkflowSummary[]>(remote, 'GET', '/api/workflows');
}

export async function getWorkflow(remote: RemoteConfig, id: string): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>(remote, 'GET', `/api/workflows/${encodeURIComponent(id)}`);
}

export async function getFullWorkflow(remote: RemoteConfig, id: string): Promise<Record<string, unknown>> {
  return request(remote, 'GET', `/api/workflows/${encodeURIComponent(id)}?full=true`);
}

export async function createWorkflow(
  remote: RemoteConfig,
  workflow: unknown,
  persist = true,
): Promise<{ id: string; name: string; persisted: boolean }> {
  const qs = persist ? '?persist=true' : '';
  return request(remote, 'POST', `/api/workflows${qs}`, workflow);
}

export async function updateWorkflow(
  remote: RemoteConfig,
  id: string,
  workflow: unknown,
  persist = true,
): Promise<{ id: string; name: string; updated: boolean; persisted: boolean }> {
  const qs = persist ? '?persist=true' : '';
  return request(remote, 'PUT', `/api/workflows/${encodeURIComponent(id)}${qs}`, workflow);
}

export async function deleteWorkflow(
  remote: RemoteConfig,
  id: string,
  persist = true,
): Promise<{ deleted: boolean; id: string; unpersisted: boolean }> {
  const qs = persist ? '?persist=true' : '';
  return request(remote, 'DELETE', `/api/workflows/${encodeURIComponent(id)}${qs}`);
}

export async function ping(remote: RemoteConfig): Promise<{ status: string }> {
  return request(remote, 'GET', '/health');
}

export async function runWorkflow(
  remote: RemoteConfig,
  workflowId: string,
  input: Record<string, unknown> = {},
): Promise<unknown> {
  return request(remote, 'POST', `/api/workflows/${encodeURIComponent(workflowId)}/run`, input);
}
