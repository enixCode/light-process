import { existsSync, statSync, unlinkSync } from 'node:fs';
import { resolve as pathResolve } from 'node:path';
import { exportWorkflowToFolder } from '../CodeLoader.js';
import type { Command } from './utils.js';
import { getFlagValue, getPositional, hasFlag, loadWorkflow, wantsHelp } from './utils.js';

export const unpack: Command = {
  desc: 'Unpack a workflow JSON file into a folder structure',
  usage: 'light unpack <file.json> [--to <dir>] [--force]',
  run() {
    if (wantsHelp()) {
      console.log(
        `Usage:\n  light unpack <file.json> [--to <dir>] [--force] [--keep]\n\nUnpack a workflow JSON file into a folder structure.\nThe source JSON is removed after unpacking (use --keep to preserve it).\n\nOptions:\n  --to <dir>    Target directory (default: ./<id>)\n  --force       Overwrite existing directory\n  --keep        Keep the source JSON file after unpacking\n\nExamples:\n  light unpack hello-world.json\n  light unpack example\n  light unpack example --keep`,
      );
      return;
    }

    const target = getPositional(0);
    if (!target) {
      console.error('Usage: light unpack <file.json> [--to <dir>] [--force]');
      process.exit(1);
    }

    const candidates = [pathResolve(target), pathResolve(target.endsWith('.json') ? target : `${target}.json`)];
    const file = candidates.find((f) => existsSync(f) && statSync(f).isFile());
    if (!file) {
      console.error(`File not found: ${target}`);
      process.exit(1);
    }

    const wf = loadWorkflow(file);
    const outputDir = pathResolve(getFlagValue('--to') ?? wf.id);

    if (existsSync(outputDir) && !hasFlag('--force')) {
      console.error(`Folder exists: ${outputDir}. Use --force to overwrite.`);
      process.exit(1);
    }

    exportWorkflowToFolder(wf, outputDir);

    if (!hasFlag('--keep')) {
      unlinkSync(file);
      console.log(`Unpacked "${wf.name}" (${wf.id}) -> ${outputDir} (JSON removed)`);
    } else {
      console.log(`Unpacked "${wf.name}" (${wf.id}) -> ${outputDir}`);
    }
  },
};
