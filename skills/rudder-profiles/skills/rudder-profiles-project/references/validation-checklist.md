# Validation Checklist

Run this review before `pb compile`:

## Project consistency

- `pb_project.yaml` has a `name:` and references the right `connection`.
- `schema_version` matches the installed binary (derived via `pb init`/`setup_new_profiles_project()`, not pasted from memory; verify with `pb version`).
- Every `model_folders` entry exists.
- Entity names and id_types match across files: every `ids[].type` in `models/inputs.yaml` is declared in `pb_project.yaml` `id_types`, and every `ids[].entity` matches an entity name.
- If an entity sets `id_stitcher:`, it points at a model defined in `models/profiles.yaml` (`models/<model_name>`), not at a YAML file path. For a first project, prefer omitting it (default stitcher).
- id_types have exclude filters for junk values (`"unknown"`, `"NaN"`, `""`, test IDs).

## Discovery grounding

- Every table was discovered from MCP or existing project files.
- Every column was confirmed with `describe_table()`.
- No placeholder names remain.

## Profiles rules

- `models/inputs.yaml` uses the `inputs:` top-level key with `app_defaults: { table, occurred_at_col, ids }` — not `models:`/`model_type: inputs`/`timestamp:`.
- `models/profiles.yaml` puts features in `var_groups:` with each var nested under `entity_var:` — there is no `model_type: profiles`.
- Every `from`-based entity var aggregates in `select`, and `from:` is a model path (`inputs/<name>` or `models/<name>`), never `ref('...')`.
- Entity var references use `'{{<entity_name>.Var("name")}}'` (e.g., `user.Var(...)`), not the literal word `entity`.
- Date windows are not hard-coded into YAML when runtime flags should control them.
- Every event-stream input has `contract: { is_event_stream: true, is_append_only: true }` AND `occurred_at_col` set. Dimensions/state tables do NOT set `is_append_only`.
- `python_requirements:` is set only if the project includes ML models (propensity, attribution).

## Access

- `pb validate access` passes — the role can read the inputs and write to the output schema.

## User confirmation

- The user approved the connection.
- The user approved the tables.
- The user approved IDs and timestamps.
- The user approved the entity and features.
- The user approved the final YAML before files were written.
