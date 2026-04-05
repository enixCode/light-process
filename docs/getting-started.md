---
layout: default
title: Getting Started
---

# Getting Started

## Requirements

- **Node.js** >= 18 ([download](https://nodejs.org))
- **Docker** with daemon running ([download](https://docs.docker.com/get-docker/))

## Install

```bash
npm install -g light-process
```

Verify your environment:

```bash
light doctor
```

Expected output:

```
Checking environment...

  [ok] Node.js: v20.x.x
  [ok] Docker: Docker version 24.x.x
  [ok] Docker daemon: running

[ok] Ready
```

## Create a project

```bash
light init my-project
cd my-project
```

This creates:

```
my-project/
  package.json
  main.js                           # SDK usage example
  workflows/
    example/
      workflow.json                  # DAG definition
      hello/
        .node.json                   # node config
        index.js                     # code
        lp.js                        # helper
```

## Run the example

```bash
light run ./workflows/example
```

```
Running: Example (from folder)
> Hello
  [Hello] Input: {}
  [ok] Hello 2100ms

-> {"hello":"world","input":{}}

[ok] 2108ms
```

## Run with input

```bash
light run ./workflows/example --input '{"name": "Alice"}'
```

```
-> {"hello":"world","input":{"name":"Alice"}}
```

## Validate a workflow

```bash
light check ./workflows/example
```

```
Checking: Example (from folder)

  [ok] workflow.json exists
  [ok] workflow.json structure
  [ok] Workflow loads
  [ok] Nodes valid - 1 node(s)
  [ok] Links valid - 0 link(s)
  [ok] Entry nodes - 1 entry node(s)

[ok] 6/6 checks passed
```

## Visualize the DAG

```bash
light describe ./workflows/example
```

Outputs a text tree and generates `describe.html` with an interactive Mermaid diagram.

## Start the dashboard

```bash
light serve ./workflows --port 3000
```

Open `http://localhost:3000` to see the web dashboard with your workflow DAG.

## Add a new node

```bash
cd workflows/example
light init --node ./transform
```

This creates a `transform/` folder with `.node.json`, `index.js`, `lp.js`, and auto-registers it in `workflow.json`.

## Add a Python node

```bash
light init --node ./analyze --lang python
```

Creates `analyze/` with `.node.json`, `main.py`, and `lp.py` using `python:3.12-alpine`.

## Next steps

- [CLI Reference](cli) - all commands and flags
- [SDK Guide](sdk) - build workflows in code
- [Workflows](workflows) - folder structure and linking
- [Conditions](conditions) - conditional routing
