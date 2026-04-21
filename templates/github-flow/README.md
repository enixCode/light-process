# github-flow template

Reusable GitHub Flow configuration used by `light-process`, `light-run`, and `light-runner`. Drop into a new Node/npm repo to get:

- `main` as the only long-lived branch
- Squash-only merge policy (no merge commits, no rebase merges)
- Mobile git tags `alpha` (moves on every main push) and `latest` (moves on every stable `v*` tag)
- Stable release flow via tag push (`v0.3.0` -> npm publish + GitHub Release)
- Guard rails: tag must be on main, pre-release tags rejected, idempotent npm publish

## What's inside

```
templates/github-flow/
  README.md                    - this file
  setup.sh                     - one-shot setup script (squash-only + seed alpha tag)
  .github/
    workflows/
      ci.yml                   - lint / build / test on push + PR
      release.yml              - tag-driven publish + mobile tag management
      deploy.yml.example       - OPTIONAL: SSH deploy for service-type projects
```

## How to use it on a new repo

### 1. Copy the workflow files

```bash
# From the new repo root
cp -r <path-to-light-process>/templates/github-flow/.github/workflows/ci.yml .github/workflows/
cp -r <path-to-light-process>/templates/github-flow/.github/workflows/release.yml .github/workflows/
```

If you also need a VPS deploy (service, not lib):
```bash
cp <path-to-light-process>/templates/github-flow/.github/workflows/deploy.yml.example .github/workflows/deploy.yml
```

### 2. Customize release.yml

Replace the placeholder with your package name:

```yaml
# Search for: <PACKAGE_NAME>
# Replace with your npm package name, e.g. `@enixcode/light-run` or `light-runner`
```

If your test command is not `npm test`, update the "Tests" step.

### 3. Run the setup script

```bash
bash <path-to-light-process>/templates/github-flow/setup.sh <owner/repo>
```

What it does:
- Enforces squash-only merge policy via the GitHub API (disables merge commits and rebase merges)
- Seeds the `alpha` mobile tag on the current `main` HEAD so downstream consumers can install via `github:owner/repo#alpha` immediately
- Prints next steps (first tag `v*` to bootstrap `latest`)

Requires: `gh` CLI authenticated (`gh auth status`) and push access to the repo.

### 4. Configure npm Trusted Publisher (one-time)

The release workflow uses OIDC Trusted Publishing (no `NODE_AUTH_TOKEN`). On npmjs.com:

- Visit `https://www.npmjs.com/package/<your-package>/access`
- Add a Trusted Publisher with:
  - GitHub org/user: `<owner>`
  - Repository: `<repo>`
  - Workflow file: `release.yml`

(Only needed once per package.)

## How the flow works

```
push to main ────────► release.yml moves `alpha` mobile tag
                                        │
                                        ▼
                       (optional) deploy.yml on `alpha` tag push
                        -> redeploy staging env

push tag v0.3.0 ─────► release.yml: npm publish + move `latest` mobile tag + GitHub Release
                                        │
                                        ▼
                       (optional) deploy.yml on `latest` tag push
                        -> redeploy prod env
```

### Daily development loop

```bash
git checkout main && git pull
git checkout -b feature/xxx
# work, commit freely
git push origin feature/xxx
gh pr create --base main --fill
gh pr merge --squash --delete-branch    # only button enabled after setup.sh
```

### Shipping a stable release

```bash
git checkout main && git pull
git tag -a v0.3.0 -m "v0.3.0 - description"
git push origin v0.3.0
gh run watch                             # follow the release workflow
```

Pre-release tags (like `v0.3.0-rc.1`) are rejected by a guard in `release.yml`.

## Installing floating builds (consumers)

| User wants | Command |
|------------|---------|
| Latest stable npm | `npm i <package>` |
| Latest main HEAD | `npm i github:<owner>/<repo>#alpha` |
| Specific release | `npm i <package>@0.3.0` |
| Latest mobile ref | `npm i github:<owner>/<repo>#latest` |

## Optional: add a VPS deploy

If this project is a **service** (not a pure npm library), also copy `deploy.yml.example` to `.github/workflows/deploy.yml` and customize the SSH step for your server. The template listens on mobile tag pushes (`alpha` -> staging, `latest` -> prod) so deploy is automatic after tag moves.

Set these secrets on the repo:
- `SSH_HOST`, `SSH_PORT`, `SSH_USER`, `SSH_DEPLOY_KEY`

## Why this setup

- **One long-lived branch** keeps history linear and reviewable.
- **Squash-only** guarantees one commit per PR on main (no merge bubbles, no rebase fan-out).
- **Mobile tags** decouple deploy/install cadence from branch state: `alpha` follows main, `latest` follows stable releases.
- **Tag-driven releases** make publishing explicit (no accidental npm publish from a main push).
- **Guard rails** (ancestor check, pre-release reject, idempotent publish) prevent the most common mistakes.
