<h1 align="center">Light Process</h1>

<p align="center">
  Lightweight DAG workflow engine for orchestrating code in Docker containers. Delegates container execution to <a href="https://github.com/enixCode/light-run">light-run</a>.
</p>

<p align="center">
  <a href="https://enixcode.github.io/light-process/">Documentation</a> -
  <a href="#quick-start">Quick Start</a> -
  <a href="#use-cases">Use Cases</a> -
  <a href="https://www.npmjs.com/package/light-process">npm</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+" />
  <img src="https://img.shields.io/badge/license-AGPL--3.0-purple" alt="AGPL-3.0" />
</p>

---

## Use Cases

**Per-tenant report pipelines** - SaaS sending a PDF per customer: fetch data (Python) -> transform (R) -> render PDF (Node) -> send email. One `POST /run` per customer, full Docker isolation per step, no shared state. Temporal is too heavy, n8n has no real container execution.

**Security automation chains** - Run Trivy, nuclei, nmap in sequence with conditional branching: if a CVE is found, trigger a deeper scan. Each scanner in its own container, self-hosted, HTTP-triggered. No GitHub Actions cloud dependency, no Bash fragility.

**Polyglot processing pipelines** - Node scraper, Python parser, Go enricher, shell uploader - all chained. No virtualenvs, no global installs, no runtime conflicts. Each step gets only the deps it needs. Mixed runtimes that LangChain and Prefect cannot handle natively.

**Run untrusted code** - Execute user-submitted scripts in containers isolated upstream by light-run (dropped caps, PID limits, isolated network, optional gVisor). Perfect for coding playgrounds, graders, or plugin systems where you cannot trust the input.

## Install

light-process is the DAG orchestrator. Container execution is delegated to a separate service called [light-run](https://github.com/enixCode/light-run). You install both:

```bash
# 1. The runner (executes containers). Requires Node 22+ and Docker on the same host.
npm install -g light-run

# 2. The orchestrator (this package).
npm install -g light-process
```

Alpha snapshots from GitHub:

```bash
npm install -g github:enixCode/light-process#alpha
npm install -g github:enixCode/light-run#alpha
```

The `#alpha` variant installs the most recent commit on `main`. It always reflects the latest code, unlike npm packages which only update on tagged releases.

## Quick Start

```bash
# In one terminal - start the runner (keeps running)
light-run serve --token $(openssl rand -hex 32) --port 3001

# In another terminal - point light-process at it
export LIGHT_RUN_URL=http://localhost:3001
export LIGHT_RUN_TOKEN=<same token as above>

light doctor                    # check Node + light-run connectivity
light init my-project           # scaffold a project
cd my-project
light run example               # run the example workflow
```

Output:

```
Running: Example (from folder)
> Hello
  [Hello] Input: {}
  [ok] Hello 2100ms

-> {"hello":"world","input":{}}

[ok] 2108ms
```

## Your First Workflow

After `light init my-project`, you get this:

```
my-project/
  example/
    workflow.json        # the DAG: which nodes exist, how they link
    hello/
      .node.json         # node config (Docker image, entrypoint, I/O)
      index.js           # your code
      lp.js              # helper - provides input and send()
      lp.d.ts            # auto-generated types for editor autocomplete
```

A **node** is just a folder with code that runs in a Docker container. A **workflow** is a `workflow.json` that wires nodes together. That's it.

Open `example/hello/index.js`:

```javascript
const { input, send } = require('./lp');
console.error('Input:', JSON.stringify(input));
send({ hello: 'world', input });
```

- `input` - the JSON data passed in (from `--input` or a previous node)
- `send(obj)` - your node's output, passed to the next node
- `console.error(...)` - logs (stdout is reserved for the helper)

Try editing it:

```javascript
const { input, send } = require('./lp');
send({ greeting: `Hello, ${input.name || 'stranger'}!` });
```

Then run it with input:

```bash
light run example --input '{"name": "Alice"}'
# -> {"greeting":"Hello, Alice!"}
```

To add a second node that uses the first node's output, `cd` into the workflow folder first so the new node is auto-registered in `workflow.json`:

```bash
cd example
light init --node shout          # creates example/shout/ and registers it
cd ..
light link example --from hello --to shout   # wire hello -> shout
```

Now you have a two-node pipeline. Run `light describe example` to visualize it.

> Note: `light init --node` only auto-registers the node if its parent directory contains a `workflow.json`. Outside a workflow folder, the node is created standalone and you'll see a hint in the output.

**Stuck?** Run `light doctor` to check your environment (Node + light-run).

## Features

- **DAG workflows** - nodes run in parallel when possible, linked with conditions
- **Delegated execution** - containers run on a light-run service (isolation, caps, gVisor handled upstream)
- **REST API** - serve workflows over HTTP for remote clients
- **Multi-language** - JavaScript and Python out of the box, any language via Docker
- **Schema validation** - JSON Schema for inputs/outputs on every node
- **Conditional routing** - MongoDB-style `when` clauses on links
- **Loop support** - back-links with `maxIterations` for retry/iteration patterns
- **CLI + SDK** - use from terminal or programmatically in Node.js

## CLI Reference

| Command | Description |
|---|---|
| `light run <target>` | Execute a workflow or single node |
| `light serve [dir]` | Start the REST API server |
| `light init [dir]` | Scaffold a new project or node |
| `light check <target>` | Validate workflow structure |
| `light describe <target>` | Visualize the DAG with schemas (text + Mermaid) |
| `light list` | List workflows in a directory |
| `light pack <target>` | Convert workflow folder to JSON |
| `light unpack <target>` | Convert JSON to workflow folder |
| `light link <dir>` | Manage links (inline flags or open in $EDITOR) |
| `light node schema <dir>` | Edit a node's input/output JSON Schema |
| `light node helpers <dir>` | Regenerate lp.d.ts from schema |
| `light remote <subcommand>` | Manage remote profiles (bind, set-key, ls, run, ...) |
| `light pull <id>` | Pull a workflow from a remote server |
| `light push [name]` | Push local workflow(s) to a remote server |
| `light doctor` | Check environment |

All commands search the current directory by default.

### Run examples

```bash
# Run a workflow from folder
light run my-workflow

# Run with input data
light run my-workflow --input '{"name": "Alice", "count": 5}'

# Run from a JSON file
light run my-workflow --input data.json

# Get full JSON output
light run my-workflow --json

# Run a single node (reads .node.json in current dir)
light run --node my-node

# Set a timeout (30 seconds)
light run my-workflow --timeout 30000
```

### Serve (REST API)

```bash
light serve --port 3000
```

Exposes a small REST API used by `light remote`, `light pull`, and `light push` to drive a remote instance.

**API key authentication** is opt-in. Set `LP_API_KEY` to enable Bearer auth on write routes and `/api/*`. If unset, auth is disabled and all routes are public:

```bash
LP_API_KEY=my-secret-key light serve --port 3000
```

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/health` | public | Health check |
| GET | `/api/workflows` | required | List workflow summaries |
| GET | `/api/workflows/:id` | required | Get workflow detail (add `?full=true` for full JSON) |
| POST | `/api/workflows` | required | Register a workflow (add `?persist=true` to write to disk) |
| PUT | `/api/workflows/:id` | required | Replace a workflow (add `?persist=true`) |
| DELETE | `/api/workflows/:id` | required | Remove a workflow (add `?persist=true` to delete file) |
| POST | `/api/workflows/:id/run` | required | Execute a workflow with the JSON body as input |

Examples:

```bash
# Health check (no auth required)
curl http://localhost:3000/health

# List workflows
curl -H "Authorization: Bearer <key>" http://localhost:3000/api/workflows

# Run a workflow
curl -X POST -H "Authorization: Bearer <key>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice"}' \
  http://localhost:3000/api/workflows/my-wf/run
