import { randomUUID } from 'node:crypto';

export type RunStatus = 'running' | 'success' | 'failed';

export interface RunNodeState {
  id: string;
  name: string;
  status: 'running' | 'success' | 'failed';
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
}

export interface RunState {
  id: string;
  workflowId: string;
  workflowName: string;
  status: RunStatus;
  startedAt: number;
  finishedAt: number | null;
  durationMs: number | null;
  currentNode: string | null;
  nodes: RunNodeState[];
  input: unknown;
  output: unknown | null;
  error: string | null;
}

const MAX_RUNS = 50;

export class RunStore {
  private runs = new Map<string, RunState>();

  start(workflowId: string, workflowName: string, input: unknown): RunState {
    const run: RunState = {
      id: randomUUID(),
      workflowId,
      workflowName,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
      currentNode: null,
      nodes: [],
      input,
      output: null,
      error: null,
    };
    this.runs.set(run.id, run);
    this.evict();
    return run;
  }

  nodeStart(runId: string, nodeId: string, nodeName: string): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.currentNode = nodeId;
    run.nodes.push({
      id: nodeId,
      name: nodeName,
      status: 'running',
      startedAt: Date.now(),
      finishedAt: null,
      durationMs: null,
    });
  }

  nodeComplete(runId: string, nodeId: string, success: boolean, durationMs: number): void {
    const run = this.runs.get(runId);
    if (!run) return;
    const node = run.nodes.find((n) => n.id === nodeId && n.status === 'running');
    if (!node) return;
    node.status = success ? 'success' : 'failed';
    node.finishedAt = Date.now();
    node.durationMs = durationMs;
    if (run.currentNode === nodeId) run.currentNode = null;
  }

  finish(runId: string, status: 'success' | 'failed', output: unknown, error: string | null): void {
    const run = this.runs.get(runId);
    if (!run) return;
    run.status = status;
    run.finishedAt = Date.now();
    run.durationMs = run.finishedAt - run.startedAt;
    run.output = output;
    run.error = error;
    run.currentNode = null;
  }

  get(id: string): RunState | undefined {
    return this.runs.get(id);
  }

  list(filter?: { workflowId?: string; status?: RunStatus }): RunState[] {
    let arr = Array.from(this.runs.values());
    if (filter?.workflowId) arr = arr.filter((r) => r.workflowId === filter.workflowId);
    if (filter?.status) arr = arr.filter((r) => r.status === filter.status);
    return arr.sort((a, b) => b.startedAt - a.startedAt);
  }

  private evict(): void {
    if (this.runs.size <= MAX_RUNS) return;
    const sorted = Array.from(this.runs.values()).sort((a, b) => a.startedAt - b.startedAt);
    const toRemove = sorted.slice(0, this.runs.size - MAX_RUNS);
    for (const r of toRemove) {
      if (r.status !== 'running') this.runs.delete(r.id);
    }
  }
}
