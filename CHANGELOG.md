# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **`rudder-core` carries the RudderStack MCP server** — `plugins/rudder-core/.mcp.json`
  declares `rudderstack`, an HTTP server at `https://mcp.rudderstack.com/mcp` with no headers.
  Installing the plugin connects MCP; the client asks the user to sign in to RudderStack in the
  browser (OAuth) the first time a tool runs. Claude Code lists it as
  `plugin:rudder-core:rudderstack`, and cursor.directory picks up the same file.
- **`rudder-core` / `rudder-onboarding`** — nine steps from an app with no analytics to one real
  event delivered to a destination the user picks: start, explore, goal, destination and secrets,
  plan and apply, instrument, verify locally, verify live, wrap up. Specs live in `rudder/`; the
  skill carries the measured traps (silent decline without `--confirm=false`, workspace-wide
  deletes, the write key's two-minute 401 window, MCP metrics without timestamps, hashed live
  event values). References cover destination specs with secrets as variables, browser
  instrumentation, and local and live verification.
  Step 1 looks at the folder before changing anything. Outside an app (an empty folder, the home
  folder, a folder of several repositories) it recommends starting again in the app, and can
  instead continue without one, in a new subfolder unless the folder is empty, and send the first
  planned event with curl. It stops on uncommitted changes, and commits an app that was not in git
  as it is before changing it, so a `git revert` never deletes the app's files. Every commit names
  its paths. Step 3 writes the event names and property types to `rudder/plan.events.json`, and
  steps 6 to 8 read them from there. Step 7 captures events with `rudder-cli sources listen` and
  checks them against that file with a jq program shipped beside the references, in two shell
  calls, or in one for agents that stop background processes when a call returns. The destination
  reference leaves unfilled secrets as `NAME:` with no value, names every secret key of Amplitude
  and Mixpanel, and lists the 24 verified destination types.
  Step 1 runs its read-only checks before it changes the folder, and commits the `.gitignore` lines
  for the var file and `.env.local` on their own, so the undo (revert the instrumentation and specs
  commits, then apply) never un-ignores a secret. Step 5 shows validate's errors without the source
  lines, which print secret values. Step 7 needs rudder-cli 0.29.0 or later and is skipped on an
  older one; its one-call recipe exits 5 when the app cannot start. Step 8 builds the curl event
  from the plan. While the installer script is unpublished, step 1 falls back to the latest
  release's binary.
  Step 2 runs a probe that names the app's source type: Flutter and React Native first, because
  their apps also hold `android/` and `ios/` folders, then Android (`android_kotlin`), iOS
  (`ios_swift`, from an Xcode project or a Podfile), web, and only then server languages; a
  `Package.swift` or a `package.json` alone makes it ask. When it finds several apps it lists them
  and asks which one sends events; when it finds none it asks "What will send events to
  RudderStack?", the question step 1 asks outside an app, now defined once. It also lists the
  RudderStack and Segment SDKs the dependencies name, the legacy Android (Java) and iOS
  (Objective-C) SDKs included. New Android (Kotlin SDK) and iOS (Swift SDK) references add the
  dependency, keep the write key out of git, load the SDK once and give each agreed event a typed
  function, in Kotlin or Java and in Swift or Objective-C. Step 7 checks a mobile app on an Android
  emulator (`10.0.2.2`) or the iOS Simulator, or is skipped without one, and step 8 runs the app
  against the real data plane. A Capacitor or Cordova app gets the JavaScript SDK, and a Unity game
  the Unity SDK. An app that already uses a RudderStack SDK keeps its current source unless the user
  agrees to move it, and a legacy SDK is replaced only on a yes. The iOS reference never edits
  `project.pbxproj` and gives the user its Xcode changes in one list. Neither mobile reference turns
  off plain HTTP an app already allows: iOS gets `NSAllowsLocalNetworking` only without
  `NSAllowsArbitraryLoads`, and Android's debug network config is skipped when
  `usesCleartextTraffic` is on. An Expo app gets a development build instead of Expo Go, GA4 on a
  mobile source uses its Firebase app stream, and an app the user will not upgrade, or cannot run on
  any emulator, simulator or device, sends its first event with curl.

### Changed

- **Breaking (repo layout):** renamed the top-level `skills/` directory back to
  `plugins/` (reverting the earlier `plugins/` → `skills/` rename). Each plugin
  lives at `plugins/<plugin>/skills/<skill>/SKILL.md`; marketplace `source` fields
  were updated to match. The rename to `skills/` was unnecessary — skills.sh
  discovery is manifest-driven and name-agnostic — and it broke cursor.directory,
  whose parser derives a skill's name from the first `skills/` path segment and so
  collapsed every plugin's skills into a single mis-named entry. `npx skills add`
  and Claude Code install UX are unchanged.

### Fixed

- **`rudder-profiles` / `rudder-profiles-setup`, `rudder-profiles-update`** —
  quoted the `description` frontmatter. An unquoted `: ` (colon-space) made the
  skills.sh CLI's YAML parser read it as a nested mapping and reject the
  frontmatter, silently dropping both skills from skills.sh (21/23 → 23/23 now).

### Added

- **`rudder-ai-events`** — new plugin that onboards an existing app to RudderStack AI events
  (spec v0.3) with the `@rudderstack/ai` (Node.js), `rudderstack-ai` (Python) and `ai-sdk-go` (Go)
  SDKs, pinned to the release that ships spec v0.3.
  - `rudder-ai-events-setup` — discovers chat, background-agent, browser-client and MCP server
    surfaces (read-only), drafts the committed `ai-events.yaml` plan (surfaces with channel,
    identity, intents with `other`, MCP `identify` / `request_context` / declared tool events,
    scores, event rules, classifier, content capture, optional trace ID link, legacy-event
    migration, time to integrate), lists the known limits that apply, and stops for explicit approval.
  - `rudder-ai-events-instrument` — exact-pinned install, `configure()` with the existing RudderStack
    client, client wrappers or framework integrations, one interaction per user turn, one task per
    background run, MCP server wrappers for every supported MCP library (Node.js SDK 1.x and 2.x,
    Python `mcp` 1.x and 2.x, Go go-sdk and mcp-go), feedback (`serverFeedback`
    opt-out), scores, flush, browser events on the existing JavaScript SDK (client copies of the
    prompt, answer and feedback sent alongside the server's by default), legacy events behind a flag.
  - `rudder-ai-events-verify` — offline capture (stub client, a mock data plane and model server, or
    an MCP client driver), validation against the AI events v0.3 JSON Schema and a client-event
    schema (events from any of the three SDKs), join, count, identity, content and MCP checks, and a
    short report.
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
