import { resolve } from 'node:path';
import { LightRunClient } from '../runner/index.js';
import { createServer } from '../server/index.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, loadWorkflowsFromDir, wantsHelp } from './utils.js';

export const serve: Command = {
  desc: 'Start the REST API server',
  usage: 'light serve [dir] [--port 3000]',
  async run() {
    if (wantsHelp()) {
      console.log(`Usage:
  light serve [dir] [options]

Options:
  --port <number>   Port to listen on (default: 3000)

Environment:
  LP_API_KEY        Enable API key authentication
  LIGHT_RUN_URL     URL of the light-run service (required)
  LIGHT_RUN_TOKEN   Bearer token for light-run (optional)

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
    if (!LightRunClient.isAvailable()) {
      console.error('  LIGHT_RUN_URL is not configured. Set LIGHT_RUN_URL=http://localhost:3001');
      process.exit(1);
    }
    const runner = new LightRunClient();

    const app = createServer({ port, runner, apiKey, persistDir: resolve(dir) });

    const workflows = loadWorkflowsFromDir(dir);
    for (const wf of workflows) {
      app.registerWorkflow(wf);
      console.log(`  Loaded workflow: ${wf.name} (${wf.id})`);
    }

    if (workflows.length === 0) {
      console.log('  No workflows found. Register via POST /api/workflows.');
    }

    await app.listen();
  },
};
