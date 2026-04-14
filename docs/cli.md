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
| `--input-file <file>` | Read input from a JSON file (alias, cannot combine with `--input`) | - |
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

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--port <number>` | Port to listen on | `3000` |
| `--verbose` | Verbose Docker logging | off |

**Environment:**

| Variable | Description |
|---|---|
| `LP_API_KEY` | Enable Bearer token authentication on protected routes. If unset, all routes are public. |

**Endpoints:**

| Method | Path | Description |
|---|---|---|
| GET | `/` | Web dashboard |
| GET | `/health` | Health check |
| GET | `/.well-known/agent-card.json` | A2A agent card |
| GET | `/api/workflows` | List workflows |
| GET | `/api/workflows/:id` | Workflow detail (add `?full=true` for full JSON) |
| POST | `/api/workflows` | Add workflow at runtime (add `?persist=true` to save) |
| PUT | `/api/workflows/:id` | Replace a workflow (add `?persist=true` to save) |
| DELETE | `/api/workflows/:id` | Remove workflow (add `?persist=true` to delete file) |
| POST | `/` or `/a2a` | A2A JSON-RPC 2.0 |

**Examples:**

```bash
# Serve all workflows in current directory
light serve

# Custom port
light serve --port 8080

# Serve a specific directory
light serve ./my-workflows --verbose

# Enable Bearer token authentication
LP_API_KEY=my-secret-key light serve
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
    in: name (string), age (integer)
    out: valid (boolean), score (number)
    -> Process [valid = true]
  Process (python:3.12-alpine)
    out: result (string)
    -> Notify
  Notify (node:20-alpine)
