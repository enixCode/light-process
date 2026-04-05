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

## Multi-Agent AI (A2A)

Expose workflows as A2A agents that other AI systems can discover and invoke.

```bash
# Start the server
light serve ./workflows --port 3000

# Another AI agent discovers skills
curl http://localhost:3000/.well-known/agent-card.json
# -> { skills: [{ name: "Process Order", description: "...", examples: [...] }] }

# Agent invokes the workflow
curl -X POST http://localhost:3000 -d '{ "jsonrpc": "2.0", ... }'
```

Why light-process fits:
- Standard A2A protocol - any A2A-compatible agent can call your workflows
- Agent card auto-generated from workflow metadata, input schemas, and output schemas
- Each workflow is a skill with description, examples, and tags
- Streaming support for long-running workflows
- Multiple workflows on a single server

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