```

### Init examples

```bash
# Scaffold a full project
light init my-project

# Scaffold a single JavaScript node
light init --node my-node

# Scaffold a Python node
light init --node my-node --lang python
```

## Workflow Formats

Workflows exist in two formats:

- **Folder** (for editing) - a directory with `workflow.json` + one subfolder per node. This is what you edit, git, and push to a server
- **JSON** (for transport) - a single portable file with everything embedded. Used by the API and for sharing

Convert between them with `pack` and `unpack`:

```bash
# Folder -> JSON (removes the folder)
light pack example

# JSON -> Folder (removes the JSON)
light unpack example

# Keep the source after converting
light pack example --keep

# List all workflows
light list
light list --json
```

## Project Structure

```
my-project/
  order-pipeline/
    workflow.json             # DAG definition
    validate/
      .node.json              # node config
      index.js                # your code
      lp.js                   # helper (auto-generated)
      lp.d.ts                 # types for autocomplete (auto-generated)
    process/
      .node.json
      main.py
      lp.py
    notify/
      .node.json
      index.js
      lp.js
  main.js                       # SDK entry point (optional)
```

### workflow.json

```json
{
  "id": "order-pipeline",
  "name": "Order Pipeline",
  "network": null,
  "nodes": [
    { "id": "validate", "name": "Validate", "dir": "validate" },
    { "id": "process", "name": "Process", "dir": "process" },
    { "id": "notify", "name": "Notify", "dir": "notify" }
  ],
  "links": [
    { "from": "validate", "to": "process", "when": { "valid": true } },
    { "from": "process", "to": "notify" }
  ]
}
```

### .node.json

```json
{
  "id": "validate",
  "name": "Validate",
  "image": "node:20-alpine",
  "entrypoint": "node index.js",
  "setup": [],
  "timeout": 10000,
  "network": null,
  "inputs": {
    "type": "object",
    "properties": {
      "orderId": { "type": "string" }
    },
    "required": ["orderId"]
  },
  "outputs": {
    "type": "object",
    "properties": {
      "valid": { "type": "boolean" }
    }
  }
}
```

## Writing Node Code

### JavaScript

```javascript
// index.js
const { input, send } = require('./lp');

console.error('Processing order:', input.orderId);

const result = { valid: true, orderId: input.orderId };
send(result);
```

### Python

```python
# main.py
from lp import input, send
import sys

