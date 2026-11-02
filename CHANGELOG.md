# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **`rudder-ai-events` 0.0.7** — tightened setup, instrumentation and verification
  with rollout lessons: install and Agent SDK upgrade preflight, durable usage
  snapshot cleanup, feedback eligibility, browser render/context handling,
  result-aware write rules, tracking-plan coverage and CI integration checks.

- **`rudder-ai-events` / `rudder-ai-events-setup`, `rudder-ai-events-instrument`,
  `rudder-ai-events-verify`.** Update the unreleased 0.0.6 plugin to spec v0.4:
  `@rudderstack/ai` and `rudderstack-ai` 0.8.0, `ai-sdk-go` v0.4.0,
  provider integrations v0.3.0 and `cmd/aicheck` v0.2.0. Discovery plans
  one-shot buttons with the SDK's conversation-ID default, repeated HITL
  pauses with in-process or JSON snapshot resume, and per-event sampling for
  high-volume MCP and per-call sources. Legacy mappings and recipes now use
  blocked answers and denied tools, confidence, credits and usage limits,
  per-call timing, purpose, fallback and BYOK, agent versions, variants,
  compactions and context-limit errors, declared-tool MCP names and result
  sizes, and the added client controls and feedback fields. Verification
  checks v0.4 server events, v0.2 client events, segment totals and final pause
  metrics; SDK checkers accept 0.3.0 and 0.4.0 captures. Removes the five known
  limits these APIs resolve; plugin version stays 0.0.6.
- **`rudder-cli` / `rudder-cli-setup`, `rudder-cli-workflow`, `rudder-transformations`,
  `rudder-import-and-evolve`; `rudder-core` / `rudder-instrumentation-debugging`.**
  Agents now check auth with `rudder-cli workspace info --json` and read the token
  from `RUDDERSTACK_ACCESS_TOKEN`. Every place that tells an agent to run
  `rudder-cli auth login` now says that the command prompts on a terminal, that
  the agent should ask the user to export the variable instead, and that it must
  never ask the user to paste a token into the chat. rudder-cli-setup documents
  that the variable wins over the token saved by `auth login`.
- **`rudder-cli` / `rudder-cli-workflow`, `rudder-transformations`,
  `rudder-import-and-evolve`; `rudder-mcp` / `rudder-mcp-workflow`.** Apply
  commands an agent runs now carry `--confirm=false`. That flag applies with
  no prompt, and the rudder-cli skills' `allowed-tools` pre-approve
  `rudder-cli`, so each of these applies says the agent first shows the user
  the dry run and waits for an explicit yes. The interactive iteration loop in
  rudder-cli-workflow is labelled as being for a person at a terminal.
  rudder-import-and-evolve says its reference examples need the same flag and
  the same yes when an agent runs them. In the multi-workspace flows, an agent
  checks that `rudder-cli workspace info --json` shows the target workspace ID
  before each dry run, because `apply` writes to the workspace of the CLI's
  token. Those flows are rudder-mcp-workflow's Dev and Prod pattern and its
  Instrumentation Verification Workflow, and the Promote Changes example in
  rudder-import-and-evolve. The expected ID comes from the user or from the
  import, never from a spec's `metadata.import`, which a copied spec brings
  from another workspace. Changing that workspace means the user restarts the
  agent with that workspace's token. The Promote Changes example now switches
  workspaces between steps.
- **`rudder-core` / `rudder-code-first-instrumentation`.** The dev and prod
  applies in Phase 6 first check that `rudder-cli workspace info --json` shows
  the target workspace, and the prod step switches the CLI to the prod
  workspace before it applies.
- **Versions.** `rudder-cli` 0.0.3 to 0.0.5, `rudder-mcp` 0.0.2 to 0.0.3,
  `rudder-core` 0.0.6 to 0.0.10.

