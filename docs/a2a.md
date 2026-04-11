---
layout: default
title: A2A Protocol
---

# A2A Protocol

Light Process implements the [A2A protocol](https://google.github.io/A2A/) (Agent-to-Agent) for exposing workflows as AI agents.

## Start the server

```bash
light serve --port 3000
```

This starts:
- **Web dashboard** at `http://localhost:3000/`
- **A2A agent** at `http://localhost:3000/`
- **Agent card** at `http://localhost:3000/.well-known/agent-card.json`

## Agent discovery

```bash
curl http://localhost:3000/.well-known/agent-card.json
```

```json
{
  "name": "Light Process",
  "description": "Workflow engine with Docker container isolation",
  "url": "http://localhost:3000",
  "protocolVersion": "0.2.1",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false,
    "stateTransitionHistory": true
  },
  "defaultInputModes": ["application/json"],
  "defaultOutputModes": ["application/json"],
  "skills": [
    {
      "id": "my-workflow",
      "name": "My Workflow",
      "description": "Workflow: My Workflow (3 nodes)",
      "tags": ["workflow"]
    }
  ]
}
```

Each registered workflow appears as a **skill**.

## Send a task

```bash
curl -X POST http://localhost:3000 \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "1",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "msg-1",
        "role": "user",
        "parts": [{
          "kind": "data",
          "data": {
            "workflowId": "my-workflow",
            "name": "Alice"
          }
        }]
      }
    }
  }'
```

## Workflow resolution

The executor selects a workflow using these rules:

1. If `workflowId` is in the data, use that workflow
2. If `workflowName` is in the data, match by name (case-insensitive)
3. If only one workflow is registered, use it automatically
4. Otherwise, return an error with available workflow names

## REST API

The server also provides REST endpoints for the dashboard:

```bash
# List all workflows
curl http://localhost:3000/api/workflows

# Get workflow detail (nodes + links, without file contents)
curl http://localhost:3000/api/workflows/my-workflow-id

# Health check
curl http://localhost:3000/health
```

## SDK usage

```javascript
import { createA2AServer, Workflow, DockerRunner } from 'light-process';

const runner = new DockerRunner();
const app = createA2AServer({ port: 3000, runner });

// Register workflows
app.registerWorkflow(myWorkflow);

// Start listening
await app.listen();

// Later: stop
await app.close();
```

### Server options

```javascript
createA2AServer({
  port: 3000,              // listen port (default: 3000)
  host: '0.0.0.0',         // bind host (default: '0.0.0.0')
  runner: new DockerRunner(), // shared runner instance
  card: {
    name: 'My Agent',       // agent name
    description: 'Custom',  // agent description
    url: 'https://my.host', // public URL
  },
});
```

## Task lifecycle

When a task is received via `message/send`:

1. **working** - workflow execution starts
2. **working** - status update per node start
3. **artifact-update** - result per node completion
4. **completed** or **failed** - final status with workflow result

## CORS

The server allows cross-origin requests:
- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, POST, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
