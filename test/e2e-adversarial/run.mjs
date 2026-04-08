#!/usr/bin/env node
// Adversarial e2e test suite for light-process.
// Spins up a local container (already started externally) and runs every
// public surface against it. Fails loudly on the first discrepancy.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = process.env.LP_TEST_URL || 'http://localhost:4141';
const KEY = process.env.LP_TEST_KEY || 'test-key-adversarial';
const LIGHT = process.env.LP_TEST_BIN || 'node dist/cli.js';

let pass = 0;
let fail = 0;
const failures = [];

function section(name) {
  console.log(`\n== ${name} ==`);
}

async function t(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    pass++;
  } catch (err) {
    console.log(`  FAIL  ${name}\n        ${err.message}`);
    fail++;
    failures.push({ name, err: err.message });
  }
}

function assertEq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${msg ?? 'assertEq'}: expected ${e}, got ${a}`);
}

function assertTrue(cond, msg) {
  if (!cond) throw new Error(msg ?? 'assertTrue failed');
}

async function httpReq(method, path, { body, auth = true, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (auth) h.Authorization = `Bearer ${KEY}`;
  const res = await fetch(BASE + path, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

function cli(args, { cwd, env } = {}) {
  const [bin, ...rest] = LIGHT.split(' ');
  const finalArgs = [...rest, ...args];
  const res = spawnSync(bin, finalArgs, {
    cwd,
    env: { ...process.env, ...(env ?? {}) },
    encoding: 'utf-8',
  });
  return { code: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

// --- Setup sandbox dir
const SANDBOX = mkdtempSync(join(tmpdir(), 'lp-e2e-'));
console.log(`Sandbox: ${SANDBOX}`);

// Point the CLI config at an isolated home so we never touch the real ~/.light
const FAKE_HOME = join(SANDBOX, 'home');
mkdirSync(FAKE_HOME, { recursive: true });
process.env.HOME = FAKE_HOME;
process.env.USERPROFILE = FAKE_HOME;

function cleanup() {
  try {
    rmSync(SANDBOX, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

// --- Main
(async () => {
  section('Health + discovery');
  await t('GET /health', async () => {
    const r = await httpReq('GET', '/health', { auth: false });
    assertEq(r.status, 200);
    assertEq(r.body.status, 'ok');
  });

  await t('GET /.well-known/agent-card.json is public', async () => {
    const r = await httpReq('GET', '/.well-known/agent-card.json', { auth: false });
    assertEq(r.status, 200);
    assertTrue(r.body && typeof r.body === 'object', 'agent card not object');
  });

  section('Auth');
  await t('POST /api/workflows without token -> 401', async () => {
    const r = await httpReq('POST', '/api/workflows', { auth: false, body: { foo: 1 } });
    assertEq(r.status, 401);
  });

  await t('POST /api/workflows with bad token -> 401', async () => {
    const r = await httpReq('POST', '/api/workflows', {
      auth: false,
      headers: { Authorization: 'Bearer wrong' },
      body: { foo: 1 },
    });
    assertEq(r.status, 401);
  });

  await t('GET /api/workflows with valid token -> 200', async () => {
    const r = await httpReq('GET', '/api/workflows');
    assertEq(r.status, 200);
    assertTrue(Array.isArray(r.body), 'not an array');
  });

  section('Workflow CRUD (in-memory)');
  const wfA = {
    id: 'e2e-a',
    name: 'E2E A',
    network: null,
    nodes: [
      {
        id: 'n1',
        name: 'n1',
        type: 'docker',
        inputs: null,
        outputs: null,
        files: { 'index.js': 'console.log("hi")' },
        image: 'node:20-alpine',
        setup: [],
        entrypoint: 'node index.js',
        workdir: '/app',
        timeout: 0,
        network: null,
      },
    ],
    links: [],
  };

  await t('POST /api/workflows -> 201', async () => {
    const r = await httpReq('POST', '/api/workflows', { body: wfA });
    assertEq(r.status, 201);
    assertEq(r.body.id, 'e2e-a');
    assertEq(r.body.persisted, false);
  });

  await t('POST duplicate -> 409', async () => {
    const r = await httpReq('POST', '/api/workflows', { body: wfA });
    assertEq(r.status, 409);
  });

  await t('GET /api/workflows/e2e-a (summary)', async () => {
    const r = await httpReq('GET', '/api/workflows/e2e-a');
    assertEq(r.status, 200);
    assertEq(r.body.id, 'e2e-a');
    assertTrue(Array.isArray(r.body.nodes), 'nodes not array');
  });

  await t('GET /api/workflows/e2e-a?full=true', async () => {
    const r = await httpReq('GET', '/api/workflows/e2e-a?full=true');
    assertEq(r.status, 200);
    assertEq(r.body.id, 'e2e-a');
    assertTrue(r.body.nodes[0].files, 'files missing in full view');
  });

  await t('PUT with id mismatch -> 400', async () => {
    const r = await httpReq('PUT', '/api/workflows/e2e-a', { body: { ...wfA, id: 'other' } });
    assertEq(r.status, 400);
  });

  await t('PUT valid -> 200 updated', async () => {
    const r = await httpReq('PUT', '/api/workflows/e2e-a', { body: { ...wfA, name: 'E2E A v2' } });
    assertEq(r.status, 200);
    assertEq(r.body.updated, true);
  });

  await t('PUT on missing id -> 404', async () => {
    const r = await httpReq('PUT', '/api/workflows/does-not-exist', { body: { ...wfA, id: 'does-not-exist' } });
    assertEq(r.status, 404);
  });

  await t('DELETE -> 200', async () => {
    const r = await httpReq('DELETE', '/api/workflows/e2e-a');
    assertEq(r.status, 200);
    assertEq(r.body.deleted, true);
  });

  await t('DELETE unknown -> 404', async () => {
    const r = await httpReq('DELETE', '/api/workflows/e2e-a');
    assertEq(r.status, 404);
  });

  section('Persistence flag');
  await t('POST ?persist=true returns persisted:true', async () => {
    const r = await httpReq('POST', '/api/workflows?persist=true', { body: { ...wfA, id: 'e2e-persist' } });
    assertEq(r.status, 201);
    assertEq(r.body.persisted, true);
  });

  await t('DELETE ?persist=true returns unpersisted:true', async () => {
    const r = await httpReq('DELETE', '/api/workflows/e2e-persist?persist=true');
    assertEq(r.status, 200);
    assertEq(r.body.unpersisted, true);
  });

  section('CLI: light config + remote');
  await t('light config list empty returns default shape', () => {
    const r = cli(['config', 'list']);
    assertEq(r.code, 0, `stderr: ${r.stderr}`);
    const cfg = JSON.parse(r.stdout);
    assertTrue('remotes' in cfg, 'no remotes field');
  });

  await t('light remote bind', () => {
    const r = cli(['remote', 'bind', BASE, '--key', KEY, '--name', 'local']);
    assertEq(r.code, 0, `stderr: ${r.stderr}`);
    assertTrue(r.stdout.includes('Bound remote'), r.stdout);
  });

  await t('light remote list shows default marker', () => {
    const r = cli(['remote', 'list']);
    assertEq(r.code, 0, r.stderr);
    assertTrue(r.stdout.includes('local'), r.stdout);
    assertTrue(r.stdout.includes('*'), 'no default marker');
  });

  await t('light remote ping', () => {
    const r = cli(['remote', 'ping']);
    assertEq(r.code, 0, r.stderr);
    assertTrue(r.stdout.includes('ok'), r.stdout);
  });

  section('CLI: light push + pull round-trip');
  const wfDir = join(SANDBOX, 'workflows', 'e2e-rt');
  mkdirSync(join(wfDir, 'n1'), { recursive: true });
  writeFileSync(
    join(wfDir, 'workflow.json'),
    JSON.stringify({
      id: 'e2e-rt',
      name: 'E2E RT',
      network: null,
      nodes: [{ id: 'n1', name: 'n1', dir: 'n1' }],
      links: [],
    }),
  );
  writeFileSync(
    join(wfDir, 'n1', '.node.json'),
    JSON.stringify({
      id: 'n1',
      name: 'n1',
      type: 'docker',
      image: 'node:20-alpine',
      entrypoint: 'node index.js',
      setup: [],
      timeout: 0,
      network: null,
      inputs: null,
      outputs: null,
    }),
  );
  writeFileSync(join(wfDir, 'n1', 'index.js'), 'console.log("rt")');

  await t('light push <dir>', () => {
    const r = cli(['push', '--path', wfDir, '--yes']);
    assertEq(r.code, 0, r.stderr);
    assertTrue(r.stdout.includes('Created') || r.stdout.includes('Updated'), r.stdout);
  });

  await t('light push same dir again -> PUT (update)', () => {
    const r = cli(['push', '--path', wfDir, '--yes']);
    assertEq(r.code, 0, r.stderr);
    assertTrue(r.stdout.includes('Updated'), r.stdout);
  });

  const pullDir = join(SANDBOX, 'pulled');
  await t('light pull <id> --path', () => {
    const r = cli(['pull', 'e2e-rt', '--path', pullDir]);
    assertEq(r.code, 0, r.stderr);
    assertTrue(existsSync(join(pullDir, 'workflow.json')), 'workflow.json missing');
    assertTrue(existsSync(join(pullDir, 'n1', '.node.json')), '.node.json missing');
  });

  await t('light pull existing without --force -> error', () => {
    const r = cli(['pull', 'e2e-rt', '--path', pullDir]);
    assertTrue(r.code !== 0, 'expected failure');
  });

  await t('light pull existing with --force', () => {
    const r = cli(['pull', 'e2e-rt', '--path', pullDir, '--force']);
    assertEq(r.code, 0, r.stderr);
  });

  section('CLI: light remote delete');
  await t('light remote delete <id> --yes', () => {
    const r = cli(['remote', 'delete', 'e2e-rt', '--yes']);
    assertEq(r.code, 0, r.stderr);
  });

  section('Secrets L1 (Node.env validation)');
  await t('POST with env LP_FOO -> 400 (reserved)', async () => {
    const bad = {
      ...wfA,
      id: 'e2e-reserved',
      nodes: [{ ...wfA.nodes[0], env: ['LP_FOO'] }],
    };
    const r = await httpReq('POST', '/api/workflows', { body: bad });
    assertEq(r.status, 400);
  });

  await t('POST with env lowercase -> 400', async () => {
    const bad = {
      ...wfA,
      id: 'e2e-bad-name',
      nodes: [{ ...wfA.nodes[0], env: ['foo-bar'] }],
    };
    const r = await httpReq('POST', '/api/workflows', { body: bad });
    assertEq(r.status, 400);
  });

  await t('POST with env OPENAI_KEY -> 201', async () => {
    const good = {
      ...wfA,
      id: 'e2e-good-env',
      nodes: [{ ...wfA.nodes[0], env: ['OPENAI_KEY'] }],
    };
    const r = await httpReq('POST', '/api/workflows', { body: good });
    assertEq(r.status, 201);
    // cleanup
    await httpReq('DELETE', '/api/workflows/e2e-good-env');
  });

  section('CLI: light link inline');
  const linkDir = join(SANDBOX, 'workflows', 'e2e-link');
  mkdirSync(join(linkDir, 'a'), { recursive: true });
  mkdirSync(join(linkDir, 'b'), { recursive: true });
  writeFileSync(
    join(linkDir, 'workflow.json'),
    JSON.stringify({
      id: 'e2e-link',
      name: 'E2E Link',
      nodes: [
        { id: 'a', name: 'a', dir: 'a' },
        { id: 'b', name: 'b', dir: 'b' },
      ],
      links: [],
    }),
  );
  writeFileSync(
    join(linkDir, 'a', '.node.json'),
    JSON.stringify({ id: 'a', name: 'a', image: 'node:20-alpine', entrypoint: 'node index.js' }),
  );
  writeFileSync(
    join(linkDir, 'b', '.node.json'),
    JSON.stringify({ id: 'b', name: 'b', image: 'node:20-alpine', entrypoint: 'node index.js' }),
  );
  writeFileSync(join(linkDir, 'a', 'index.js'), '');
  writeFileSync(join(linkDir, 'b', 'index.js'), '');

  await t('light link inline add', () => {
    const r = cli(['link', linkDir, '--from', 'a', '--to', 'b', '--when', '{"status":"ok"}']);
    assertEq(r.code, 0, r.stderr);
    const meta = JSON.parse(readFileSync(join(linkDir, 'workflow.json'), 'utf-8'));
    assertEq(meta.links.length, 1);
    assertEq(meta.links[0].from, 'a');
  });

  await t('light link --list', () => {
    const r = cli(['link', linkDir, '--list']);
    assertEq(r.code, 0, r.stderr);
    assertTrue(r.stdout.includes('a -> b'), r.stdout);
  });

  // --- Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total: ${pass + fail}   PASS: ${pass}   FAIL: ${fail}`);
  if (fail > 0) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.err}`);
  }
  cleanup();
  process.exit(fail > 0 ? 1 : 0);
})().catch((err) => {
  console.error('Test runner crashed:', err);
  cleanup();
  process.exit(2);
});