- **Breaking (repo layout):** renamed the top-level `skills/` directory back to
  `plugins/` (reverting the earlier `plugins/` → `skills/` rename). Each plugin
  lives at `plugins/<plugin>/skills/<skill>/SKILL.md`; marketplace `source` fields
  were updated to match. The rename to `skills/` was unnecessary — skills.sh
  discovery is manifest-driven and name-agnostic — and it broke cursor.directory,
  whose parser derives a skill's name from the first `skills/` path segment and so
  collapsed every plugin's skills into a single mis-named entry. `npx skills add`
  and Claude Code install UX are unchanged.

### Fixed

- **`rudder-cli` / `rudder-cli-setup`, `rudder-typer-workflow`; `docs/installation.md`;
  `examples/typer-workflow`.** The rudder-cli install instructions now point at
  files that exist. rudder-cli-setup named raw binaries such as
  `rudder-cli_darwin_arm64` that no release has. It now downloads the
  `install.sh` attached to the latest rudder-iac release into a new temporary
  folder and runs it. The script installs that release's archive (the arm64
  build under Rosetta) after checking it against the release's checksums file,
  and puts `rudder-cli` in `~/.local/bin`. When the download of the script gets
  a 404 because a release that just came out is still uploading its files, the
  agent waits a minute and tries again, up to 10 times. It does not retry an
  error the script itself prints, and when a sandbox keeps the script from
  writing to `~/.local/bin` or reaching github.com, it asks the user to run the
  install outside the sandbox instead of installing into the project. When
  `~/.local/bin` is not on PATH, the
  agent runs `"$HOME/.local/bin/rudder-cli"` for the rest of the session, gives
  the user that path for any rudder-cli command they run, and shows the
  `export PATH` line in its closing summary, or when it stops earlier. The
  installation guide named a Homebrew tap that does not exist, the typer example installed
  `@rudderlabs/rudder-cli` from npm, which does not exist, and
  rudder-typer-workflow's CI reference used a `rudderstack/setup-rudder-cli`
  action that does not exist. The guide now gives the same install, and
  both CI examples download the release archive and check its checksum.
- **`rudder-cli` / `rudder-cli-setup`, `rudder-cli-workflow`, `rudder-transformations`.**
  Replaced `RUDDER_ACCESS_TOKEN` with `RUDDERSTACK_ACCESS_TOKEN`, the variable
  rudder-cli reads (rudder-iac `cli/internal/config/config.go:86`).
- **`rudder-cli` / `rudder-cli-workflow`, `rudder-transformations`.** Removed
  `rudder-cli plan`, which does not exist; `rudder-cli apply --dry-run` is the
  plan. Removed `rudder-cli export` from the transformations command table for
  the same reason.
- **`rudder-cli` / `rudder-cli-workflow`.** Corrected what `apply` deletes. It
  plans a delete for every CLI-managed resource (one with an external id) in the
  workspace that the local project does not declare, across all providers.
  Resources created in the dashboard have no external id and are never touched.
  The old text said every remote resource of any kind was deleted.

- **`rudder-profiles` / `rudder-profiles-setup`, `rudder-profiles-update`** —
  quoted the `description` frontmatter. An unquoted `: ` (colon-space) made the
  skills.sh CLI's YAML parser read it as a nested mapping and reject the
  frontmatter, silently dropping both skills from skills.sh (21/23 → 23/23 now).

### Added

- **`rudder-cli` / `rudder-cli-workflow`, `rudder-transformations`.** A
  "Variables and secrets" section on `--var-file` for `validate` and `apply`:
  `{{ .NAME }}` references in single quotes, doubling a `'` inside a value, the
  `.vars.yaml` / `.vars.yml` name rule, later files winning, `RUDDER_<NAME>`
  environment variables winning over files, the
  `error[project/var-substitution]` failure, git-ignoring the var file, and that
  substitution is on by default only from rudder-cli 0.25.0. The var file's
  one-line values are single-quoted too, since YAML reads `\` as an escape
  inside double quotes, and a `'` in a value is written as four inside those
  quotes. A multi-line value, such as a PEM key, goes in a `|` block with each
  `'` written as `''`, since single quotes would turn its line breaks into
  spaces; up to rudder-cli 0.28.0 the spec's quotes still do. The recipe
  filters the output of `validate`, the dry run, apply and
  `transformations test`, since each shows a diagnostic's source line after
  substitution, secrets included, whether the value comes from a var file or a
  `RUDDER_<NAME>` variable. Each filter drops every diagnostic's whole source
  block, so every line of a multi-line value is dropped too, and keeps the
  error lines, the plan and the test results. The filtered apply is in Step 3,
  apart from the others, so it runs only after a dry run that exits 0 and the
  user's yes.
  rudder-transformations says `transformations test` needs the same
  `--var-file` flags and the same filter.
