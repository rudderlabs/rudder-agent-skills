# Error Classification

## YAML Structure

Common signals:

- `unmarshal`
- `field not found`
- parser line and column errors

First action: inspect the referenced YAML section and compare field names against the live schema. Common culprits:

- Invented field names (e.g., `contracts` vs `contract`, `materialized` vs `materialization`).
- Wrong indentation level.
- Missing required keys.

Second action: check `references/common-yaml-mistakes.md` for known patterns.

## Cross-File Reference

Common signals:

- `id type ... not found`
- `model ... not found`

First action: verify exact names and paths across all three files:

- `pb_project.yaml` — `id_types[].name` and `entities[].name`
- `models/inputs.yaml` — `ids[].type` must match an `id_types` entry in `pb_project.yaml`, and `ids[].entity` must match an entity name
- `models/profiles.yaml` — `from: inputs/<name>` / `from: models/<name>` must match a defined model (never `ref('...')`); `entity_key` must match an entity name

Run `pb show models` to see the resolved dependency graph.

Known exact error strings in this class:

| Error contains | Cause | Fix |
|----------------|-------|-----|
| `Duplicate model name '<x>' found at` | Two models share a name (or a reserved keyword was used) | Rename one |
| `A wrong path is used to refer to a model` | Bad `from:`/`edge_sources` path — wrong folder, misspelling, or package model | Check spelling; package models need the package path |
| `is_append_only` requires `occurred_at_col` | Contract set without a timestamp column | Add `app_defaults.occurred_at_col` |
| `Default time grain is not set` | A model uses a timegrain but the project has no default | Set `default_time_grain` in `pb_project.yaml` |
| `field <x> not found in type` | pb binary older than the project's schema | Upgrade pb (or `pb migrate auto --inplace` if the project is the older side) |

## SQL or Warehouse

Common signals:

- `invalid identifier`
- `column not found`
- `object does not exist`

First action: call `describe_table()` to confirm the table exists and the column name is spelled correctly. Check for:

- Case sensitivity (some warehouses are case-sensitive).
- Schema qualification (`database.schema.table` vs just `table`).
- Column renames that happened after the YAML was written.

## CLI Usage

Common signals:

- bad flag errors
- `does not match time regex`
- invalid time format

First action: correct flags and use ISO 8601 timestamps: `YYYY-MM-DDTHH:MM:SSZ`.

Common mistakes:
- Using `--begin-time` instead of `--begin_time` (underscore, not hyphen).
- Omitting the timezone designator `Z`.
- Passing a date without time component.

## Version Mismatch

Common signals:

- `schema_version not supported`

First action: run `pb version` to check the installed pb CLI version. Then check the `schema_version` in `pb_project.yaml`. Update the schema version to match what the installed pb supports.

## MCP Precondition (Warehouse Connection)

Common signals:

- `warehouse not initialized` / `no connection` from `run_query()`
- The first `run_query()` of a session fails

First action: call `initialize_warehouse_connection(<connection_name>)` once per session before any `run_query()` / `describe_table()`. This is a hard requirement documented in the MCP tool's own docstring; the agent must call it explicitly.

## Python or RPC

Common signals:

- `rpc error`
- `ModuleNotFoundError`
- `connection refused` on gRPC port
- Python traceback in pb output

First action: **STOP.** Do not attempt to fix Python environment issues. Do not run `pip install`, modify virtual environments, or edit Python paths. Surface the exact error message to the user and recommend:

- Re-running `setup.sh` from profiles-mcp.
- Checking that the profiles-mcp virtual environment is intact.
- Contacting the Profiles team if the error persists.

## Progressive Escalation Protocol

| Attempt | Action |
|---------|--------|
| 1st | Apply fix based on error classification |
| 2nd | Consult `search_profiles_docs()` for related documentation |
| 3rd | Read documentation examples and reference files |
| 4th | **STOP** — present all findings and attempted fixes to the user |

Never exceed 4 attempts without explicit user guidance. Thrashing makes things worse.
