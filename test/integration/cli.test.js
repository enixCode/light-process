import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const CLI = 'node';
const CLI_PATH = join(import.meta.dirname, '..', '..', 'dist', 'cli.js');
const PKG_PATH = join(import.meta.dirname, '..', '..', 'package.json');
const PKG = JSON.parse(readFileSync(PKG_PATH, 'utf-8'));

function run(...args) {
  return exec(CLI, [CLI_PATH, ...args], { timeout: 15_000 });
}

function _runIn(cwd, ...args) {
  return exec(CLI, [CLI_PATH, ...args], { cwd, timeout: 15_000 });
}

function makeTmpDir() {
  const dir = join(tmpdir(), `lp-cli-test-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// -------------------------------------------------------------------
// light --version
// -------------------------------------------------------------------
describe('CLI: --version', () => {
  it('outputs version matching package.json', async () => {
    const { stdout } = await run('--version');
    assert.ok(stdout.includes(PKG.version), `Expected version ${PKG.version} in: ${stdout}`);
    assert.match(stdout.trim(), /^light-process v\d+\.\d+\.\d+/);
  });
});

// -------------------------------------------------------------------
// light help
// -------------------------------------------------------------------
describe('CLI: help', () => {
  it('outputs command list', async () => {
    const { stdout } = await run('help');
    assert.ok(stdout.includes('Commands:'));
    assert.ok(stdout.includes('run'));
    assert.ok(stdout.includes('init'));
    assert.ok(stdout.includes('check'));
    assert.ok(stdout.includes('describe'));
    assert.ok(stdout.includes('doctor'));
    assert.ok(stdout.includes('serve'));
  });
});

// -------------------------------------------------------------------
// light doctor
// -------------------------------------------------------------------
describe('CLI: doctor', () => {
  it('outputs check results and exits 0 (may have optional fails)', async () => {
    // doctor exits 1 if required deps missing (Docker), so we handle both
    try {
      const { stdout } = await run('doctor');
      assert.ok(stdout.includes('Checking environment'));
      assert.ok(stdout.includes('Node.js'));
    } catch (err) {
      // exit code 1 means Docker is not available - that is fine
      assert.ok(err.stdout.includes('Checking environment'));
      assert.ok(err.stdout.includes('Node.js'));
    }
  });
});

// -------------------------------------------------------------------
// light init (workflow project)
// -------------------------------------------------------------------
describe('CLI: init (workflow project)', () => {
  let tmpDir;

  before(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates expected files: package.json, example/, main.js', async () => {
    const initDir = join(tmpDir, 'my-project');
    await run('init', initDir);

    assert.ok(existsSync(join(initDir, 'package.json')), 'package.json should exist');
    assert.ok(existsSync(join(initDir, 'example')), 'example/ should exist');
    assert.ok(existsSync(join(initDir, 'main.js')), 'main.js should exist');
    assert.ok(existsSync(join(initDir, 'example', 'workflow.json')), 'workflow.json should exist');
    assert.ok(existsSync(join(initDir, 'example', 'hello', '.node.json')), '.node.json should exist');
    assert.ok(existsSync(join(initDir, 'example', 'hello', 'index.js')), 'index.js should exist');

    // Validate package.json content
    const pkg = JSON.parse(readFileSync(join(initDir, 'package.json'), 'utf-8'));
    assert.equal(pkg.type, 'module');
    assert.ok(pkg.dependencies['light-process']);
  });
});

// -------------------------------------------------------------------
// light init --node
// -------------------------------------------------------------------
describe('CLI: init --node', () => {
  let tmpDir;

  before(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates .node.json, index.js, lp.js, lp.py, input.json', async () => {
    const nodeDir = join(tmpDir, 'my-node');
    await run('init', nodeDir, '--node', '--verbose');

    assert.ok(existsSync(join(nodeDir, '.node.json')), '.node.json should exist');
    assert.ok(existsSync(join(nodeDir, 'index.js')), 'index.js should exist');
    assert.ok(existsSync(join(nodeDir, 'lp.js')), 'lp.js should exist');
    assert.ok(existsSync(join(nodeDir, 'lp.py')), 'lp.py should exist');
    assert.ok(existsSync(join(nodeDir, 'input.json')), 'input.json should exist');

    // Validate .node.json content
    const nodeJson = JSON.parse(readFileSync(join(nodeDir, '.node.json'), 'utf-8'));
    assert.equal(nodeJson.image, 'node:20-alpine');
    assert.equal(nodeJson.entrypoint, 'node index.js');
  });
});

// -------------------------------------------------------------------
// light init --node --lang python
// -------------------------------------------------------------------
describe('CLI: init --node --lang python', () => {
  let tmpDir;

  before(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('creates main.py instead of index.js', async () => {
    const nodeDir = join(tmpDir, 'py-node');
    await run('init', nodeDir, '--node', '--lang', 'python');

    assert.ok(existsSync(join(nodeDir, '.node.json')), '.node.json should exist');
    assert.ok(existsSync(join(nodeDir, 'main.py')), 'main.py should exist');
    assert.ok(!existsSync(join(nodeDir, 'index.js')), 'index.js should NOT exist');

    const nodeJson = JSON.parse(readFileSync(join(nodeDir, '.node.json'), 'utf-8'));
    assert.equal(nodeJson.image, 'python:3.12-alpine');
    assert.equal(nodeJson.entrypoint, 'python main.py');
  });
});

// -------------------------------------------------------------------
// light check on init'd workflow
// -------------------------------------------------------------------
describe('CLI: check', () => {
  let tmpDir;

  before(async () => {
    tmpDir = makeTmpDir();
    const projectDir = join(tmpDir, 'check-project');
    await run('init', projectDir);
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('exits 0 with all checks passing on init workflow', async () => {
    const workflowDir = join(tmpDir, 'check-project', 'example');
    const { stdout } = await run('check', workflowDir);
    assert.ok(stdout.includes('[ok]'), 'Should have passing checks');
    assert.ok(stdout.includes('checks passed'), 'Should report checks passed');
  });
});

// -------------------------------------------------------------------
// light describe on init'd workflow
// -------------------------------------------------------------------
describe('CLI: describe', () => {
  let tmpDir;

  before(async () => {
    tmpDir = makeTmpDir();
    const projectDir = join(tmpDir, 'describe-project');
    await run('init', projectDir);
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('outputs node info', async () => {
    const workflowDir = join(tmpDir, 'describe-project', 'example');
    const { stdout } = await run('describe', workflowDir, '--no-html');
    assert.ok(stdout.includes('Example'), 'Should contain workflow name');
    assert.ok(stdout.includes('Hello'), 'Should contain node name');
    assert.ok(stdout.includes('1 nodes'), 'Should report node count');
  });
});

// -------------------------------------------------------------------
// light run (Docker-dependent - skip if not available)
// -------------------------------------------------------------------
describe('CLI: run', () => {
  let tmpDir;
  let dockerAvailable = false;

  before(async () => {
    tmpDir = makeTmpDir();
    const projectDir = join(tmpDir, 'run-project');
    await run('init', projectDir);

    // Check Docker availability
    try {
      await exec('docker', ['--version'], { timeout: 5000 });
      const info = await exec('docker', ['info'], { timeout: 10_000 }).catch(() => null);
      dockerAvailable = !!info;
    } catch {
      dockerAvailable = false;
    }
  });

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('executes workflow successfully', {
    skip: !dockerAvailable ? 'Docker not available' : false,
    timeout: 60_000,
  }, async () => {
    const workflowDir = join(tmpDir, 'run-project', 'example');
    const { stdout } = await exec(CLI, [CLI_PATH, 'run', workflowDir], { timeout: 60_000 });
    assert.ok(stdout.includes('Running:'), 'Should show running message');
    assert.ok(stdout.includes('[ok]'), 'Should show success');
  });

  it('outputs valid JSON with --json', {
    skip: !dockerAvailable ? 'Docker not available' : false,
    timeout: 60_000,
  }, async () => {
    const workflowDir = join(tmpDir, 'run-project', 'example');
    const { stdout } = await exec(CLI, [CLI_PATH, 'run', workflowDir, '--json'], { timeout: 60_000 });
    const result = JSON.parse(stdout);
    assert.equal(typeof result.success, 'boolean');
    assert.equal(typeof result.duration, 'number');
    assert.ok(result.workflowId);
    assert.ok(result.results);
  });

  it('passes input correctly with --input', {
    skip: !dockerAvailable ? 'Docker not available' : false,
    timeout: 60_000,
  }, async () => {
    const workflowDir = join(tmpDir, 'run-project', 'example');
    const { stdout } = await exec(CLI, [CLI_PATH, 'run', workflowDir, '--json', '--input', '{"name":"test"}'], {
      timeout: 60_000,
    });
    const result = JSON.parse(stdout);
    assert.equal(typeof result.success, 'boolean');
    assert.ok(result.results);
  });

  it('runs single node with --node', {
    skip: !dockerAvailable ? 'Docker not available' : false,
    timeout: 60_000,
  }, async () => {
    const nodeDir = join(tmpDir, 'run-project', 'example', 'hello');
    const { stdout } = await exec(CLI, [CLI_PATH, 'run', '--node', nodeDir, '--json'], { timeout: 60_000 });
    const result = JSON.parse(stdout);
    assert.equal(typeof result.success, 'boolean');
  });
});

// -------------------------------------------------------------------
// Unknown command
// -------------------------------------------------------------------
describe('CLI: unknown command', () => {
  it('exits non-zero for unknown command', async () => {
    try {
      await run('nonexistent-command');
      assert.fail('Should have exited non-zero');
    } catch (err) {
      assert.ok(err.code !== 0 || err.killed, 'Should exit with non-zero code');
      assert.ok(err.stderr.includes('Unknown command'), 'Should say unknown command');
    }
  });
});