- **`rudder-mcp` / `rudder-mcp-setup`, `rudder-mcp-workflow`.** OAuth setup
  uses Claude Code's native HTTP transport:
  `claude mcp add --transport http rudderstack https://mcp.rudderstack.com/mcp`,
  then `/mcp` and Authenticate, with no `npx` or `mcp-remote`. OAuth is the
  route for people and coding agents alike. The access-token route,
  `https://mcp.rudderstack.com/bearer-auth-mcp` with `Authorization: Bearer
  <token>` and `X-Workspace-ID` headers referenced as
  `${RUDDERSTACK_ACCESS_TOKEN}` in `.mcp.json`, is documented for sessions that
  cannot open a browser. The skills say that route has no `user_details` or
  `user_switch_workspace` tool. A "Choose the workspace" section in
  rudder-mcp-workflow tells an agent on the OAuth route to pass the workspace
  ID as `workspace_id` when the workspace tools take that argument, and to call
  `user_switch_workspace` when they do not. The MCP server is replacing
  `user_switch_workspace` with a `workspace_id` argument on every workspace
  tool, so the guidance works with both versions. When `claude mcp list`
  already shows a server at `https://mcp.rudderstack.com/mcp`, as
  `plugin:rudder-core:rudderstack` or under any other name, both skills
  authenticate that entry instead of adding a second server, and they give the
  plugin entry's name for `claude mcp login` and `claude mcp logout`.
  rudder-mcp-workflow also uses an entry at
  `https://mcp.rudderstack.com/bearer-auth-mcp` as it is, since adding a server
  under the name a project's `.mcp.json` already uses hides that entry. With the
  access-token route, rudder-mcp-setup says to disable that entry for the
  folder in `/mcp`, since its different URL would leave both servers listed.
  rudder-mcp-setup's `allowed-tools` pre-approves only the OAuth
  `claude mcp add` command, so the access-token command waits for the user's
  approval. Its troubleshooting table maps `403` `insufficient_scope` to a
  wrong `X-Workspace-ID`, `401` `bearer token authentication failed` to a
  token that expired or was revoked, and `401`
  `bearer token authorization failed` to a token refused during the workspace
  lookup.
- **`rudder-core` carries the RudderStack MCP server** — `plugins/rudder-core/.mcp.json`
  declares `rudderstack`, an HTTP server at `https://mcp.rudderstack.com/mcp` with no headers.
  Installing the plugin connects MCP; the client asks the user to sign in to RudderStack in the
  browser (OAuth) the first time a tool runs. Claude Code lists it as
  `plugin:rudder-core:rudderstack`, and cursor.directory picks up the same file.
  When the MCP tools are missing, `rudder-destination-debugging` and `rudder-environment-check`
  connect the server that is there before adding one. They find it by its URL under any name with
  `claude mcp list`, keep an access-token entry at `/bearer-auth-mcp` with the plugin's entry
  disabled, and have the user enable that entry in `/mcp` without `Authenticate` if it is
  disabled, or approve it at Claude Code's next start if it is pending approval. They have the user
  authenticate an entry at `/mcp`, and give the `claude mcp add` command,
  and a line for other agents, only when there is none. The environment check also looks for
  `list_sources` and `get_source`, which both routes have. Claude Code skips the
  plugin's entry when a hand-added HTTP server has the same URL, but keeps both beside a hand-added
  `npx -y mcp-remote` entry, so remove that one with `claude mcp remove rudderstack`. It also
  keeps both beside an access-token entry at `https://mcp.rudderstack.com/bearer-auth-mcp`, a
  different URL, so in that folder disable the plugin's entry in `/mcp`. The README says the
  server comes with plugin installs only, and how to add it after `npx skills add`.
