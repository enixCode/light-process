import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { loadWorkflowFromFolder } from '../CodeLoader.js';
import { resolveWorkflowRemote } from '../config.js';
import { createWorkflow, getWorkflow, updateWorkflow } from '../remoteClient.js';
import type { Command } from './utils.js';
import { confirm, getFlagValue, getPositional, hasFlag, wantsHelp } from './utils.js';

async function pushOne(dir: string, remoteOverrideName: string | undefined): Promise<void> {
  const wf = loadWorkflowFromFolder(dir);
  if (!wf) {
    console.error(`Not a valid workflow folder: ${dir}`);
    return;
  }
  const r = remoteOverrideName
    ? { name: remoteOverrideName, remote: resolveWorkflowRemote(dir)?.remote }
    : resolveWorkflowRemote(dir);
  if (!r?.remote) {
    console.error('No remote configured. Run: light remote bind <url> --key <key>');
    process.exit(1);
  }

  const body = wf.toJSON();
  let exists = false;
  try {
    await getWorkflow(r.remote, wf.id);
    exists = true;
  } catch {
    exists = false;
  }

  if (exists) {
    const ok = await confirm(`Workflow "${wf.id}" exists on ${r.name}. Replace?`);
    if (!ok) {
      console.log(`Skipped ${wf.id}`);
      return;
    }
    const res = await updateWorkflow(r.remote, wf.id, body, true);
    console.log(`Updated "${res.name}" (${res.id}) on ${r.name}`);
  } else {
    const res = await createWorkflow(r.remote, body, true);
    console.log(`Created "${res.name}" (${res.id}) on ${r.name}`);
  }
}

function findWorkflowDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    if (statSync(full).isDirectory() && existsSync(join(full, 'workflow.json'))) {
      out.push(full);
    }
  }
  return out;
}

export const push: Command = {
  desc: 'Push a local workflow folder to a remote server',
  usage: 'light push [<name>] [--path <dir>] [--remote <name>] [--yes]',
  async run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light push [<name>] [options]

Push local workflow folder(s) to a remote server.
With no arguments, pushes all workflows in ./workflows/.

Options:
  --path <dir>      Workflow folder path (instead of name lookup)
  --remote <name>   Use a specific remote profile
  --yes, -y         Skip confirmation prompts

Examples:
  light push my-workflow
  light push --path ./custom-dir
  light push --yes`);
      return;
    }

    const remoteName = getFlagValue('--remote');
    const customPath = getFlagValue('--path') ?? getFlagValue('--dir');
    const name = getPositional(0);

    if (customPath) {
      await pushOne(pathResolve(customPath), remoteName);
      return;
    }
    if (name) {
      const dir = pathResolve(join('./workflows', name));
      if (!existsSync(dir)) {
        console.error(`Not found: ${dir}`);
        process.exit(1);
      }
      await pushOne(dir, remoteName);
      return;
    }

    // No arg: push all under ./workflows
    const dirs = findWorkflowDirs(pathResolve('./workflows'));
    if (dirs.length === 0) {
      console.error('No workflows found in ./workflows');
      process.exit(1);
    }
    for (const d of dirs) await pushOne(d, remoteName);
  },
};
