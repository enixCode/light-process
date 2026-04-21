import { OUTPUT_FILE } from '../helpers.js';
import type { Node } from '../models/Node.js';
import { Execution, type NodeExecutionResult, type RunNodeOptions } from './Execution.js';

/*
 * HTTP client that delegates container execution to a light-run service.
 * Requires LIGHT_RUN_URL; optional LIGHT_RUN_TOKEN for Bearer auth.
 */

export interface LightRunClientOptions {
  url?: string;
  token?: string;
}

interface RunState {
  id: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  exitCode?: number;
  durationMs?: number;
  artifacts?: Array<{ path: string; bytes: number; type: string }>;
  error?: string;
}

let seq = 0;

export class LightRunClient {
  private readonly url: string;
  private readonly token: string | undefined;

  constructor(options: LightRunClientOptions = {}) {
    this.url = options.url ?? process.env.LIGHT_RUN_URL ?? '';
    this.token = options.token ?? process.env.LIGHT_RUN_TOKEN;
  }

  static isAvailable(): boolean {
    return !!process.env.LIGHT_RUN_URL;
  }

  runNode(node: Node, input: Record<string, unknown> = {}, options: RunNodeOptions = {}): Execution {
    if (!node.image) {
      throw new Error(`Node '${node.name}' has no Docker image`);
    }

    const execId = `lp-${node.id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}-${Date.now()}-${seq++}`;

    let lightRunId: string | undefined;
    const cancelFn = () => {
      if (!lightRunId) return;
      fetch(`${this.url}/runs/${lightRunId}/cancel`, {
        method: 'POST',
        headers: this.headers(),
      }).catch(() => {});
    };

    const resultPromise = this.executeNode(node, input, (id) => {
      lightRunId = id;
    });

    return new Execution(execId, resultPromise, options.signal, cancelFn);
  }

  private async executeNode(
    node: Node,
    input: Record<string, unknown>,
    onRunId: (id: string) => void,
  ): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    const outputPath = `${node.workdir}/${OUTPUT_FILE}`;

    try {
      const body: Record<string, unknown> = {
        image: node.image,
        files: node.files,
        extract: [outputPath],
      };
      if (node.entrypoint) body.entrypoint = node.entrypoint;
      if (node.setup.length > 0) body.setup = node.setup;
      if (node.timeout > 0) body.timeout = node.timeout;
      if (node.network) body.network = node.network;
      if (node.workdir !== '/app') body.workdir = node.workdir;
      if (Object.keys(input).length > 0) body.input = input;

      if (node.env.length > 0) {
        const env: Record<string, string> = {};
        for (const name of node.env) {
          const value = process.env[name];
          if (value !== undefined) env[name] = value;
        }
        if (Object.keys(env).length > 0) body.env = env;
      }

      const res = await fetch(`${this.url}/run`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`light-run POST /run ${res.status}: ${text.slice(0, 500)}`);
      }

      const state = (await res.json()) as RunState;
      onRunId(state.id);

      let output: Record<string, unknown> = {};
      const artifactName = OUTPUT_FILE;
      const hasOutput = state.artifacts?.some((a) => a.path === artifactName && a.type === 'file');

      if (hasOutput && state.status === 'succeeded') {
        try {
          const artRes = await fetch(`${this.url}/runs/${state.id}/artifacts/${artifactName}`, {
            headers: this.headers(),
          });
          if (artRes.ok) {
            const text = await artRes.text();
            const parsed = JSON.parse(text.trim());
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              output = parsed as Record<string, unknown>;
            }
          }
        } catch {
          // Output file missing or unparseable
        }
      }

      return {
        nodeId: node.id,
        nodeName: node.name,
        success: state.status === 'succeeded',
        exitCode: state.exitCode ?? (state.status === 'succeeded' ? 0 : 1),
        stdout: '',
        stderr: state.error ?? '',
        duration: state.durationMs ?? Date.now() - startTime,
        input,
        output,
        cancelled: state.status === 'cancelled',
      };
    } catch (err) {
      return {
        nodeId: node.id,
        nodeName: node.name,
        success: false,
        exitCode: 1,
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        duration: Date.now() - startTime,
        input,
        output: {},
        cancelled: false,
      };
    }
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'content-type': 'application/json' };
    if (this.token) h.authorization = `Bearer ${this.token}`;
    return h;
  }
}
