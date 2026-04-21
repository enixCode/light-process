# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is this?

Lightweight DAG workflow engine. Orchestrates code that runs in Docker containers, connected by links with conditions. Container execution is delegated to a separate `light-run` HTTP service (see `ECOSYSTEM.md`). Exposes an A2A protocol API. CLI + SDK.

## Sibling projects (local checkouts)

light-process is the top of a 3-tier stack. When reading or debugging, the other two tiers are cloned side-by-side:

- `../light-runner` - npm package `light-runner` (v0.9.0). Low-level Docker runner: caps drop, networks, ephemeral volumes, tar-stream file seeding. Pure library, no HTTP, no CLI. Entry: `../light-runner/src/index.ts`. Doc: `../light-runner/README.md`, `../light-runner/CLAUDE.md`.
- `../light-run` - npm package `light-run` (v0.1.0). Thin HTTP wrapper around `light-runner`: Fastify server exposing `POST /run`, `GET /runs/:id`, `GET /runs/:id/artifacts/:name`, `POST /runs/:id/cancel`, `GET /health`. This is the only service light-process talks to. Entry: `../light-run/src/bin/light-run.js`. Doc: `../light-run/README.md`, `../light-run/CLAUDE.md`.
- `./` (this repo) - `light-process`. DAG orchestrator. Sends HTTP requests to `light-run`, never touches Docker itself.

Dependency direction: `light-process -> light-run -> light-runner -> Docker`. When a container-level bug surfaces (image not found, caps, volumes, stream), fix it in `../light-runner`. When an HTTP contract bug surfaces (payload shape, auth, cancel, artifacts), fix it in `../light-run`. Only workflow/DAG/A2A concerns belong here.

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
    LightRunClient.ts HTTP client calling the light-run service (POST /run, artifact fetch, cancel)
                      Exported under the legacy name `DockerRunner` from runner/index.ts for backward compat
    Execution.ts      Async result wrapper with cancellation (NodeExecutionResult shape)

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
- **light-run** = the external HTTP service that actually runs containers. light-process is now a pure orchestrator

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

MongoDB-style operators: `gt`, `gte`, `lt`, `lte`, `ne`, `in`, `exists`, `regex`, `or`.

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

## Container execution via light-run

light-process no longer talks to the Docker daemon directly. All container work is delegated to a `light-run` HTTP service over the network.

- Required env: `LIGHT_RUN_URL` (e.g. `http://localhost:3001`)
- Optional env: `LIGHT_RUN_TOKEN` (sent as `Authorization: Bearer <token>`)
- `light doctor` checks `LIGHT_RUN_URL` (required) and Docker/gVisor/GPU on the current host (informational - Docker must actually be on the light-run host)
- Both `light run` and `light serve` refuse to start if `LIGHT_RUN_URL` is unset
- Isolation (cap drops, networks, PID limits, per-execution volumes, gVisor/runsc, GPU) is implemented by light-run, not here. See `ECOSYSTEM.md`

### Wire contract (LightRunClient <-> light-run)

`LightRunClient.runNode` builds this body and POSTs it to `POST /run` synchronously (no `async:true`):

| field | source | Zod rule in light-run (`../light-run/src/schemas.ts`) |
|-------|--------|--------------------------------------------------------|
| `image` | `node.image` | required, 1-300 chars |
| `files` | `node.files` | **required, >= 1 entry**, keys relative, no `..`, max 1024 chars each |
| `entrypoint` | `node.entrypoint` if set | optional, 1-2048 chars |
| `setup` | `node.setup` if non-empty | optional, <=50 entries |
| `timeout` | `node.timeout` if `> 0` | optional, 1 ms to 1 h (`60*60*1000`) |
| `network` | `node.network` if set | optional, max 100 chars |
| `workdir` | `node.workdir` if `!== '/app'` | optional, max 200 chars |
| `input` | runtime input if non-empty | optional, unknown |
| `env` | `{name: process.env[name]}` filtered | optional, keys `[A-Za-z_][A-Za-z0-9_]*` |
| `extract` | `[<workdir>/.lp-output.json]` | optional, <=20 entries, each <=1024 chars |

Response: the final `RunState`. Output retrieval: `GET /runs/:id/artifacts/.lp-output.json`. Cancel: `POST /runs/:id/cancel` (204). The run id is a UUID v4 minted server-side (the `lp-*` prefix built in `LightRunClient` is only used for our own `Execution.id`, not sent to light-run).

### Edge cases and gotchas

