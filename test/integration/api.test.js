import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { createA2AServer } from '../../dist/a2a/index.js';
import { Node } from '../../dist/models/Node.js';
import { Workflow } from '../../dist/Workflow.js';

// --- helpers ---

function makeTestWorkflow(id = 'test-wf', name = 'Test Workflow') {
  const node = new Node({
    id: 'node-1',
    name: 'Step One',
    image: 'node:20-alpine',
    entrypoint: 'node index.js',
    files: { 'index.js': 'console.log("ok")' },
  });
  const wf = new Workflow({ id, name });
  wf.addNode(node);
  return wf;
}

function request(port, method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: raw,
          json() {
            return JSON.parse(raw);
          },
        });
      });
    });
    req.on('error', reject);
    if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// --- test suite ---

describe('A2A Server API', () => {
  let app;
  let port;

  before(async () => {
    // Use port 0 so the OS assigns a random free port
    app = createA2AServer({ port: 0, host: '127.0.0.1' });
    await new Promise((resolve) => {
      app.server.listen(0, '127.0.0.1', () => {
        port = app.server.address().port;
        resolve();
      });
    });
  });

  after(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------
  describe('GET /health', () => {
    it('returns { status: "ok" }', async () => {
      const res = await request(port, 'GET', '/health');
      assert.equal(res.status, 200);
      const data = res.json();
      assert.equal(data.status, 'ok');
    });
  });

  // ---------------------------------------------------------------
  // Agent card
  // ---------------------------------------------------------------
  describe('GET /.well-known/agent-card.json', () => {
    it('returns valid agent card with expected fields', async () => {
      const res = await request(port, 'GET', '/.well-known/agent-card.json');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('application/json'));
      const card = res.json();
      assert.ok(card.name);
      assert.ok(card.url);
      assert.ok(card.protocolVersion);
      assert.ok(card.capabilities);
    });
  });

  // ---------------------------------------------------------------
  // Dashboard (HTML)
  // ---------------------------------------------------------------
  describe('GET /', () => {
    it('returns HTML', async () => {
      const res = await request(port, 'GET', '/');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/html'));
      assert.ok(res.body.includes('<html') || res.body.includes('<!DOCTYPE'));
    });
  });

  // ---------------------------------------------------------------
  // PWA manifest
  // ---------------------------------------------------------------
  describe('GET /manifest.json', () => {
    it('returns valid JSON manifest', async () => {
      const res = await request(port, 'GET', '/manifest.json');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('json'));
      const manifest = res.json();
      assert.ok(manifest.name || manifest.short_name);
    });
  });

  // ---------------------------------------------------------------
  // Service worker
  // ---------------------------------------------------------------
  describe('GET /sw.js', () => {
    it('returns JavaScript', async () => {
      const res = await request(port, 'GET', '/sw.js');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('javascript'));
    });
  });

  // ---------------------------------------------------------------
  // Workflows list - empty
  // ---------------------------------------------------------------
  describe('GET /api/workflows (empty)', () => {
    it('returns empty array when no workflows registered', async () => {
      const res = await request(port, 'GET', '/api/workflows');
      assert.equal(res.status, 200);
      const list = res.json();
      assert.ok(Array.isArray(list));
      assert.equal(list.length, 0);
    });
  });

  // ---------------------------------------------------------------
  // Register + list workflows
  // ---------------------------------------------------------------
  describe('Workflow registration and retrieval', () => {
    before(() => {
      app.registerWorkflow(makeTestWorkflow());
    });

    it('GET /api/workflows returns array with 1 item', async () => {
      const res = await request(port, 'GET', '/api/workflows');
      assert.equal(res.status, 200);
      const list = res.json();
      assert.ok(Array.isArray(list));
      assert.equal(list.length, 1);
      assert.equal(list[0].id, 'test-wf');
      assert.equal(list[0].name, 'Test Workflow');
      assert.equal(list[0].nodeCount, 1);
      assert.equal(list[0].linkCount, 0);
      assert.ok(Array.isArray(list[0].entryNodes));
    });

    it('GET /api/workflows/:id returns workflow detail with nodes and links', async () => {
      const res = await request(port, 'GET', '/api/workflows/test-wf');
      assert.equal(res.status, 200);
      const wf = res.json();
      assert.equal(wf.id, 'test-wf');
      assert.equal(wf.name, 'Test Workflow');
      assert.ok(Array.isArray(wf.nodes));
      assert.equal(wf.nodes.length, 1);
      assert.equal(wf.nodes[0].id, 'node-1');
      assert.equal(wf.nodes[0].name, 'Step One');
      assert.equal(wf.nodes[0].image, 'node:20-alpine');
      assert.ok(Array.isArray(wf.links));
      assert.equal(wf.links.length, 0);
    });

    it('GET /api/workflows/nonexistent returns 404', async () => {
      const res = await request(port, 'GET', '/api/workflows/nonexistent');
      assert.equal(res.status, 404);
      const data = res.json();
      assert.ok(data.error);
    });
  });

  // ---------------------------------------------------------------
  // 404 on unknown route
  // ---------------------------------------------------------------
  describe('GET /nonexistent', () => {
    it('returns 404', async () => {
      const res = await request(port, 'GET', '/nonexistent');
      assert.equal(res.status, 404);
      const data = res.json();
      assert.ok(data.error);
    });
  });

  // ---------------------------------------------------------------
  // CORS preflight
  // ---------------------------------------------------------------
  describe('OPTIONS /', () => {
    it('returns 204', async () => {
      const res = await request(port, 'OPTIONS', '/');
      assert.equal(res.status, 204);
    });
  });

  // ---------------------------------------------------------------
  // CORS headers present
  // ---------------------------------------------------------------
  describe('CORS headers', () => {
    it('includes Access-Control-Allow-Origin on responses', async () => {
      const res = await request(port, 'GET', '/health');
      assert.equal(res.headers['access-control-allow-origin'], '*');
      assert.ok(res.headers['access-control-allow-methods']);
      assert.ok(res.headers['access-control-allow-headers']);
    });
  });

  // ---------------------------------------------------------------
  // POST with invalid JSON
  // ---------------------------------------------------------------
  describe('POST / with invalid JSON', () => {
    it('returns 400', async () => {
      const res = await new Promise((resolve, reject) => {
        const opts = {
          hostname: '127.0.0.1',
          port,
          path: '/',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        };
        const req = http.request(opts, (httpRes) => {
          const chunks = [];
          httpRes.on('data', (c) => chunks.push(c));
          httpRes.on('end', () => {
            const raw = Buffer.concat(chunks).toString();
            resolve({
              status: httpRes.statusCode,
              headers: httpRes.headers,
              body: raw,
              json() {
                return JSON.parse(raw);
              },
            });
          });
        });
        req.on('error', reject);
        req.write('this is not json{{{');
        req.end();
      });
      assert.equal(res.status, 400);
      const data = res.json();
      assert.ok(data.error);
      assert.ok(data.error.includes('Invalid JSON'));
    });
  });

  // ---------------------------------------------------------------
  // POST with valid JSON-RPC but invalid method
  // ---------------------------------------------------------------
  describe('POST / with valid JSON-RPC but unknown method', () => {
    it('returns a JSON-RPC error response', async () => {
      const rpcRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'nonexistent/method',
        params: {},
      };
      const res = await request(port, 'POST', '/', rpcRequest);
      assert.equal(res.status, 200);
      const data = res.json();
      // JSON-RPC error should have error field
      assert.ok(data.error, 'Should contain an error field for unknown method');
    });
  });
});
