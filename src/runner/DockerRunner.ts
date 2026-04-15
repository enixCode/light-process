import { execSync, spawn, spawnSync } from 'node:child_process';
import { dirname } from 'node:path';
import { isPathSafe, safeJsonParse } from '../CodeLoader.js';
import { OUTPUT_FILE } from '../helpers.js';
import type { Node } from '../models/index.js';
import type { NodeExecutionResult } from './Execution.js';
import { Execution } from './Execution.js';

let containerSeq = 0;

const CONTAINER_NAME_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
const MAX_CONTAINER_NAME_LENGTH = 128;
const ISOLATED_NETWORK = 'lp-isolated';
const SEEDER_IMAGE = 'alpine:3.19';

const DANGEROUS_CAPS = ['NET_RAW', 'MKNOD', 'SYS_CHROOT', 'SETPCAP', 'SETFCAP', 'AUDIT_WRITE'];

export interface DockerRunnerOptions {
  verbose?: boolean;
  memoryLimit?: string;
  cpuLimit?: string;
  noNewPrivileges?: boolean;
  runtime?: 'runc' | 'runsc' | 'kata';
  gpu?: 'all' | number | string | false;
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
  private logger: { info: (obj: unknown, msg?: string) => void } | null;
  private networkReady = false;

  constructor(options: DockerRunnerOptions = {}) {
    this.verbose = options.verbose || false;
    this.memoryLimit = options.memoryLimit ?? null;
    this.cpuLimit = options.cpuLimit ?? null;
    this.noNewPrivileges = options.noNewPrivileges ?? true;
    this.runtime = options.runtime ?? 'runc';
    this.gpu = options.gpu ?? false;
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

  static cleanupOrphanVolumes(): number {
    try {
      const out = execSync('docker volume ls --filter name=lp- --format "{{.Name}}"', {
        encoding: 'utf-8',
      });
      const volumes = out
        .trim()
        .split('\n')
        .map((v) => v.trim())
        .filter(Boolean);
      let cleaned = 0;
      for (const v of volumes) {
        try {
          execSync(`docker volume rm ${v}`, { stdio: 'ignore' });
          cleaned++;
        } catch {
          // Volume is in use, skip (will be cleaned by the runner that owns it)
        }
      }
      return cleaned;
    } catch {
      return 0;
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
    const volumeName = execution.id;
    let volumeCreated = false;

    try {
      const entrypointScript = this.generateEntrypointScript(node);
      const filesToWrite = { ...node.files };
      if (entrypointScript) {
        filesToWrite['.lp-entrypoint.sh'] = entrypointScript;
      }

      this.validateFilePaths(filesToWrite);

      await this.createVolume(volumeName);
      volumeCreated = true;
      await this.seedVolume(volumeName, filesToWrite, !!entrypointScript);

      if (!node.network) {
        this.ensureIsolatedNetwork();
      }

      const dockerArgs = this.buildDockerArgs(node, volumeName, execution.id, !!entrypointScript);

      if (this.verbose) {
        const info = {
          container: execution.id,
          volume: volumeName,
          cmd: `docker ${dockerArgs.join(' ')}`,
          stdinBytes: JSON.stringify(input).length,
        };
        if (this.logger) {
          this.logger.info(info, 'DockerRunner exec');
        } else {
          console.log(`[DockerRunner] Container: ${execution.id}`);
          console.log(`[DockerRunner] Volume: ${volumeName}`);
          console.log(`[DockerRunner] Running: docker ${dockerArgs.join(' ')}`);
          console.log(`[DockerRunner] stdin: ${JSON.stringify(input).length} bytes`);
        }
      }

      const result = await this.exec(dockerArgs, input, node.timeout, execution, onLog);

      const output = await this.readOutputFromVolume(volumeName);

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
      if (volumeCreated) {
        await this.destroyVolume(volumeName);
      }
    }
  }

  private validateFilePaths(files: Record<string, string>): void {
    for (const filePath of Object.keys(files)) {
      if (!isPathSafe(filePath, '/dst')) {
        throw new Error(`Security: Path traversal detected in file path: ${filePath}`);
      }
    }
  }

  private buildSeedScript(files: Record<string, string>, hasEntrypoint: boolean): string {
    const lines = ['set -e'];
    const dirs = new Set<string>();
    for (const path of Object.keys(files)) {
      const dir = dirname(path);
      if (dir && dir !== '.' && dir !== '/') dirs.add(dir);
    }
    for (const dir of dirs) {
      lines.push(`mkdir -p "/dst/${dir}"`);
    }
    for (const [path, content] of Object.entries(files)) {
      const b64 = Buffer.from(content, 'utf-8').toString('base64');
      lines.push(`base64 -d > "/dst/${path}" <<'LP_B64_END'`);
      lines.push(b64);
      lines.push('LP_B64_END');
    }
    if (hasEntrypoint) {
      lines.push('chmod +x "/dst/.lp-entrypoint.sh"');
    }
    lines.push('chmod -R a+rX /dst');
    return lines.join('\n');
  }

  private createVolume(volumeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['volume', 'create', volumeName], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`docker volume create failed (${code}): ${stderr.trim()}`));
      });
    });
  }

  private seedVolume(volumeName: string, files: Record<string, string>, hasEntrypoint: boolean): Promise<void> {
    const script = this.buildSeedScript(files, hasEntrypoint);
    return new Promise((resolve, reject) => {
      const proc = spawn('docker', ['run', '--rm', '-i', '-v', `${volumeName}:/dst`, SEEDER_IMAGE, 'sh'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let stderr = '';
      proc.stderr.on('data', (d) => {
        stderr += d.toString();
      });
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`seedVolume failed (${code}): ${stderr.trim()}`));
      });
      proc.stdin.write(script);
      proc.stdin.end();
    });
  }

  private readOutputFromVolume(volumeName: string): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const proc = spawn(
        'docker',
        ['run', '--rm', '-v', `${volumeName}:/src`, SEEDER_IMAGE, 'cat', `/src/${OUTPUT_FILE}`],
        { stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stdout = '';
      proc.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      proc.on('error', () => resolve({}));
      proc.on('close', (code) => {
        if (code !== 0) return resolve({});
        try {
          const parsed = safeJsonParse(stdout.trim()) as Record<string, unknown>;
          resolve(parsed ?? {});
        } catch {
          resolve({});
        }
      });
    });
  }

  private destroyVolume(volumeName: string): Promise<void> {
    return new Promise((resolve) => {
      const proc = spawn('docker', ['volume', 'rm', '-f', volumeName], { stdio: 'ignore' });
      proc.on('error', () => resolve());
      proc.on('close', () => resolve());
    });
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
    volumeName: string,
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
    args.push('-v', `${volumeName}:${node.workdir}`);

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
}
