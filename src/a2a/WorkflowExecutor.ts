import type { DataPart, Part, TaskArtifactUpdateEvent, TaskStatusUpdateEvent } from '@a2a-js/sdk';
import type { AgentExecutor, ExecutionEventBus, RequestContext } from '@a2a-js/sdk/server';
import type { LightRunClient } from '../runner/index.js';
import type { Workflow } from '../Workflow.js';

/** Extract structured data from A2A message parts */
function extractInput(parts: Part[]): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const part of parts) {
    if (part.kind === 'data') {
      Object.assign(input, (part as DataPart).data);
    }
  }
  return input;
}

/** Find which workflow to run based on the message content */
function resolveWorkflow(workflows: Map<string, Workflow>, input: Record<string, unknown>): Workflow | null {
  const workflowId = input.workflowId as string | undefined;
  const workflowName = input.workflowName as string | undefined;

  if (workflowId && workflows.has(workflowId)) {
    return workflows.get(workflowId)!;
  }

  if (workflowName) {
    const lower = workflowName.toLowerCase();
    for (const wf of workflows.values()) {
      if (wf.name.toLowerCase() === lower) return wf;
    }
  }

  if (workflows.size === 1) {
    return workflows.values().next().value!;
  }

  return null;
}

export class WorkflowExecutor implements AgentExecutor {
  private abortControllers = new Map<string, AbortController>();

  constructor(
    private workflows: Map<string, Workflow>,
    private runner: LightRunClient,
  ) {}

  async execute(context: RequestContext, eventBus: ExecutionEventBus): Promise<void> {
    const taskId = context.taskId;
    const contextId = context.contextId;

    // Seed a task so the A2A SDK can return it on message/send
    eventBus.publish({
      kind: 'task',
      id: taskId,
      contextId,
      status: { state: 'submitted' },
      history: [context.userMessage],
      artifacts: [],
    } as never);

    const rawInput = extractInput(context.userMessage.parts);
    const workflow = resolveWorkflow(this.workflows, rawInput);
    // If the caller nested the workflow input under a dedicated field, unwrap it.
    const input =
      rawInput.input && typeof rawInput.input === 'object'
        ? (rawInput.input as Record<string, unknown>)
        : Object.fromEntries(Object.entries(rawInput).filter(([k]) => k !== 'workflowId' && k !== 'workflowName'));

    if (!workflow) {
      const names = Array.from(this.workflows.values()).map((w) => w.name);
      eventBus.publish({
        kind: 'status-update',
        taskId,
        contextId: context.contextId,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: `Workflow not found. Available: ${names.join(', ')}. Pass workflowId or workflowName in data.`,
              },
            ],
          },
        },
        final: true,
      } as TaskStatusUpdateEvent);
      eventBus.finished();
      return;
    }

    const abortController = new AbortController();
    this.abortControllers.set(taskId, abortController);

    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId: context.contextId,
      status: {
        state: 'working',
        message: {
          role: 'agent',
          parts: [{ kind: 'text', text: `Starting workflow: ${workflow.name}` }],
        },
      },
      final: false,
    } as TaskStatusUpdateEvent);

    try {
      const result = await workflow.execute(input, {
        runner: this.runner,
        onNodeStart: (_nodeId, nodeName) => {
          eventBus.publish({
            kind: 'status-update',
            taskId,
            contextId: context.contextId,
            status: {
              state: 'working',
              message: {
                role: 'agent',
                parts: [{ kind: 'text', text: `Running node: ${nodeName}` }],
              },
            },
            final: false,
          } as TaskStatusUpdateEvent);
        },
        onNodeComplete: (nodeId, nodeName, success, duration) => {
          eventBus.publish({
            kind: 'artifact-update',
            taskId,
            contextId: context.contextId,
            artifact: {
              artifactId: nodeId,
              name: nodeName,
              parts: [
                {
                  kind: 'data',
                  data: { nodeId, nodeName, success, duration },
                },
              ],
            },
          } as TaskArtifactUpdateEvent);
        },
        onStatusChange: (status) => {
          eventBus.publish({
            kind: 'status-update',
            taskId,
            contextId: context.contextId,
            status: {
              state: 'working',
              message: {
                role: 'agent',
                parts: [
                  {
                    kind: 'data',
                    data: {
                      currentNode: status.currentNodeName,
                      completedNodes: status.completedNodes,
                    },
                  } as DataPart,
                ],
              },
            },
            final: false,
          } as TaskStatusUpdateEvent);
        },
      });

      eventBus.publish({
        kind: 'artifact-update',
        taskId,
        contextId: context.contextId,
        artifact: {
          artifactId: 'workflow-result',
          name: 'Workflow Result',
          parts: [{ kind: 'data', data: result as unknown as Record<string, unknown> }],
        },
      } as TaskArtifactUpdateEvent);

      eventBus.publish({
        kind: 'status-update',
        taskId,
        contextId: context.contextId,
        status: {
          state: result.success ? 'completed' : 'failed',
          message: {
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: result.success
                  ? `Workflow completed in ${result.duration}ms`
                  : `Workflow failed: ${result.error}`,
              },
            ],
          },
        },
        final: true,
      } as TaskStatusUpdateEvent);
    } catch (err) {
      eventBus.publish({
        kind: 'status-update',
        taskId,
        contextId: context.contextId,
        status: {
          state: 'failed',
          message: {
            role: 'agent',
            parts: [{ kind: 'text', text: `Error: ${(err as Error).message}` }],
          },
        },
        final: true,
      } as TaskStatusUpdateEvent);
    } finally {
      this.abortControllers.delete(taskId);
      eventBus.finished();
    }
  }

  async cancelTask(taskId: string, eventBus: ExecutionEventBus): Promise<void> {
    const controller = this.abortControllers.get(taskId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(taskId);
    }
    eventBus.publish({
      kind: 'status-update',
      taskId,
      contextId: '',
      status: { state: 'canceled' },
      final: true,
    } as TaskStatusUpdateEvent);
    eventBus.finished();
  }
}
