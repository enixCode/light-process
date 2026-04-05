export class LightProcessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LightProcessError';
  }
}

export class LinkValidationError extends LightProcessError {
  public readonly linkId: string;
  public readonly linkName: string;
  public readonly from: string;
  public readonly to: string;

  constructor(message: string, linkId: string, linkName: string, from: string, to: string) {
    super(message);
    this.name = 'LinkValidationError';
    this.linkId = linkId;
    this.linkName = linkName;
    this.from = from;
    this.to = to;
  }
}

export class CircularDependencyError extends LightProcessError {
  public readonly workflowId: string;
  public readonly cycle: string[];

  constructor(workflowId: string, cycle: string[]) {
    super(`Circular dependency detected: ${cycle.join(' ->')}`);
    this.name = 'CircularDependencyError';
    this.workflowId = workflowId;
    this.cycle = cycle;
  }
}

export class WorkflowTimeoutError extends LightProcessError {
  public readonly workflowId: string;
  public readonly timeout: number;
  public readonly elapsed: number;

  constructor(workflowId: string, timeout: number, elapsed: number) {
    super(`Workflow "${workflowId}" timed out after ${elapsed}ms (limit: ${timeout}ms)`);
    this.name = 'WorkflowTimeoutError';
    this.workflowId = workflowId;
    this.timeout = timeout;
    this.elapsed = elapsed;
  }
}