- **`rudder-core` / `rudder-setup`.** New skill that takes an app from no analytics to one real
  event delivered to a destination the user picks, in nine steps: start, explore, goal,
  destination and secrets, plan and apply, instrument, verify locally, verify live, wrap up. The
  pipeline is rudder-cli specs in `rudder/`, and each change is a commit of its own.
  - It sets up web apps (Capacitor and Cordova included), Android (Kotlin or Java), iOS (Swift
    or Objective-C), Flutter, React Native (Expo through a development build), Unity and server
    apps. In a repository with several apps it asks which one sends events. With no app, or an
    app the user will not upgrade or cannot run, the first event goes out with curl.
  - Step 1 stops on uncommitted changes and commits an app that is not in git before it changes
    anything. When rudder-cli is missing or lacks `docs destination` and validate's secret check,
    it installs the latest release with the installer attached to it, and it uses a RudderStack
    MCP server that is already set up instead of adding a second one.
  - Step 4 writes the destination spec from what `rudder-cli docs destination` lists for the
    installed release and checks its secrets with validate, so the skill needs the first
    rudder-cli release with rudderlabs/rudder-iac#989 and #990. A webhook with no public endpoint
    gets a quick tunnel to this machine, where the agent keeps background processes, or a request
    bin.
  - The user approves the event plan, picks the destination, and says yes to every apply after
    seeing its dry run. A dry run that would delete a resource this project did not create, such
    as another project's, stops the skill.
  - Secrets and the write key go in git-ignored files, and the skill drops the spec lines
    rudder-cli prints with secrets filled in.
  - An app that already uses a RudderStack SDK keeps its source unless the user agrees to move
    it. Run in a folder whose `rudder/` came from an earlier run, the skill adds a source of the
    app's type beside the old one.
  - Step 7 checks the app's events against the plan on this machine with `rudder-cli sources
    listen` (an emulator or simulator for a mobile app). Step 8 sends a real event and confirms
    that the destination received it.
  - When the user asks, in the same session or a later one, step 9 undoes a run from the record
    it keeps in the git directory: it reverts the commits that run made, puts back the key files
    it changed, and applies, after checking that rudder-cli points at the workspace the run
    changed and that the apply removes only what the run created.

- **`rudder-ai-events`** — new plugin that onboards an existing app to RudderStack AI events
  (spec v0.3) with the `@rudderstack/ai` (Node.js), `rudderstack-ai` (Python) and `ai-sdk-go` (Go)
  SDKs. Versions are resolved at run time (0.7.0 / v0.3.0 or later); all three install from public
  registries. Node.js apps on Deno, browser-only repos whose chat backend lives elsewhere, and
  repos that generate typed tracking calls are covered.
  - `rudder-ai-events-setup` — discovers chat, background-agent, browser-client and MCP server
    surfaces (read-only) and drafts the committed `ai-events.md` plan. The plan opens with a
    customer-facing `## What changes` summary (events new / changed / removed, code touched, identity,
    data that leaves the app, impact, switch-off and rollback), then the breaking-change checks against
    legacy events, intents and outcomes, known limits and one `## Config` YAML block. Decisions the code
    answers are taken with evidence; only identity per entry point, intent lists, true blockers and
    approval are asked, in one round.
  - `rudder-ai-events-instrument` — exact-pinned install with lockfile hygiene, `configure()` with the
    existing RudderStack client, wrappers or integrations, one interaction per user turn and one task
    per background run, app-detected failures ended with a status, MCP server wrappers (one per
    endpoint), independent switches for AI and legacy events, bounded flush and shutdown, and browser
    events on the existing JavaScript SDK. Covers agent loops the app starts without awaiting, cache-write
    prices, and restoring the `tarball:` URLs pnpm drops from unrelated lockfile entries. A verify PASS
    comes before any commit or PR.
  - `rudder-ai-events-verify` — offline capture with the SDKs' recorders, a mock data plane and model
    server, or an MCP client in the server's production session mode; the SDKs' migration check
    (`npx @rudderstack/ai check`, `python -m rudderstack.ai.check`, `aicheck`) validates the AI events
    v0.3 and browser-event schemas, joins, counts, identity, content, switches and app-detected failures,
    and its `what-changes` regenerates `## What changes` from captured payloads for the PR body. The AI
    events switch is required; a no-op client stands in only when checking an older instrumentation.
