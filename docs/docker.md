---
layout: default
title: Docker & Security
---

# Docker & Security

Each node runs in an isolated Docker container with security hardening.

## Container lifecycle

1. A named Docker volume (`lp-<execId>`) is created for the run
2. An entrypoint script is generated from `setup` + `entrypoint`
3. Files (node files + entrypoint) are seeded into the volume via a short-lived helper container
4. `docker run` starts the node container with the volume mounted at `workdir`
5. Input is piped to stdin as JSON
6. Output is read from `.lp-output.json` in the volume via a helper container
7. Node container is removed after execution (`--rm`); volume is destroyed

This volume-based design lets the runner work the same way whether it runs on the host or inside a container with `/var/run/docker.sock` mounted - no host path needs to be shared between the two contexts.

Orphan volumes from a previous crash are pruned at `light serve` startup.

## DockerRunner options

```javascript
const runner = new DockerRunner({
  memoryLimit: '512m',     // --memory flag
  cpuLimit: '1.5',         // --cpus flag
  runtime: 'runsc',        // --runtime flag
  gpu: 'all',              // --gpus flag
  noNewPrivileges: true,   // --security-opt (default: true)
  verbose: false,          // log Docker commands
});
```

| Option | Type | Default | Description |
|---|---|---|---|
| `memoryLimit` | string | none | Container memory limit (e.g. "256m", "2g") |
| `cpuLimit` | string | none | CPU cores (e.g. "0.5", "2") |
| `runtime` | string | "runc" | Container runtime: "runc", "runsc" (gVisor), "kata" |
| `gpu` | boolean/string/number | false | GPU access: false, "all", count, device ID |
| `noNewPrivileges` | boolean | true | Prevent privilege escalation |
| `verbose` | boolean | false | Log Docker commands |

## Security hardening

### Capabilities dropped

The following dangerous capabilities are always dropped:

- `NET_RAW` - raw socket access
- `MKNOD` - device file creation
- `SYS_CHROOT` - chroot
- `SETPCAP` - capability modification
- `SETFCAP` - file capability modification
- `AUDIT_WRITE` - audit log writing

### Other security measures

- `--no-new-privileges` prevents privilege escalation
- `--pids-limit 100` limits process count
- Per-execution Docker volume destroyed after run; orphans pruned at startup
- Path traversal checks on file operations
- Prototype pollution prevention on JSON parsing

## Networks

### Default: lp-isolated

By default, all containers run on a shared `lp-isolated` bridge network with **inter-container communication disabled** (ICC=false).

```bash
# Created automatically on first use:
docker network create --driver bridge \
  -o com.docker.network.bridge.enable_icc=false \
  lp-isolated
```

### Network options

| Value | Effect |
|---|---|
| `null` | Use workflow network (default: `lp-isolated`) |
| `"none"` | No network access |
| `"host"` | Host network (no isolation) |
| `"my-net"` | Custom Docker network |

Set per-node in `.node.json`:

```json
{
  "network": "none"
}
```

Or per-workflow in `workflow.json`:

```json
{
  "network": "my-custom-network"
}
```

Node network overrides workflow network.

## GPU support

```javascript
const runner = new DockerRunner({ gpu: 'all' });
```

| Value | Docker flag |
|---|---|
| `false` | no GPU |
| `'all'` | `--gpus all` |
| `2` | `--gpus 2` |
| `'"device=0,1"'` | `--gpus "device=0,1"` |

Requires NVIDIA Container Toolkit. Check with `light doctor`.

## Runtimes

| Runtime | Description |
|---|---|
| `runc` | Default OCI runtime |
| `runsc` | gVisor sandbox (stronger isolation) |
| `kata` | Kata Containers (VM-level isolation) |

Check availability with `light doctor`.

## Container naming

Containers are named `lp-<nodeId>-<timestamp>-<seq>` for easy identification:

```
lp-hello-1712345678901-0
```

## Cancellation

Workflows support cancellation via `AbortController`:

```javascript
const controller = new AbortController();

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);

const result = await wf.execute(input, {
  runner,
  signal: controller.signal,
});
```

Cancelled containers are killed with `docker kill`.
