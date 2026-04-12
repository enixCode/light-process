import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import type { IOSchema, JSONSchema } from '../schema.js';
import type { Command } from './utils.js';
import { getPositional, hasFlag, wantsHelp } from './utils.js';

const TYPES = ['string', 'number', 'boolean', 'array', 'object'] as const;

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

function prompt(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
}

async function promptType(rl: ReturnType<typeof createInterface>): Promise<string> {
  console.log('  Type:');
  for (let i = 0; i < TYPES.length; i++) {
    console.log(`    ${i + 1}. ${TYPES[i]}`);
  }
  while (true) {
    const ans = await prompt(rl, '  > ');
    const idx = parseInt(ans, 10) - 1;
    if (idx >= 0 && idx < TYPES.length) return TYPES[idx];
    console.log(`  Pick 1-${TYPES.length}`);
  }
}

async function promptField(
  rl: ReturnType<typeof createInterface>,
): Promise<{ name: string; schema: JSONSchema; required: boolean }> {
  const name = await prompt(rl, '  Field name: ');
  const type = await promptType(rl);

  const schema: JSONSchema = { type: type as JSONSchema['type'] };

  if (type === 'array') {
    console.log('  Item type:');
    for (let i = 0; i < TYPES.length; i++) {
      console.log(`    ${i + 1}. ${TYPES[i]}`);
    }
    while (true) {
      const ans = await prompt(rl, '  > ');
      const idx = parseInt(ans, 10) - 1;
      if (idx >= 0 && idx < TYPES.length) {
        schema.items = { type: TYPES[idx] as JSONSchema['type'] };
        break;
      }
      console.log(`  Pick 1-${TYPES.length}`);
    }
  }

  const desc = await prompt(rl, '  Description (enter to skip): ');
  if (desc) schema.description = desc;

  const req = (await prompt(rl, '  Required? (y/n): ')).toLowerCase();
  const required = req === 'y' || req === 'yes';

  return { name, schema, required };
}

function displayFields(schema: IOSchema): void {
  const props = schema.properties || {};
  const required = schema.required || [];
  const keys = Object.keys(props);
  if (keys.length === 0) {
    console.log('  (no fields)');
    return;
  }
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const p = props[key];
    const type = p.type || 'any';
    const req = required.includes(key) ? ', required' : '';
    const desc = p.description ? ` - ${p.description}` : '';
    console.log(`  ${i + 1}. ${key} (${type}${req})${desc}`);
  }
}

async function buildFromScratch(rl: ReturnType<typeof createInterface>): Promise<IOSchema | null> {
  const want = (await prompt(rl, 'Add fields? (y/n): ')).toLowerCase();
  if (want !== 'y' && want !== 'yes') return null;

  const properties: Record<string, JSONSchema> = {};
  const required: string[] = [];

  while (true) {
    const field = await promptField(rl);
    properties[field.name] = field.schema;
    if (field.required) required.push(field.name);

    const more = (await prompt(rl, '  Add another? (y/n): ')).toLowerCase();
    if (more !== 'y' && more !== 'yes') break;
  }

  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
}

