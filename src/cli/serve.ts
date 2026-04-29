import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { LightRunClient } from '../runner/index.js';
import { createServer } from '../server/index.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag, loadWorkflowsFromDir, wantsHelp } from './utils.js';

const RUNNER_BIN = 'light-run';
const RUNNER_PKG = '@enixcode/light-run';
const HEALTH_TIMEOUT_MS = 15_000;
const HEALTH_INTERVAL_MS = 200;

export const serve: Command = {
  desc: 'Start the REST API server',
  usage: 'light serve [dir] [--port 3000]',
  async run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light serve [dir] [options]

Options:
  --port <number>          Port to listen on (default: 3000)
  --runner-port <number>   Port for the auto-spawned light-run (default: 3001)
  --install                Auto install ${RUNNER_PKG} if missing (only when LIGHT_RUN_URL unset)

Environment:
  LP_API_KEY        Enable API key authentication
  LIGHT_RUN_URL     URL of the light-run service. If unset, a local light-run is auto-spawned.
  LIGHT_RUN_TOKEN   Bearer token for light-run (optional)

Examples:
  light serve
  light serve --port 8080
  light serve --install
  LP_API_KEY=secret light serve`);
      return;
    }

    const dir = getPositional(0) || '.';
    const port = parseInt(getFlagValue('--port', '3000'), 10);
    const apiKey = process.env.LP_API_KEY;
    if (!apiKey) {
      console.log('  No LP_API_KEY set - auth disabled');
    }

    if (!process.env.LIGHT_RUN_URL) {
      await bootstrapRunner();
    }

    const runner = new LightRunClient();

    const app = createServer({ port, runner, apiKey, persistDir: resolve(dir) });

    const workflows = loadWorkflowsFromDir(dir);
    for (const wf of workflows) {
      app.registerWorkflow(wf);
      console.log(`  Loaded workflow: ${wf.name} (${wf.id})`);
    }

    if (workflows.length === 0) {
      console.log('  No workflows found. Register via POST /api/workflows.');
    }

    await app.listen();
  },
};

async function bootstrapRunner(): Promise<void> {
  const runnerPort = parseInt(getFlagValue('--runner-port', '3001'), 10);
  const installFlag = hasFlag('--install');

  const installed = await isRunnerInstalled();
  if (!installed) {
    if (!installFlag) {
      console.error(`${RUNNER_BIN} not installed. Run: npm i -g ${RUNNER_PKG}    (or: light serve --install)`);
      process.exit(1);
    }
    console.log(`  Installing ${RUNNER_PKG}...`);
    const result = spawnSync('npm', ['i', '-g', RUNNER_PKG], { stdio: 'inherit', shell: true });
    if (result.status !== 0) {
      console.error('npm install failed');
      process.exit(1);
    }
  }

  const token = randomBytes(16).toString('hex');
  const args = ['serve', '--token', token, '--port', String(runnerPort)];
  const child = spawnRunner(RUNNER_BIN, args, ['ignore', 'pipe', 'pipe']);

  const stderrBuffer: string[] = [];
  pipeLines(child.stdout, (line) => process.stdout.write(`[runner] ${line}\n`));
  pipeLines(child.stderr, (line) => {
    stderrBuffer.push(line);
    if (stderrBuffer.length > 50) stderrBuffer.shift();
    process.stderr.write(`[runner] ${line}\n`);
  });

  registerCleanup(child);

  try {
    await waitForHealth(runnerPort);
  } catch (err) {
    child.kill('SIGTERM');
    const detail = stderrBuffer.length ? `\nRunner stderr:\n${stderrBuffer.join('\n')}` : '';
    console.error(`  Failed to start light-run on port ${runnerPort}: ${(err as Error).message}${detail}`);
    process.exit(1);
  }

  process.env.LIGHT_RUN_URL = `http://localhost:${runnerPort}`;
  process.env.LIGHT_RUN_TOKEN = token;
  console.log(`  light-run ready on http://localhost:${runnerPort}`);
}

function isRunnerInstalled(): Promise<boolean> {
  return new Promise((resolveP) => {
    const probe = spawnRunner(RUNNER_BIN, ['--help'], 'ignore');
    probe.on('error', (err) => {
      resolveP((err as NodeJS.ErrnoException).code !== 'ENOENT');
    });
    probe.on('exit', (code) => resolveP(code === 0));
  });
}

function spawnRunner(bin: string, args: string[], stdio: 'ignore' | ('ignore' | 'pipe')[]): ChildProcess {
  if (process.platform === 'win32') {
    const cmd = [bin, ...args].join(' ');
    return spawn(cmd, { stdio, shell: true });
  }
  return spawn(bin, args, { stdio });
}

function pipeLines(stream: NodeJS.ReadableStream | null, onLine: (line: string) => void): void {
  if (!stream) return;
  let partial = '';
  stream.setEncoding('utf-8');
  stream.on('data', (chunk: string) => {
    const lines = (partial + chunk).split('\n');
    partial = lines.pop() ?? '';
    for (const line of lines) onLine(line);
  });
  stream.on('end', () => {
    if (partial) onLine(partial);
  });
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  const url = `http://localhost:${port}/health`;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastErr = err;
    }
    await sleep(HEALTH_INTERVAL_MS);
  }
  throw new Error(
    `health check timed out after ${HEALTH_TIMEOUT_MS}ms (${(lastErr as Error)?.message ?? 'no response'})`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function registerCleanup(child: ChildProcess): void {
  let killing = false;
  const kill = () => {
    if (killing || child.killed) return;
    killing = true;
    child.kill('SIGTERM');
    setTimeout(() => {
      if (!child.killed) child.kill('SIGKILL');
    }, 2000).unref();
  };

  process.on('SIGINT', () => {
    kill();
    setTimeout(() => process.exit(130), 2100).unref();
  });
  process.on('SIGTERM', () => {
    kill();
    setTimeout(() => process.exit(143), 2100).unref();
  });
  process.on('exit', kill);

  child.on('exit', (code, signal) => {
    if (!killing) {
      console.error(`[runner] light-run exited unexpectedly (code=${code}, signal=${signal})`);
      process.exit(1);
    }
  });
}