print('Processing order:', input.get('orderId'), file=sys.stderr)

result = {'valid': True, 'orderId': input.get('orderId')}
send(result)
```

### Any language

Read JSON from **stdin**, write result to `.lp-output.json`:

```bash
#!/bin/sh
INPUT=$(cat)
echo "Got: $INPUT" >&2
echo '{"done": true}' > .lp-output.json
```

## SDK Usage

```javascript
import { Workflow, Node, Schema, LightRunClient } from 'light-process';

// Create workflow
const wf = new Workflow({ name: 'greeting-pipeline' });

// Node 1: greet
const greet = wf.addNode({ name: 'Greet', image: 'node:20-alpine' });
greet.inputs = Schema.object({ name: Schema.string() }, ['name']);
greet.setCode((input) => ({ message: `Hello, ${input.name}!` }));

// Node 2: uppercase
const upper = wf.addNode({ name: 'Uppercase', image: 'node:20-alpine' });
upper.setCode((input) => ({ result: input.message.toUpperCase() }));

// Connect them
wf.addLink({ from: greet.id, to: upper.id });

// Run
const result = await wf.execute({ name: 'World' }, { runner: new LightRunClient() });
console.log(result.results);
// { "greet-id": { output: { message: "Hello, World!" } },
//   "upper-id": { output: { result: "HELLO, WORLD!" } } }
```

### Conditional routing

```javascript
// Route based on output values
wf.addLink({
  from: validate.id,
  to: process.id,
  when: { status: 'ok', score: { gte: 80 } }
});

wf.addLink({
  from: validate.id,
  to: reject.id,
  when: { status: { ne: 'ok' } }
});
```

### Loops with back-links

```javascript
// Retry up to 3 times
wf.addLink({
  from: process.id,
  to: validate.id,
  when: { retry: true },
  maxIterations: 3
});
```

### Load from folder

```javascript
import { loadWorkflowFromFolder, LightRunClient } from 'light-process';

const wf = loadWorkflowFromFolder('./my-workflow');
const result = await wf.execute({ key: 'value' }, { runner: new LightRunClient() });
```

### Node from folder

```javascript
import { Node, loadDirectory, DEFAULT_IGNORE } from 'light-process';

const node = new Node({ name: 'My Node', image: 'node:20-alpine' });
node.addFolder('./my-node', 'node index.js', { ignore: DEFAULT_IGNORE });
```

## Condition Operators

Links support MongoDB-style `when` conditions on the source node's output:

| Operator | Example | Description |
|---|---|---|
| (none) | `{ status: "ok" }` | Exact match |
| `gt` | `{ count: { gt: 5 } }` | Greater than |
| `gte` | `{ count: { gte: 5 } }` | Greater or equal |
| `lt` | `{ count: { lt: 10 } }` | Less than |
| `lte` | `{ count: { lte: 10 } }` | Less or equal |
| `ne` | `{ status: { ne: "error" } }` | Not equal |
| `in` | `{ role: { in: ["admin", "mod"] } }` | Membership |
| `exists` | `{ token: { exists: true } }` | Field presence |
| `regex` | `{ token: { regex: "^ok" } }` | Regex match |
| `or` | `{ or: [{...}, {...}] }` | Logical OR |

All top-level fields use AND logic by default.

## Execution (light-run)

Container execution is delegated to a [light-run](https://github.com/enixCode/light-run) HTTP service. light-process never touches Docker itself.

```bash
# Point light-process at a running light-run instance
export LIGHT_RUN_URL=http://localhost:3001
export LIGHT_RUN_TOKEN=your-bearer-token   # optional, if light-run requires auth
```

```javascript
// SDK: point the client explicitly if env vars aren't set
const runner = new LightRunClient({
  url: 'http://localhost:3001',
  token: process.env.LIGHT_RUN_TOKEN,
});
```

Isolation (cap drops, PID limits, network, gVisor runtime, GPU access) is configured on the light-run service - see its [README](https://github.com/enixCode/light-run#readme). A `network` value on the node (`'none'`, named network, etc.) is forwarded to light-run.

## Schema Validation

```javascript
import { Schema } from 'light-process';

// Define input/output schemas on nodes
node.inputs = Schema.object({
  name: Schema.string({ minLength: 1 }),
  age: Schema.integer({ minimum: 0 }),
  tags: Schema.array(Schema.string(), { minItems: 1 }),
  active: Schema.boolean(),
}, ['name', 'age']);  // required fields

node.outputs = Schema.object({
  result: Schema.string(),
  score: Schema.number({ minimum: 0, maximum: 100 }),
});
```

## Development

```bash
git clone https://github.com/enixcode/light-process.git
cd light-process
npm install
npm run build          # compile TypeScript
npm run dev            # watch mode
npm run link           # build + npm link for local CLI testing
npm test               # unit tests
npm run test:all       # unit + integration tests
```

## Requirements

- **Node.js** >= 20
- A running [light-run](https://github.com/enixCode/light-run) instance reachable via `LIGHT_RUN_URL`

## License

[AGPL-3.0](LICENSE)
