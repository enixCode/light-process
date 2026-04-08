# Development Guide

Internal guide for contributors. User-facing docs live in [README.md](README.md) and [docs/index.html](docs/index.html).

## Branching model

| Branch | Purpose | Published |
|---|---|---|
| `dev` | Daily work, alphas, testing | Mobile git tag `alpha` only. No npm publish. Auto-deployed to VPS for testing. |
| `main` | Stable releases | npm `@latest`, fixed tag `v<ver>`, mobile tag `latest`, GitHub Release. |

Rule of thumb: code on `dev`, merge to `main` when ready to ship a stable release.

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
- Lint (biome) + build (tsc) + unit tests on Node 18 and 22
- Integration tests on Node 22
- Nothing is published

### release.yml - runs on push to main or dev

**Version computation (no commit to package.json):**
- `BASE` = `require('./package.json').version.split('-')[0]` (e.g. `0.1.0`)
- On main: `VERSION = BASE` (e.g. `0.1.0`)
- On dev: `VERSION = ${BASE}-alpha.${git rev-list --count HEAD}` (e.g. `0.1.0-alpha.42`)
- `npm version $VERSION --no-git-tag-version` injects the version in the runner, never commited

**On dev:**
- Lint + build + test
- Force-push mobile git tag `alpha` to the current commit
- No npm publish, no fixed tag, no GitHub Release, no pollution

**On main:**
- Lint + build + test
- Guard: refuse to publish if version contains `-` (no pre-release suffix on main)
- Skip if that version already exists on npm (idempotent)
- `npm publish --tag latest --provenance --access public` (OIDC trusted publishing)
- Create fixed git tag `v0.2.0`
- Force-push mobile git tag `latest` to the current commit
- Create GitHub Release with auto-generated notes

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
# -> CI runs, 'alpha' tag moves to your commit, VPS redeploys.
# Users can install via: npm i github:enixCode/light-process#alpha
```

### Release a new stable version

```bash
# Bump package.json on dev (pick one)
npm run version:patch    # 0.1.0 -> 0.1.1
npm run version:minor    # 0.1.0 -> 0.2.0
npm run version:major    # 0.1.0 -> 1.0.0

git add package.json
git commit -m "bump 0.2.0"
git push origin dev

# Merge to main
git checkout main
git merge dev
git push origin main
# -> release.yml publishes 0.2.0 on npm @latest
#    + creates v0.2.0 fixed tag
#    + moves 'latest' mobile tag
#    + creates GitHub Release
#    + (currently) deploy.yml does NOT fire on main push
```

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
