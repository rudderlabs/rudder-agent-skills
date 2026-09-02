# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **`rudder-typer-workflow`** — rewritten against the actual CLI. The skill
  documented a `rudder-cli typer init` command, a `ruddertyper.yml` config file, and
  `--config` / `--verbose` flags, none of which exist (they belong to the retired npm
  `rudder-typer` v1); it listed TypeScript as "manual" and shipped a long section on
  hand-writing types to mirror a tracking plan, when TypeScript has been a generated
  platform; it omitted `--platform`, which is required, so every command in it would
  have failed; and it put `rudder-cli apply` inside the iteration loop, mutating a
  live workspace on every turn. Now covers the offline `--local` flow, its two-gate
  experimental setup, the real flag and option sets, the resolver-only constructor,
  and the provenance/drift discipline a committed client needs. Adds
  `references/platforms.md` (per-platform output, verified against generator output)
  and rewrites `references/ci-cd-integration.md`, which carried the same phantom
  config-file flags.
- **`rudder-instrumentation-planning`, `rudder-code-first-instrumentation`** — fixed
  the same phantom commands where they had spread: `typer init`, bare
  `typer generate` with no `--platform`, and the instruction to hand-write TypeScript
  types "since RudderTyper only does Swift/Kotlin".

### Removed

- **`examples/typer-workflow/`** — removed. Every artifact in it was fictional: a
  `ruddertyper.yml` nothing reads, a `typer init` step that does not exist, and
  hand-written files labelled "example generated code" that do not resemble generator
  output. Superseded by `examples/instrumentation-e2e/`.

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

- **`examples/instrumentation-e2e/`** — a runnable end-to-end example of the catalog
  → typed client → call sites workflow: a storefront app whose analytics client is
  generated from YAML on disk with `typer generate --local` (no workspace, apply or
  auth), a `tp-sync.sh` with provenance recording and a `--check` mode, a CI
  drift-check workflow, tests pinning the late-binding contract, and type-level
  assertions that fail the typecheck if the generator stops enforcing the plan.

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
