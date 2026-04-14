# Development Guide

Internal guide for contributors. User-facing docs live in [README.md](README.md) and [docs/index.html](docs/index.html).

## Branching model

| Branch/Ref | Purpose | Published |
|---|---|---|
| `dev` | Daily work, alphas, testing | Mobile git tag `alpha`. No npm publish. Auto-deployed to VPS test. |
| `main` | Stable integration branch | Auto-deployed to VPS prod. **No npm publish.** |
| tag `v*` | Release trigger | npm `@latest` + mobile tag `latest` + GitHub Release. |

**Releases are tag-driven, not branch-driven.** Merging dev into main
deploys the code but does not publish to npm. Publishing happens only
when you explicitly push a version tag (`git tag v0.1.0 && git push origin v0.1.0`).

## Quick commands

```bash
npm run build        # compile TypeScript
npm run dev          # tsc --watch
npm start            # node dist/cli.js serve
npm test             # unit tests
npm run test:all     # unit + integration
npm run lint         # biome check
npm run lint:fix     # biome check --write
npm run test:e2e     # adversarial HTTP + CLI tests against a running server
```

## CI/CD overview

Three GitHub Actions workflows:

### ci.yml - always runs on push/PR
- Lint (biome) + build (tsc) + unit tests on Node 20 and 22
- Integration tests on Node 22
- Nothing is published

### release.yml - triggered by dev push OR tag push (v*)

**On dev push:**
- Lint + build + test
- Force-push mobile git tag `alpha` to the current commit
- No npm publish, no fixed tag, no GitHub Release

**On tag push (`v*`):**
- Lint + build + test
- Read version from tag name: `VERSION="${GITHUB_REF_NAME#v}"` (e.g. `v0.1.0` -> `0.1.0`)
- Guard: refuse to publish if version contains `-` (pre-release tags like `v0.1.0-rc.1` are rejected)
- `npm version $VERSION --no-git-tag-version` injects version for publish
- Skip if version already exists on npm (idempotent)
- `npm publish --tag latest --provenance --access public` (OIDC trusted publishing)
- Force-push mobile git tag `latest` to the tagged commit
- `gh release create v0.1.0 --generate-notes`

**Pushing to `main` does NOT trigger release.yml.** It only triggers
`ci.yml` (tests) and `deploy.yml` (VPS prod deploy). Releases are
intentional - you have to create and push a version tag to publish.

### deploy.yml - runs on push to dev (temporary, was main)
- SSH to VPS via `appleboy/ssh-action`
- Runs a restricted deploy script that only accepts the app name as input
- Script (ansible-backup playbook 15): `cd ~/apps/light-process && git fetch && git reset --hard origin/<branch> && docker compose up -d --build --remove-orphans`
- The VPS pulls whatever branch is configured in `inventory/hosts.yml` of ansible-backup

## How to release

### Release a new alpha (implicit, on every dev push)

```bash
git commit -am "..."
git push origin dev
# -> CI runs, 'alpha' git tag moves to your commit, VPS test redeploys.
# Users install dev via: npm i github:enixCode/light-process#alpha
```

### Release a new stable version

Tag-based. Three steps:

```bash
# 1. Merge dev into main (optional, just updates VPS prod)
git checkout main
git pull
git merge dev
git push origin main

# 2. Create and push the version tag - this triggers npm publish
git tag v0.1.0
git push origin v0.1.0

# 3. Watch the release workflow
gh run watch
```

What happens on the tag push:
- release.yml runs on the tagged commit
- Lint + build + test
- `npm publish 0.1.0 --tag latest --provenance --access public`
- mobile tag `latest` moves to this commit
- GitHub Release `v0.1.0` created with auto notes

No package.json bumping required - the workflow reads the version from
the tag name. You can align package.json with the released tag if you
want (for consistency in the repo), but the published package always
matches the tag.

See [RELEASE.md](RELEASE.md) for the full visual guide.

### Trouble

- **`npm publish` 404 "Not found"** on OIDC trusted publishing:
  - Ensure Node 24+ in the workflow (npm v10 has a broken OIDC handshake that returns 404)
  - Check trusted publisher config on npmjs.com matches `repo_owner/repo_name/release.yml`
  - Make sure `package.json` `repository.url` matches GitHub casing (claim is case-sensitive)
- **`release.yml` fails with "version already exists"**: the npm pre-check should skip this, but if not, bump `package.json` and push again.
- **VPS deploy succeeds but runs old code**: check which branch is in `ansible-backup/inventory/hosts.yml`. The script pulls that exact branch. If you want dev code, set `branch: "dev"` there.

## Architecture

See [CLAUDE.md](CLAUDE.md) for the source tree layout, key concepts (Node, Link, Workflow, conditions), Docker isolation, API auth, and remote workflow commands.

## Testing against a local server

Two ways to test the CLI against a live server:

**Native local (fastest):**

```bash
# Terminal 1
LP_API_KEY=testkey node dist/cli.js serve /tmp/wf --port 4141

# Terminal 2
HOME=/tmp/fake node dist/cli.js remote bind http://localhost:4141 --key testkey
HOME=/tmp/fake node dist/cli.js remote ping
HOME=/tmp/fake node dist/cli.js remote ls
```

**Docker:**

```bash
docker compose up --build
curl http://localhost:3000/health
```

## Adversarial e2e suite

`test/e2e-adversarial/run.mjs` spins through 31 real HTTP + CLI scenarios against a running server. Not wired into CI yet.

```bash
LP_API_KEY=testkey node dist/cli.js serve /tmp/wf --port 4141 &
LP_TEST_URL=http://localhost:4141 LP_TEST_KEY=testkey npm run test:e2e
```

Covers: health, discovery, auth, CRUD, persist flag, PUT, CLI config/remote/push/pull/link, secrets L1 validation.

## Secrets management (level 1)

Nodes can opt into env passthrough:

```json
{
  "id": "my-node",
  "env": ["OPENAI_API_KEY", "STRIPE_KEY"]
}
```

- Only **names** are stored in the workflow JSON. Values live on the server's environment (or systemd unit, or docker-compose `env_file`).
- Names are validated at Node construction: must match `[A-Z_][A-Z0-9_]*`, cannot start with `LP_` (reserved).
- DockerRunner injects them via `-e NAME=$value` at container spawn time.
- Missing values: the runner warns and skips (container gets no such env var).
- Never sync secrets via `light push`. The workflow JSON only references names.

## Commit messages

- End with `build with cc`
- No em-dashes anywhere, use regular `-`
- No need for conventional commits - manual version bumps
- Examples: `fix WorkflowExecutor TDZ on result`, `add PUT /api/workflows/:id`, `bump 0.2.0`

## Code style

Enforced by biome. Rules in `biome.json`. Key points:
- ESM only (`"type": "module"`)
- Import with `.js` extension (TypeScript ESM convention)
- No default exports, named only
- Errors extend `LightProcessError`
- Follow KISS, SOLID, YAGNI