- **Empty `files`**: Zod rejects with 400. `Node.setCode()`, `addHelper()`, `loadDirectory()` always populate files, but a bare `new Node({name, image, entrypoint})` in SDK mode would break. If adding new Node paths, ensure at least one file is written.
- **Payload size**: default `bodyLimit` on light-run is 10 MiB. Big models/binaries in `files` need `LIGHT_RUN_BODY_LIMIT` bumped on the light-run side (we don't set it).
- **Artifact path match**: `LightRunClient` looks for `a.path === OUTPUT_FILE` (= `.lp-output.json`). This relies on light-runner's rule "file `from` lands as `to/basename(from)`" -> `scanArtifacts` returns the bare basename, which matches. If light-run ever changes extract semantics, this breaks silently (we'd just report empty output).
- **Type drift**: `../light-run/src/schemas.ts` holds a compile-time alignment assert against `light-runner`'s `RunRequest`. If light-runner widens/tightens shared fields (`image`, `timeout`, `network`, `env`, `workdir`, `input`), light-run's build fails before the drift reaches us. Our only defense is the HTTP contract above - re-read it when upgrading light-run.
- **Timeouts**: `node.timeout = 0` means "no timeout" -> we omit the field and light-run lets light-runner use its 20-minute default (see `../light-runner/README.md`). For unbounded runs, that default still applies.
- **No Docker artifacts shipped**: light-process is pure npm. Users install `light-run` and `light-process` globally via npm; light-run provides the Docker connection on its own host.

## Distribution

Pure npm - no Docker images, no compose file shipped. Users install both packages globally and run them as two processes:

```bash
npm install -g light-run light-process

# terminal 1 - runner (keeps running, needs Docker on the same host)
light-run serve --token $(openssl rand -hex 32) --port 3001

# terminal 2 - orchestrator
export LIGHT_RUN_URL=http://localhost:3001
export LIGHT_RUN_TOKEN=<same token>
light serve
```

Requires Node 22+ and Docker on the machine running `light-run`. light-process itself only needs Node - it never talks to Docker directly.

### Production deploy (your own VPS)

`.github/workflows/deploy.yml` triggers on mobile git tag pushes (`alpha` or `latest`) that `release.yml` moves automatically. It SSHes into the server and runs `light-process-test` (staging, lp-test.enixcode.fr) when `alpha` moves, or `light-process` (prod, lp.enixcode.fr) when `latest` moves. Those scripts live on the server - they restart a systemd unit, re-run `npm install -g light-process@latest`, and bounce the process. Same pattern for `light-run` (`systemctl restart light-run` or equivalent). No `staging` branch, no compose image published, no build step on the CI.

Concretely: push to `main` auto-deploys staging via the `alpha` tag hop; push a `v*` tag auto-deploys prod via the `latest` tag hop.

### What lives where

| Concern | Fixed in |
|---------|----------|
| Container flags, caps, volumes, tar streaming, gVisor runtime | `../light-runner` |
| HTTP route, auth token, Zod validation, artifact storage/eviction, async+callback | `../light-run` |
| Workflow DAG, link conditions, back-link loops, A2A protocol, CLI, SDK | here |
| `.lp-output.json` convention (JSON only, in `workdir`) | here (helpers.ts, LightRunClient) |

## Rules

3- **ALWAYS VERIFY THAT A FIX REALLY WORKS ON THE ACTUAL BROKEN CASE, AND ASK FOR CONFIRMATION BEFORE ANY COMMIT OR PUSH.**
- ESM-only (`"type": "module"` in package.json)
- Node 20+ required
- Target: ES2022, module: Node16
- All imports use `.js` extension (TypeScript convention for ESM)
- No default exports - use named exports
- Errors extend `LightProcessError`
- Commit messages: short and synthetic, just the fix + "build with cc" (no long body)
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

## Branching and releases

GitHub Flow - single long-lived branch.

- `main` - the only long-lived branch. All work merges here via PRs (squash merged).
- Feature branches (`feature/*`, `fix/*`, `docs/*`) - short-lived, deleted after merge.
- Tag `v*` - release trigger (npm publish + GitHub Release).
- Mobile tag `alpha` - auto-moves to main HEAD on every push.
- Contributors fork, branch from `main`, PR to `main`. See CONTRIBUTING.md.
- Release: tag main with `v{VERSION}` and push. See the release skill.

## CI/CD

- Published on npm as `light-process` (bins: `light`, `light-process`). Install: `npm i -g light-process`
- `.github/workflows/ci.yml` - lint/build/test
- `.github/workflows/release.yml` - triggered by push to `main` (move mobile git tag `alpha`) or push of tag `v*` (lint/build/test + `npm publish --tag latest --provenance` via OIDC + move mobile git tag `latest` + GitHub Release). Tag-based releases: pushing a version tag triggers publish.
- `.github/workflows/deploy.yml` - triggered by push of mobile tags `alpha` (-> `light-process-test` on lp-test.enixcode.fr, staging) or `latest` (-> `light-process` on lp.enixcode.fr, prod). Tags are moved automatically by `release.yml`, so push to `main` auto-deploys staging and push a `v*` tag auto-deploys prod. There is **no `staging` branch** - staging is an environment driven by the `alpha` mobile tag.
- No Docker image is published for light-process itself - it runs on the host and uses Docker only to execute node containers

## Documentation

When changing files in `src/`, you MUST also update:
- `docs/index.html` - if the change affects any documented feature, API, CLI, or behavior
- `README.md` - if the change affects quick start, examples, or feature list
- `CLAUDE.md` - if the change affects architecture, key concepts, or rules
- `ECOSYSTEM.md` - if the change affects the light-run / light-process boundary or the shared projects diagram