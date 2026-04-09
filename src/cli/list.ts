import { existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { type Command, getFlagValue, hasFlag, loadWorkflowsFromDir, wantsHelp } from './utils.js';

export const list: Command = {
  desc: 'List workflows in a directory',
  usage: 'light list [--dir <path>] [--json]',
  run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light list [--dir <path>] [--json]

Lists all workflows found in a directory.
Discovers both JSON files and folder-based workflows.

Options:
  --dir <path>   Directory to scan (default: .)
  --json         Output as JSON

Examples:
  light list
  light list --dir ./my-workflows
  light list --json`);
      return;
    }

    const dir = getFlagValue('--dir') || '.';
    const resolved = resolve(dir);
    const jsonOutput = hasFlag('--json');

    if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
      console.error(`Not a directory: ${resolved}`);
      process.exit(1);
    }

    const workflows = loadWorkflowsFromDir(resolved, true);

    if (jsonOutput) {
      const entries = workflows.map((wf) => ({
        id: wf.id,
        name: wf.name,
        nodes: wf.nodes.size,
        links: wf.links.size,
      }));
      console.log(JSON.stringify(entries, null, 2));
      return;
    }

    if (workflows.length === 0) {
      console.log(`No workflows found in ${resolved}`);
      return;
    }

    console.log(`\n${workflows.length} workflow(s) in ${resolved}\n`);

    const maxName = Math.max(4, ...workflows.map((w) => w.name.length));
    const header = `  ${'Name'.padEnd(maxName)}  Nodes  Links`;
    console.log(header);
    console.log(`  ${'-'.repeat(header.trim().length)}`);

    for (const wf of workflows) {
      const name = wf.name.padEnd(maxName);
      const nodes = String(wf.nodes.size).padStart(5);
      const links = String(wf.links.size).padStart(5);
      console.log(`  ${name}  ${nodes}  ${links}`);
    }

    console.log();
  },
};
