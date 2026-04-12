# Light Process - Technical Guide

## What is this?

Lightweight DAG workflow engine. Runs code in Docker containers, connected by links with conditions. Exposes an A2A protocol API. CLI + SDK.

## Quick commands

```bash
npm run build        # compile TypeScript
npm run dev          # watch mode
npm start            # alias for: node dist/cli.js serve
npm test             # unit tests
npm run test:all     # unit + integration
```

## Architecture

```
src/
  cli.ts              CLI entry - dispatches to commands
  index.ts            SDK barrel exports
  Workflow.ts         Core DAG - nodes, links, batch execution
  CodeLoader.ts       Load/export workflows from folder structure
  schema.ts           JSON Schema validation via AJV
  helpers.ts          Language helpers (lp.js, lp.py) + lp.d.ts generator
  defaults.ts         Constants (workdir, images, ignore patterns)
  errors.ts           Custom error types

  models/
    Node.ts           Container config - image, files, entrypoint, I/O schema
    Link.ts           Edge - from/to, when condition, data, maxIterations
    conditions.ts     MongoDB-style condition evaluation

  runner/
    DockerRunner.ts   Docker container execution engine
    Execution.ts      Async result wrapper with cancellation

  cli/
    run.ts            Execute workflow or single node
    serve.ts          Start A2A API server
    init.ts           Scaffold project or node
    check.ts          Validate workflow structure
    describe.ts       DAG visualization with I/O schemas (text + Mermaid HTML)
    doctor.ts         Environment health check
    config.ts         Read/write global config (~/.light/config.json)
    remote.ts         Manage remote profiles, ping, ls, run, delete
    pull.ts           Pull a workflow from remote into ./<id>/
    push.ts           Push local workflow folder(s) to remote (POST or PUT)
    pack.ts           Convert workflow folder to single JSON file
    unpack.ts         Convert JSON file to workflow folder
    list.ts           List workflows in a directory
    link.ts           Manage links (inline flags or $EDITOR, no REPL)
    node.ts           Node management (info, schema editor, register, helpers)
    utils.ts          Arg parsing, workflow resolution

  config.ts           Global config manager (remotes, defaults, override resolution)
  remoteClient.ts     HTTP client for the A2A server (list/get/getFull/create/update/delete/ping/sendMessage)

  a2a/
    server.ts         HTTP server with JSON-RPC + SSE
    WorkflowExecutor.ts  A2A AgentExecutor implementation
    cardBuilder.ts    Builds AgentCard from workflows
```

## Key concepts

- **Node** = a Docker container with code files, image, entrypoint, optional I/O schema
- **Link** = edge between nodes with optional `when` condition (MongoDB-style) and `data` injection
- **Back-link** = link creating a cycle - requires `maxIterations` to prevent infinite loops
- **Entry nodes** = nodes with no incoming forward links (back-links excluded)
- **Execution** = queue-based batches with `Promise.all()` for parallel nodes

## Workflow formats

Workflows exist in two formats - folder (for editing) and JSON (for transport/deploy):

```
my-workflow/                     # folder format - the working copy
  workflow.json                  # id, name, network, nodes[], links[]
  node-a/
    .node.json                   # id, name, image, entrypoint, setup, I/O schema
    index.js                     # code
    lp.js                        # helper
    lp.d.ts                      # auto-generated types for editor autocomplete

my-workflow.json                 # JSON format - single portable file
```

- `light pack <name>` converts folder to JSON (removes the folder)
- `light unpack <name>` converts JSON to folder (removes the JSON)
- `light list` shows all workflows in the current directory
- `light node schema <dir>` edits a node's input/output JSON Schema interactively (also regenerates `lp.d.ts`)
- `light node helpers <dir>` regenerates `lp.d.ts` from schema (for manual `.node.json` edits)
- Use `--keep` on pack/unpack to preserve the source
- All commands search the current directory by default

## Conditions system (link.when)