- **CI / dev tooling** — both directory crawlers now run as gates against the
  working tree: cursor.directory's real `parse.ts` (vendored, pinned) via
  `scripts/cursor-preview/preview.mts`, and skills.sh's real `skills` CLI (pinned)
  via `scripts/skills-sh-check.py`. Each asserts all manifest-declared skills are
  discovered, so a layout/frontmatter regression fails CI instead of a live submission.

- **`rudder-core` / `rudder-data-graphs`** — documented the optional per-column
  `pii_mask` flag in the Data Graph YAML template: `pii_mask: true` marks a
  warehouse column as PII so its values are masked (`***`) in the Data Graph
  preview (enterprise-only; server rejects it on other plans). Added it to the
  annotated `columns:` example (including a PII-only entry with no alias), the
  **Column metadata fields** table, and the validation rules (a column entry now
  needs `name` plus at least one of `display_name` / `description` / `pii_mask`).
  Extended the **Schema visibility** pitch in `capability-comparison.md` to note
  PII columns stay masked in the preview.
- **`rudder-core` / `rudder-data-graphs`** — documented the optional per-column
  `columns:` block in the Data Graph YAML template: `display_name` (alias) and
  `description` overrides that surface in the Audience Builder. Added a worked
  `columns:` example to the annotated template, a `columns` row to the Model
  fields table, a new **Column metadata fields** reference table, and validation
  rules (sparse list; each entry needs `name` plus at least one of
  `display_name` / `description`; alias is case-insensitive-unique per model).
  Reframed the **Schema visibility** pitch in `capability-comparison.md` around
  aliases/descriptions making raw warehouse columns marketer-readable.

## [0.0.3] - 2026-06-03

### Changed

- **`rudder-cli` / `rudder-cli-workflow`** — documented
  `rudder-cli workspace accounts list` as the authoritative way to discover
  workspace account IDs. Added a "Looking up account IDs" subsection covering
  the mandatory `--json` flag in non-interactive contexts (plain output needs
  a TTY), the meaningful fields (`id` is the value for a spec's `account_id`),
  the `--category source` / `--type` filters, and the note that this surfaces
  accounts the MCP cannot (Data Graph UI / standalone warehouse connections).
- **`rudder-core` / `rudder-data-graphs`** — reframed `account_id` resolution
  around the CLI account list instead of requiring a RETL source config. Added
  **Step 4a — Resolve the warehouse `account_id`** with a "building from
  scratch / no RETL source yet" branch, a why-not-MCP note, and a
  failed-apply-on-missing-`account_id` troubleshooting entry in the YAML
  template.
- **`rudder-mcp` / `rudder-mcp-workflow`** — added a "Don't do this" item:
  don't rely on the MCP to discover account IDs (it only sees accounts behind
  a RETL source or destination); fall back to
  `rudder-cli workspace accounts list --category source --json`.
