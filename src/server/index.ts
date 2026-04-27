import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer as httpCreateServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LightRunClient } from '../runner/index.js';
import type { Workflow } from '../Workflow.js';
import { buildRoutes, json, type RouteContext } from './routes.js';
import { RunStore } from './runStore.js';
import { serveStatic, UI_AVAILABLE } from './static.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
const VERSION: string = pkg.version;

if (!UI_AVAILABLE) {
  console.warn('UI not built. Run: cd ui && npm install && npm run build');
}

export interface ServerOptions {
  port?: number;
  host?: string;
  runner?: LightRunClient;
  apiKey?: string;
  persistDir?: string;
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return timingSafeEqual(bufA, bufA) && false;
  return timingSafeEqual(bufA, bufB);
}

function isProtectedRoute(method: string, pathname: string): boolean {
  if (method === 'POST' || method === 'PUT' || method === 'DELETE') return true;
  if (pathname === '/api/meta') return false;
  if (pathname.startsWith('/api/')) return true;
  return false;
}

export function createServer(options: ServerOptions = {}) {
  const { port = 3000, host = '0.0.0.0', runner = new LightRunClient(), apiKey, persistDir } = options;
  const persistPath = persistDir ? resolve(persistDir) : null;

  const workflows = new Map<string, Workflow>();
  const runStore = new RunStore();
  const routes = buildRoutes();

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
      const ctx: RouteContext = { req, res, url, workflows, runStore, runner, persistPath, version: VERSION, apiKey };

      for (const route of routes) {
        if (route.method !== method) continue;
        const params = route.match(pathname);
        if (!params) continue;
        await route.handler(ctx, params);
        return;
      }

      if (method === 'GET' && serveStatic(res, pathname)) return;

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
        console.log(`Docs:       ${base}/docs`);
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
