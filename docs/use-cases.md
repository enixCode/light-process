---
layout: default
title: Use Cases
---

# Use Cases

## AI/ML Pipelines

Preprocess a dataset in Python, train a model with GPU, evaluate metrics, and conditionally deploy or retrain.

```
[Preprocess]       -> [Train]          -> [Evaluate] --(score >= 0.9)--> [Deploy]
 python:3.12-alpine    pytorch/pytorch     python:3.12      \
                       gpu: 'all'                            \--(score < 0.9)--> [Retrain]
                                                                                   maxIterations: 3
```

Why light-process fits:
- GPU pass-through for training nodes via `gpu: 'all'`
- Conditional routing based on evaluation metrics (`when: { score: { gte: 0.9 } }`)
- Back-links for retraining loops with `maxIterations` to prevent infinite loops
- Schema validation catches shape mismatches between preprocessing and training
- Network isolation prevents training containers from accessing the internet

## Data Processing

Extract data from an API, clean it, validate the schema, and route valid/invalid records to different handlers.

```
[Extract]          -> [Clean]          -> [Validate] --(valid: true)--> [Load to DB]
 node:20-alpine       python:3.12-alpine   node:20-alpine
                                                     --(valid: false)--> [Log Errors]
```

Why light-process fits:
- Mix Node.js (fast API calls) and Python (pandas/numpy) in the same pipeline
- Schema validation on outputs catches data quality issues between steps
- Conditional routing separates valid and invalid records without if/else in code
- Each step is isolated - a buggy cleanup script can't corrupt the loader

## Remote workflow execution

Serve workflows over HTTP for remote clients, CI pipelines, or other services to trigger them.

```bash
# Start the REST server
LP_API_KEY=secret light serve --port 3000

# Discover workflows
curl -H "Authorization: Bearer secret" http://localhost:3000/api/workflows

# Invoke a workflow
curl -X POST -H "Authorization: Bearer secret" \
  -H "Content-Type: application/json" \
  -d '{"orderId": "abc"}' \
  http://localhost:3000/api/workflows/order-pipeline/run
```

Why light-process fits:
- Plain REST - any HTTP client works, no SDK required
- Bearer auth on write routes, `/health` public for load balancers
- One server hosts multiple workflows, add/remove at runtime with persistence
- `light remote`/`pull`/`push` CLIs already talk to this API

## Microservice Orchestration

Chain API calls with per-step timeouts, network control, and error routing.

```
[Validate Request]  -> [Call Service A]  --+-> [Merge Results] -> [Respond]
 network: "none"       timeout: 5000       |
                       network: "api-net"  |
                    -> [Call Service B]  --+
                       timeout: 5000
                       network: "api-net"
```

Why light-process fits:
- Per-node network control: validation runs isolated (`none`), API calls get network access
- Per-node timeouts prevent slow services from blocking the pipeline
- Independent nodes run in parallel automatically (Service A and B)
- Input/output schemas enforce API contracts between steps
- Link `data` fields inject configuration without hardcoding in node code
