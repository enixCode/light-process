import { existsSync } from 'node:fs';
import { join, resolve as pathResolve } from 'node:path';
import { exportWorkflowToFolder } from '../CodeLoader.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag, loadWorkflow } from './utils.js';

export const unpack: Command = {
  desc: 'Unpack a workflow JSON file into a folder structure',
  usage: 'light unpack <file.json> [--to <dir>] [--force]',
  run() {
    const file = getPositional(0);
    if (!file) {
      console.error('Usage: light unpack <file.json> [--to <dir>] [--force]');
      process.exit(1);
    }

    const wf = loadWorkflow(pathResolve(file));
    const outputDir = pathResolve(getFlagValue('--to') ?? join('./workflows', wf.id));

    if (existsSync(outputDir) && !hasFlag('--force')) {
      console.error(`Folder exists: ${outputDir}. Use --force to overwrite.`);
      process.exit(1);
    }

    exportWorkflowToFolder(wf, outputDir);
    console.log(`Unpacked "${wf.name}" (${wf.id}) -> ${outputDir}`);
  },
};
