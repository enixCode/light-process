import { v4 as uuidv4 } from 'uuid';
import { CircularDependencyError, LinkValidationError, WorkflowTimeoutError } from './errors.js';
import {
  checkCondition,
  Link,
  type LinkConfig,
  type LinkJSON,
  Node,
  type NodeConfig,
  type NodeJSON,
  validateWhen,
} from './models/index.js';
import { LightRunClient } from './runner/index.js';
import { validateInput, validateOutput } from './schema.js';

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

export interface WorkflowConfig {
  id?: string;
  name: string;
  network?: string | null;
  nodes?: (Node | NodeJSON)[];
  links?: (Link | LinkJSON)[];
}

export interface WorkflowJSON {
  id: string;
  name: string;
  network: string | null;
  nodes: NodeJSON[];
  links: LinkJSON[];
}

export class Workflow {
  public readonly id: string;
  public name: string;
  public network: string | null;
  public nodes: Map<string, Node>;
  public links: Map<string, Link>;
  private _outgoingLinks: Map<string, Link[]> = new Map();
  private _incomingLinks: Map<string, Link[]> = new Map();

  constructor(config: WorkflowConfig) {
    this.id = config.id || uuidv4();
    this.name = config.name;
    this.network = config.network ?? null;
    this.nodes = new Map();
    this.links = new Map();

    if (config.nodes) {
      for (const node of config.nodes) {
        this.addNode(node instanceof Node ? node : Node.fromJSON(node as NodeJSON));
      }
    }
    if (config.links) {
      for (const link of config.links) {
        this.addLink(link instanceof Link ? link : Link.fromJSON(link as LinkJSON));
      }
    }
  }

  /** Inherits workflow network if node has none */
  addNode(config: NodeConfig): Node {
    const node = config instanceof Node ? config : new Node(config);
    if (node.network === null && this.network !== null) {
      node.network = this.network;
    }
    this.nodes.set(node.id, node);
    return node;
  }

  /** Validates nodes exist, no self-loop, valid when, cycles require maxIterations */
  addLink(config: LinkConfig): Link {
    const link = config instanceof Link ? config : new Link(config);

    if (!this.nodes.has(link.from)) {
      throw new LinkValidationError(
        `Link "${link.name}" references non-existent source node "${link.from}"`,
        link.id,
        link.name,
        link.from,
        link.to,
      );
    }
    if (!this.nodes.has(link.to)) {
      throw new LinkValidationError(
        `Link "${link.name}" references non-existent target node "${link.to}"`,
        link.id,
        link.name,
        link.from,
        link.to,
      );
    }
    if (link.from === link.to) {
      throw new LinkValidationError(
        `Link "${link.name}" creates a self-loop on node "${link.from}"`,
        link.id,
        link.name,
        link.from,
        link.to,
      );
    }
    if (link.when) {
      try {
        validateWhen(link.when);
      } catch (err) {
        throw new LinkValidationError(
          `Link "${link.name}" has invalid 'when' condition: ${(err as Error).message}`,
          link.id,
          link.name,
          link.from,
          link.to,
        );
      }
    }
    if (this.wouldCreateCycle(link) && link.maxIterations == null) {
      throw new LinkValidationError(
        `Link "${link.name}" creates a cycle. Back-links require 'maxIterations' to be set.`,
        link.id,
        link.name,
        link.from,
        link.to,
      );
    }

    this.links.set(link.id, link);

    const outgoing = this._outgoingLinks.get(link.from) || [];
    outgoing.push(link);
    this._outgoingLinks.set(link.from, outgoing);

    const incoming = this._incomingLinks.get(link.to) || [];
    incoming.push(link);
    this._incomingLinks.set(link.to, incoming);

    return link;
  }

  private wouldCreateCycle(newLink: Link): boolean {
    const visited = new Set<string>();

    const canReach = (from: string, target: string): boolean => {
      if (from === target) return true;
      if (visited.has(from)) return false;
      visited.add(from);

      for (const link of this.getOutgoingLinks(from)) {
        if (link.maxIterations != null) continue;
        if (canReach(link.to, target)) return true;
      }
      return false;
    };

    return canReach(newLink.to, newLink.from);
  }

  addLinks(links: LinkConfig[]): Link[] {
    return links.map((link) => this.addLink(link));
  }

  getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  /** Nodes with no incoming forward links (back-links excluded) */
  getEntryNodes(): Node[] {
    const nodesWithIncoming = new Set<string>();
    for (const link of this.links.values()) {
      if (link.maxIterations != null && link.maxIterations > 0) continue;
      nodesWithIncoming.add(link.to);
    }
    return Array.from(this.nodes.values()).filter((n) => !nodesWithIncoming.has(n.id));
  }

  getOutgoingLinks(nodeId: string): Link[] {
    return this._outgoingLinks.get(nodeId) || [];
  }

  getIncomingLinks(nodeId: string): Link[] {
    return this._incomingLinks.get(nodeId) || [];
  }

  findLink(from: string, to: string): Link | undefined {
    const outgoing = this._outgoingLinks.get(from) || [];
    return outgoing.find((l) => l.to === to);
  }

