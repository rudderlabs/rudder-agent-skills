# CI/CD integration

The generated client is a build artifact of the catalog's state. Committing it is
right — consumers should not need the CLI to build — but a committed artifact drifts,
and a drifted client is valid code that compiles, passes tests and emits the wrong
shape. CI is the only thing that notices.

A working version of everything here is `examples/instrumentation-e2e/` in this repo.

## The one check worth having

Regenerate against the catalog's **default branch** and fail if the committed client
differs.

```yaml
name: Typed client drift

on:
  pull_request:
    paths:
      - 'src/analytics/generated/**'
      - 'scripts/tp-sync.sh'
      - 'package.json'

jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      # The catalog's default branch — not the PR author's branch. The question is
      # "is the committed client reproducible from catalog main?", which is what makes
      # the merge order enforceable instead of advisory.
      - uses: actions/checkout@v4
        with:
          repository: your-org/your-catalog-repo
          path: .catalog
          token: ${{ secrets.CATALOG_READ_TOKEN }}

      # Pin the CLI: the generated header embeds the version that produced it, so an
      # unpinned CLI turns every release into a spurious diff.
      - name: Install rudder-cli
        env:
          RUDDER_CLI_VERSION: 0.23.0
        run: |
          curl -fsSL "https://github.com/rudderlabs/rudder-iac/releases/download/v${RUDDER_CLI_VERSION}/rudder-cli_Linux_x86_64.tar.gz" \
            | tar -xz -C /usr/local/bin rudder-cli
          rudder-cli --version

      - uses: actions/setup-node@v4
        with:
          node-version-file: '.nvmrc'
          cache: 'npm'
      - run: npm ci

      - name: Committed client must match the catalog
        env:
          CATALOG_PATH: .catalog
        run: npm run tp:check
```

`tp:check` regenerates into a temp directory and diffs. The whole implementation:

```bash
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_LOCAL_TYPER=true \
  rudder-cli typer generate --local --location "$CATALOG_PATH" \
    --tracking-plan-id "$TRACKING_PLAN_ID" --platform typescript \
    --output "$tmp" --option outputFileName=index.ts
diff -u src/analytics/generated/index.ts "$tmp/index.ts" \
  || { echo "run 'npm run tp:sync' and commit the result" >&2; exit 1; }
```

See `examples/instrumentation-e2e/app/scripts/tp-sync.sh` for the version-gating and
provenance-writing around it.

### What it catches

- a call-site PR merged without regenerating
- a client generated from a wrong-branch or dirty catalog checkout
- a catalog change merged without the consumer being regenerated
- the merge order being violated — a consumer PR ahead of its catalog change cannot
  pass, so the ordering stops depending on reviewer memory

### Three things that make it flaky if you skip them

1. **Pin the CLI version.** The `ruddertyper` context block in every generated file
   carries `rudderCLIVersion`. Bump the pin in the same PR that commits a client
   regenerated with the newer CLI.
2. **Check out the catalog's default branch**, not a ref derived from the PR.
3. **Set `TMPDIR` beside the repo** on CLIs older than 0.22.0, or the temp-file rename
   fails across volumes. Fixed upstream in 0.22.0; harmless to keep.

## Pre-commit hook

Cheaper feedback than CI, and it uses the same script:

```bash
#!/usr/bin/env bash
# .githooks/pre-commit
git diff --cached --name-only | grep -q '^src/analytics/generated/' || exit 0
npm run tp:check
```

Do not make this a *sync* hook that regenerates and stages. A hook that rewrites files
mid-commit surprises people, and regenerating from whatever branch the catalog checkout
happens to be on is exactly the failure the provenance record exists to catch.

## Multi-platform projects

One command per platform, one output directory each, all from the same catalog commit:

```bash
export RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_LOCAL_TYPER=true
for p in typescript kotlin swift; do
  rudder-cli typer generate --local --location "$CATALOG_PATH" \
    --tracking-plan-id storefront --platform "$p" --output "clients/$p"
done
```

Run the drift check for every platform in one job. A plan change that reaches the web
client but not the Android one is the same drift problem wearing a different hat.

## Monorepo with the catalog in-repo

Simplest case: `--location` is a relative path and there is no second checkout, no
token, and no default-branch question.

```
repo/
├── catalog/              # data-catalog/ + tracking-plans/
└── apps/web/
    └── src/analytics/generated/
```

```yaml
on:
  pull_request:
    paths: ['catalog/**', 'apps/web/src/analytics/generated/**']
```

The check becomes "does the committed client match the catalog *in this PR*", which
also removes the merge-order problem — both sides land in one commit.

## Do not

- Generate at build time instead of committing. It puts the CLI, the catalog checkout
  and (for the remote flow) credentials on the critical path of every build, and hides
  catalog changes from code review — the diff in the generated client is the most
  reviewable artifact in the whole workflow.
- Run `rudder-cli apply` from the drift job. Applying mutates a workspace; a PR check
  must not. Applying belongs in a deploy job on the catalog repo, after merge.
