<h1 align="center">Light Process</h1>

<p align="center">
  Lightweight workflow engine with Docker container isolation and A2A protocol support.
</p>

<p align="center">
  <a href="https://enixcode.github.io/light-process/">Documentation</a> -
  <a href="#quick-start">Quick Start</a> -
  <a href="#use-cases">Use Cases</a> -
  <a href="https://www.npmjs.com/package/light-process">npm</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen" alt="Node 20+" />
  <img src="https://img.shields.io/badge/docker-required-blue" alt="Docker" />
  <img src="https://img.shields.io/badge/license-AGPL--3.0-purple" alt="AGPL-3.0" />
  <img src="https://img.shields.io/badge/A2A-protocol-orange" alt="A2A Protocol" />
</p>

---

## Use Cases

**AI agent pipelines** - Call an LLM, validate its JSON output against a schema, retry up to 3 times on bad output, then route by the result. Every step sandboxed in its own container.

**Run untrusted code** - Execute user-submitted scripts safely. Dropped capabilities, PID limits, optional network isolation. Perfect for coding playgrounds, graders, or plugin systems.

**Polyglot scripts** - Node scraper, Python parser, shell uploader - all in one pipeline. No virtualenvs, no global installs. Each step gets only the deps it needs, reproducible on any machine.

**Workflows as APIs** - `light serve` turns every workflow into an HTTP endpoint and an A2A agent skill. Ship your automation as a callable service without writing a server.

## Install

```bash
# Stable release from npm (recommended)
npm install -g light-process

# Latest dev snapshot from GitHub (for testing unreleased features)
npm install -g github:enixCode/light-process#alpha
```

The `#alpha` variant installs the most recent commit on the `dev` branch
(via a mobile git tag). It always reflects the latest code, unlike npm
packages which only update on tagged releases. There is no `@alpha` tag
on npm - dev builds are only available via the GitHub URL.

## Quick Start

```bash
light doctor                    # check Node + Docker
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

**Stuck?** Run `light doctor` to check your environment (Node + Docker).

## Features

- **DAG workflows** - nodes run in parallel when possible, linked with conditions
- **Docker isolation** - each node runs in its own container with dropped capabilities
- **A2A protocol** - expose workflows as AI agents with streaming support
- **Web dashboard** - terminal-style UI to inspect workflows and nodes
- **Multi-language** - JavaScript and Python out of the box, any language via Docker
- **Schema validation** - JSON Schema for inputs/outputs on every node
- **Conditional routing** - MongoDB-style `when` clauses on links
- **Loop support** - back-links with `maxIterations` for retry/iteration patterns
- **CLI + SDK** - use from terminal or programmatically in Node.js

## CLI Reference

| Command | Description |
|---|---|
| `light run <target>` | Execute a workflow or single node |
| `light serve [dir]` | Start A2A server + web dashboard |
| `light init [dir]` | Scaffold a new project or node |
| `light check <target>` | Validate workflow structure |
| `light describe <target>` | Visualize the DAG with schemas (text + Mermaid) |
| `light list` | List workflows in a directory |
| `light pack <target>` | Convert workflow folder to JSON |
| `light unpack <target>` | Convert JSON to workflow folder |
| `light link <dir>` | Manage links (inline flags or open in $EDITOR) |
| `light node schema <dir>` | Edit a node's input/output JSON Schema |
| `light node helpers <dir>` | Regenerate lp.d.ts from schema |
| `light config <get\|set\|list>` | Read or write global config |
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

### Serve (API + Dashboard)

```bash
light serve --port 3000
```

Opens a web dashboard at `http://localhost:3000/` and exposes the A2A API.

**API key authentication** is opt-in. Set `LP_API_KEY` to enable Bearer auth on POST and `/api/*` routes. If unset, auth is disabled and all routes are public:

```bash
LP_API_KEY=my-secret-key light serve --port 3000
```

Protected routes (POST and `/api/*`) require a Bearer token in the Authorization header:

```bash
# Health check (no auth required)
curl http://localhost:3000/health

# Agent card (no auth required)
curl http://localhost:3000/.well-known/agent-card.json

# List workflows (auth required)
curl -H "Authorization: Bearer <your-api-key>" http://localhost:3000/api/workflows

# Workflow detail (auth required)
curl -H "Authorization: Bearer <your-api-key>" http://localhost:3000/api/workflows/my-workflow-id

# Add a workflow dynamically (in-memory only)
curl -X POST -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"id":"my-wf","name":"My Workflow","nodes":[...],"links":[]}' \
  http://localhost:3000/api/workflows

# Add a workflow AND persist it to disk (survives restart)
curl -X POST -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{"id":"my-wf","name":"My Workflow","nodes":[...],"links":[]}' \
  "http://localhost:3000/api/workflows?persist=true"

# Remove a workflow (in-memory only)
curl -X DELETE -H "Authorization: Bearer <your-api-key>" \
  http://localhost:3000/api/workflows/my-wf

# Remove a workflow AND delete its file from disk
curl -X DELETE -H "Authorization: Bearer <your-api-key>" \
  "http://localhost:3000/api/workflows/my-wf?persist=true"
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
import { Workflow, Node, Schema, DockerRunner } from 'light-process';

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
const result = await wf.execute({ name: 'World' }, { runner: new DockerRunner() });
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
import { loadWorkflowFromFolder, DockerRunner } from 'light-process';

const wf = loadWorkflowFromFolder('./my-workflow');
const result = await wf.execute({ key: 'value' }, { runner: new DockerRunner() });
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

## Docker Configuration

### DockerRunner options

```javascript
const runner = new DockerRunner({
  memoryLimit: '512m',     // container memory limit
  cpuLimit: '1.5',         // CPU cores
  runtime: 'runsc',        // 'runc' (default), 'runsc' (gVisor), 'kata'
  gpu: 'all',              // false, 'all', number, or device ID
  verbose: true,           // log Docker commands
});
```

### Security

- Containers run with `--no-new-privileges`
- Capabilities dropped: NET_RAW, MKNOD, SYS_CHROOT, SETPCAP, SETFCAP, AUDIT_WRITE
- PID limit: 100 per container
- Default network: `lp-isolated` (bridge, inter-container communication disabled)
- `network: "none"` fully isolates a node

## A2A Protocol

Light Process implements the [A2A protocol](https://google.github.io/A2A/) for agent-to-agent communication.

```bash
# Start the server (no auth - public)
light serve --port 3000

# Enable Bearer auth by setting LP_API_KEY
LP_API_KEY=my-secret-key light serve --port 3000

# Discover the agent (no auth required)
curl http://localhost:3000/.well-known/agent-card.json

# Send a task via JSON-RPC 2.0 (auth required)
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-api-key>" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "msg-1",
        "role": "user",
        "parts": [{
          "kind": "data",
          "data": { "workflowId": "my-workflow", "name": "World" }
        }]
      }
    }
  }'
```

Each registered workflow appears as a **skill** in the agent card.

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

- **Node.js** >= 18
- **Docker** (daemon running)
- Optional: gVisor (runsc) for extra sandboxing
- Optional: NVIDIA GPU support

## License

[AGPL-3.0](LICENSE)
