import { resolve } from 'node:path';
import { createA2AServer } from '../a2a/server.js';
import { DockerRunner } from '../runner/index.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag, loadWorkflowsFromDir, wantsHelp } from './utils.js';

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
  light serve
  light serve --port 8080
  LP_API_KEY=secret light serve`);
      return;
    }

    const dir = getPositional(0) || '.';
    const port = parseInt(getFlagValue('--port', '3000'), 10);
    const apiKey = process.env.LP_API_KEY;
    if (!apiKey) {
      console.log('  No LP_API_KEY set - auth disabled');
    }
    const runner = new DockerRunner({ verbose: hasFlag('--verbose') });

    if (DockerRunner.isAvailable()) {
      const cleaned = DockerRunner.cleanupOrphanVolumes();
      if (cleaned > 0) console.log(`  Cleaned ${cleaned} orphan volume(s)`);
    }

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
