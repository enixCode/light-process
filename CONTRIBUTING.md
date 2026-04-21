# Contributing to Light Process

## Branching model

GitHub Flow - everything happens on `main`.

| Branch/Ref | Purpose |
|---|---|
| `main` | Single source of truth. All PRs merge here. |
| `feature/*`, `fix/*`, etc. | Short-lived branches for work in progress. Deleted after merge. |
| tag `v*` | Release trigger (npm publish + GitHub Release). |
| tag `alpha` (mobile) | Auto-moves to `main` HEAD on each push. Points to latest code. |

**No long-lived `dev` branch.** Work happens in short feature branches merged to main via PR.

## How to contribute

1. **Fork** the repository
2. **Branch from `main`**
   ```bash
   git checkout main
   git pull origin main
   git checkout -b feature/my-feature
   ```
3. Work, commit freely (your branch, your rules - WIP commits are fine)
4. Push and open a **Pull Request targeting `main`**
5. Your PR will be reviewed and **squash-merged** into main (1 clean commit)

### Branch naming

- `feature/xxx` - new features
- `fix/xxx` - bug fixes
- `docs/xxx` - documentation
- `refactor/xxx` - refactors
- `test/xxx` - test changes

### PR guidelines

- Keep PRs focused - one feature or fix per PR
- Follow existing code style (enforced by biome)
- Add tests if you're adding logic
- Commit messages on your branch can be anything (squash compresses them)
- The PR title becomes the main commit message - make it descriptive
- No em-dashes - use regular dashes `-`

### Code style

Enforced by biome (`biome.json`). Key points:
- ESM only (`"type": "module"`)
- Import with `.js` extension (TypeScript ESM convention)
- Named exports only (no default exports)
- Errors extend `LightProcessError`
- Follow KISS, SOLID, YAGNI

## For maintainers

### Daily development

Same flow as contributors - branch from main, commit, PR, squash merge. Fully scriptable with `gh` (no browser needed).

```bash
git checkout main
git pull origin main
git checkout -b feature/xxx
# work, commit freely (wip commits are fine, they get squashed)
git push origin feature/xxx
gh pr create --base main --fill          # PR title/body from commits
gh pr merge --squash --delete-branch     # squash + delete branch, one command
git checkout main
git pull origin main
```

### Release process

Tag-based. No merge, no branch gymnastics.

```bash
# 1. Make sure main is up to date and green
git checkout main
git pull origin main

# 2. Create version tag
git tag -a v0.3.0 -m "v0.3.0

- change 1
- change 2

build with cc"

# 3. Push the tag
git push origin v0.3.0

# 4. Watch the release workflow
gh run watch

# 5. Create GitHub release with auto-generated notes (contributor credit)
gh release create v0.3.0 --generate-notes
```

What happens on tag push:
- `release.yml` runs on the tagged commit
- Lint + build + test
- `npm publish 0.3.0 --tag latest --provenance --access public`
- Mobile tag `latest` moves to this commit
- GitHub Release is created

### CI/CD

- **Push to `main`** - CI runs + mobile `alpha` tag moves to HEAD -> triggers **staging deploy** (lp-test.enixcode.fr)
- **Push tag `v*`** - CI runs + npm publish + mobile `latest` tag moves -> triggers **prod deploy** (lp.enixcode.fr) + GitHub Release
- **No more `dev` branch** - legacy artifact, can be deleted

### Deploy test (staging)

Staging is an environment driven by the `alpha` mobile tag - **not a branch**. Any merge to `main` auto-deploys to lp-test.enixcode.fr through the tag hop.

To force-redeploy staging without a new commit, re-push the `alpha` tag:

```bash
git tag -f alpha <sha>
git push -f origin alpha
```

Or skip staging and trust CI + local testing before tagging a `v*` release.

## Quick commands

```bash
npm run build        # compile TypeScript
npm run dev          # tsc --watch
npm start            # node dist/cli.js serve
npm test             # unit tests
npm run test:all     # unit + integration
npm run lint         # biome check
npm run lint:fix     # biome check --write
npm run test:e2e     # adversarial HTTP + CLI tests
```

## Testing against a local server

```bash
# Terminal 1
LP_API_KEY=testkey node dist/cli.js serve /tmp/wf --port 4141

# Terminal 2
HOME=/tmp/fake node dist/cli.js remote bind http://localhost:4141 --key testkey
HOME=/tmp/fake node dist/cli.js remote ping
```

## Secrets management

Nodes opt into env passthrough via `"env": ["OPENAI_API_KEY"]` in `.node.json`. Only names are stored - values live on the server environment. Never sync secrets via `light push`.

## Architecture

See [CLAUDE.md](CLAUDE.md) for source tree layout, key concepts, and API details.
