import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { safeJsonParse } from '../CodeLoader.js';
import { generateDts } from '../helpers.js';
import type { IOSchema } from '../schema.js';
import { displayFields, promptYesNo, schemaFlow, summarizeFields } from './node-schema-editor.js';
import type { Command } from './utils.js';
import { getPositional, hasFlag, wantsHelp } from './utils.js';

interface NodeJson {
  id: string;
  name: string;
  image: string;
  entrypoint: string;
  setup: string[];
  timeout: number;
  network: string | null;
  inputs: IOSchema | null;
  outputs: IOSchema | null;
}

interface WorkflowMeta {
  nodes: Array<{ id: string; name: string; dir: string }>;
  links: Array<{
    id: string;
    from: string;
    to: string;
    data: Record<string, unknown>;
    when: Record<string, unknown> | null;
  }>;
}

function readNodeJson(dir: string): NodeJson {
  const nodeJsonPath = join(dir, '.node.json');
  if (!existsSync(nodeJsonPath)) {
    console.error(`No .node.json found in ${dir}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(nodeJsonPath, 'utf-8'));
}

function writeDtsIfJs(dir: string, nodeJson: NodeJson): void {
  if (existsSync(join(dir, 'lp.js'))) {
    writeFileSync(join(dir, 'lp.d.ts'), generateDts(nodeJson.inputs, nodeJson.outputs));
  }
}

async function infoCommand(dir: string): Promise<void> {
  const nodeJson = readNodeJson(dir);

  const parentDir = dirname(dir);
  const workflowPath = join(parentDir, 'workflow.json');
  const hasWorkflow = existsSync(workflowPath);

  let receivesFrom: Array<{
    nodeId: string;
    nodeName: string;
    outputs: IOSchema | null;
    data: Record<string, unknown>;
    when: Record<string, unknown> | null;
  }> | null = null;

  if (hasWorkflow) {
    const meta = safeJsonParse(readFileSync(workflowPath, 'utf-8')) as WorkflowMeta;
    const dirName = basename(dir);
    const nodeRef = meta.nodes?.find((n) => n.dir === dirName);

    if (nodeRef) {
      const incomingLinks = (meta.links || []).filter((l) => l.to === nodeRef.id);
      receivesFrom = [];

      for (const link of incomingLinks) {
        const srcRef = meta.nodes.find((n) => n.id === link.from);
        let srcOutputs: IOSchema | null = null;

        if (srcRef) {
          const srcNodePath = join(parentDir, srcRef.dir, '.node.json');
          if (existsSync(srcNodePath)) {
            const srcNode = JSON.parse(readFileSync(srcNodePath, 'utf-8'));
            srcOutputs = srcNode.outputs ?? null;
          }
        }

        receivesFrom.push({
          nodeId: link.from,
          nodeName: srcRef?.name ?? link.from,
          outputs: srcOutputs,
          data: link.data || {},
          when: link.when ?? null,
        });
      }
    }
  }

  if (hasFlag('--json')) {
    console.log(
      JSON.stringify(
        {
          name: nodeJson.name,
          id: nodeJson.id,
          image: nodeJson.image,
          entrypoint: nodeJson.entrypoint,
          inputs: nodeJson.inputs,
          outputs: nodeJson.outputs,
          receivesFrom,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log(`Node: ${nodeJson.name} (${nodeJson.id})`);
  console.log(`Image: ${nodeJson.image || '(none)'}`);
  console.log(`Entrypoint: ${nodeJson.entrypoint || '(none)'}`);

  console.log('\nInputs:');
  if (nodeJson.inputs) displayFields(nodeJson.inputs);
  else console.log('  (no schema defined)');

  console.log('\nOutputs:');
  if (nodeJson.outputs) displayFields(nodeJson.outputs);
  else console.log('  (no schema defined)');

  if (receivesFrom === null) {
    if (!hasWorkflow) return;
    console.log('\n(node not found in parent workflow)');
    return;
  }

  console.log('\nReceives from:');
  if (receivesFrom.length === 0) {
    console.log('  (entry node - no incoming links)');
    return;
  }

  for (const src of receivesFrom) {
    const fields = src.outputs ? summarizeFields(src.outputs) : '(schema unavailable)';
    console.log(`  ${src.nodeName} -> ${fields}`);
    if (src.when) console.log(`    when: ${JSON.stringify(src.when)}`);
    if (Object.keys(src.data).length > 0) console.log(`    data: ${JSON.stringify(src.data)}`);
  }
}

function registerCommand(dir: string): void {
  const nodeJson = readNodeJson(dir);
  const nodeName = basename(dir);

  const parentDir = dirname(dir);
  const workflowPath = join(parentDir, 'workflow.json');
  if (!existsSync(workflowPath)) {
    console.error(`No workflow.json found in ${parentDir}`);
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(workflowPath, 'utf-8'));
  if (!Array.isArray(meta.nodes)) {
    console.error('workflow.json has no nodes array');
    process.exit(1);
  }

  const id = nodeJson.id || nodeName;
  const name = nodeJson.name || nodeName;

  if (meta.nodes.some((n: any) => n.dir === nodeName || n.id === id)) {
    console.log(`Node "${id}" is already registered in workflow.json`);
    return;
  }

  meta.nodes.push({ id, name, dir: nodeName });
  writeFileSync(workflowPath, JSON.stringify(meta, null, 2));
  console.log(`Registered node "${name}" (${id}) in workflow.json`);
}

async function schemaCommand(dir: string): Promise<void> {
  const nodeJsonPath = join(dir, '.node.json');
  const nodeJson = readNodeJson(dir);
  console.log(`Node: ${nodeJson.name} (${nodeJson.id})`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  nodeJson.inputs = await schemaFlow(rl, 'Inputs', nodeJson.inputs);
  nodeJson.outputs = await schemaFlow(rl, 'Outputs', nodeJson.outputs);

  const save = await promptYesNo(rl, '\nSave? (y/n): ');
  rl.close();

  if (save) {
    writeFileSync(nodeJsonPath, JSON.stringify(nodeJson, null, 2));
    writeDtsIfJs(dir, nodeJson);
    console.log(`Updated ${nodeJsonPath}`);
  } else {
    console.log('Discarded.');
  }
}

function helpersCommand(dir: string): void {
  const nodeJson = readNodeJson(dir);
  writeDtsIfJs(dir, nodeJson);
  console.log('Updated lp.d.ts');
}

export const node: Command = {
  desc: 'Manage nodes (info, schema, register, helpers)',
  usage: 'light node <info|schema|register|helpers> <dir>',
  async run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light node info <dir>         Show node metadata, schema, and incoming links
  light node info <dir> --json  Output as JSON
  light node schema <dir>       Edit input/output schema interactively
  light node register <dir>     Register a node folder in the parent workflow.json
  light node helpers <dir>      Regenerate lp.d.ts from schema (for autocomplete)

Examples:
  light node info my-node
  light node info my-node --json
  light node schema my-node
  light node schema example/hello
  light node register my-workflow/my-node
  light node helpers my-node`);
      return;
    }

    const action = getPositional(0);

    if (action === 'info') {
      await infoCommand(resolve(getPositional(1) || '.'));
      return;
    }

    if (action === 'schema') {
      if (hasFlag('--no-prompt')) {
        console.log('Schema editing requires interactive mode.');
        return;
      }
      await schemaCommand(resolve(getPositional(1) || '.'));
      return;
    }

    if (action === 'register') {
      registerCommand(resolve(getPositional(1) || '.'));
      return;
    }

    if (action === 'helpers') {
      helpersCommand(resolve(getPositional(1) || '.'));
      return;
    }

    if (!action) {
      console.error('Usage: light node <info|schema|register|helpers> <dir>');
      process.exit(1);
    }

    console.error(`Unknown node action: ${action}`);
    process.exit(1);
  },
};
