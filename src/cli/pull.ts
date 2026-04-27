import { existsSync, rmSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { exportWorkflowToFolder } from '../CodeLoader.js';
import { getFullWorkflow, listWorkflows } from '../remote/client.js';
import { getRemote } from '../remote/config.js';
import { Workflow } from '../Workflow.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag, wantsHelp } from './utils.js';

async function pullOne(remoteName: string | undefined, id: string, targetDir: string, force: boolean): Promise<void> {
  const r = getRemote(remoteName);
  if (!r) {
    console.error('No remote configured. Run: light remote bind <url> --key <key>');
    process.exit(1);
  }
  if (existsSync(targetDir)) {
    if (!force) {
      console.error(`Target exists: ${targetDir}. Use --force to overwrite or --path <dir> for another location.`);
      process.exit(1);
    }
    rmSync(targetDir, { recursive: true, force: true });
  }
  const json = await getFullWorkflow(r.remote, id);
  const wf = Workflow.fromJSON(json as unknown as Parameters<typeof Workflow.fromJSON>[0]);
  exportWorkflowToFolder(wf, targetDir);
  console.log(`Pulled "${wf.name}" (${wf.id}) from ${r.name} -> ${targetDir}`);
}

export const pull: Command = {
  desc: 'Pull a workflow from a remote server into a local folder',
  usage: 'light pull <id> [--path <dir>] [--force] [--remote <name>] | light pull --all',
  async run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light pull <id> [options]
  light pull --all [options]

Pull workflow(s) from a remote server into local folders.

Options:
  --path <dir>      Target directory (default: ./<id>)
  --force           Overwrite existing target directory
  --remote <name>   Use a specific remote profile
  --all             Pull all workflows from the remote

Examples:
  light pull my-workflow
  light pull my-workflow --path ./custom-dir
  light pull --all --force`);
      return;
    }

    const remoteName = getFlagValue('--remote');
    const customPath = getFlagValue('--path') ?? getFlagValue('--dir');
    const force = hasFlag('--force');

    if (hasFlag('--all')) {
      const r = getRemote(remoteName);
      if (!r) {
        console.error('No remote configured.');
        process.exit(1);
      }
      const list = await listWorkflows(r.remote);
      const base = customPath ?? '.';
      for (const wf of list) {
        const target = pathResolve(join(base, wf.id));
        await pullOne(remoteName, wf.id, target, force);
      }
      return;
    }

    const id = getPositional(0);
    if (!id) {
      console.error('Usage: light pull <id> [--path <dir>] [--force] [--remote <name>]');
      process.exit(1);
    }
    const target = pathResolve(customPath ?? id);
    await pullOne(remoteName, id, target, force);
  },
};
