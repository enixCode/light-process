---
layout: default
title: Execution (light-run)
---

# Execution

light-process no longer talks to Docker directly. Every node runs inside a container spawned by the [light-run](https://github.com/enixCode/light-run) HTTP service.

## Configuration

```bash
export LIGHT_RUN_URL=http://localhost:3001     # required
export LIGHT_RUN_TOKEN=your-bearer-token       # optional, if light-run requires auth
```

Or programmatically via the SDK:

```javascript
import { LightRunClient } from 'light-process';

const runner = new LightRunClient({
  url: 'http://localhost:3001',
  token: process.env.LIGHT_RUN_TOKEN,
});
```

## Node -> light-run mapping

Each node field is forwarded to `POST /run`:

| Node field | light-run field | Notes |
|---|---|---|
| `image` | `image` | Required |
| `files` | `files` | Record<path, content>, paths relative, >= 1 entry |
| `entrypoint` | `entrypoint` | Executed via `sh -c` |
| `setup` | `setup` | Commands chained with `&&` before entrypoint |
| `timeout` | `timeout` | Omitted when `0` (light-runner default applies) |
| `network` | `network` | `"none"`, named network, or omitted for default |
| `workdir` | `workdir` | Omitted when `/app` (light-run default) |
| `env` (names) | `env` (name->value) | Values resolved from the light-process env |
| runtime input | `input` | Piped to container stdin |
| - | `extract` | Always `[<workdir>/.lp-output.json]` |

## Output channel

A node writes its result to `.lp-output.json` in its workdir. light-process fetches the artifact via `GET /runs/:id/artifacts/.lp-output.json` once the run succeeds. Empty or non-object output becomes `{}`.

## Isolation

Capability drops, PID limits, isolated bridge networks, gVisor/runsc runtime, GPU access, memory/CPU caps - **all handled by light-run** (which delegates to light-runner). Configure them on the light-run instance, not here. See the [light-run README](https://github.com/enixCode/light-run#readme).

## Cancellation

Workflows support cancellation via `AbortController`. When aborted, light-process calls `POST /runs/:id/cancel` on light-run.

```javascript
const controller = new AbortController();
setTimeout(() => controller.abort(), 5000);

const result = await wf.execute(input, {
  runner,
  signal: controller.signal,
});
```

## Health check

```bash
light doctor
```

Verifies `LIGHT_RUN_URL` is set and `GET /health` on the light-run instance responds.
