import { timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer as httpCreateServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LightRunClient } from './runner/index.js';
import { Workflow } from './Workflow.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const VERSION: string = pkg.version;

export interface ServerOptions {
  port?: number;
  host?: string;
  runner?: LightRunClient;
  apiKey?: string;
  persistDir?: string;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return timingSafeEqual(bufA, bufA) && false;
  return timingSafeEqual(bufA, bufB);
}

function isProtectedRoute(method: string, pathname: string): boolean {
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') return true;
  if (pathname.startsWith('/api/')) return true;
  return false;
}

export function createServer(options: ServerOptions = {}) {
  const { port = 3000, host = '0.0.0.0', runner = new LightRunClient(), apiKey, persistDir } = options;
  const persistPath = persistDir ? resolve(persistDir) : null;
  const persistFile = (id: string) => join(persistPath as string, `${id}.json`);

  const workflows = new Map<string, Workflow>();

  const server = httpCreateServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() || 'GET';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    if (apiKey && isProtectedRoute(method, pathname)) {
      const auth = req.headers.authorization || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token || !safeEqual(token, apiKey)) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }
    }

    try {
      if (method === 'GET' && pathname === '/health') {
        json(res, 200, { status: 'ok', version: VERSION, commit: process.env.COMMIT_SHA || 'unknown' });
        return;
      }

      if (method === 'GET' && pathname === '/api/workflows') {
        const list = Array.from(workflows.values()).map((wf) => ({
          id: wf.id,
          name: wf.name,
          nodeCount: wf.nodes.size,
          linkCount: wf.links.size,
          entryNodes: wf.getEntryNodes().map((n) => n.id),
        }));
        json(res, 200, list);
        return;
      }

      const wfMatch = pathname.match(/^\/api\/workflows\/([^/]+)$/);
      if (method === 'GET' && wfMatch) {
        const wf = workflows.get(wfMatch[1]);
        if (!wf) {
          json(res, 404, { error: 'Workflow not found' });
          return;
        }
        if (url.searchParams.get('full') === 'true') {
          json(res, 200, wf.toJSON());
          return;
        }
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
        return;
      }

      if (method === 'POST' && pathname === '/api/workflows') {
        const body = await readBody(req);
        let data: unknown;
        try {
          data = JSON.parse(body);
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
          return;
        }
        try {
          const wf = Workflow.fromJSON(data as Parameters<typeof Workflow.fromJSON>[0]);
          if (workflows.has(wf.id)) {
            json(res, 409, { error: 'Workflow already exists', id: wf.id });
            return;
          }
          workflows.set(wf.id, wf);
          let persisted = false;
          if (url.searchParams.get('persist') === 'true') {
            if (!persistPath) {
              json(res, 400, { error: 'Persistence not enabled (server has no workflows directory)' });
              return;
            }
            try {
              writeFileSync(persistFile(wf.id), JSON.stringify(data, null, 2));
              persisted = true;
            } catch (err) {
              json(res, 500, { error: `Persist failed: ${(err as Error).message}` });
              return;
            }
          }
          json(res, 201, { id: wf.id, name: wf.name, persisted });
        } catch (err) {
          json(res, 400, { error: (err as Error).message });
        }
        return;
      }

      if (method === 'PUT' && wfMatch) {
        const id = wfMatch[1];
        if (!workflows.has(id)) {
          json(res, 404, { error: 'Workflow not found' });
          return;
        }
        const body = await readBody(req);
        let data: unknown;
        try {
          data = JSON.parse(body);
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
          return;
        }
        try {
          const wf = Workflow.fromJSON(data as Parameters<typeof Workflow.fromJSON>[0]);
          if (wf.id !== id) {
            json(res, 400, { error: `Body id "${wf.id}" does not match URL id "${id}"` });
            return;
          }
          workflows.set(id, wf);
          let persisted = false;
          if (url.searchParams.get('persist') === 'true') {
            if (!persistPath) {
              json(res, 400, { error: 'Persistence not enabled (server has no workflows directory)' });
              return;
            }
            try {
              writeFileSync(persistFile(id), JSON.stringify(data, null, 2));
              persisted = true;
            } catch (err) {
              json(res, 500, { error: `Persist failed: ${(err as Error).message}` });
              return;
            }
          }
          json(res, 200, { id, name: wf.name, updated: true, persisted });
        } catch (err) {
          json(res, 400, { error: (err as Error).message });
        }
        return;
      }

      if (method === 'DELETE' && wfMatch) {
        const id = wfMatch[1];
        if (!workflows.has(id)) {
          json(res, 404, { error: 'Workflow not found' });
          return;
        }
        workflows.delete(id);
        let unpersisted = false;
        if (url.searchParams.get('persist') === 'true' && persistPath) {
          const file = persistFile(id);
          if (existsSync(file)) {
            try {
              unlinkSync(file);
              unpersisted = true;
            } catch (err) {
              json(res, 500, { error: `Unpersist failed: ${(err as Error).message}` });
              return;
            }
          }
        }
        json(res, 200, { deleted: true, id, unpersisted });
        return;
      }

      const runMatch = pathname.match(/^\/api\/workflows\/([^/]+)\/run$/);
      if (method === 'POST' && runMatch) {
        const id = runMatch[1];
        const wf = workflows.get(id);
        if (!wf) {
          json(res, 404, { error: 'Workflow not found' });
          return;
        }
        let input: Record<string, unknown> = {};
        const body = await readBody(req);
        if (body.trim()) {
          try {
            const parsed = JSON.parse(body);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              input = parsed as Record<string, unknown>;
            } else {
              json(res, 400, { error: 'Body must be a JSON object' });
              return;
            }
          } catch {
            json(res, 400, { error: 'Invalid JSON body' });
            return;
          }
        }
        try {
          const result = await wf.execute(input, { runner });
          json(res, result.success ? 200 : 500, result);
        } catch (err) {
          json(res, 500, { error: (err as Error).message });
        }
        return;
      }

      json(res, 404, { error: 'Not found' });
    } catch (err) {
      json(res, 500, { error: (err as Error).message });
    }
  });

  function registerWorkflow(workflow: Workflow): void {
    workflows.set(workflow.id, workflow);
  }

  function unregisterWorkflow(id: string): boolean {
    return workflows.delete(id);
  }

  function listen(): Promise<void> {
    return new Promise((resolve) => {
      server.listen(port, host, () => {
        const base = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
        console.log(`Light Process REST API listening on ${base}`);
        console.log(`Health:     ${base}/health`);
        console.log(`Workflows:  ${base}/api/workflows`);
        if (apiKey) console.log(`Auth:       Bearer token required on API routes`);
        resolve();
      });
    });
  }

  function close(): Promise<void> {
    return new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  return { server, listen, close, registerWorkflow, unregisterWorkflow, workflows };
}
