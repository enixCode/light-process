import type { AgentCard } from '@a2a-js/sdk';
import { DefaultRequestHandler, InMemoryTaskStore, JsonRpcTransportHandler } from '@a2a-js/sdk/server';
import { timingSafeEqual } from 'crypto';
import { readFileSync } from 'fs';
import { createServer as httpCreateServer, type IncomingMessage, type ServerResponse } from 'http';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { DockerRunner } from '../runner/index.js';
import { Workflow } from '../Workflow.js';
import { buildAgentCard, type CardOptions } from './cardBuilder.js';
import { MANIFEST_JSON, SERVICE_WORKER_JS, UI_HTML } from './ui.js';
import { WorkflowExecutor } from './WorkflowExecutor.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
const VERSION: string = pkg.version;

export interface A2AServerOptions {
  /** Port to listen on (default: 3000) */
  port?: number;
  /** Host to bind to (default: '0.0.0.0') */
  host?: string;
  /** DockerRunner instance shared across executions */
  runner?: DockerRunner;
  /** Agent card options */
  card?: CardOptions;
  /** API key for Bearer token authentication (optional - no auth when unset) */
  apiKey?: string;
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
  if (method === 'POST') return true;
  if (pathname.startsWith('/api/')) return true;
  return false;
}

export function createA2AServer(options: A2AServerOptions = {}) {
  const { port = 3000, host = '0.0.0.0', runner = new DockerRunner(), apiKey } = options;

  const workflows = new Map<string, Workflow>();

  let agentCard: AgentCard;
  let requestHandler: DefaultRequestHandler;
  let transport: JsonRpcTransportHandler;

  function rebuildHandler() {
    agentCard = buildAgentCard(workflows, {
      ...options.card,
      url: options.card?.url || `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`,
      apiKey: !!apiKey,
    });
    const taskStore = new InMemoryTaskStore();
    const executor = new WorkflowExecutor(workflows, runner);
    requestHandler = new DefaultRequestHandler(agentCard, taskStore, executor);
    transport = new JsonRpcTransportHandler(requestHandler);
  }

  rebuildHandler();

  const server = httpCreateServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const pathname = url.pathname;
    const method = req.method?.toUpperCase() || 'GET';

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // API key auth check
    if (apiKey && isProtectedRoute(method, pathname)) {
      const auth = req.headers['authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token || !safeEqual(token, apiKey)) {
        json(res, 401, { error: 'Unauthorized' });
        return;
      }
    }

    try {
      // UI routes
      if (method === 'GET' && pathname === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(UI_HTML.replace('__VERSION__', 'v' + VERSION));
        return;
      }

      if (method === 'GET' && pathname === '/manifest.json') {
        res.writeHead(200, { 'Content-Type': 'application/manifest+json' });
        res.end(MANIFEST_JSON);
        return;
      }

      if (method === 'GET' && pathname === '/sw.js') {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(SERVICE_WORKER_JS);
        return;
      }

      // API routes
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
          registerWorkflow(wf);
          json(res, 201, { id: wf.id, name: wf.name });
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
        unregisterWorkflow(id);
        json(res, 200, { deleted: true, id });
        return;
      }

      // ROADMAP: GET /api/workflows/:id/history - execution logs
      // ROADMAP: POST /api/workflows/:id/run - trigger execution
      // ROADMAP: GET /api/workflows/:id/stream - SSE live updates

      if (method === 'GET' && (pathname === '/.well-known/agent-card.json' || pathname === '/.well-known/agent.json')) {
        json(res, 200, agentCard);
        return;
      }

      if (method === 'GET' && pathname === '/health') {
        json(res, 200, { status: 'ok' });
        return;
      }

      if (method === 'POST' && (pathname === '/' || pathname === '/a2a')) {
        const body = await readBody(req);
        let request: unknown;
        try {
          request = JSON.parse(body);
        } catch {
          json(res, 400, { error: 'Invalid JSON' });
          return;
        }

        const result = await transport.handle(request);

        if (result && typeof (result as AsyncGenerator).next === 'function') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          });

          const generator = result as AsyncGenerator;
          for await (const event of generator) {
            res.write(`data: ${JSON.stringify(event)}\n\n`);
          }
          res.end();
        } else {
          json(res, 200, result);
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
    rebuildHandler();
  }

  function unregisterWorkflow(id: string): boolean {
    const deleted = workflows.delete(id);
    if (deleted) rebuildHandler();
    return deleted;
  }

  function listen(): Promise<void> {
    return new Promise((resolve) => {
      server.listen(port, host, () => {
        const base = `http://${host === '0.0.0.0' ? 'localhost' : host}:${port}`;
        console.log(`Light Process A2A agent listening on ${base}`);
        console.log(`Dashboard:  ${base}/`);
        console.log(`Agent Card: ${base}/.well-known/agent-card.json`);
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
