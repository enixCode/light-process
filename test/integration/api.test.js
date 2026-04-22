import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';

import { Node } from '../../dist/models/Node.js';
import { createServer } from '../../dist/server.js';
import { Workflow } from '../../dist/Workflow.js';

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

describe('REST API server', () => {
  let app;
  let port;

  before(async () => {
    app = createServer({ port: 0, host: '127.0.0.1' });
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

  describe('GET /health', () => {
    it('returns { status: "ok" }', async () => {
      const res = await request(port, 'GET', '/health');
      assert.equal(res.status, 200);
      const data = res.json();
      assert.equal(data.status, 'ok');
      assert.ok(data.version);
    });
  });

  describe('GET /api/workflows (empty)', () => {
    it('returns empty array when no workflows registered', async () => {
      const res = await request(port, 'GET', '/api/workflows');
      assert.equal(res.status, 200);
      const list = res.json();
      assert.ok(Array.isArray(list));
      assert.equal(list.length, 0);
    });
  });

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

    it('GET /api/workflows/:id?full=true returns full workflow JSON', async () => {
      const res = await request(port, 'GET', '/api/workflows/test-wf?full=true');
      assert.equal(res.status, 200);
      const wf = res.json();
      assert.equal(wf.id, 'test-wf');
      assert.ok(Array.isArray(wf.nodes));
      assert.equal(wf.nodes[0].files['index.js'], 'console.log("ok")');
    });

    it('GET /api/workflows/nonexistent returns 404', async () => {
      const res = await request(port, 'GET', '/api/workflows/nonexistent');
      assert.equal(res.status, 404);
      const data = res.json();
      assert.ok(data.error);
    });
  });

  describe('POST /api/workflows', () => {
    it('creates a workflow from JSON body', async () => {
      const body = {
        id: 'wf-create',
        name: 'Created',
        nodes: [
          {
            id: 'n1',
            name: 'N1',
            image: 'node:20-alpine',
            entrypoint: 'node index.js',
            files: { 'index.js': 'console.log(1)' },
          },
        ],
        links: [],
      };
      const res = await request(port, 'POST', '/api/workflows', body);
      assert.equal(res.status, 201);
      const data = res.json();
      assert.equal(data.id, 'wf-create');
      assert.equal(data.persisted, false);
    });

    it('rejects duplicate id with 409', async () => {
      const body = {
        id: 'wf-create',
        name: 'Dup',
        nodes: [
          {
            id: 'n1',
            name: 'N1',
            image: 'node:20-alpine',
            entrypoint: 'node index.js',
            files: { 'index.js': 'console.log(1)' },
          },
        ],
        links: [],
      };
      const res = await request(port, 'POST', '/api/workflows', body);
      assert.equal(res.status, 409);
    });

    it('rejects invalid JSON with 400', async () => {
      const res = await new Promise((resolve, reject) => {
        const opts = {
          hostname: '127.0.0.1',
          port,
          path: '/api/workflows',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        };
        const req = http.request(opts, (httpRes) => {
          const chunks = [];
          httpRes.on('data', (c) => chunks.push(c));
          httpRes.on('end', () => {
            resolve({ status: httpRes.statusCode });
          });
        });
        req.on('error', reject);
        req.write('not json{{{');
        req.end();
      });
      assert.equal(res.status, 400);
    });
  });

  describe('DELETE /api/workflows/:id', () => {
    it('deletes a registered workflow', async () => {
      const res = await request(port, 'DELETE', '/api/workflows/wf-create');
      assert.equal(res.status, 200);
      const data = res.json();
      assert.equal(data.deleted, true);
      assert.equal(data.id, 'wf-create');
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(port, 'DELETE', '/api/workflows/wf-create');
      assert.equal(res.status, 404);
    });
  });

  describe('GET /nonexistent', () => {
    it('returns 404', async () => {
      const res = await request(port, 'GET', '/nonexistent');
      assert.equal(res.status, 404);
      const data = res.json();
      assert.ok(data.error);
    });
  });

  describe('CORS', () => {
    it('OPTIONS returns 204', async () => {
      const res = await request(port, 'OPTIONS', '/');
      assert.equal(res.status, 204);
    });

    it('includes Access-Control-Allow-Origin on responses', async () => {
      const res = await request(port, 'GET', '/health');
      assert.equal(res.headers['access-control-allow-origin'], '*');
      assert.ok(res.headers['access-control-allow-methods']);
      assert.ok(res.headers['access-control-allow-headers']);
    });
  });

  describe('GET /', () => {
    it('serves the embedded HTML UI', async () => {
      const res = await request(port, 'GET', '/');
      assert.equal(res.status, 200);
      assert.ok(res.headers['content-type'].includes('text/html'));
      assert.ok(res.body.includes('<!DOCTYPE'));
      assert.ok(res.body.includes('Light Process'));
    });
  });

  describe('GET /api/runs', () => {
    it('returns empty array when no runs yet', async () => {
      const res = await request(port, 'GET', '/api/runs');
      assert.equal(res.status, 200);
      const list = res.json();
      assert.ok(Array.isArray(list));
    });

    it('accepts limit, workflowId, and status filters', async () => {
      const res = await request(port, 'GET', '/api/runs?limit=5&status=running');
      assert.equal(res.status, 200);
      const list = res.json();
      assert.ok(Array.isArray(list));
    });
  });

  describe('GET /api/runs/:id', () => {
    it('returns 404 for unknown run', async () => {
      const res = await request(port, 'GET', '/api/runs/unknown-run-id');
      assert.equal(res.status, 404);
    });
  });
});

describe('REST API server with auth', () => {
  let app;
  let port;
  const apiKey = 'secret-123';

  before(async () => {
    app = createServer({ port: 0, host: '127.0.0.1', apiKey });
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

  it('rejects protected routes without token', async () => {
    const res = await request(port, 'GET', '/api/workflows');
    assert.equal(res.status, 401);
  });

  it('accepts protected routes with correct token', async () => {
    const res = await new Promise((resolve, reject) => {
      const opts = {
        hostname: '127.0.0.1',
        port,
        path: '/api/workflows',
        method: 'GET',
        headers: { Authorization: `Bearer ${apiKey}` },
      };
      const req = http.request(opts, (httpRes) => {
        const chunks = [];
        httpRes.on('data', (c) => chunks.push(c));
        httpRes.on('end', () => {
          resolve({ status: httpRes.statusCode });
        });
      });
      req.on('error', reject);
      req.end();
    });
    assert.equal(res.status, 200);
  });

  it('allows /health without token', async () => {
    const res = await request(port, 'GET', '/health');
    assert.equal(res.status, 200);
  });
});
