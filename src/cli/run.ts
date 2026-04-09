import { existsSync, readFileSync, statSync } from 'fs';
import { resolve } from 'path';
import { loadDirectory, loadWorkflowFromFolder } from '../CodeLoader.js';
import { DEFAULT_IGNORE } from '../defaults.js';
import { Node } from '../models/index.js';
import { DockerRunner } from '../runner/index.js';
import { Workflow } from '../Workflow.js';
import { type Command, getFlagValue, getPositional, hasFlag, resolveWorkflow, wantsHelp } from './utils.js';

export const run: Command = {
  desc: 'Run a workflow or single node',
  usage: 'light run <file|id|name> [--node] [--input <file|json>] [--json] [--timeout <ms>]',
  async run() {
    const target = getPositional(0);
    const isNode = hasFlag('--node');

    const showHelp = wantsHelp() || target === '--help' || target === '-h';
    if (showHelp || (!target && !isNode)) {
      console.log(`Usage:
  light run <file|dir|id|name> [options]
  light run --node [dir] [options]

Options:
  --input <file|json>   Input data (JSON file path or inline JSON string)
  --input-file <file>   Input data from a JSON file
  --dir <dir>           Workflow search directory (default: ./workflows)
  --json                Output result as JSON
  --json-source         Prefer .json file over folder when both exist
  --timeout <ms>        Global timeout in ms (default: 0 = unlimited)
  --node                Run current directory as a single node (reads .node.json)
                        If input.json exists, it is used as default input

Examples:
  light run ./workflows/my-workflow.json
  light run my-workflow --input '{"key": "value"}'
  light run my-workflow --input data.json --json
  light run --node ./my-node`);
      process.exit(showHelp ? 0 : 1);
    }

    const jsonOutput = hasFlag('--json');
    const inputFlag = getFlagValue('--input');
    const inputFileFlag = getFlagValue('--input-file');
    if (inputFlag && inputFileFlag) {
      console.error('Cannot use both --input and --input-file');
      process.exit(1);
    }
    const timeoutFlag = getFlagValue('--timeout');
    const timeout = timeoutFlag ? parseInt(timeoutFlag, 10) : 0;

    let workflow: Workflow;
    let source: 'folder' | 'json' | 'node' = 'json';

    if (isNode) {
      const nodeDir = resolve(target || '.');
      const nodeJsonPath = resolve(nodeDir, '.node.json');
      if (!existsSync(nodeJsonPath)) {
        console.error('No .node.json found. Run "light init --node" first.');
        process.exit(1);
      }
      const meta = JSON.parse(readFileSync(nodeJsonPath, 'utf-8'));
      const files = loadDirectory(nodeDir, { ignore: [...DEFAULT_IGNORE, '.node.json', 'input.json'] });
      const node = new Node({ ...meta, files });
      workflow = new Workflow({ name: meta.name || 'node' });
      workflow.addNode(node);
      source = 'node';
    } else {
      const forceJson = hasFlag('--json-source');
      const dir = getFlagValue('--dir', './workflows');
      const resolved = resolve(target!);

      const folderPath = resolved.endsWith('.json') ? resolved.slice(0, -5) : resolved;
      const jsonPath = resolved.endsWith('.json') ? resolved : resolved + '.json';
      const folderExists =
        existsSync(folderPath) && statSync(folderPath).isDirectory() && loadWorkflowFromFolder(folderPath) !== null;
      const jsonExists = existsSync(jsonPath) && statSync(jsonPath).isFile();

      if (folderExists && jsonExists && !forceJson) {
        console.warn(
          `Warning: Both "${folderPath}" and "${jsonPath}" exist. Using folder. Use --json-source to use JSON.`,
        );
      }

      if (folderExists && !forceJson) {
        workflow = loadWorkflowFromFolder(folderPath)!;
        source = 'folder';
      } else if (!folderExists && !jsonExists && existsSync(resolve('.', 'main.js'))) {
        console.error(`Workflow not found: ${target}`);
        console.error('A main.js exists - run "node main.js" first to generate the workflow folders.');
        process.exit(1);
      } else {
        const jsonTarget = jsonExists ? jsonPath : target!;
        workflow = resolveWorkflow(jsonTarget, dir);
        source = 'json';
      }
    }

    let inputData: Record<string, unknown> = {};
    const nodeInputJson = isNode ? resolve(target || '.', 'input.json') : null;
    const inputSource =
      inputFlag || inputFileFlag || (nodeInputJson && existsSync(nodeInputJson) ? nodeInputJson : null);
    if (inputSource) {
      try {
        if (!inputFileFlag && inputSource.startsWith('{')) {
          inputData = JSON.parse(inputSource);
        } else {
          inputData = JSON.parse(readFileSync(inputSource, 'utf-8'));
        }
      } catch (err: unknown) {
        console.error(`Failed to parse input: ${(err as Error).message}`);
        process.exit(1);
      }
    }

    if (!DockerRunner.isAvailable()) {
      console.error('Docker is not available. Workflows require Docker to execute.');
      console.error('Run "light doctor" to check your environment.');
      process.exit(1);
    }

    if (!inputSource && !jsonOutput) {
      const entryNodes = workflow.getEntryNodes();
      const nodesWithRequired = entryNodes.filter((n) => n.inputs?.required && n.inputs.required.length > 0);
      if (nodesWithRequired.length > 0) {
        for (const node of nodesWithRequired) {
          console.warn(`Warning: "${node.name}" expects required input fields: ${node.inputs!.required!.join(', ')}`);
        }
        console.warn('Use --input <file|json> to provide input data.\n');
      }
    }

    try {
      const runner = new DockerRunner();

      if (!jsonOutput) console.log(`Running: ${workflow.name} (from ${source})`);

      let lastLog = '';
      let lastLogCount = 0;
      let lastLogName = '';

      const flushLog = () => {
        if (lastLogCount > 1) {
          process.stdout.write(` (x${lastLogCount})\n`);
        } else if (lastLogCount === 1) {
          process.stdout.write('\n');
        }
        lastLogCount = 0;
      };

      const result = await workflow.execute(inputData, {
        runner,
        timeout,
        onNodeStart: (id, name) => {
          if (!jsonOutput) {
            flushLog();
            console.log(`> ${name}`);
          }
        },
        onLog: (id, name, log) => {
          if (!jsonOutput) {
            if (log === lastLog && name === lastLogName) {
              lastLogCount++;
              process.stdout.write(`\r  [${name}] ${log} (x${lastLogCount})`);
            } else {
              flushLog();
              lastLog = log;
              lastLogName = name;
              lastLogCount = 1;
              process.stdout.write(`  [${name}] ${log}`);
            }
          }
        },
        onNodeComplete: (id, name, success, duration) => {
          if (!jsonOutput) {
            flushLog();
            console.log(`  ${success ? '[ok]' : '[fail]'} ${name} ${duration}ms`);
          }
        },
      });
      flushLog();

      if (jsonOutput) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        const nodeIds = Object.keys(result.results);
        const lastOutput = result.results[nodeIds[nodeIds.length - 1]]?.output;
        if (lastOutput && Object.keys(lastOutput).length > 0) {
          console.log(`\n-> ${JSON.stringify(lastOutput)}`);
        }
        console.log(`\n${result.success ? '[ok]' : '[fail]'} ${result.duration}ms`);
      }

      if (!result.success) process.exit(1);
    } catch (err: unknown) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  },
};
