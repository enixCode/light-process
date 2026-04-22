---
layout: default
title: SDK Guide
---

# SDK Guide

Use light-process programmatically in Node.js to build, configure, and execute workflows.

## Install

```bash
npm install light-process
```

## Basic workflow

```javascript
import { Workflow, LightRunClient } from 'light-process';

const wf = new Workflow({ name: 'hello' });

const node = wf.addNode({ name: 'Greet', image: 'node:20-alpine' });
node.setCode((input) => ({ message: `Hello, ${input.name}!` }));

const result = await wf.execute(
  { name: 'World' },
  { runner: new LightRunClient() }
);

console.log(result.success); // true
console.log(result.results);
```

## Multi-node pipeline

```javascript
import { Workflow, Schema, LightRunClient } from 'light-process';

const wf = new Workflow({ name: 'pipeline' });

// Node 1: validate
const validate = wf.addNode({ name: 'Validate', image: 'node:20-alpine' });
validate.inputs = Schema.object({ email: Schema.string() }, ['email']);
validate.setCode((input) => ({
  valid: input.email.includes('@'),
  email: input.email,
}));

// Node 2: process (only runs if valid)
const process = wf.addNode({ name: 'Process', image: 'node:20-alpine' });
process.setCode((input) => ({
  processed: true,
  email: input.email,
}));

// Node 3: reject (only runs if invalid)
const reject = wf.addNode({ name: 'Reject', image: 'node:20-alpine' });
reject.setCode((input) => ({
  rejected: true,
  reason: 'Invalid email',
}));

// Conditional links
wf.addLink({
  from: validate.id,
  to: process.id,
  when: { valid: true },
});

wf.addLink({
  from: validate.id,
  to: reject.id,
  when: { valid: { ne: true } },
});

const result = await wf.execute(
  { email: 'alice@example.com' },
  { runner: new LightRunClient() }
);
```

## Node from folder

```javascript
import { Node, loadDirectory, DEFAULT_IGNORE } from 'light-process';

const node = new Node({
  name: 'My Node',
  image: 'node:20-alpine',
  entrypoint: 'node index.js',
});

// Load all files from a directory
const files = loadDirectory('./my-node', { ignore: DEFAULT_IGNORE });
node.addFiles(files);

// Or use the shorthand
node.addFolder('./my-node', 'node index.js');
```

## Load workflow from folder

```javascript
import { loadWorkflowFromFolder, LightRunClient } from 'light-process';

const wf = loadWorkflowFromFolder('./my-workflow');
if (!wf) {
  console.error('Invalid workflow folder');
  process.exit(1);
}

const result = await wf.execute({}, { runner: new LightRunClient() });
```

## Export workflow to folder

```javascript
import { exportWorkflowToFolder } from 'light-process';

// After building a workflow programmatically
exportWorkflowToFolder(wf, './output/my-workflow');
// Creates workflow.json + node folders with .node.json and code files
```

## Execution callbacks

```javascript
const result = await wf.execute(input, {
  runner: new LightRunClient(),
  timeout: 30000, // 30s global timeout

  onNodeStart: (nodeId, nodeName) => {
    console.log(`Starting: ${nodeName}`);
  },

  onNodeComplete: (nodeId, nodeName, success, duration) => {
    console.log(`${nodeName}: ${success ? 'ok' : 'failed'} (${duration}ms)`);
  },

  onLog: (nodeId, nodeName, log) => {
    console.log(`[${nodeName}] ${log}`);
  },

  onStatusChange: (status) => {
    console.log(`Current: ${status.currentNodeName}`);
    console.log(`Done: ${status.completedNodes.length}`);
  },
});
```

## LightRunClient options

```javascript
const runner = new LightRunClient({
  url: 'http://localhost:3001',   // light-run endpoint (default: $LIGHT_RUN_URL)
  token: process.env.LIGHT_RUN_TOKEN, // optional Bearer token
});
```

Container-level isolation (memory, CPU, gVisor runtime, GPU) is configured on the light-run service, not here. See the [light-run docs](https://github.com/enixCode/light-run#readme).

## Node.setCode

Wraps a JavaScript function as node code. The function receives input as an argument and returns the output.

```javascript
node.setCode((input) => {
  // input is the parsed JSON from stdin
  const result = { doubled: input.value * 2 };
  return result; // written to .lp-output.json
});
```

**Limitations:** closures and external variables are not available at runtime (the function is serialized to a string).

## Node.addHelper

Adds language-specific helper files (`lp.js`, `lp.py`) that provide `input` and `send`.

```javascript
node.addHelper('javascript'); // adds lp.js
node.addHelper('python');     // adds lp.py
node.addHelper();             // adds all helpers
```

When using folder-based workflows, `light node schema` and `light node helpers` regenerate `lp.d.ts` - a TypeScript declaration file that gives editors autocomplete for `input` fields and `send()` arguments based on the node's schema.

## Workflow serialization

```javascript
// To JSON
const json = wf.toJSON();
const str = JSON.stringify(json, null, 2);

// From JSON
const restored = Workflow.fromJSON(json);
```

## REST API server

Expose workflows over a minimal REST API programmatically.

```javascript
import { createServer, LightRunClient } from 'light-process';

const runner = new LightRunClient();
const app = createServer({
  port: 3000,                     // listen port (default: 3000)
  host: '0.0.0.0',                // bind host (default: '0.0.0.0')
  runner,                         // shared LightRunClient instance
  apiKey: process.env.LP_API_KEY, // enable Bearer auth when set
  persistDir: './workflows',      // directory for workflows added with ?persist=true
});

// Register workflows up front
app.registerWorkflow(myWorkflow);

// Or add/remove at runtime
app.unregisterWorkflow('old-workflow');

await app.listen();
// ...later
await app.close();
```

When `apiKey` is provided, every write route (POST/PUT/DELETE) and every `/api/*` route requires `Authorization: Bearer <key>`. Leave it undefined to run without auth. `/health` is always public.

## Error types

```javascript
import {
  LightProcessError,
  LinkValidationError,
  CircularDependencyError,
  WorkflowTimeoutError,
} from 'light-process';
```

| Error | Thrown when |
|---|---|
| `LinkValidationError` | Invalid link (missing node, self-loop, cycle without maxIterations) |
| `CircularDependencyError` | No entry nodes in non-empty workflow |
| `WorkflowTimeoutError` | Execution exceeds timeout |