```

Node input/output schemas are shown when defined.

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

## light config

Read, write, or list values in the global config (`~/.light/config.json`).

```bash
light config <get|set|list|path> [key] [value]
```

**Subcommands:**

| Subcommand | Description |
|---|---|
| `list`, `show` | Print the full config |
| `get <key>` | Read a nested key (dot notation supported) |
| `set <key> <value>` | Write a nested key (JSON parsed when possible) |
| `path` | Print the config file path |

**Examples:**

```bash
light config list
light config get defaultRemote
light config set defaultRemote prod
```

---

## light remote

Manage remote A2A server profiles and run workflows remotely.

```bash
light remote <bind|set-key|list|use|forget|ping|ls|run|delete|rm> [...]
```

**Subcommands:**

| Subcommand | Description |
|---|---|
| `bind <url> --key <key> [--name <name>]` | Register a remote (first becomes default) |
| `set-key <key> [--name <name>]` | Rotate the API key for an existing remote |
| `list` | Show all registered remotes |
| `use <name>` | Set the default remote |
| `forget <name>` | Remove a remote |
| `ping [--remote <name>]` | Check a remote's `/health` |
| `ls [--remote <name>] [--json]` | List workflows on a remote |
| `run <id> [--input <json>\|--input-file <path>] [--json]` | Execute a workflow remotely |
| `delete <id> [--soft] [--yes]` (alias `rm`) | Delete a workflow on a remote |

Per-workflow remote override: create a `.light-remote` file inside the workflow folder containing the remote name.

**Examples:**

```bash
light remote bind https://my-server.com --key abc123
light remote set-key newkey --name test
light remote ls
light remote run my-workflow --input '{"key": "value"}'
light remote delete old-workflow --yes
```

---

## light pull

Pull a workflow (or all workflows) from a remote server into a local folder.

```bash
light pull <id> [--path <dir>] [--force] [--remote <name>]
light pull --all [--force] [--remote <name>]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--path <dir>` | Target directory | `./<id>` |
| `--force` | Wipe target directory if it already exists | off |
| `--remote <name>` | Use a specific remote | default remote |
| `--all` | Pull every workflow registered on the remote | off |

---

## light push

Push a local workflow folder to a remote server. Omitting `<name>` pushes every workflow folder in the current directory. When a workflow already exists, push confirms before replacing it (use `--yes` to skip the prompt).

```bash
light push [<name>] [--path <dir>] [--remote <name>] [--yes]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--path <dir>` | Folder containing workflow folders | `.` |
| `--remote <name>` | Use a specific remote | default remote |
| `--yes` | Skip the replace confirmation | off |

---

## light link

Manage links between nodes in a workflow folder.

```bash
light link <dir>                                    # Open workflow.json in $EDITOR
light link <dir> --from <id> --to <id> [options]    # Add a link
light link <dir> --edit <link-id> [options]          # Edit a link
light link <dir> --list                             # List links
light link <dir> --remove <link-id>                 # Remove a link
light link <dir> --open                             # Open in $EDITOR
```

**Options (for --from/--to and --edit):**

| Flag | Description |
|---|---|
| `--from <id>` | Source node id |
| `--to <id>` | Target node id |
| `--when <json>` | Condition - when to follow the link |
| `--data <json>` | Static data to inject |
| `--max-iterations <n>` | Limit for back-links (cycles) |
| `--edit <link-id>` | Edit an existing link (only given fields change) |
| `--list` | Print existing links and exit |
| `--remove <link-id>` | Remove a link by id |
| `--open` | Open workflow.json in $EDITOR |

Without flags, opens `workflow.json` in `$EDITOR`.

**Examples:**

```bash
light link my-workflow --list
light link my-workflow --from a --to b
light link my-workflow --from a --to b --when '{"status": "ok"}'
light link my-workflow --from a --to b --when '{"count": {"gt": 5}}' --max-iterations 10
light link my-workflow --edit a-b-1 --when '{"status": {"ne": "error"}}'
light link my-workflow --remove a-b-1
```

---

## light list

List workflows found in a directory. Discovers both folders and JSON files.

```bash
light list [--dir <path>] [--json]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--dir <path>` | Directory to scan | `.` |
| `--json` | Machine-readable output | off |

---

## light pack

Convert a workflow folder into a single portable JSON file. The source folder is removed after packing unless `--keep` is passed.

```bash
light pack [<folder>] [--to <file>] [--force] [--keep]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--to <file>` | Output file path | `<id>.json` |
| `--force` | Overwrite an existing file | off |
| `--keep` | Keep the source folder after packing | off |

---

## light unpack

Convert a workflow JSON file into a folder structure. The source JSON is removed after unpacking unless `--keep` is passed.

```bash
light unpack <file.json> [--to <dir>] [--force] [--keep]
```

**Options:**

| Flag | Description | Default |
|---|---|---|
| `--to <dir>` | Target directory | `./<id>` |
| `--force` | Overwrite existing directory | off |
| `--keep` | Keep the source JSON file after unpacking | off |

---

## light node

Manage node metadata - inspect node info or edit schemas interactively.

### light node info

Show node metadata, input/output schema, and what it receives from upstream nodes.

```bash
light node info <dir> [--json]
```

Reads `.node.json` from the target directory. If a parent `workflow.json` exists, also shows incoming links with source node output schemas, conditions, and injected data.

**Example output:**

```
Node: transform (transform-1)
Image: node:20-alpine
Entrypoint: node index.js

Inputs:
  1. name (string, required) - The user name
  2. age (integer)

Outputs:
  1. result (string, required)

Receives from:
  validate -> status (string, required), message (string)
    when: {"status":"ok"}
    data: {"role":"admin"}
```

### light node schema

Opens an interactive editor that reads `.node.json` in `<dir>` and lets you add, edit, or remove input/output schema fields. Changes are written back to `.node.json` on save.

```bash
light node schema <dir>
```

### light node register

Register an existing node folder in the parent `workflow.json`. Reads the `.node.json` to get the node's id and name, then adds it to the nodes array. Skips if already registered.

```bash
light node register <dir>
```

Use this when you initialized a node outside a workflow folder and moved it in afterwards.

### light node helpers

Regenerate `lp.d.ts` from the node's input/output schema. Provides TypeScript type definitions for `lp.js` so editors show autocomplete for `input` fields and `send()` arguments.

```bash
light node helpers <dir>
```

This is also run automatically by `light node schema` after saving.

**Examples:**

```bash
light node info ./my-node
light node info ./my-node --json
light node schema ./my-node
light node schema ./example/hello
light node register ./my-workflow/my-node
light node helpers ./my-node
```

---

## Global options

| Flag | Description |
|---|---|
| `--version`, `-v` | Show version |
| `--help`, `-h` | Show help |
| `--verbose` | Verbose output |
| `--json` | JSON output |
