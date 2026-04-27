import { v4 as uuidv4 } from 'uuid';
import { LinkValidationError } from './errors.js';
import { type ExecuteOptions, type ExecutionResult, type ExecutionResultNode, executeWorkflow } from './executor.js';
import {
  Link,
  type LinkConfig,
  type LinkJSON,
  Node,
  type NodeConfig,
  type NodeJSON,
  validateWhen,
} from './models/index.js';

export type { ExecuteOptions, ExecutionResult, ExecutionResultNode };

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

  execute(initialData: Record<string, unknown> = {}, options: ExecuteOptions = {}): Promise<ExecutionResult> {
    return executeWorkflow(this, initialData, options);
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
