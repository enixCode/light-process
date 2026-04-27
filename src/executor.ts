import { CircularDependencyError, WorkflowTimeoutError } from './errors.js';
import { checkCondition, type Link, type Node } from './models/index.js';
import { LightRunClient } from './runner/index.js';
import { validateInput, validateOutput } from './schema.js';
import type { Workflow } from './Workflow.js';

export interface ExecutionResultNode {
  nodeId: string;
  nodeName: string;
  success: boolean;
  exitCode?: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  stdout?: string;
  stderr?: string;
  duration?: number;
  timestamp: string;
}

export interface ExecutionResult {
  workflowId: string;
  success: boolean;
  results: Record<string, ExecutionResultNode>;
  duration: number;
  error?: string;
}

export interface ExecuteOptions {
  runner?: LightRunClient;
  timeout?: number;
  onNodeStart?: (nodeId: string, nodeName: string) => void;
  onNodeComplete?: (nodeId: string, nodeName: string, success: boolean, duration: number) => void;
  onLog?: (nodeId: string, nodeName: string, log: string) => void;
  onStatusChange?: (status: {
    currentNodeId: string | null;
    currentNodeName: string | null;
    completedNodes: string[];
  }) => void;
}

interface NodeRunContext {
  runner: LightRunClient;
  signal: AbortSignal;
  onNodeStart?: ExecuteOptions['onNodeStart'];
  onNodeComplete?: ExecuteOptions['onNodeComplete'];
  onLog?: ExecuteOptions['onLog'];
}

async function runNode(node: Node, input: Record<string, unknown>, ctx: NodeRunContext): Promise<ExecutionResultNode> {
  const makeResult = (overrides: Partial<ExecutionResultNode> = {}): ExecutionResultNode => ({
    nodeId: node.id,
    nodeName: node.name,
    success: false,
    input,
    output: {},
    timestamp: new Date().toISOString(),
    ...overrides,
  });

  if (ctx.signal.aborted) {
    return makeResult({ stderr: 'Cancelled' });
  }

  if (node.inputs) {
    const validation = validateInput(input, node.inputs);
    if (!validation.valid) {
      return makeResult({ stderr: `Input validation failed: ${validation.errors.join(', ')}` });
    }
  }

  ctx.onNodeStart?.(node.id, node.name);

  const runOptions = {
    signal: ctx.signal,
    onLog: ctx.onLog ? (log: string) => ctx.onLog!(node.id, node.name, log) : undefined,
  };

  const result = await ctx.runner.runNode(node, input, runOptions).result;

  if (node.outputs && result.success) {
    const validation = validateOutput(result.output, node.outputs);
    if (!validation.valid) {
      return makeResult({
        exitCode: result.exitCode,
        output: result.output,
        stdout: result.stdout,
        stderr: `Output validation failed: ${validation.errors.join(', ')}`,
        duration: result.duration,
      });
    }
  }

  const output = makeResult({
    success: result.success,
    exitCode: result.exitCode,
    output: result.output,
    stdout: result.stdout,
    stderr: result.stderr,
    duration: result.duration,
  });

  ctx.onNodeComplete?.(node.id, node.name, result.success, result.duration);
  return output;
}

function buildMergedInput(
  workflow: Workflow,
  targetId: string,
  nodeOutputs: Map<string, Record<string, unknown>>,
  executed: Set<string>,
): { ready: boolean; merged: Record<string, unknown> } {
  const merged: Record<string, unknown> = {};

  for (const inLink of workflow.getIncomingLinks(targetId)) {
    const srcOutput = nodeOutputs.get(inLink.from);
    if (inLink.when) {
      if (srcOutput && checkCondition(inLink.when, srcOutput)) {
        Object.assign(merged, srcOutput, inLink.data);
      }
    } else {
      if (!srcOutput && !executed.has(inLink.from)) {
        return { ready: false, merged };
      }
      if (srcOutput) Object.assign(merged, srcOutput, inLink.data);
    }
  }

  return { ready: true, merged };
}

function shouldFollowLink(link: Link, output: Record<string, unknown>, iterations: Map<string, number>): boolean {
  if (link.when && !checkCondition(link.when, output)) return false;
  if (link.maxIterations != null) {
    const count = iterations.get(link.id) || 0;
    if (count >= link.maxIterations) return false;
    iterations.set(link.id, count + 1);
  }
  return true;
}

export async function executeWorkflow(
  workflow: Workflow,
  initialData: Record<string, unknown> = {},
  options: ExecuteOptions = {},
): Promise<ExecutionResult> {
  const { runner = new LightRunClient(), timeout = 0, onNodeStart, onNodeComplete, onLog, onStatusChange } = options;

  const startTime = Date.now();
  const results = new Map<string, ExecutionResultNode>();
  const nodeOutputs = new Map<string, Record<string, unknown>>();
  let workflowError: string | undefined;

  const entryNodes = workflow.getEntryNodes();
  if (entryNodes.length === 0 && workflow.nodes.size > 0) {
    throw new CircularDependencyError(workflow.id, ['No entry nodes found']);
  }

  const abortController = new AbortController();
  const signal = abortController.signal;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  if (timeout > 0) {
    timeoutId = setTimeout(() => abortController.abort(), timeout);
  }

  const completedNodeIds: string[] = [];
  const nodeCtx: NodeRunContext = { runner, signal, onNodeStart, onNodeComplete, onLog };

  try {
    const linkIterations = new Map<string, number>();
    const pending = new Set<string>();
    const executed = new Set<string>();
    const queue: Array<{ nodeId: string; input: Record<string, unknown> }> = [];

    for (const node of entryNodes) {
      queue.push({ nodeId: node.id, input: initialData });
      pending.add(node.id);
    }

    while (queue.length > 0 && !signal.aborted) {
      const batch = queue.splice(0);

      const batchResults = await Promise.all(
        batch.map(async ({ nodeId, input }) => {
          const node = workflow.nodes.get(nodeId);
          if (!node) return null;

          pending.delete(nodeId);
          onStatusChange?.({
            currentNodeId: nodeId,
            currentNodeName: node.name,
            completedNodes: [...completedNodeIds],
          });
          const result = await runNode(node, input, nodeCtx);
          results.set(nodeId, result);
          nodeOutputs.set(nodeId, result.output);
          executed.add(nodeId);
          completedNodeIds.push(nodeId);

          return { nodeId, result };
        }),
      );

      const failed = batchResults.find((r) => r && !r.result.success);
      if (failed) {
        workflowError = `Node "${workflow.nodes.get(failed.nodeId)?.name}" failed`;
        break;
      }

      for (const br of batchResults) {
        if (!br) continue;

        const output = nodeOutputs.get(br.nodeId) || {};

        for (const link of workflow.getOutgoingLinks(br.nodeId)) {
          if (!shouldFollowLink(link, output, linkIterations)) continue;

          const targetId = link.to;
          if (pending.has(targetId)) continue;

          const { ready, merged } = buildMergedInput(workflow, targetId, nodeOutputs, executed);
          if (ready) {
            queue.push({ nodeId: targetId, input: merged });
            pending.add(targetId);
          }
        }
      }
    }

    if (signal.aborted) {
      throw new WorkflowTimeoutError(workflow.id, timeout, Date.now() - startTime);
    }
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  const success = !workflowError && !signal.aborted;
  return {
    workflowId: workflow.id,
    success,
    results: Object.fromEntries(results),
    duration: Date.now() - startTime,
    error: workflowError,
  };
}
