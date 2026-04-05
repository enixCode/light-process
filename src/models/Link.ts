import { v4 as uuidv4 } from 'uuid';

export interface LinkJSON {
  id: string;
  name: string;
  from: string;
  to: string;
  data: Record<string, unknown>;
  /** MongoDB-style condition - link is only followed when this evaluates to true */
  when: Record<string, unknown> | null;
  /** Max iterations for back-links to prevent infinite loops (null = unlimited) */
  maxIterations: number | null;
}

export interface LinkConfig {
  name?: string;
  from?: string;
  to?: string;
  id?: string;
  data?: Record<string, unknown>;
  when?: Record<string, unknown> | null;
  maxIterations?: number | null;
}

export class Link implements LinkJSON {
  public readonly id: string;
  public name: string;
  public from: string;
  public to: string;
  public data: Record<string, unknown>;
  public when: Record<string, unknown> | null;
  public maxIterations: number | null;

  constructor(config: LinkConfig) {
    if (!config.from || !config.to) {
      throw new Error('Link requires "from" and "to"');
    }

    this.id = config.id || uuidv4();
    this.name = config.name || `${config.from}->${config.to}`;
    this.from = config.from;
    this.to = config.to;
    this.data = config.data || {};
    this.when = config.when ?? null;
    this.maxIterations = config.maxIterations ?? null;
  }

  toJSON(): LinkJSON {
    return {
      id: this.id,
      name: this.name,
      from: this.from,
      to: this.to,
      data: this.data,
      when: this.when,
      maxIterations: this.maxIterations,
    };
  }

  static fromJSON(json: LinkJSON): Link {
    return new Link(json);
  }
}
