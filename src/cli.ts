#!/usr/bin/env node

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { check } from './cli/check.js';
import { config } from './cli/config.js';
import { describe } from './cli/describe.js';
import { doctor } from './cli/doctor.js';
import { init } from './cli/init.js';
import { link } from './cli/link.js';
import { pull } from './cli/pull.js';
import { push } from './cli/push.js';
import { remote } from './cli/remote.js';
import { run } from './cli/run.js';
import { serve } from './cli/serve.js';
import type { Command } from './cli/utils.js';

const MIN_NODE_MAJOR = 18;
const nodeMajor = parseInt(process.version.slice(1), 10);
if (nodeMajor < MIN_NODE_MAJOR) {
  console.error(`light-process requires Node.js >= ${MIN_NODE_MAJOR}.0.0 (current: ${process.version})`);
  console.error('Download the latest LTS from https://nodejs.org');
  process.exit(1);
}

const commands: Record<string, Command> = {
  run,
  serve,
  init,
  check,
  describe,
  doctor,
  config,
  remote,
  pull,
  push,
  link,
  help: {
    desc: 'Show help',
    usage: 'light help [command]',
    run() {
      const cmd = process.argv[3];
      if (cmd && commands[cmd]) {
        console.log(`\n${cmd}: ${commands[cmd].desc}`);
        console.log(`Usage: ${commands[cmd].usage}\n`);
        return;
      }

      console.log(`
Light Process CLI

Commands:
${Object.entries(commands)
  .map(([name, { desc }]) => `  ${name.padEnd(12)} ${desc}`)
  .join('\n')}

Options:
  --version, -v   Show version
  --verbose       Verbose output
  --json          JSON output

Examples:
  light run ./workflows/example
  light run --node ./my-node
`);
    },
  },
};

const command = process.argv[2];

if (command === '--version' || command === '-v') {
  const __filename = fileURLToPath(import.meta.url);
  const pkg = JSON.parse(readFileSync(join(dirname(__filename), '..', 'package.json'), 'utf-8'));
  console.log(`light-process v${pkg.version}`);
  process.exit(0);
}

if (!command || command === '--help' || command === '-h') {
  commands.help.run();
} else if (commands[command]) {
  Promise.resolve(commands[command].run()).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: ${command}`);
  commands.help.run();
  process.exit(1);
}
