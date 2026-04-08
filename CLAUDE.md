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
  helpers.ts          Language helpers (lp.js, lp.py)
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
    describe.ts       DAG visualization (text + Mermaid HTML)
    doctor.ts         Environment health check
    utils.ts          Arg parsing, workflow resolution

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

## Folder structure for workflows

```
workflows/my-workflow/
  workflow.json          # id, name, network, nodes[], links[]
  node-a/
    .node.json           # id, name, image, entrypoint, setup, I/O schema
    index.js             # code
    lp.js                # helper
```

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
- `POST /api/workflows` - add a workflow at runtime (JSON body with workflow definition)
- `DELETE /api/workflows/:id` - remove a workflow at runtime
- Adding/removing workflows calls `rebuildHandler()` to update the AgentCard and transport

## Docker isolation

- Default network: `lp-isolated` (bridge, icc=false)
- Dropped capabilities: NET_RAW, MKNOD, SETPCAP, etc.
- `--no-new-privileges`, PID limit 100
- Output via `.lp-output.json` in container workdir (`/app`)

## Rules

- ESM-only (`"type": "module"` in package.json)
- Node 18+ required
- Target: ES2022, module: Node16
- All imports use `.js` extension (TypeScript convention for ESM)
- No default exports - use named exports
- Errors extend `LightProcessError`
- Commit messages: just the message + "build with cc"
- Follow KISS, SOLID, YAGNI
- Version: single source of truth in `package.json` - the server reads it at runtime

## CI/CD

- Published on npm as `light-process` (bins: `light`, `light-process`). Install: `npm i -g light-process`
- `.github/workflows/ci.yml` - lint/build/test
- `.github/workflows/release.yml` - on push to `main`/`dev` touching `package.json`, if version changed: lint + build + test + `npm publish` via OIDC trusted publishing + git tag + GitHub Release. npm dist-tag auto-detected from version suffix (`alpha`/`beta`/`rc`/`latest`)
- `.github/workflows/deploy.yml` - on push to `main`, SSH deploy runs `light-process` on the server
- No Docker image is published for light-process itself - it runs on the host and uses Docker only to execute node containers

## Documentation

When changing files in `src/`, you MUST also update:
- `docs/index.html` - if the change affects any documented feature, API, CLI, or behavior
- `README.md` - if the change affects quick start, examples, or feature list
- `CLAUDE.md` - if the change affects architecture, key concepts, or rules
