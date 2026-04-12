import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadWorkflowFromFolder, slugify } from '../CodeLoader.js';
import { Workflow } from '../Workflow.js';

export interface Command {
  desc: string;
  usage: string;
  run: () => Promise<void> | void;
}

const args = process.argv.slice(2);

const VALUE_FLAGS = new Set([
  '--input',
  '--input-file',
  '--dir',
  '--path',
  '--port',
  '--temp-dir',
  '--lang',
  '--timeout',
  '--when',
  '--data',
  '--max-iterations',
  '--key',
  '--name',
  '--remote',
  '--from',
  '--to',
  '--remove',
  '--edit',
]);

export function getPositional(n: number): string | undefined {
  let count = 0;
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('-')) {
      if (VALUE_FLAGS.has(args[i])) i++;
      continue;
    }
    if (count === n) return args[i];
    count++;
  }
  return undefined;
}

export function hasFlag(flag: string): boolean {
  return args.includes(flag);
}

export function wantsHelp(): boolean {
  return hasFlag('--help') || hasFlag('-h');
}

export async function confirm(msg: string): Promise<boolean> {
  if (hasFlag('--yes') || hasFlag('-y')) return true;
  process.stdout.write(`${msg} (y/N) `);
  return new Promise((resolve) => {
    process.stdin.setEncoding('utf-8');
    process.stdin.once('data', (data) => {
      const ans = String(data).trim().toLowerCase();
      resolve(ans === 'y' || ans === 'yes');
      process.stdin.pause();
    });
  });
}

export function getFlagValue(flag: string): string | undefined;
export function getFlagValue(flag: string, fallback: string): string;
export function getFlagValue(flag: string, fallback?: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx > -1 ? args[idx + 1] : fallback;
}

export function loadWorkflow(file: string): Workflow {
  const content = readFileSync(file, 'utf-8');
  return Workflow.fromJSON(JSON.parse(content));
}

export function resolveWorkflow(target: string, dir: string): Workflow {
  if (target.endsWith('.json') || existsSync(target)) {
    try {
      return loadWorkflow(target);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  if (existsSync(dir)) {
    const workflows = loadWorkflowsFromDir(dir, true);
    const t = target.toLowerCase();
    const found = workflows.find((wf) => wf.id === target || wf.name.toLowerCase() === t);
    if (found) return found;
  }

  const filePath = join(dir, target.endsWith('.json') ? target : `${target}.json`);
  if (existsSync(filePath)) {
    try {
      return loadWorkflow(filePath);
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }

  console.error(`Workflow not found: ${target}`);
  console.error(`Searched in: ${resolve(dir)}`);

  if (existsSync(dir)) {
    const available = loadWorkflowsFromDir(dir, true);
    if (available.length > 0) {
      console.error('\nAvailable workflows:');
      for (const wf of available) {
        console.error(`  - ${wf.name} (${wf.id})`);
      }
    }
  }
  process.exit(1);
}

export function loadWorkflowsFromDir(dir: string, silent = false): Workflow[] {
  if (!existsSync(dir)) return [];

  const workflows: Workflow[] = [];
  const seen = new Set<string>();

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      const wf = loadWorkflowFromFolder(fullPath);
      if (wf && !seen.has(wf.id)) {
        seen.add(wf.id);
        workflows.push(wf);
        if (!silent) console.log(`  + ${entry}/ (folder)`);
      }
    } else if (stat.isFile() && entry.endsWith('.json') && !entry.startsWith('.')) {
      try {
        const raw = JSON.parse(readFileSync(fullPath, 'utf-8'));
        if (!raw.nodes || !raw.name) continue;
        const wf = Workflow.fromJSON(raw);
        if (!seen.has(wf.id)) {
          seen.add(wf.id);
          workflows.push(wf);
          if (!silent) console.log(`  + ${entry}`);
        }
      } catch {
        if (!silent) console.error(`  x ${entry}: invalid workflow`);
      }
    }
  }
  return workflows;
}

export { slugify };
