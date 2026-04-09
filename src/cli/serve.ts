import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { createA2AServer } from '../a2a/server.js';
import { loadWorkflowFromFolder } from '../CodeLoader.js';
import { DockerRunner } from '../runner/index.js';
import { Workflow } from '../Workflow.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag, wantsHelp } from './utils.js';

function loadWorkflowsFromDir(dir: string): Workflow[] {
  const workflows: Workflow[] = [];
  const absDir = resolve(dir);

  for (const entry of readdirSync(absDir)) {
    const fullPath = join(absDir, entry);
    if (entry.endsWith('.json') && !entry.startsWith('.')) {
      try {
        const raw = JSON.parse(readFileSync(fullPath, 'utf-8'));
        if (raw.nodes && raw.name) {
          workflows.push(Workflow.fromJSON(raw));
        }
      } catch {
        // Skip invalid files
      }
    }
    if (statSync(fullPath).isDirectory()) {
      const wf = loadWorkflowFromFolder(fullPath);
      if (wf) {
        workflows.push(wf);
      }
    }
  }
  return workflows;
}

export const serve: Command = {
  desc: 'Start the A2A API server',
  usage: 'light serve [dir] [--port 3000]',
  async run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light serve [dir] [options]

Options:
  --port <number>   Port to listen on (default: 3000)
  --verbose         Verbose output

Environment:
  LP_API_KEY        Enable API key authentication

Examples:
  light serve ./workflows
  light serve ./workflows --port 8080
  LP_API_KEY=secret light serve ./workflows`);
      return;
    }

    const dir = getPositional(0) || '.';
    const port = parseInt(getFlagValue('--port', '3000'), 10);
    const apiKey = process.env.LP_API_KEY;
    if (!apiKey) {
      console.log('  No LP_API_KEY set - auth disabled');
    }
    const runner = new DockerRunner({ verbose: hasFlag('--verbose') });

    const app = createA2AServer({ port, runner, apiKey, persistDir: resolve(dir) });

    const workflows = loadWorkflowsFromDir(dir);
    for (const wf of workflows) {
      app.registerWorkflow(wf);
      console.log(`  Loaded workflow: ${wf.name} (${wf.id})`);
    }

    if (workflows.length === 0) {
      console.log('  No workflows found. Register via A2A message/send.');
    }

    await app.listen();
  },
};
