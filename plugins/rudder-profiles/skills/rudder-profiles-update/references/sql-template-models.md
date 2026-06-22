# SQL Template Models

Use a `sql_template` model when a transform can't be expressed as an entity_var: multi-step SQL, joins across inputs, filtering/reshaping a source before features read it (sessionization, dedup, a filtered event view). Shape verified against the `sample_cohort_project` sample.

## Basic discrete model

```yaml
models:
  - name: marketing_pages
    model_type: sql_template
    model_spec:
      materialization:
        output_type: view          # table | view | ephemeral
        run_type: discrete         # discrete (full each run) | incremental
      single_sql: |
        {% with pages = this.DeRef("inputs/rsPages") %}
          select * from {{pages}} where context_campaign_source = 'mktemail'
        {% endwith %}
      ids:                         # registers this model's output as edge/feature source
        - select: user_id
          type: user_id
          entity: users
        - select: anonymous_id
          type: anonymous_id
          entity: users
      contract:
        is_optional: false
        is_event_stream: false
        with_entity_ids:
          - users
        with_columns:
          - name: user_id
          - name: context_campaign_name
      features:
        - name: context_campaign_name
```

## Field notes

- **`single_sql` vs `multi_sql`** — exactly one. `single_sql` is one `SELECT`; `multi_sql` is multiple statements (e.g. `CREATE TEMP TABLE …; CREATE TABLE {{this}} AS …`). pb wraps `single_sql` in its own CTE chain, so a **top-level `WITH` breaks** — inline subqueries or use `multi_sql`.
- **`this.DeRef("inputs/<name>")` / `this.DeRef("models/<name>")`** is how you reference another model and create the dependency. Pongo2 templating (`{% with %}`, `{% if %}`, `{{ ... }}`). Declare DeRefs at the top of the template, never only inside conditionals.
- **`materialization.output_type`** — `table` (persisted, fast reads, storage cost), `view` (cheap, recomputed on read), `ephemeral` (inlined as a CTE, no stored object). `report`, `file`, `none`, `shell` exist for non-warehouse artifacts.
- **`ids:`** — same `{select, type, entity}` shape as inputs; declaring them lets the model contribute edges to the id stitcher and feed feature views. Optional if the model is purely intermediate.
- **`contract:`** — `is_event_stream`/`is_append_only` behave as on inputs; `with_entity_ids`/`with_columns` declare what downstream models can rely on. Set `is_append_only: true` only if the model's output is genuinely append-only (required before it can feed incremental features).
- **`features:`** — columns to expose as features when this model feeds a feature table.
- Reference the model from entity_vars with `from: models/<name>`.

## Place it in `models/`

Put SQL template models in a `models/sql_models.yaml` (any file under `model_folders` works; the `models:` key holds them, the same list that holds id_stitcher / entity_cohort / feature_table_model).

## Making one incremental

For window functions or multi-step transforms that must run incrementally, see `references/incremental-migration.md` § Incremental SQL models — the `pre_existing`/`prereqs`/`checkpoint_name` setup and the `id_clusters_delta` remap. Keep a `sql_template` discrete unless it's a real performance bottleneck; discrete is simpler and always correct.
