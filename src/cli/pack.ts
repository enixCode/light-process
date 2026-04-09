import { existsSync, writeFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { loadWorkflowFromFolder } from '../CodeLoader.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag } from './utils.js';

export const pack: Command = {
  desc: 'Pack a workflow folder into a single JSON file',
  usage: 'light pack [<folder>] [--to <file>] [--force]',
  run() {
    const dir = pathResolve(getPositional(0) || '.');

    const wf = loadWorkflowFromFolder(dir);
    if (!wf) {
      console.error(`Not a valid workflow folder: ${dir}`);
      process.exit(1);
    }

    const outputPath = pathResolve(getFlagValue('--to') ?? `${wf.id}.json`);

    if (existsSync(outputPath) && !hasFlag('--force')) {
      console.error(`File exists: ${outputPath}. Use --force to overwrite.`);
      process.exit(1);
    }

    writeFileSync(outputPath, JSON.stringify(wf.toJSON(), null, 2));
    console.log(`Packed "${wf.name}" (${wf.id}) -> ${outputPath}`);
  },
};
