# Basic YAML Templates

Replace every bracketed item with real discovered values before writing files. These shapes match the pb schema verified against the engine's sample projects. pb uses **strict YAML unmarshalling** — unknown fields fail compile, so do not invent keys.

## Schema version — derive it, don't hardcode

`schema_version` moves with the pb release line (e.g. 93 on 0.24.x, 98 on 0.25.x, 99 on 0.26.x). Do not paste a number from memory.

- **Best:** scaffold the skeleton with `pb init pb-project -o <folder>` (or the MCP `setup_new_profiles_project(project_path)`), which stamps the correct `schema_version` for the installed binary. Then fill in discovered resources.
- If you must write a literal, use the value the installed binary reports and confirm with `pb version`. As of the 0.25.x release line this is **98**.
- If an existing project is on an older version, `pb migrate auto --inplace` upgrades it.

## `pb_project.yaml`

```yaml
name: [project_name]
schema_version: 98   # match the installed pb; verify with `pb version` (see note above)
connection: [connection_name]
model_folders:
  - models
entities:
  - name: [entity_name]          # e.g., user
    # id_stitcher is OPTIONAL. Omit it to use the default ID stitcher, which builds
    # the identity graph automatically from the ids declared on inputs. Only set it
    # if you define an explicit id_stitcher model in models/profiles.yaml:
    # id_stitcher: models/[stitcher_model_name]   # a MODEL ref, never a file path
    id_types:
      - main_id
      - user_id
      - anonymous_id
      - email
id_types:
  - name: main_id
  - name: user_id
  - name: anonymous_id
    filters:                     # exclude junk values — the cheapest over-stitching prevention
      - type: exclude
        value: "unknown"
      - type: exclude
        value: "NaN"
      - type: exclude
        value: ""
  - name: email
    filters:
      - type: include
        regex: ".+@.+"
      - type: exclude
        value: "test@company.com"   # known internal/test values

# Add only if the project will use ML models (propensity, attribution):
# python_requirements:
#   - profiles_mlcorelib>=0.8.1
```

Notes:
- `name:` is required.
- `id_stitcher:` under an entity is a **model reference** (`models/<model_name>`), never a file path like `models/profiles.yaml`.
- id_type entries support `name`, optional `extends`, and optional `filters` (`type: include|exclude` with `value:` or `regex:`). There is no `sql_type` field.
- Always add exclude filters for junk IDs (`"unknown"`, `"NaN"`, empty string, internal test values) — junk IDs leaking into the graph are the most common cause of over-stitching.

## `models/inputs.yaml`

```yaml
inputs:
  - name: [input_model_name]
    # Event-stream contract — set BOTH for tracks/identifies/pages tables,
    # NOT for slowly-changing dimensions or user-state tables.
    # is_append_only: true is REQUIRED to enable later migration to incremental,
    # and requires occurred_at_col to be set.
    contract:
      is_event_stream: true
      is_append_only: true
    app_defaults:
      table: [database.schema.table]        # or `view:`
      occurred_at_col: [timestamp_column]
      ids:
        - select: "[id_column]"             # column name or SQL expr, e.g. lower(email)
          type: [id_type_name]              # must be declared in pb_project.yaml id_types
          entity: [entity_name]
          # to_default_stitcher: false      # optional — keep a low-trust id out of the default stitcher
```

Notes:
- The top-level key is `inputs:` — NOT `models:`. There is no `model_type: inputs`.
- The table/view name and timestamp column live under `app_defaults:` (`table:`/`view:`; `occurred_at_col:` — not `timestamp:`).
- Each `ids:` entry needs `select`, `type`, AND `entity`. There is no `name:` field on an id entry.

## `models/profiles.yaml`

For a minimal first project (default ID stitcher, a few features) you only need `var_groups:`:

```yaml
var_groups:
  - name: [var_group_name]            # e.g., user_vars
    entity_key: [entity_name]
    vars:
      - entity_var:
          name: [feature_name]
          description: [short_description]
          select: count(*)             # must aggregate when `from` is present
          from: inputs/[input_model_name]
```

Only add an explicit id_stitcher model if the user needs to customize edge sources (then set `entities[].id_stitcher: models/[stitcher_name]` in `pb_project.yaml`):

```yaml
models:
  - name: [stitcher_model_name]
    model_type: id_stitcher
    model_spec:
      entity_key: [entity_name]
      edge_sources:
        - from: inputs/[input_model_name]
        - from: inputs/[other_input_model_name]
```

Notes:
- There is no `model_type: profiles`. Features live in `var_groups:`, each var wrapped under an `entity_var:` (or `input_var:`) key — note the extra nesting level.
- `from:` takes a model path: `inputs/<input_name>` or `models/<model_name>`. There is no dbt-style `ref('...')` in pb.
- Reference another entity_var inside a `select:` as `{{[entity_name].Var("other_var")}}` (e.g., `{{user.Var("order_count")}}`) — quote the whole `select` with outer single quotes. The shorthand `{{user.other_var}}` also works. The first segment is the **entity name**, not the literal word "entity".
- A derived entity_var (computed only from other vars) has NO `from:` key.
- Order-dependent aggregations (`first_value`/`last_value`) need a `window:` with `order_by`.

## Notes

- Use real connection and table names from discovery.
- If a var has `from`, aggregate in `select`.
- Keep the first compile target small.
- Set `contract.is_append_only: true` on every event-stream input (and set `occurred_at_col` — pb rejects `is_append_only` without it). Without the contract, users cannot migrate to incremental later without a schema bump that invalidates checkpoints. Dimension/state tables (not event streams) should NOT set `is_append_only`.
- `python_requirements:` is only needed for ML models (propensity, attribution). Leave it commented out for entity-only projects.
