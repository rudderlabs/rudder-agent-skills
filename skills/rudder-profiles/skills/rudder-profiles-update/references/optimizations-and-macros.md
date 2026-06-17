# Optimizations & Macros

Two small project-level files: `models/optimizations.yaml` (performance flags) and `models/macros.yaml` (reusable SQL snippets). Shapes verified against pb sample projects.

## `models/optimizations.yaml`

One per project. All flags are optional and default to off/conservative — enable and verify per project.

```yaml
optimizations:
  main_id_addition_approach: case_based_join   # recommended for entities with 3+ id_types
  enable_input_columns_filtering: true         # avoid `select *` — read only needed columns
  bundle_entity_vars: true                     # group entity-var execution into fewer queries
  bundle_input_vars: true                      # group input-var execution
```

- `main_id_addition_approach: case_based_join` is the recommended join strategy when an entity has several id_types.
- `enable_input_columns_filtering` cuts scanned data by selecting only referenced columns from input tables.
- `bundle_entity_vars` / `bundle_input_vars` reduce the number of warehouse queries by grouping var computation — the biggest win on projects with many features.
- Enable incrementally and re-run; confirm output is unchanged before keeping a flag on. There are env-var equivalents (`PB_FORCE_*`) but the YAML file is the durable, per-project place.

## `models/macros.yaml`

Macros are compile-time text templates (Pongo2) substituted wherever you call them. Each has `name`, an `inputs:` list, and a `value:` template string.

```yaml
macros:
  - name: subtract_range
    inputs:
      - a
      - b
    value: "{{a}} - {{b}}"
```

Call it anywhere a `select:`/`merge:`/SQL template is allowed: `select: '{{subtract_range(user.x, user.y)}}'`.

### Warehouse-aware macros

`value:` can branch on `{{ warehouse.DatabaseType() }}` to emit dialect-specific SQL — this is how the conventional date macros and the `min_by`/`max_by` shims work. The `macro_datediff*` macros propensity models rely on are defined this way:

```yaml
macros:
  - name: macro_datediff           # days between `column` and the project's end_time
    inputs:
      - column
    value: >
      {% if warehouse.DatabaseType() == "bigquery" %}
        {% if !(end_time|isnil) %} date_diff(date('{{end_time.Format("2006-01-02 15:04:05")}}'), date({{column}}), day)
        {% else %} date_diff(CURRENT_DATE(), date({{column}}), day) {% endif %}
      {% elif warehouse.DatabaseType() == "postgres" %}
        {% if !(end_time|isnil) %} date '{{end_time.Format("2006-01-02 15:04:05")}}' - date({{column}})
        {% else %} CURRENT_DATE - date({{column}}) {% endif %}
      {% else %}
        {% if !(end_time|isnil) %} datediff(day, date({{column}}), date('{{end_time.Format("2006-01-02 15:04:05")}}'))
        {% else %} datediff(day, date({{column}}), GETDATE()) {% endif %}
      {% endif %}
  - name: macro_datediff_n         # boolean: is `column` within `number_of_days` of end_time?
    inputs:
      - column
      - number_of_days
    value: "(... {{column}} ... <= {{number_of_days}} ...)"   # same dialect branching; returns a predicate
```

- `macro_datediff_n`'s second argument is an **integer day count** and the macro returns a **boolean predicate** — not a unit string. (See `propensity-yaml-template.md`.)
- These are **project-defined, not pb built-ins.** If a project needs them and `models/macros.yaml` doesn't define them, copy them from a sample project before relying on them.
- `end_time` is the run's reference timestamp — using it (rather than `current_date`) is what keeps date features deterministic across reruns and correct for ML training snapshots.

See `references/warehouse-shims.md` for the `min_by`/`max_by` warehouse-branching macros used in incremental merges.
