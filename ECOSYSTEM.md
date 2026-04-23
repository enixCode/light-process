# Light Ecosystem

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                  light-runner (npm v0.9.0)                   │
│                                                             │
│  DockerRunner - execution isolee d'un container             │
│  - caps dropped, network isole, PID limit, no-new-privs     │
│  - volumes ephemeres par execution, runsc/gVisor optionnel  │
│  - files/input/extract - zero HTTP, zero CLI                │
└──────────────────────────┬──────────────────────────────────┘
                           │ import
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  light-run (npm v0.1.0)                      │
│                                                             │
│  HTTP wrapper autour de light-runner                        │
│  POST /run { image, files, extract, ... }                   │
│  GET /runs/:id/artifacts/* (stream)                         │
│  POST /runs/:id/cancel                                       │
│  Bearer auth, body limit, async + callback HMAC             │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                      light-process                           │
│                                                             │
│  DAG de containers - workflow.json (nodes + links + when)   │
│  LightRunClient -> POST /run sur LIGHT_RUN_URL              │
│  light serve (REST API) | light push/pull | SDK             │
│  Zero Docker direct, zero infra (Node only)                 │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
                ┌─────────────────────────────┐
                │     light-process-ui         │
                │                             │
                │  Frontend Next.js optionnel │
                │  - @xyflow/react (DAG viz)  │
                │  - pages workflows/jobs     │
                │  - consomme l'API REST      │
                └─────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   parpaing-agent-worker                      │
│                                                             │
│  Specialise : agents AI (Claude Code, OpenCode)             │
│                                                             │
│  Stack : Python 3.12 + FastAPI + PostgreSQL 17 + nginx      │
│                                                             │
│  - Job queue Postgres (create, poll, /wait bloquant, TTL)   │
│  - Warm container pool (atomic acquire, zero race)          │
│  - LLM gateway nginx (cache les API keys aux workers)       │
│  - Multi-tower horizontal scaling (TOWER_REPLICAS=N)        │
│  - Prometheus metrics + dashboard /ui                       │
│  - TOML profiles + Jinja2 templates                         │
│  - Isolation : cap_drop ALL, pids 100, ipc private, runsc   │
└─────────────────────────────────────────────────────────────┘
```

## Liste complete des projets

| Projet | Role | Statut | Stack |
|--------|------|--------|-------|
| **light-runner** | Package npm - DockerRunner bas-niveau (container, caps, volumes) | **publie v0.9.0** | Node + TS |
| **light-run** | HTTP wrapper autour de light-runner (POST /run, artifacts, cancel) | publie v0.1.0, experimental | Node + Fastify + light-runner |
| **light-process** | DAG workflow engine, tape sur light-run via HTTP | actif | Node + TS |
| **light-process-ui** | Frontend Next.js (optionnel) | existe | Next.js + Tailwind + xyflow |
| **jsontoui** | Renderer formulaires depuis JSON Schema | side project, /jtu integre | Node + TS |
| **parpaing** | Agents AI Claude Code / OpenCode | GitHub, MVP | Python + FastAPI + Postgres |
| **lite-light-process** | Ancien prototype | **A ARCHIVER** (doublon) | Node + TS |

## Comparaison execution

| | light-run | light-process | parpaing |
|--|--|--|--|
| **Primitive** | 1 container | DAG containers | agents AI |
| **Trigger** | POST /run | POST + CLI | POST + queue |
| **Config** | GitHub repo | JSON workflow | prompt texte |
| **Infra** | zero | zero | PostgreSQL |
| **Scaling** | stateless | stateless | multi-tower |
| **Use case** | code a la demande | pipelines chaines | coding agents |

## Quand utiliser quoi

```
Tu veux executer du code isole une fois
  └-> light-run

Tu veux chainer plusieurs etapes avec conditions
  └-> light-process

Tu veux faire tourner Claude Code / OpenCode sur des taches
  └-> parpaing
```

## Partage de code - light-runner

`light-runner` est le package npm bas-niveau (v0.9.0) qui expose :
- `DockerRunner.run({ image, dir, command, input, extract, ... })` - execute un container isole
- Caps dropped, network isole, PID limit, no-new-privileges, volumes ephemeres, runsc optionnel
- Zero HTTP, zero workflow, zero CLI

```
npm install light-runner
```

**Consommateurs** : `light-run` l'utilise comme dependance directe pour executer chaque requete HTTP. `light-process` ne le touche plus directement - il tape sur `light-run` via HTTP.

**parpaing reste independant** - stack Python + Postgres, besoin (queue, scaling, metrics)
depasse ce que light-runner (Node) fournirait.

## Projets a clarifier

- **lite-light-process** - ancien prototype, meme description que light-process. A archiver proprement (README note explicative + derniere release + archive GitHub).
- **light-process-ui** - optionnel, autonome. Consomme l'API REST `/api/workflows/*`.
- **jsontoui** - side project, integration deja fonctionnelle via /jtu. Approfondir plus tard si besoin d'UI auto-generees depuis schemas.

## Ce que light-process peut apprendre de parpaing

| Pattern parpaing | Interet pour light-process |
|--|--|
| Warm container pool | Gros gain de latence - aujourd'hui un container neuf par node |
| Endpoint `/wait` bloquant | Meilleur DX que du polling sur `/status` |
| Job TTL + cleanup | Evite la croissance illimitee du state |
| Flag runtime `runsc` (gVisor) | Upgrade securite trivial pour workloads hostiles |
| LLM gateway nginx | Cache les API keys si les nodes appellent des LLM |
| Prometheus `/metrics` | Observabilite standard |

Ces patterns sont optionnels - a considerer quand light-process est battle-tested sur le core.

## Flux typique par projet

### light-run
```
Client -> POST /run { image, files, entrypoint, extract, ... }
       -> light-runner DockerRunner.run(...)
       -> { id, status, exitCode, artifacts }
  GET /runs/:id/artifacts/*  -> stream binaire
```

### light-process
```
Client -> POST /api/workflows/:id/run { input }
       -> Workflow.execute(input)
          -> batch 1 : node-a, node-b en parallele
             LightRunClient.runNode -> POST light-run /run
          -> condition sur output -> node-c ou node-d
          -> batch 2 : node-c
       -> { results, success, duration }
```

### parpaing
```
Client -> POST /task { prompt, agent: "claude-code" }
       -> job queue PostgreSQL
       -> worker -> Docker container agent
       -> stream output
       -> { result, logs }
```
