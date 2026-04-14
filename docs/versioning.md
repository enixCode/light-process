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

Light Process uses tag-based releases. Creating a git tag `v<version>`
on the `main` branch triggers the npm publish workflow.

```
0.1.0   First stable release
0.1.1   Patch - bug fixes
0.2.0   Minor - new features (may break pre-1.0 APIs)
1.0.0   First major - stable API commitment
```

Between releases, the `main` branch carries work-in-progress code. Every
push to `main` moves a mobile git tag named `alpha` to the latest commit.

## Installing alpha builds

```bash
# Install latest stable from npm (recommended)
npm install light-process

# Install a specific release
npm install light-process@0.1.0

# Install latest alpha snapshot (from GitHub, not npm)
npm install github:enixCode/light-process#alpha
```

The `#alpha` variant installs whatever commit the mobile git tag `alpha`
currently points to - always the latest push on the `main` branch. There
is no `@alpha` tag on npm; alpha builds are only distributed via GitHub.

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