- **Breaking (repo layout):** renamed top-level `plugins/` directory to `skills/` so the [skills.sh](https://skills.sh) catalog indexer surfaces all 17 skills (it walks `skills/` but not `plugins/`). Each plugin still lives at `skills/<plugin>/skills/<skill>/SKILL.md`, mirroring the [`dbt-labs/dbt-agent-skills`](https://github.com/dbt-labs/dbt-agent-skills) layout. Marketplace manifest plugin `source` fields updated accordingly. The `npx skills add rudderlabs/rudder-agent-skills` install UX is unchanged.

### Updating from a previous install

Already installed `0.0.2` (or earlier)? Pull the new skill content:

- **Vercel Skills CLI:** `npx skills update` (or `npx skills update rudder-cli-workflow rudder-data-graphs rudder-mcp-workflow` to update only the changed skills).
- **Claude Code marketplace:** `/plugin marketplace update rudder-agent-skills`, then the updated `rudder-core`, `rudder-cli`, and `rudder-mcp` plugins are picked up automatically.
- **Manual git clone:** `cd ~/.claude/plugins/marketplaces/rudder-agent-skills && git pull`.

## [0.0.2] - 2026-05-28

### Changed

- **`rudder-core` / `rudder-data-graphs`** — documented the entity `root`
  flag (optional, entity-only, multiple roots valid, count not enforced),
  the relationship sidedness rule (declare once, never the inverse), and a
  warehouse-agnostic join-key verification step (Snowflake / BigQuery /
  Postgres / Redshift / Databricks) with a no-access fallback. Added SCD2
  surrogate-key and ingestion-timestamp modeling edge cases, a date-dimension
  anti-pattern, per-type `display_name` uniqueness, and a symmetric-name
  collision fix in the YAML template.
- **`rudder-cli` / `rudder-cli-workflow`** — documented `--confirm=false`
  for non-interactive apply (default `--confirm=true` silently no-ops in
  non-TTY contexts), the full-source-of-truth deletion semantics of `apply`,
  and `-c <config>` selection for multi-environment workspaces. Fixed the
  misleading "unexpected deletion" troubleshooting row.

## [0.0.1] - 2026-05-28

Initial public release of the `rudder-agent-skills` Claude Code plugin marketplace.

### Added

#### Plugins

- **`rudder-core`** — cross-tool RudderStack domain knowledge
  - `rudder-data-catalog` — events, properties, categories, custom types
  - `rudder-tracking-plans` — tracking plan assembly with nested properties
  - `rudder-data-graphs` — entity / event / relationship modeling for Audiences
  - `rudder-instrumentation-planning` — event taxonomy design
  - `rudder-instrumentation-debugging` — validation error diagnosis
  - `rudder-design-first-instrumentation` — taxonomy-first instrumentation workflow
  - `rudder-code-first-instrumentation` — code-first instrumentation workflow
  - `rudder-environment-check` — diagnostic for all tool prerequisites
- **`rudder-cli`** — workflows for the `rudder-cli` and `rudder-typer` CLIs
  - `rudder-cli-setup` — installation and authentication
  - `rudder-cli-workflow` — validate → dry-run → apply iteration loop
  - `rudder-import-and-evolve` — import existing resources, safe evolution patterns
  - `rudder-typer-workflow` — type-safe SDK generation (Swift, Kotlin)
  - `rudder-transformations` — transformation and library authoring
- **`rudder-mcp`** — workflows for RudderStack's hosted MCP server at `mcp.rudderstack.com`
  - `rudder-mcp-setup` — Claude Code connection walkthrough (OAuth)
  - `rudder-mcp-workflow` — AI-agent usage patterns aligned with the official catalog
- **`rudder-terraform`** — workflows for the RudderStack Terraform provider
  - `rudder-terraform-setup` — provider installation and configuration
  - `rudder-terraform-workflow` — resource and data-source usage patterns

#### Installation paths

- Vercel Skills CLI: `npx skills add rudderlabs/rudder-agent-skills` (works with 40+ coding agents)
- Claude Code plugin system: `/plugin marketplace add rudderlabs/rudder-agent-skills`
- Manual symlink / submodule / copy paths documented in `docs/installation.md`

#### Repo tooling

- `scripts/review-skills.py` — self-contained linter covering frontmatter discipline, description quality, progressive disclosure, and security hygiene
- `.githooks/pre-commit` (fast local checks) and `.githooks/pre-push` (strict gate matching CI)
- GitHub Actions workflow runs the linter, JSON manifest validation, and `claude plugin validate .` on every PR
- `step-security/harden-runner` with egress auditing on the validate workflow; all action references SHA-pinned

#### Governance and docs

- `README.md`, `CONTRIBUTING.md`, `docs/installation.md`
- `.github/pull_request_template.md` and `.github/ISSUE_TEMPLATE/{bug,skill-proposal,config}` for external contributors
- MIT License
