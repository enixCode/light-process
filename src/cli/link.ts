import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { safeJsonParse } from '../CodeLoader.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag } from './utils.js';

interface LinkJson {
  id?: string;
  name?: string;
  from: string;
  to: string;
  when?: Record<string, unknown>;
  data?: Record<string, unknown>;
  maxIterations?: number;
}

interface NodeRef {
  id: string;
  name: string;
  dir: string;
}

interface WorkflowMeta {
  id: string;
  name: string;
  network?: string | null;
  nodes: NodeRef[];
  links: LinkJson[];
}

function loadMeta(dir: string): { path: string; meta: WorkflowMeta } {
  const path = join(dir, 'workflow.json');
  if (!existsSync(path)) {
    console.error(`Not a workflow folder: ${dir}`);
    process.exit(1);
  }
  const meta = safeJsonParse(readFileSync(path, 'utf-8')) as WorkflowMeta;
  meta.links = meta.links ?? [];
  return { path, meta };
}

function saveMeta(path: string, meta: WorkflowMeta): void {
  writeFileSync(path, JSON.stringify(meta, null, 2));
}

function prompt(rl: ReturnType<typeof createInterface>, q: string): Promise<string> {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a)));
}

async function interactive(dir: string): Promise<void> {
  const { path, meta } = loadMeta(dir);
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log(`\nWorkflow: ${meta.name} (${meta.id})`);
  console.log(`Nodes:`);
  for (let i = 0; i < meta.nodes.length; i++) {
    console.log(`  [${i + 1}] ${meta.nodes[i].id} - ${meta.nodes[i].name}`);
  }
  console.log(`Existing links: ${meta.links.length}`);

  while (true) {
    const ans = (await prompt(rl, '\nAdd a link? (y/n) ')).trim().toLowerCase();
    if (ans !== 'y' && ans !== 'yes') break;

    const fromIdx = parseInt(await prompt(rl, 'From node #: '), 10) - 1;
    const toIdx = parseInt(await prompt(rl, 'To node #: '), 10) - 1;
    if (!meta.nodes[fromIdx] || !meta.nodes[toIdx]) {
      console.log('Invalid index, skipped.');
      continue;
    }
    const link: LinkJson = { from: meta.nodes[fromIdx].id, to: meta.nodes[toIdx].id };

    const wantCond = (await prompt(rl, 'Add condition? (y/n) ')).trim().toLowerCase();
    if (wantCond === 'y' || wantCond === 'yes') {
      const field = (await prompt(rl, 'Field name: ')).trim();
      const op = (await prompt(rl, 'Operator (eq/gt/gte/lt/lte/ne/in/exists): ')).trim();
      const valStr = (await prompt(rl, 'Value (JSON): ')).trim();
      let value: unknown = valStr;
      try {
        value = JSON.parse(valStr);
      } catch {
        // keep as string
      }
      link.when = op === 'eq' ? { [field]: value } : { [field]: { [op]: value } };
    }

    const maxIter = (await prompt(rl, 'maxIterations (empty for none): ')).trim();
    if (maxIter) link.maxIterations = parseInt(maxIter, 10);

    link.id = `${link.from}-${link.to}-${meta.links.length + 1}`;
    meta.links.push(link);
    console.log(`Added: ${link.from} -> ${link.to}${link.when ? ` when ${JSON.stringify(link.when)}` : ''}`);
  }

  const save = (await prompt(rl, '\nSave? (y/n) ')).trim().toLowerCase();
  rl.close();
  if (save === 'y' || save === 'yes') {
    saveMeta(path, meta);
    console.log(`Saved to ${path}`);
  } else {
    console.log('Discarded.');
  }
}

export const link: Command = {
  desc: 'Edit links in a workflow folder (interactive or inline)',
  usage: 'light link <workflow-dir> [--from <id> --to <id> [--when <json>]] | --list | --remove <link-id>',
  async run() {
    const dir = getPositional(0);
    if (!dir) {
      console.error('Usage: light link <workflow-dir> [...]');
      process.exit(1);
    }

    if (hasFlag('--list')) {
      const { meta } = loadMeta(dir);
      for (const l of meta.links) {
        console.log(`${l.id ?? '?'}  ${l.from} -> ${l.to}${l.when ? ` when ${JSON.stringify(l.when)}` : ''}`);
      }
      return;
    }

    const removeId = getFlagValue('--remove');
    if (removeId) {
      const { path, meta } = loadMeta(dir);
      const before = meta.links.length;
      meta.links = meta.links.filter((l) => l.id !== removeId);
      saveMeta(path, meta);
      console.log(`Removed ${before - meta.links.length} link(s)`);
      return;
    }

    const from = getFlagValue('--from');
    const to = getFlagValue('--to');
    if (from && to) {
      const { path, meta } = loadMeta(dir);
      const link: LinkJson = { from, to };
      const whenStr = getFlagValue('--when');
      if (whenStr) link.when = JSON.parse(whenStr);
      const maxIter = getFlagValue('--max-iterations');
      if (maxIter) link.maxIterations = parseInt(maxIter, 10);
      link.id = `${from}-${to}-${meta.links.length + 1}`;
      meta.links.push(link);
      saveMeta(path, meta);
      console.log(`Added link ${link.id}`);
      return;
    }

    await interactive(dir);
  },
};