  removeLink(from: string, to: string): boolean {
    const outgoing = this._outgoingLinks.get(from);
    if (!outgoing) return false;

    const idx = outgoing.findIndex((l) => l.to === to);
    if (idx === -1) return false;

    const link = outgoing[idx];
    this.links.delete(link.id);
    outgoing.splice(idx, 1);
    if (outgoing.length === 0) this._outgoingLinks.delete(from);

    const incoming = this._incomingLinks.get(to);
    if (incoming) {
      const inIdx = incoming.indexOf(link);
      if (inIdx !== -1) incoming.splice(inIdx, 1);
      if (incoming.length === 0) this._incomingLinks.delete(to);
    }

    return true;
  }

  private async runNode(
    node: Node,
    input: Record<string, unknown>,
    ctx: {
      runner: LightRunClient;
      signal: AbortSignal;
      onNodeStart?: (nodeId: string, nodeName: string) => void;
      onNodeComplete?: (nodeId: string, nodeName: string, success: boolean, duration: number) => void;
      onLog?: (nodeId: string, nodeName: string, log: string) => void;
    },
  ): Promise<ExecutionResultNode> {
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

  async execute(initialData: Record<string, unknown> = {}, options: ExecuteOptions = {}): Promise<ExecutionResult> {
    const { runner = new LightRunClient(), timeout = 0, onNodeStart, onNodeComplete, onLog, onStatusChange } = options;

    const startTime = Date.now();
    const results = new Map<string, ExecutionResultNode>();
    const nodeOutputs = new Map<string, Record<string, unknown>>();
    let workflowError: string | undefined;

    const entryNodes = this.getEntryNodes();
    if (entryNodes.length === 0 && this.nodes.size > 0) {
      throw new CircularDependencyError(this.id, ['No entry nodes found']);
    }

    const abortController = new AbortController();
    const signal = abortController.signal;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (timeout > 0) {
      timeoutId = setTimeout(() => {
        abortController.abort();
      }, timeout);
    }

    const completedNodeIds: string[] = [];
    const nodeCtx = { runner, signal, onNodeStart, onNodeComplete, onLog };

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
            const node = this.nodes.get(nodeId);
            if (!node) return null;

            pending.delete(nodeId);
            onStatusChange?.({
              currentNodeId: nodeId,
              currentNodeName: node.name,
              completedNodes: [...completedNodeIds],
            });
            const result = await this.runNode(node, input, nodeCtx);
            results.set(nodeId, result);
            nodeOutputs.set(nodeId, result.output);
            executed.add(nodeId);
            completedNodeIds.push(nodeId);

            return { nodeId, result };
          }),
        );

        const failed = batchResults.find((r) => r && !r.result.success);
        if (failed) {
          workflowError = `Node "${this.nodes.get(failed.nodeId)?.name}" failed`;
          break;
        }

        for (const br of batchResults) {
          if (!br) continue;

          const output = nodeOutputs.get(br.nodeId) || {};

          for (const link of this.getOutgoingLinks(br.nodeId)) {
            if (link.when && !checkCondition(link.when, output)) continue;

            if (link.maxIterations != null) {
              const count = linkIterations.get(link.id) || 0;
              if (count >= link.maxIterations) continue;
              linkIterations.set(link.id, count + 1);
            }

            const targetId = link.to;
            if (pending.has(targetId)) continue;

            let ready = true;
            const mergedInput: Record<string, unknown> = {};

            for (const inLink of this.getIncomingLinks(targetId)) {
              const srcOutput = nodeOutputs.get(inLink.from);
              if (inLink.when) {
                if (srcOutput && checkCondition(inLink.when, srcOutput)) {
                  Object.assign(mergedInput, srcOutput, inLink.data);
                }
              } else {
                if (!srcOutput && !executed.has(inLink.from)) {
                  ready = false;
                  break;
                }
                if (srcOutput) Object.assign(mergedInput, srcOutput, inLink.data);
              }
            }

            if (ready) {
              queue.push({ nodeId: targetId, input: mergedInput });
              pending.add(targetId);
            }
          }
        }
      }

      if (signal.aborted) {
        throw new WorkflowTimeoutError(this.id, timeout, Date.now() - startTime);
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    const success = !workflowError && !signal.aborted;
    return {
      workflowId: this.id,
      success,
      results: Object.fromEntries(results),
      duration: Date.now() - startTime,
      error: workflowError,
    };
  }

  toJSON(): WorkflowJSON {
    return {
      id: this.id,
      name: this.name,
      network: this.network,
      nodes: Array.from(this.nodes.values()).map((n) => n.toJSON()),
      links: Array.from(this.links.values()).map((l) => l.toJSON()),
    };
  }

  static fromJSON(json: WorkflowJSON): Workflow {
    return new Workflow({
      id: json.id,
      name: json.name,
      network: json.network,
      nodes: json.nodes?.map((n) => Node.fromJSON(n)),
      links: json.links?.map((l) => Link.fromJSON(l)),
    });
  }
}