async function editExisting(rl: ReturnType<typeof createInterface>, schema: IOSchema): Promise<IOSchema | null> {
  const properties = { ...schema.properties };
  const required = [...(schema.required || [])];

  displayFields({ type: 'object', properties, required });

  while (true) {
    const action = (await prompt(rl, '\nAction (add/edit/remove/done): ')).toLowerCase();

    if (action === 'done' || action === 'd') break;

    if (action === 'add' || action === 'a') {
      const field = await promptField(rl);
      properties[field.name] = field.schema;
      if (field.required && !required.includes(field.name)) required.push(field.name);
      console.log(`  Added: ${field.name}`);
      displayFields({ type: 'object', properties, required });
      continue;
    }

    if (action === 'edit' || action === 'e') {
      const keys = Object.keys(properties);
      if (keys.length === 0) {
        console.log('  No fields to edit.');
        continue;
      }
      displayFields({ type: 'object', properties, required });
      const idx = parseInt(await prompt(rl, '  Which field? (#): '), 10) - 1;
      if (idx < 0 || idx >= keys.length) {
        console.log('  Invalid.');
        continue;
      }
      const oldName = keys[idx];
      const field = await promptField(rl);
      // Remove old, add new
      delete properties[oldName];
      const reqIdx = required.indexOf(oldName);
      if (reqIdx !== -1) required.splice(reqIdx, 1);
      properties[field.name] = field.schema;
      if (field.required && !required.includes(field.name)) required.push(field.name);
      console.log(`  Updated: ${oldName} -> ${field.name}`);
      displayFields({ type: 'object', properties, required });
      continue;
    }

    if (action === 'remove' || action === 'r') {
      const keys = Object.keys(properties);
      if (keys.length === 0) {
        console.log('  No fields to remove.');
        continue;
      }
      displayFields({ type: 'object', properties, required });
      const idx = parseInt(await prompt(rl, '  Which field? (#): '), 10) - 1;
      if (idx < 0 || idx >= keys.length) {
        console.log('  Invalid.');
        continue;
      }
      const name = keys[idx];
      delete properties[name];
      const reqIdx = required.indexOf(name);
      if (reqIdx !== -1) required.splice(reqIdx, 1);
      console.log(`  Removed: ${name}`);
      displayFields({ type: 'object', properties, required });
      continue;
    }

    console.log('  Unknown action. Use: add, edit, remove, done');
  }

  if (Object.keys(properties).length === 0) return null;
  return { type: 'object', properties, ...(required.length > 0 ? { required } : {}) };
}

async function schemaFlow(
  rl: ReturnType<typeof createInterface>,
  label: string,
  current: IOSchema | null,
): Promise<IOSchema | null> {
  console.log(`\n--- ${label} ---`);
  if (current) {
    console.log(`Current ${label.toLowerCase()} fields:`);
    return editExisting(rl, current);
  }
  console.log(`No ${label.toLowerCase()} schema defined.`);
  return buildFromScratch(rl);
}

async function schemaCommand(dir: string): Promise<void> {
  const nodeJsonPath = join(dir, '.node.json');
  if (!existsSync(nodeJsonPath)) {
    console.error(`No .node.json found in ${dir}`);
    process.exit(1);
  }

  const nodeJson: NodeJson = JSON.parse(readFileSync(nodeJsonPath, 'utf-8'));
  console.log(`Node: ${nodeJson.name} (${nodeJson.id})`);

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const inputs = await schemaFlow(rl, 'Inputs', nodeJson.inputs);
  const outputs = await schemaFlow(rl, 'Outputs', nodeJson.outputs);

  nodeJson.inputs = inputs;
  nodeJson.outputs = outputs;

  const save = (await prompt(rl, '\nSave? (y/n): ')).toLowerCase();
  rl.close();

  if (save === 'y' || save === 'yes') {
    writeFileSync(nodeJsonPath, JSON.stringify(nodeJson, null, 2));
    console.log(`Updated ${nodeJsonPath}`);
  } else {
    console.log('Discarded.');
  }
}

export const node: Command = {
  desc: 'Manage nodes (schema editor)',
  usage: 'light node schema <dir>',
  async run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light node schema <dir>       Edit input/output schema interactively

Options:
  --no-prompt                   Skip interactive mode (for CI)

Examples:
  light node schema my-node
  light node schema example/hello`);
      return;
    }

    const action = getPositional(0);

    if (action === 'schema') {
      if (hasFlag('--no-prompt')) {
        console.log('Schema editing requires interactive mode.');
        return;
      }
      const dir = resolve(getPositional(1) || '.');
      await schemaCommand(dir);
      return;
    }

    if (!action) {
      console.error('Usage: light node schema <dir>');
      process.exit(1);
    }

    console.error(`Unknown node action: ${action}`);
    process.exit(1);
  },
};
