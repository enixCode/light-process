---
layout: default
title: Workflows
---

# Workflows

A workflow is a directed acyclic graph (DAG) of nodes connected by links. Each node runs code in a Docker container.

## Folder structure

```
my-workflow/
  workflow.json          # DAG definition
  node-a/
    .node.json           # node config
    index.js             # code
    lp.js                # helper
  node-b/
    .node.json
    main.py
    lp.py
```

## workflow.json

Defines the DAG structure:

```json
{
  "id": "my-workflow",
  "name": "My Workflow",
  "network": null,
  "nodes": [
    { "id": "node-a", "name": "Node A", "dir": "node-a" },
    { "id": "node-b", "name": "Node B", "dir": "node-b" }
  ],
  "links": [
    { "from": "node-a", "to": "node-b" }
  ]
}
```

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `name` | yes | Display name |
| `network` | no | Docker network for all nodes (null = `lp-isolated`) |
| `nodes` | yes | Array of node references (`id`, `name`, `dir`) |
| `links` | no | Array of links between nodes |

## .node.json

Configures a single node:

```json
{
  "id": "node-a",
  "name": "Node A",
  "image": "node:20-alpine",
  "entrypoint": "node index.js",
  "setup": ["npm install axios"],
  "timeout": 10000,
  "network": null,
  "inputs": null,
  "outputs": null
}
```

| Field | Required | Description |
|---|---|---|
| `id` | yes | Unique identifier |
| `name` | yes | Display name |
| `image` | yes | Docker image |
| `entrypoint` | yes | Command to run |
| `setup` | no | Shell commands before entrypoint |
| `timeout` | no | Node timeout in ms (0 = none) |
| `network` | no | Override workflow network |
| `inputs` | no | JSON Schema for input validation |
| `outputs` | no | JSON Schema for output validation |

## Links

Links connect nodes and control data flow:

```json
{
  "from": "node-a",
  "to": "node-b",
  "when": { "status": "ok" },
  "data": { "extra": "value" },
  "maxIterations": null
}
```

| Field | Required | Description |
|---|---|---|
| `from` | yes | Source node ID |
| `to` | yes | Target node ID |
| `when` | no | Condition on source output (see [Conditions](conditions)) |
| `data` | no | Extra data merged into target input |
| `maxIterations` | no | Loop limit for back-links |

## Execution model

1. **Entry nodes** (no incoming forward links) start first with the initial input
2. Nodes in the same layer run **in parallel** via `Promise.all()`
3. After a node completes, outgoing links are evaluated
4. If a link has `when`, it only fires if the condition matches the output
5. Target nodes start when **all** incoming links have data ready
6. Multiple incoming links merge their outputs with `Object.assign()`
7. Link `data` is merged on top of the source output
8. If any node fails, the workflow stops

## Back-links (loops)

A link that creates a cycle requires `maxIterations`:

```json
{
  "from": "process",
  "to": "validate",
  "when": { "retry": true },
  "maxIterations": 3
}
```

Without `maxIterations`, adding a cycle throws `LinkValidationError`.

## Network inheritance

- Workflow `network` applies to all nodes with `network: null`
- Node `network` overrides the workflow network
- Default network is `lp-isolated` (bridge, no inter-container communication)
- Set `network: "none"` to fully isolate a node

## Data flow

```
Input -> [Node A] -> output A
                       |
                       v (merged with link.data)
                   [Node B] -> output B
                       |
                       v
                   [Node C] -> final output
```

When multiple nodes feed into one:

```
[Node A] -> output A -+
                       |-> merged input -> [Node C]
[Node B] -> output B -+
```

Merge order follows link evaluation order. Later values overwrite earlier ones.
