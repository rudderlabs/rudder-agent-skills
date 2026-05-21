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
- `models/inputs.yaml` — `ids[].name` must match `id_types` in `pb_project.yaml`
- `models/profiles.yaml` — `from: ref('model_name')` must match an input model name; `entity_key` must match an entity name

Run `pb show models` to see the resolved dependency graph.

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
