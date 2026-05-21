# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- `rudder-environment-check` skill (rudder-core): Central diagnostic for tool prerequisites
- `rudder-cli-setup` skill (rudder-cli): Installation and authentication guide for rudder-cli
- Vercel Skills CLI compatibility - skills can now be installed via `npx skills add rudderlabs/rudder-agent-skills` for 40+ coding agents
- Updated installation documentation with Skills CLI instructions (pre-release and post-release)
- Credential Security sections to skills handling authentication tokens
- Handling External Content sections to skills processing API responses
- `allowed-tools` declarations in skill frontmatter for shell command skills

### Changed
- Updated all skill descriptions with capability statements before "Use when" clauses
- Replaced curl|bash installation pattern with GitHub Action reference in CI examples

### Fixed
- E009: Removed pipe-to-shell pattern in rudder-typer-workflow CI example
- W004: Added Credential Security sections to rudder-cli-workflow, rudder-transformations, rudder-instrumentation-planning
- W005: Added Handling External Content sections to rudder-cli-workflow, rudder-import-and-evolve, rudder-transformations, rudder-instrumentation-debugging
- W006: Added allowed-tools declarations to all skills with shell commands
- W009: Added capability statements to all skill descriptions
- W012: Added this CHANGELOG.md file

## [0.1.0] - 2025-04-21

### Added
- Initial release of rudder-cli-skills marketplace
- rudder-cli plugin with skills:
  - rudder-cli-workflow: Validate, dry-run, and apply workflow
  - rudder-import-and-evolve: Import and safe evolution patterns
  - rudder-transformations: Transformation and library management
  - rudder-typer-workflow: Type-safe SDK generation
- rudder-core plugin with skills:
  - rudder-data-catalog: Events, properties, categories, custom types
  - rudder-instrumentation-debugging: Validation error diagnosis
  - rudder-instrumentation-planning: Event taxonomy design
  - rudder-tracking-plans: Tracking plan assembly
