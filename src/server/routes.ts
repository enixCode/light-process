import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { LightRunClient } from '../runner/index.js';
import { Workflow } from '../Workflow.js';
import { buildStaticSpec, buildWorkflowsSpec, renderScalarHtml } from './openapi.js';
import type { RunStatus, RunStore } from './runStore.js';

export interface RouteContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  workflows: Map<string, Workflow>;
  runStore: RunStore;
  runner: LightRunClient;
  persistPath: string | null;
  version: string;
  apiKey?: string;
}

export interface Route {
  method: string;
  match: (pathname: string) => RegExpMatchArray | null;
  handler: (ctx: RouteContext, params: RegExpMatchArray) => Promise<void> | void;
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function readJsonBody(req: IncomingMessage, res: ServerResponse): Promise<unknown | undefined> {
  const body = await readBody(req);
  if (!body.trim()) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return undefined;
  }
}

const exact = (pathname: string) => (p: string) => (p === pathname ? ([p] as RegExpMatchArray) : null);
const regex = (re: RegExp) => (p: string) => p.match(re);

const persistFile = (persistPath: string, id: string) => join(persistPath, `${id}.json`);

export function buildRoutes(): Route[] {
  return [
    {
      method: 'GET',
      match: exact('/health'),
      handler: ({ res, version }) => {
        json(res, 200, { status: 'ok', version, commit: process.env.COMMIT_SHA || 'unknown' });
      },
    },
    {
      method: 'GET',
      match: exact('/api/meta'),
      handler: ({ res, version, apiKey }) => {
        json(res, 200, { authRequired: !!apiKey, version });
      },
    },
    {
      method: 'GET',
      match: exact('/api/workflows'),
      handler: ({ res, workflows }) => {
        const list = Array.from(workflows.values()).map((wf) => ({
          id: wf.id,
          name: wf.name,
          nodeCount: wf.nodes.size,
          linkCount: wf.links.size,
          entryNodes: wf.getEntryNodes().map((n) => n.id),
        }));
        json(res, 200, list);
      },
    },
    {
      method: 'GET',
      match: regex(/^\/api\/workflows\/([^/]+)$/),
      handler: ({ res, url, workflows }, params) => {
        const wf = workflows.get(params[1]);
        if (!wf) return json(res, 404, { error: 'Workflow not found' });
        if (url.searchParams.get('full') === 'true') return json(res, 200, wf.toJSON());
        json(res, 200, {
          id: wf.id,
          name: wf.name,
          network: wf.network,
          nodes: Array.from(wf.nodes.values()).map((n) => ({
            id: n.id,
            name: n.name,
            type: n.type,
            image: n.image,
            hasInputs: !!n.inputs,
            hasOutputs: !!n.outputs,
            timeout: n.timeout,
            fileCount: Object.keys(n.files).length,
            entrypoint: n.entrypoint,
          })),
          links: Array.from(wf.links.values()).map((l) => ({
            id: l.id,
            name: l.name,
            from: l.from,
            to: l.to,
            hasCondition: !!l.when,
            maxIterations: l.maxIterations,
          })),
        });
      },
    },
    {
      method: 'POST',
      match: exact('/api/workflows'),
      handler: async ({ req, res, url, workflows, persistPath }) => {
        const data = await readJsonBody(req, res);
        if (data === undefined) return;
        try {
          const wf = Workflow.fromJSON(data as Parameters<typeof Workflow.fromJSON>[0]);
          if (workflows.has(wf.id)) {
            return json(res, 409, { error: 'Workflow already exists', id: wf.id });
          }
          workflows.set(wf.id, wf);
          let persisted = false;
          if (url.searchParams.get('persist') === 'true') {
            if (!persistPath) {
              return json(res, 400, { error: 'Persistence not enabled (server has no workflows directory)' });
            }
            try {
              writeFileSync(persistFile(persistPath, wf.id), JSON.stringify(data, null, 2));
              persisted = true;
            } catch (err) {
              return json(res, 500, { error: `Persist failed: ${(err as Error).message}` });
            }
          }
          json(res, 201, { id: wf.id, name: wf.name, persisted });
        } catch (err) {
          json(res, 400, { error: (err as Error).message });
        }
      },
    },
    {
      method: 'PUT',
      match: regex(/^\/api\/workflows\/([^/]+)$/),
      handler: async ({ req, res, url, workflows, persistPath }, params) => {
        const id = params[1];
        if (!workflows.has(id)) return json(res, 404, { error: 'Workflow not found' });
        const data = await readJsonBody(req, res);
        if (data === undefined) return;
        try {
          const wf = Workflow.fromJSON(data as Parameters<typeof Workflow.fromJSON>[0]);
          if (wf.id !== id) {
            return json(res, 400, { error: `Body id "${wf.id}" does not match URL id "${id}"` });
          }
          workflows.set(id, wf);
          let persisted = false;
          if (url.searchParams.get('persist') === 'true') {
            if (!persistPath) {
              return json(res, 400, { error: 'Persistence not enabled (server has no workflows directory)' });
            }
            try {
              writeFileSync(persistFile(persistPath, id), JSON.stringify(data, null, 2));
              persisted = true;
            } catch (err) {
              return json(res, 500, { error: `Persist failed: ${(err as Error).message}` });
            }
          }
          json(res, 200, { id, name: wf.name, updated: true, persisted });
        } catch (err) {
          json(res, 400, { error: (err as Error).message });
        }
      },
    },
    {
      method: 'DELETE',
      match: regex(/^\/api\/workflows\/([^/]+)$/),
      handler: ({ res, url, workflows, persistPath }, params) => {
        const id = params[1];
        if (!workflows.has(id)) return json(res, 404, { error: 'Workflow not found' });
        workflows.delete(id);
        let unpersisted = false;
        if (url.searchParams.get('persist') === 'true' && persistPath) {
          const file = persistFile(persistPath, id);
          if (existsSync(file)) {
            try {
              unlinkSync(file);
              unpersisted = true;
            } catch (err) {
              return json(res, 500, { error: `Unpersist failed: ${(err as Error).message}` });
            }
          }
        }
        json(res, 200, { deleted: true, id, unpersisted });
      },
    },
    {
      method: 'POST',
      match: regex(/^\/api\/workflows\/([^/]+)\/run$/),
      handler: async ({ req, res, workflows, runStore, runner }, params) => {
        const wf = workflows.get(params[1]);
        if (!wf) return json(res, 404, { error: 'Workflow not found' });

        let input: Record<string, unknown> = {};
        const body = await readBody(req);
        if (body.trim()) {
          try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              input = parsed as Record<string, unknown>;
            } else {
              return json(res, 400, { error: 'Body must be a JSON object' });
            }
          } catch {
            return json(res, 400, { error: 'Invalid JSON body' });
          }
        }

        const run = runStore.start(wf.id, wf.name, input);
        try {
          const result = await wf.execute(input, {
            runner,
            onNodeStart: (nodeId, nodeName) => runStore.nodeStart(run.id, nodeId, nodeName),
            onNodeComplete: (nodeId, _name, success, duration) =>
              runStore.nodeComplete(run.id, nodeId, success, duration),
          });
          runStore.finish(run.id, result.success ? 'success' : 'failed', result, null);
          json(res, result.success ? 200 : 500, { ...result, runId: run.id });
        } catch (err) {
          const message = (err as Error).message;
          runStore.finish(run.id, 'failed', null, message);
          json(res, 500, { error: message, runId: run.id });
        }
      },
    },
    {
      method: 'GET',
      match: exact('/api/runs'),
      handler: ({ res, url, runStore }) => {
        const filter: { workflowId?: string; status?: RunStatus } = {};
        const wfId = url.searchParams.get('workflowId');
        const status = url.searchParams.get('status');
        if (wfId) filter.workflowId = wfId;
        if (status === 'running' || status === 'success' || status === 'failed') filter.status = status;
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        json(res, 200, runStore.list(filter).slice(0, limit));
      },
    },
    {
      method: 'GET',
      match: regex(/^\/api\/runs\/([^/]+)$/),
      handler: ({ res, runStore }, params) => {
        const run = runStore.get(params[1]);
        if (!run) return json(res, 404, { error: 'Run not found' });
        json(res, 200, run);
      },
    },
    {
      method: 'GET',
      match: exact('/openapi.json'),
      handler: ({ res, version, apiKey }) => {
        json(res, 200, buildStaticSpec({ version, authRequired: !!apiKey }));
      },
    },
    {
      method: 'GET',
      match: exact('/openapi-workflows.json'),
      handler: ({ res, workflows, version, apiKey }) => {
        json(res, 200, buildWorkflowsSpec(workflows, { version, authRequired: !!apiKey }));
      },
    },
    {
      method: 'GET',
      match: exact('/docs'),
      handler: ({ res }) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderScalarHtml('/openapi.json', 'Light Process API'));
      },
    },
    {
      method: 'GET',
      match: exact('/docs/workflows'),
      handler: ({ res }) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderScalarHtml('/openapi-workflows.json', 'Light Process Workflows'));
      },
    },
  ];
}

export { json, readBody };
