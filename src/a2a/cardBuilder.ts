import type { AgentCard } from '@a2a-js/sdk';
import type { Node } from '../models/index.js';
import type { IOSchema } from '../schema.js';
import type { Workflow } from '../Workflow.js';

export interface CardOptions {
  /** Agent name (default: 'Light Process') */
  name?: string;
  /** Agent description */
  description?: string;
  /** Base URL where the agent is accessible */
  url?: string;
  /** Protocol version (default: '0.2.1') */
  protocolVersion?: string;
  /** Documentation URL */
  documentationUrl?: string;
  /** Whether API key auth is enabled (advertises securitySchemes in the card) */
  apiKey?: boolean;
}

function describeSchema(schema: IOSchema): string {
  if (!schema.properties) return '{}';
  const fields = Object.entries(schema.properties).map(([key, val]) => {
    const v = val as Record<string, unknown>;
    const required = schema.required?.includes(key) ? ' (required)' : '';
    const type = (v.type as string) || 'any';
    const desc = v.description ? ` - ${v.description}` : '';
    return `  ${key}: ${type}${required}${desc}`;
  });
  return fields.join('\n');
}

function describeCondition(when: Record<string, unknown>): string {
  return Object.entries(when)
    .map(([key, val]) => {
      if (key === 'or' && Array.isArray(val)) {
        const subs = val.map((c) => describeCondition(c as Record<string, unknown>));
        return `(${subs.join(' OR ')})`;
      }
      if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
        const ops = val as Record<string, unknown>;
        return Object.entries(ops)
          .map(([op, v]) => `${key} ${op} ${JSON.stringify(v)}`)
          .join(', ');
      }
      return `${key} == ${JSON.stringify(val)}`;
    })
    .join(', ');
}

function buildSkillDescription(wf: Workflow): string {
  const lines: string[] = [];
  const nodes = Array.from(wf.nodes.values());
  const entryNodes = wf.getEntryNodes();

  // Overview
  lines.push(`Workflow "${wf.name}" with ${nodes.length} step(s).`);

  // Entry node inputs
  const inputNodes = entryNodes.filter((n) => n.inputs);
  if (inputNodes.length > 0) {
    lines.push('');
    lines.push('Expected input:');
    for (const node of inputNodes) {
      if (inputNodes.length > 1) lines.push(`  ${node.name}:`);
      lines.push(describeSchema(node.inputs!));
    }
  }

  // Final node outputs
  const exitNodes = nodes.filter((n) => wf.getOutgoingLinks(n.id).length === 0);
  const outputNodes = exitNodes.filter((n) => n.outputs);
  if (outputNodes.length > 0) {
    lines.push('');
    lines.push('Output:');
    for (const node of outputNodes) {
      if (outputNodes.length > 1) lines.push(`  ${node.name}:`);
      lines.push(describeSchema(node.outputs!));
    }
  }

  return lines.join('\n');
}

function buildSkillExamples(wf: Workflow): string[] {
  const examples: string[] = [];
  const entryNodes = wf.getEntryNodes();

  // Build an example input from entry node schemas
  for (const node of entryNodes) {
    if (!node.inputs?.properties) continue;
    const example: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(node.inputs.properties)) {
      const v = val as Record<string, unknown>;
      if (v.default !== undefined) {
        example[key] = v.default;
        continue;
      }
      if (v.enum && Array.isArray(v.enum) && v.enum.length > 0) {
        example[key] = v.enum[0];
        continue;
      }
      switch (v.type) {
        case 'string':
          example[key] = `example_${key}`;
          break;
        case 'number':
        case 'integer':
          example[key] = 1;
          break;
        case 'boolean':
          example[key] = true;
          break;
        case 'array':
          example[key] = [];
          break;
        case 'object':
          example[key] = {};
          break;
      }
    }
    examples.push(`Send data: ${JSON.stringify(example)}`);
  }

  // Generic usage example
  examples.push(`Specify workflowId: "${wf.id}" or workflowName: "${wf.name}" in your data part.`);

  return examples;
}

const IMAGE_TO_LANG: Record<string, string> = {
  node: 'javascript',
  python: 'python',
  ruby: 'ruby',
  golang: 'go',
  rust: 'rust',
  openjdk: 'java',
  php: 'php',
  swift: 'swift',
  gcc: 'c',
  ubuntu: 'shell',
  alpine: 'shell',
  debian: 'shell',
};

function buildSkillTags(wf: Workflow): string[] {
  const tags = new Set<string>(['workflow']);
  for (const node of wf.nodes.values()) {
    if (node.image) {
      const base = node.image.split(':')[0].split('/').pop() || '';
      const lang = IMAGE_TO_LANG[base];
      if (lang) tags.add(lang);
    }
    if (node.type !== 'docker') tags.add(node.type);
  }
  if (wf.links.size > 0) tags.add('multi-step');
  const hasConditions = Array.from(wf.links.values()).some((l) => l.when);
  if (hasConditions) tags.add('conditional');
  const hasLoops = Array.from(wf.links.values()).some((l) => l.maxIterations != null);
  if (hasLoops) tags.add('loop');
  return Array.from(tags);
}

/** Build an A2A AgentCard from registered workflows */
export function buildAgentCard(workflows: Map<string, Workflow>, options: CardOptions = {}): AgentCard {
  const skills = Array.from(workflows.values()).map((wf) => ({
    id: wf.id,
    name: wf.name,
    description: buildSkillDescription(wf),
    tags: buildSkillTags(wf),
    examples: buildSkillExamples(wf),
  }));

  const card: AgentCard = {
    name: options.name || 'Light Process',
    description: options.description || 'Workflow engine with Docker container isolation',
    url: options.url || 'http://localhost:3000',
    protocolVersion: options.protocolVersion || '0.2.1',
    capabilities: {
      streaming: true,
      pushNotifications: false,
      stateTransitionHistory: true,
    },
    defaultInputModes: ['application/json'],
    defaultOutputModes: ['application/json'],
    version: '0.1.0',
    skills,
  };

  if (options.documentationUrl) {
    card.documentationUrl = options.documentationUrl;
  }

  if (options.apiKey) {
    card.securitySchemes = {
      apiKey: { type: 'apiKey', name: 'Authorization', in: 'header', description: 'Bearer token' },
    };
    card.security = [{ apiKey: [] }];
  }

  return card;
}
