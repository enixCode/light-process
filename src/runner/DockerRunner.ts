import { execSync, spawn, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { isPathSafe, safeJsonParse } from '../CodeLoader.js';
import { OUTPUT_FILE } from '../helpers.js';
import type { Node } from '../models/index.js';
import type { NodeExecutionResult } from './Execution.js';
import { Execution } from './Execution.js';

let containerSeq = 0;

const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const MAX_CONTAINER_NAME_LENGTH = 128;
const ISOLATED_NETWORK = 'lp-isolated';

const DANGEROUS_CAPS = ['NET_RAW', 'MKNOD', 'SYS_CHROOT', 'SETPCAP', 'SETFCAP', 'AUDIT_WRITE'];

function toDockerPath(p: string): string {
  if (process.platform !== 'win32') return p;
  return p.replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`).replace(/\\/g, '/');
}

export interface DockerRunnerOptions {
  verbose?: boolean;
  memoryLimit?: string;
  cpuLimit?: string;
  noNewPrivileges?: boolean;
  runtime?: 'runc' | 'runsc' | 'kata';
  gpu?: 'all' | number | string | false;
  tempDir?: string;
  logger?: { info: (obj: unknown, msg?: string) => void };
}

export interface RunNodeOptions {
  signal?: AbortSignal;
  onLog?: (log: string) => void;
}

export class DockerRunner {
  public verbose: boolean;
  public memoryLimit: string | null;
  public cpuLimit: string | null;
  public noNewPrivileges: boolean;
  public runtime: 'runc' | 'runsc' | 'kata';
  public gpu: 'all' | number | string | false;
  public tempDir: string | null;
  private logger: { info: (obj: unknown, msg?: string) => void } | null;
  private networkReady = false;

  constructor(options: DockerRunnerOptions = {}) {
    this.verbose = options.verbose || false;
    this.memoryLimit = options.memoryLimit ?? null;
    this.cpuLimit = options.cpuLimit ?? null;
    this.noNewPrivileges = options.noNewPrivileges ?? true;
    this.runtime = options.runtime ?? 'runc';
    this.gpu = options.gpu ?? false;
    this.tempDir = options.tempDir ?? null;
    this.logger = options.logger ?? null;
  }

  private ensureIsolatedNetwork(): void {
    if (this.networkReady) return;
    try {
      execSync(`docker network inspect ${ISOLATED_NETWORK}`, { stdio: 'ignore' });
    } catch {
      try {
        execSync(
          `docker network create --driver bridge -o com.docker.network.bridge.enable_icc=false ${ISOLATED_NETWORK}`,
          { stdio: 'ignore' },
        );
      } catch {
        // Network may have been created by another process
      }
    }
    this.networkReady = true;
  }

  private validateContainerName(name: string): void {
    if (!name || name.length > MAX_CONTAINER_NAME_LENGTH) {
      throw new Error(`Invalid container name length: ${name}`);
    }
    if (!CONTAINER_NAME_REGEX.test(name)) {
      throw new Error(`Invalid container name format: ${name}`);
    }
  }

  static isAvailable(): boolean {
    try {
      execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  runNode(node: Node, input: Record<string, unknown> = {}, options: RunNodeOptions = {}): Execution {
    const safeId = node.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8);
    const containerName = `lp-${safeId}-${Date.now()}-${containerSeq++}`;

    let resolveResult!: (result: NodeExecutionResult) => void;
    const resultPromise = new Promise<NodeExecutionResult>((r) => {
      resolveResult = r;
    });

    const execution = new Execution(containerName, resultPromise, options.signal);

    this.executeNode(execution, node, input, options.onLog).then((result) => {
      resolveResult(result);
    });

    return execution;
  }

  private async executeNode(
    execution: Execution,
    node: Node,
    input: Record<string, unknown>,
    onLog?: (log: string) => void,
  ): Promise<NodeExecutionResult> {
    if (execution.cancelled) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        success: false,
        exitCode: -1,
        stdout: '',
        stderr: 'Cancelled before start',
        duration: 0,
        input,
        output: {},
        cancelled: true,
        resources: { cpu: this.cpuLimit, memory: this.memoryLimit },
      };
    }

    const startTime = Date.now();
    let tempDir: string | null = null;

    try {
      tempDir = await mkdtemp(join(this.tempDir ?? tmpdir(), 'light-process-'));
      await chmod(tempDir, 0o755);

      const entrypointScript = this.generateEntrypointScript(node);
      const filesToWrite = { ...node.files };
      if (entrypointScript) {
        filesToWrite['.lp-entrypoint.sh'] = entrypointScript;
      }

      await this.writeFiles(tempDir, filesToWrite);

      if (!node.network) {
        this.ensureIsolatedNetwork();
      }

      const dockerArgs = this.buildDockerArgs(node, tempDir, execution.id, !!entrypointScript);

      if (this.verbose) {
        const info = {
          container: execution.id,
          cmd: `docker ${dockerArgs.join(' ')}`,
          stdinBytes: JSON.stringify(input).length,
        };
        if (this.logger) {
          this.logger.info(info, 'DockerRunner exec');
        } else {
          console.log(`[DockerRunner] Container: ${execution.id}`);
          console.log(`[DockerRunner] Running: docker ${dockerArgs.join(' ')}`);
          console.log(`[DockerRunner] stdin: ${JSON.stringify(input).length} bytes`);
        }
      }

      const result = await this.exec(dockerArgs, input, node.timeout, execution, onLog);

      const output = await this.readOutputFile(tempDir);

      return {
        nodeId: node.id,
        nodeName: node.name,
        success: result.exitCode === 0 && !result.cancelled,
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime,
        input,
        output,
        cancelled: result.cancelled,
        resources: { cpu: this.cpuLimit, memory: this.memoryLimit },
      };
    } finally {
      if (tempDir) {
        try {
          await rm(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }

  private async writeFiles(dir: string, files: Record<string, string>): Promise<void> {
    for (const [filePath, content] of Object.entries(files)) {
      if (!isPathSafe(filePath, dir)) {
        throw new Error(`Security: Path traversal detected in file path: ${filePath}`);
      }
      const fullPath = resolve(join(dir, filePath));

      const fileDir = dirname(fullPath);
      await mkdir(fileDir, { recursive: true });
      await writeFile(fullPath, content);
    }
  }

  private generateEntrypointScript(node: Node): string | null {
    const commands = [...node.setup];
    if (node.entrypoint) {
      commands.push(node.entrypoint);
    }

    if (commands.length === 0) {
      return null;
    }

    const lines = ['#!/bin/sh', 'set -e', ...commands];

    return lines.join('\n');
  }

  private buildDockerArgs(
    node: Node,
    tempDir: string,
    containerName: string,
    hasEntrypoint: boolean = false,
  ): string[] {
    this.validateContainerName(containerName);

    const args = ['run', '--rm', '-i', '--name', containerName];

    if (this.runtime !== 'runc') {
      args.push(`--runtime=${this.runtime}`);
    }

    if (this.gpu !== false) {
      if (this.gpu === 'all') {
        args.push('--gpus', 'all');
      } else if (typeof this.gpu === 'number') {
        args.push('--gpus', this.gpu.toString());
      } else {
        args.push('--gpus', `device=${this.gpu}`);
      }
    }

    if (this.memoryLimit) {
      args.push('--memory', this.memoryLimit);
    }
    if (this.cpuLimit) {
      args.push('--cpus', this.cpuLimit);
    }

    if (this.noNewPrivileges) {
      args.push('--security-opt', 'no-new-privileges');
    }

    for (const cap of DANGEROUS_CAPS) {
      args.push('--cap-drop', cap);
    }

    args.push('--pids-limit', '100');

    args.push('-w', node.workdir);
    args.push('-v', `${toDockerPath(tempDir)}:${node.workdir}`);

    for (const name of node.env ?? []) {
      const value = process.env[name];
      if (value === undefined) {
        if (this.verbose) console.warn(`[DockerRunner] env "${name}" not set on server, skipping`);
        continue;
      }
      args.push('-e', `${name}=${value}`);
    }

    if (node.network === 'none') {
      args.push('--network', 'none');
    } else if (node.network) {
      args.push('--network', node.network);
    } else {
      args.push('--network', ISOLATED_NETWORK);
    }

    if (!node.image) {
      throw new Error(`Node '${node.name}' has no image specified`);
    }
    args.push(node.image);

    if (hasEntrypoint) {
      args.push('sh', `${node.workdir}/.lp-entrypoint.sh`);
    }

    return args;
  }

  private exec(
    args: string[],
    input: Record<string, unknown>,
    timeout: number,
    execution: Execution,
    onLog?: (log: string) => void,
  ): Promise<{ exitCode: number; stdout: string; stderr: string; cancelled: boolean }> {
    return new Promise((resolve) => {
      const proc = spawn('docker', args, {
        ...(timeout > 0 && { timeout }),
      });

      const stdoutChunks: Buffer[] = [];
      let stderr = '';
      let cancelled = false;

      proc.stdout?.on('data', (data: Buffer) => {
        stdoutChunks.push(data);
      });

      proc.stderr.on('data', (data: Buffer) => {
        const text = data.toString();

        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (trimmed) {
            stderr += `${line}\n`;
            onLog?.(line);
          }
        }

        if (this.verbose) {
          process.stderr.write(data);
        }
      });

      proc.on('close', (exitCode: number | null, signal: string | null) => {
        if (signal === 'SIGTERM' || signal === 'SIGKILL' || exitCode === 137 || exitCode === 143) {
          cancelled = true;
        }
        if (execution.cancelled) {
          cancelled = true;
        }

        if (exitCode === null || signal) {
          try {
            spawnSync('docker', ['kill', execution.id], { stdio: 'ignore' });
          } catch {
            // Container may have already stopped
          }
        }

        const stdout = Buffer.concat(stdoutChunks).toString();
        resolve({ exitCode: exitCode || 0, stdout, stderr, cancelled });
      });

      proc.on('error', (err: Error) => {
        const stdout = Buffer.concat(stdoutChunks).toString();
        resolve({ exitCode: 1, stdout, stderr: err.message, cancelled: execution.cancelled });
      });

      proc.stdin.write(JSON.stringify(input));
      proc.stdin.end();
    });
  }

  private async readOutputFile(tempDir: string): Promise<Record<string, unknown>> {
    try {
      const filePath = join(tempDir, OUTPUT_FILE);
      const content = await readFile(filePath, 'utf-8');
      return safeJsonParse(content.trim()) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
}
