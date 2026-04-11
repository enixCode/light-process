---
layout: default
title: CLI Reference
---

# CLI Reference

## light run

Execute a workflow or single node.

```bash
light run <file|dir|id|name> [options]
light run --node [dir] [options]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--input <file\|json>` | Input data (JSON file or inline) | `{}` |
| `--json` | Output full result as JSON | off |
| `--timeout <ms>` | Global timeout | 0 (none) |
| `--dir <dir>` | Workflow search directory | `.` |
| `--json-source` | Prefer .json over folder | off |
| `--node` | Run current dir as single node | off |
| `--verbose` | Verbose output | off |

**Examples:**

```bash
# Run from folder
light run my-workflow

# Run with inline JSON input
light run my-workflow --input '{"key": "value"}'

# Run with input file
light run my-workflow --input data.json

# Full JSON output (for piping)
light run my-workflow --json | jq '.results'

# Run a single node
light run --node ./my-node

# Single node with input.json auto-loaded
cd my-node && light run --node .

# Search by name in a directory
light run my-workflow --dir ./custom-workflows
```

**Resolution order:**
1. If `--node`: loads `.node.json` from target directory
2. If target is a folder with `workflow.json`: loads from folder
3. If target is a `.json` file: loads directly
4. Searches `--dir` for matching workflow by ID or name

---

## light serve

Start the A2A API server with web dashboard.

```bash
light serve [dir] [--port 3000] [--verbose]
```

**Endpoints:**

| Method | Path | Description |
|---|---|---|
| GET | `/` | Web dashboard |
| GET | `/health` | Health check |
| GET | `/.well-known/agent-card.json` | A2A agent card |
| GET | `/api/workflows` | List workflows |
| GET | `/api/workflows/:id` | Workflow detail |
| POST | `/` or `/a2a` | A2A JSON-RPC 2.0 |

**Examples:**

```bash
# Serve all workflows in current directory
light serve

# Custom port
light serve --port 8080

# Serve a specific directory
light serve ./my-workflows --verbose
```

---

## light init

Scaffold a new project or node.

```bash
light init [dir]                    # full project
light init --node [dir] [--lang]    # single node
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--node` | Create a node instead of project | off |
| `--lang <js\|python>` | Node language | `js` |
| `--verbose` | Show created files | off |

**Project init creates:**
- `package.json` with start/check scripts
- `example/` folder with a hello node
- `main.js` with SDK example

**Node init creates:**
- `.node.json` with image and entrypoint
- `index.js` or `main.py` (template code)
- `lp.js` and `lp.py` (helpers)
- `input.json` (empty test input)
- Auto-registers in parent `workflow.json` if present

---

## light check

Validate a workflow without running it.

```bash
light check <file|dir> [--fix]
```

**Checks performed:**
1. `workflow.json` exists and parses
2. Node folders exist
3. `.node.json` files exist
4. Workflow loads (valid structure)
5. All nodes have images
6. All nodes have entrypoints or files
7. Entry nodes exist

**`--fix`** auto-removes dead node references from `workflow.json`.

---

## light describe

Show workflow structure and generate a visual diagram.

```bash
light describe <file|dir|id|name> [--no-html]
```

Outputs a text tree and generates `describe.html` with an interactive Mermaid diagram.

**Example output:**

```
  Order Pipeline (order-pipeline)
  3 nodes, 2 links

  Validate (node:20-alpine)
    -> Process (when: valid == true)
  Process (python:3.12-alpine)
    -> Notify
  Notify (node:20-alpine)
```

---

## light doctor

Check environment health.

```bash
light doctor
```

**Checks:**
- Node.js version (>= 18)
- Docker installation
- Docker daemon status
- gVisor (runsc) availability
- GPU support (nvidia-smi)
- Docker GPU plugin

---

## Global options

| Flag | Description |
|---|---|
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |
| `--verbose` | Verbose output |
| `--json` | JSON output |