MongoDB-style operators: `gt`, `gte`, `lt`, `lte`, `ne`, `in`, `exists`, `or`.

```json
{ "count": { "gt": 5 }, "status": "ok" }
```

All top-level fields are AND. Use `{ "or": [...] }` for OR logic.

## API key authentication

- `light serve` enables API key auth only when `LP_API_KEY` env var is set
- If `LP_API_KEY` is unset, auth is disabled (all routes public)
- Protects POST routes and `/api/*` routes - requires `Authorization: Bearer <key>` header
- GET routes like `/health` and `/.well-known/agent-card.json` are public
- AgentCard advertises security schemes when auth is enabled
- `POST /api/workflows` - add a workflow at runtime (JSON body). In-memory only by default. Add `?persist=true` to also write `<workflows-dir>/<id>.json` so it survives restarts
- `DELETE /api/workflows/:id` - remove a workflow at runtime. Add `?persist=true` to also delete the file from disk
- Adding/removing workflows calls `rebuildHandler()` to update the AgentCard and transport
- The persist directory is set by `light serve [dir]` (defaults to `.`) and passed as `persistDir` to `createA2AServer`

## Docker isolation

- Default network: `lp-isolated` (bridge, icc=false)
- Dropped capabilities: NET_RAW, MKNOD, SETPCAP, etc.
- `--no-new-privileges`, PID limit 100
- Output via `.lp-output.json` in container workdir (`/app`)

## Rules

- ESM-only (`"type": "module"` in package.json)
- Node 20+ required
- Target: ES2022, module: Node16
- All imports use `.js` extension (TypeScript convention for ESM)
- No default exports - use named exports
- Errors extend `LightProcessError`
- Commit messages: just the message + "build with cc"
- Follow KISS, SOLID, YAGNI
- Version: single source of truth in `package.json` - the server reads it at runtime

## Remote workflow (client-server)

- Global config at `~/.light/config.json`. Per-workflow override via `.light-remote` file inside the workflow folder
- `light remote bind <url> --key <key> [--name <name>]` - register a remote (first one becomes default)
- `light remote set-key <key> [--name <name>]` - update API key on an existing remote (keeps url)
- `light remote list|use|forget|ping`
- `light remote ls`, `light remote run <id> --input '...'|--input-file f.json`
- `light remote delete|rm <id> [--soft] [--yes]`
- `light pull <id> [--path <dir>] [--force]` - default target `./<id>/`. `--force` wipes target first
- `light push [<name>] [--path <dir>]` - no-arg pushes all in current directory. Auto POST/PUT (PUT prompts confirm unless `--yes`)
- `light link <dir>` - manage links inline (`--from/--to`, `--edit <id>`, `--list`, `--remove <id>`) or open in `$EDITOR`
- Server: `GET /api/workflows/:id?full=true` returns the full workflow JSON for pull
- Server: `PUT /api/workflows/:id?persist=true` atomic update used by push

## CI/CD

- Published on npm as `light-process` (bins: `light`, `light-process`). Install: `npm i -g light-process`
- `.github/workflows/ci.yml` - lint/build/test
- `.github/workflows/release.yml` - triggered by push to `dev` (move mobile git tag `alpha`) or push of tag `v*` (lint/build/test + `npm publish --tag latest --provenance` via OIDC + move mobile git tag `latest` + GitHub Release). Tag-based releases: pushing a version tag triggers publish, merging `dev` into `main` does not
- `.github/workflows/deploy.yml` - on push to `main` or `dev`, SSH deploy runs `light-process` (main/prod) or `light-process-test` (dev) on the server
- No Docker image is published for light-process itself - it runs on the host and uses Docker only to execute node containers

## Documentation

When changing files in `src/`, you MUST also update:
- `docs/index.html` - if the change affects any documented feature, API, CLI, or behavior
- `README.md` - if the change affects quick start, examples, or feature list
- `CLAUDE.md` - if the change affects architecture, key concepts, or rules
