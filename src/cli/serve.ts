import { randomBytes } from 'crypto';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { createA2AServer } from '../a2a/server.js';
import { loadWorkflowFromFolder } from '../CodeLoader.js';
import { DockerRunner } from '../runner/index.js';
import { Workflow } from '../Workflow.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag } from './utils.js';

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
    const dir = getPositional(0) || '.';
    const port = parseInt(getFlagValue('--port', '3000'), 10);
    let apiKey = process.env.LP_API_KEY;
    if (!apiKey) {
      apiKey = randomBytes(32).toString('hex');
      console.log(`  Generated API key: ${apiKey}`);
    }
    const runner = new DockerRunner({ verbose: hasFlag('--verbose') });

    const app = createA2AServer({ port, runner, apiKey });

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
