# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
