import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join, resolve } from 'path';
import { DEFAULT_IMAGES } from '../defaults.js';
import type { CodeLanguage } from '../helpers.js';
import { getAllHelpers, getHelper } from '../helpers.js';
import { type Command, getFlagValue, getPositional, hasFlag } from './utils.js';

export const init: Command = {
  desc: 'Initialize a new project or node folder',
  usage: 'light init [dir] [--node [--lang js|python]]',
  run() {
    if (hasFlag('--node')) {
      initNode(resolve(getPositional(0) || '.'));
      return;
    }
    const dir = resolve(getPositional(0) || '.');
    const workflowsDir = join(dir, 'workflows');

    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (!existsSync(workflowsDir)) mkdirSync(workflowsDir);

    const pkgPath = join(dir, 'package.json');
    if (!existsSync(pkgPath)) {
      writeFileSync(
        pkgPath,
        JSON.stringify(
          {
            name: basename(dir),
            version: '1.0.0',
            type: 'module',
            scripts: {
              start: 'light run ./workflows/example',
              check: 'light check ./workflows/example',
            },
            dependencies: {
              'light-process': '^0.1.0',
            },
          },
          null,
          2,
        ),
      );
      console.log('+ package.json');
    }

    const exampleDir = join(workflowsDir, 'example');
    if (!existsSync(exampleDir)) {
      mkdirSync(exampleDir, { recursive: true });

      const nodeDir = join(exampleDir, 'hello');
      mkdirSync(nodeDir);

      writeFileSync(
        join(exampleDir, 'workflow.json'),
        JSON.stringify(
          {
            id: 'example',
            name: 'Example',
            network: null,
            nodes: [{ id: 'hello', name: 'Hello', dir: 'hello' }],
            links: [],
          },
          null,
          2,
        ),
      );
      console.log('+ workflows/example/workflow.json');

      const config = langConfigs.javascript;
      writeFileSync(
        join(nodeDir, '.node.json'),
        JSON.stringify(
          {
            id: 'hello',
            name: 'Hello',
            image: config.image,
            entrypoint: config.entrypoint,
            setup: [],
            timeout: 0,
            network: null,
            inputs: null,
            outputs: null,
          },
          null,
          2,
        ),
      );
      console.log('+ workflows/example/hello/.node.json');

      writeFileSync(join(nodeDir, config.mainFile), config.mainCode);
      console.log(`+ workflows/example/hello/${config.mainFile}`);

      const helper = getHelper('javascript');
      writeFileSync(join(nodeDir, helper.filename), helper.content);
      console.log(`+ workflows/example/hello/${helper.filename}`);
    }

    const mainPath = join(dir, 'main.js');
    if (!existsSync(mainPath)) {
      writeFileSync(
        mainPath,
        `import { DockerRunner, loadWorkflowFromFolder } from 'light-process';

const wf = loadWorkflowFromFolder('./workflows/example');
if (!wf) {
  console.error('Failed to load workflow. Run "light init" first.');
  process.exit(1);
}

const result = await wf.execute({}, { runner: new DockerRunner() });
console.log(result.success ? 'Success' : 'Failed');
console.log(JSON.stringify(result.results, null, 2));
`,
      );
      console.log('+ main.js');
    }

    console.log(`\nProject initialized in ${dir}`);
    console.log('\nNext steps:');
    console.log('  npm install');
    console.log('  light run ./workflows/example          # run from folders');
    console.log('  light describe ./workflows/example     # visualize the DAG');
    console.log('  node main.js                           # run with custom SDK logic');
  },
};

interface LangConfig {
  image: string;
  entrypoint: string;
  mainFile: string;
  mainCode: string;
}

const langConfigs: Record<CodeLanguage, LangConfig> = {
  javascript: {
    image: DEFAULT_IMAGES.javascript,
    entrypoint: 'node index.js',
    mainFile: 'index.js',
    mainCode: `const { input, send } = require('./lp');
console.error('Input:', JSON.stringify(input));
send({ hello: 'world', input });
`,
  },
  python: {
    image: DEFAULT_IMAGES.python,
    entrypoint: 'python main.py',
    mainFile: 'main.py',
    mainCode: `from lp import input, send
import sys
print('Input:', input, file=sys.stderr)
send({'hello': 'world', 'input': input})
`,
  },
};

function parseLang(value: string | undefined): CodeLanguage {
  if (!value || value === 'js') return 'javascript';
  if (value === 'py') return 'python';
  if (value === 'javascript' || value === 'python') return value;
  console.error(`Unknown language: ${value}. Supported: js, python`);
  process.exit(1);
}

function initNode(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const nodeName = basename(dir) || 'my-node';
  const lang = parseLang(getFlagValue('--lang'));
  const verbose = hasFlag('--verbose');
  const config = langConfigs[lang];
  let fileCount = 0;

  const nodeJsonPath = join(dir, '.node.json');
  if (!existsSync(nodeJsonPath)) {
    const nodeJson: Record<string, unknown> = {
      id: nodeName,
      name: nodeName,
      image: config.image,
      entrypoint: config.entrypoint,
      setup: [],
      timeout: 0,
      network: null,
      inputs: null,
      outputs: null,
    };
    writeFileSync(nodeJsonPath, JSON.stringify(nodeJson, null, 2));
    fileCount++;
    if (verbose) console.log('+ .node.json');
  }

  const mainPath = join(dir, config.mainFile);
  if (!existsSync(mainPath)) {
    const mainDir = join(dir, config.mainFile.split('/').slice(0, -1).join('/'));
    if (mainDir !== dir && !existsSync(mainDir)) mkdirSync(mainDir, { recursive: true });
    writeFileSync(mainPath, config.mainCode);
    fileCount++;
    if (verbose) console.log(`+ ${config.mainFile}`);
  }

  for (const helper of getAllHelpers()) {
    const helperPath = join(dir, helper.filename);
    if (!existsSync(helperPath)) {
      writeFileSync(helperPath, helper.content);
      fileCount++;
      if (verbose) console.log(`+ ${helper.filename}`);
    }
  }

  const inputPath = join(dir, 'input.json');
  if (!existsSync(inputPath)) {
    writeFileSync(inputPath, '{}');
    fileCount++;
    if (verbose) console.log('+ input.json');
  }

  let registered = false;
  const workflowJsonPath = join(resolve(dir), '..', 'workflow.json');
  if (existsSync(workflowJsonPath)) {
    const meta = JSON.parse(readFileSync(workflowJsonPath, 'utf-8'));
    if (Array.isArray(meta.nodes)) {
      const alreadyExists = meta.nodes.some((n: any) => n.dir === nodeName);
      if (!alreadyExists) {
        meta.nodes.push({ id: nodeName, name: nodeName, dir: nodeName });
        writeFileSync(workflowJsonPath, JSON.stringify(meta, null, 2));
        registered = true;
      }
    }
  }

  const parts = [`${nodeName}/`, `(${lang}, ${fileCount} files)`];
  if (registered) parts.push('- registered in workflow.json');
  console.log(`+ ${parts.join(' ')}`);
}
