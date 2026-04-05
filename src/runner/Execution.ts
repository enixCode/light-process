import { spawnSync } from 'child_process';

export interface NodeExecutionResult {
  nodeId: string;
  nodeName: string;
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
  cancelled: boolean;
  resources: { cpu: string | null; memory: string | null };
}

export class Execution {
  public readonly id: string;
  public readonly result: Promise<NodeExecutionResult>;

  private _cancelled = false;
  private _signal?: AbortSignal;
  private _abortListener?: () => void;

  constructor(id: string, result: Promise<NodeExecutionResult>, signal?: AbortSignal) {
    this.id = id;

    this.result = result.finally(() => {
      if (this._signal && this._abortListener) {
        this._signal.removeEventListener('abort', this._abortListener);
      }
    });

    if (signal) {
      this._signal = signal;
      if (signal.aborted) {
        this._cancelled = true;
      } else {
        this._abortListener = () => this.cancel();
        signal.addEventListener('abort', this._abortListener);
      }
    }
  }

  cancel(): void {
    if (this._cancelled) return;
    this._cancelled = true;

    try {
      spawnSync('docker', ['kill', this.id], { stdio: 'ignore' });
    } catch {
      // Container may have already stopped
    }
  }

  get cancelled(): boolean {
    return this._cancelled;
  }
}
