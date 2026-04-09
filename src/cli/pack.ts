import { existsSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { loadWorkflowFromFolder } from '../CodeLoader.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag, wantsHelp } from './utils.js';

export const pack: Command = {
  desc: 'Pack a workflow folder into a single JSON file',
  usage: 'light pack [<folder>] [--to <file>] [--force]',
  run() {
    if (wantsHelp()) {
      console.log(
        `Usage:\n  light pack [<folder>] [--to <file>] [--force] [--keep]\n\nPack a workflow folder into a single JSON file.\nThe source folder is removed after packing (use --keep to preserve it).\n\nOptions:\n  --to <file>   Output file path (default: <id>.json)\n  --force       Overwrite existing file\n  --keep        Keep the source folder after packing\n\nExamples:\n  light pack hello-world\n  light pack hello-world --to out.json\n  light pack example --keep`,
      );
      return;
    }

    const target = getPositional(0) || '.';
    const dir = pathResolve(target);

    if (!existsSync(dir) || !statSync(dir).isDirectory()) {
      console.error(`Not a workflow folder: ${dir}`);
      process.exit(1);
    }

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

    if (!hasFlag('--keep')) {
      rmSync(dir, { recursive: true });
      console.log(`Packed "${wf.name}" (${wf.id}) -> ${outputPath} (folder removed)`);
    } else {
      console.log(`Packed "${wf.name}" (${wf.id}) -> ${outputPath}`);
    }
  },
};
