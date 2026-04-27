import type { Workflow } from '../Workflow.js';

interface SpecOpts {
  version: string;
  authRequired: boolean;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function publicOp(op: Record<string, unknown>, authRequired: boolean): Record<string, unknown> {
  return authRequired ? { ...op, security: [] } : op;
}

export function buildStaticSpec(opts: SpecOpts): object {
  const { version, authRequired } = opts;

  const components: Record<string, unknown> = {
    schemas: {
      WorkflowSummary: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          nodeCount: { type: 'integer' },
          linkCount: { type: 'integer' },
          entryNodes: { type: 'array', items: { type: 'string' } },
        },
      },
      Workflow: {
        type: 'object',
        required: ['id', 'name', 'nodes', 'links'],
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          network: { type: 'string' },
          nodes: { type: 'array', items: { type: 'object' } },
          links: { type: 'array', items: { type: 'object' } },
        },
      },
      Run: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          workflowId: { type: 'string' },
          workflowName: { type: 'string' },
          status: { type: 'string', enum: ['running', 'success', 'failed'] },
          startedAt: { type: 'string' },
          finishedAt: { type: 'string' },
        },
      },
      Error: {
        type: 'object',
        properties: { error: { type: 'string' } },
      },
    },
  };

  if (authRequired) {
    components.securitySchemes = {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Token' },
    };
  }

  const jsonResponse = (ref: string) => ({
    content: { 'application/json': { schema: { $ref: `#/components/schemas/${ref}` } } },
  });
  const errorResponse = {
    content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
  };

  const paths: Record<string, Record<string, unknown>> = {
    '/health': {
      get: publicOp(
        {
          tags: ['Meta'],
          summary: 'Health check',
          operationId: 'getHealth',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      status: { type: 'string' },
                      version: { type: 'string' },
                      commit: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        authRequired,
      ),
    },
    '/api/meta': {
      get: publicOp(
        {
          tags: ['Meta'],
          summary: 'Server metadata',
          operationId: 'getMeta',
          responses: {
            '200': {
              description: 'OK',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      authRequired: { type: 'boolean' },
                      version: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
        authRequired,
      ),
    },
    '/api/workflows': {
      get: {
        tags: ['Workflows'],
        summary: 'List workflow summaries',
        operationId: 'listWorkflows',
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/WorkflowSummary' } },
              },
            },
          },
        },
      },
      post: {
        tags: ['Workflows'],
        summary: 'Register a workflow',
        operationId: 'createWorkflow',
        parameters: [{ name: 'persist', in: 'query', schema: { type: 'boolean' } }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } },
        },
        responses: {
          '201': {
            description: 'Created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    persisted: { type: 'boolean' },
                  },
                },
              },
            },
          },
          '409': { description: 'Conflict', ...errorResponse },
          '400': { description: 'Bad request', ...errorResponse },
        },
      },
    },
    '/api/workflows/{id}': {
      get: {
        tags: ['Workflows'],
        summary: 'Get workflow',
        operationId: 'getWorkflow',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'full', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          '200': { description: 'OK', ...jsonResponse('Workflow') },
          '404': { description: 'Not found', ...errorResponse },
        },
      },
      put: {
        tags: ['Workflows'],
        summary: 'Replace a workflow',
        operationId: 'replaceWorkflow',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'persist', in: 'query', schema: { type: 'boolean' } },
        ],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Workflow' } } },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    updated: { type: 'boolean' },
                    persisted: { type: 'boolean' },
                  },
                },
              },
            },
          },
          '404': { description: 'Not found', ...errorResponse },
          '400': { description: 'Bad request', ...errorResponse },
        },
      },
      delete: {
        tags: ['Workflows'],
        summary: 'Delete a workflow',
        operationId: 'deleteWorkflow',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'persist', in: 'query', schema: { type: 'boolean' } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    deleted: { type: 'boolean' },
                    id: { type: 'string' },
                    unpersisted: { type: 'boolean' },
                  },
                },
              },
            },
          },
          '404': { description: 'Not found', ...errorResponse },
        },
      },
    },
    '/api/workflows/{id}/run': {
      post: {
        tags: ['Workflows'],
        summary: 'Execute a workflow',
        operationId: 'runWorkflow',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object' } } },
        },
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { runId: { type: 'string' }, success: { type: 'boolean' } },
                },
              },
            },
          },
          '500': { description: 'Execution error', ...errorResponse },
        },
      },
    },
    '/api/runs': {
      get: {
        tags: ['Runs'],
        summary: 'List runs',
        operationId: 'listRuns',
        parameters: [
          { name: 'workflowId', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['running', 'success', 'failed'] } },
          { name: 'limit', in: 'query', schema: { type: 'integer' } },
        ],
        responses: {
          '200': {
            description: 'OK',
            content: {
              'application/json': { schema: { type: 'array', items: { $ref: '#/components/schemas/Run' } } },
            },
          },
        },
      },
    },
    '/api/runs/{id}': {
      get: {
        tags: ['Runs'],
        summary: 'Get a run',
        operationId: 'getRun',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': { description: 'OK', ...jsonResponse('Run') },
          '404': { description: 'Not found', ...errorResponse },
        },
      },
    },
  };

  return {
    openapi: '3.1.0',
    info: {
      title: 'Light Process API',
      version,
      description: 'DAG workflow orchestrator control plane',
    },
    components,
    ...(authRequired ? { security: [{ bearerAuth: [] }] } : {}),
    paths,
  };
}

export function buildWorkflowsSpec(workflows: Map<string, Workflow>, opts: SpecOpts): object {
  const { version, authRequired } = opts;

  const components: Record<string, unknown> = {};
  if (authRequired) {
    components.securitySchemes = {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'Token' },
    };
  }

  const paths: Record<string, Record<string, unknown>> = {};
  for (const wf of workflows.values()) {
    const entry = wf.getEntryNodes()[0];
    const inputSchema = entry?.inputs ?? { type: 'object' };
    const op: Record<string, unknown> = {
      tags: ['Workflows'],
      summary: `Run ${wf.name}`,
      description: `Execute workflow "${wf.name}" (${wf.nodes.size} nodes, ${wf.links.size} links).`,
      operationId: `run_${wf.id}`,
      requestBody: {
        required: false,
        content: { 'application/json': { schema: inputSchema } },
      },
      responses: {
        '200': {
          description: 'Execution result',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { runId: { type: 'string' }, success: { type: 'boolean' } },
              },
            },
          },
        },
      },
    };
    paths[`/api/workflows/${wf.id}/run`] = { post: op };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Light Process Workflows',
      version,
      description: 'Per-workflow run endpoints. Regenerated on every request from the in-memory registry.',
    },
    components,
    ...(authRequired ? { security: [{ bearerAuth: [] }] } : {}),
    paths,
  };
}

export function renderScalarHtml(specUrl: string, title: string): string {
  const safeTitle = escapeHtml(title);
  return `<!doctype html>
<html>
  <head>
    <title>${safeTitle}</title>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body>
    <div id="app"></div>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
    <script>
      Scalar.createApiReference('#app', {
        url: '${specUrl}',
        persistAuth: true,
        hideClientButton: false,
      })
    </script>
  </body>
</html>`;
}
