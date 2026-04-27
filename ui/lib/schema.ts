import type { RJSFSchema } from '@rjsf/utils';

interface NodeJson {
  id: string;
  inputs?: { properties?: Record<string, RJSFSchema> };
}

interface LinkJson {
  to: string;
}

interface WorkflowJson {
  nodes?: NodeJson[];
  links?: LinkJson[];
}

export function mergeEntryInputsSchema(wf: WorkflowJson): RJSFSchema | null {
  const targetIds = new Set((wf.links || []).map((l) => l.to));
  const entries = (wf.nodes || []).filter((n) => !targetIds.has(n.id));

  const merged: Record<string, RJSFSchema> = {};
  for (const n of entries) {
    const props = n.inputs?.properties;
    if (!props) continue;
    for (const [k, v] of Object.entries(props)) {
      if (!(k in merged)) merged[k] = v;
    }
  }

  if (Object.keys(merged).length === 0) return null;

  return {
    type: 'object',
    properties: merged,
  };
}
