---
layout: default
title: Versioning
---

# Versioning

Light Process follows [Semantic Versioning](https://semver.org/) (semver).

## Format

```
MAJOR.MINOR.PATCH-PRERELEASE
```

| Part | Meaning | Example |
|---|---|---|
| MAJOR | Breaking API changes | 1.0.0 -> 2.0.0 |
| MINOR | New features (backwards-compatible) | 0.1.0 -> 0.2.0 |
| PATCH | Bug fixes (backwards-compatible) | 0.1.0 -> 0.1.1 |
| PRERELEASE | Pre-release tag | 0.1.0-alpha.0 |

## Pre-1.0 (current)

While the major version is `0`, the API is not considered stable. Minor version bumps may include breaking changes.

## Release lifecycle

```
0.1.0-alpha.0   First alpha - core features, may have bugs
0.1.0-alpha.2   Second alpha - bug fixes from alpha.1
0.1.0-beta.1    Feature-complete, testing phase
0.1.0-beta.2    Bug fixes from beta.1
0.1.0-rc.1      Release candidate - final testing
0.1.0            Stable release
0.1.1            Patch - bug fix
0.2.0            Minor - new features
1.0.0            First major - stable API commitment
```

## Pre-release ordering

npm and semver sort pre-releases correctly:

```
0.1.0-alpha.0 < 0.1.0-alpha.2 < 0.1.0-beta.1 < 0.1.0-rc.1 < 0.1.0
```

## Installing pre-releases

```bash
# Install latest stable (skips pre-releases)
npm install light-process

# Install specific pre-release
npm install light-process@0.1.0-alpha.0

# Install latest including pre-releases
npm install light-process@next
```

## Current version

Check `package.json` for the current version - it is the single source of truth.

What's included:
- Core workflow engine (DAG execution, parallel batches)
- Node model (Docker containers, code files, I/O schema)
- Link model (conditions, data injection, back-links)
- CLI (run, serve, init, check, describe, doctor)
- A2A protocol server with web dashboard
- JavaScript and Python helpers
- JSON Schema validation

What's not stable yet:
- API surface may change
- A2A integration (SDK compatibility)
- Dashboard features (roadmap items)
