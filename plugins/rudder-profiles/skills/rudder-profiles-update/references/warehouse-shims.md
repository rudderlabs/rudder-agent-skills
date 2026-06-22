# Warehouse Shims for Incremental Merges

Incremental `merge:` clauses often need "the value at the latest/earliest timestamp," but pb has no built-in `MIN_BY`/`MAX_BY` that works on every warehouse. Define project-level macros that branch on `{{ warehouse.DatabaseType() }}` and emit the right SQL per warehouse.

## Why these exist

`MIN_BY(a, b)` returns `a` from the row where `b` is smallest; `MAX_BY` returns `a` where `b` is largest. This is the building block for last/first-value features that stay correct when a baseline is merged with a delta. Snowflake and Databricks have it natively; BigQuery and Postgres emulate it with `ARRAY_AGG`; Redshift has neither and needs a `LISTAGG` workaround with real caveats (see below).

Define the macros once in `models/macros.yaml`. They are invoked as `{{min_by(col, order_col)}}` / `{{max_by(col, order_col)}}` anywhere a `select:` or `merge:` template is allowed.

## models/macros.yaml

```yaml
macros:
  # min_by(value_column, order_column):
  #   value_column at the row where order_column is smallest.
  - name: min_by
    inputs:
      - value_column
      - order_column
    value: >
      {% if warehouse.DatabaseType() == "snowflake" %} MIN_BY({{value_column}}, {{order_column}})
      {% elif warehouse.DatabaseType() == "databricks" %} MIN_BY({{value_column}}, {{order_column}})
      {% elif warehouse.DatabaseType() == "bigquery" %} ARRAY_AGG({{value_column}} ORDER BY {{order_column}} ASC LIMIT 1)[OFFSET(0)]
      {% elif warehouse.DatabaseType() == "postgres" %} (ARRAY_AGG({{value_column}} ORDER BY {{order_column}} ASC))[1]
      {% elif warehouse.DatabaseType() == "redshift" %} SPLIT_PART(LISTAGG({{value_column}}, '|||') WITHIN GROUP (ORDER BY {{order_column}} ASC), '|||', 1)
      {% else %} MIN_BY({{value_column}}, {{order_column}})
      {% endif %}

  # max_by(value_column, order_column):
  #   value_column at the row where order_column is largest.
  - name: max_by
    inputs:
      - value_column
      - order_column
    value: >
      {% if warehouse.DatabaseType() == "snowflake" %} MAX_BY({{value_column}}, {{order_column}})
      {% elif warehouse.DatabaseType() == "databricks" %} MAX_BY({{value_column}}, {{order_column}})
      {% elif warehouse.DatabaseType() == "bigquery" %} ARRAY_AGG({{value_column}} ORDER BY {{order_column}} DESC LIMIT 1)[OFFSET(0)]
      {% elif warehouse.DatabaseType() == "postgres" %} (ARRAY_AGG({{value_column}} ORDER BY {{order_column}} DESC))[1]
      {% elif warehouse.DatabaseType() == "redshift" %} SPLIT_PART(LISTAGG({{value_column}}, '|||') WITHIN GROUP (ORDER BY {{order_column}} DESC), '|||', 1)
      {% else %} MAX_BY({{value_column}}, {{order_column}})
      {% endif %}
```

## Usage in an entity_var

The `select:` computes the per-window value; the `merge:` re-applies the same macro over the combined baseline+delta rowset so the result stays correct incrementally.

`merge:` is a SQL expression string over the combined baseline+delta `rowset`, never a structured object. The companion `_by_param` timestamp var must be defined **before** the main var in the same var_group.

```yaml
# companion var carries the ordering timestamp into the rowset (define FIRST):
- entity_var:
    name: last_event_timestamp
    select: max(timestamp)
    from: inputs/tracks
    merge: max({{rowset.last_event_timestamp}})
    is_feature: false
- entity_var:
    name: last_event_name
    select: '{{max_by(tracks.event_name, tracks.timestamp)}}'
    from: inputs/tracks
    merge: '{{max_by(rowset.last_event_name, rowset.last_event_timestamp)}}'
```

## Caveats by warehouse

| Warehouse | Implementation | Caveat |
|-----------|----------------|--------|
| Snowflake | Native `MIN_BY`/`MAX_BY` | Very old accounts may lack these — fall back to the BigQuery-style `ARRAY_AGG` pattern. |
| Databricks | Native `MIN_BY`/`MAX_BY` | None significant. |
| BigQuery | `ARRAY_AGG(... ORDER BY ... LIMIT 1)[OFFSET(0)]` | NULLs sort first on ASC; add `IGNORE NULLS` if you must skip them. |
| Postgres | `(ARRAY_AGG(... ORDER BY ...))[1]` | Builds a full per-group array; cost grows with group size. |
| Redshift | `SPLIT_PART(LISTAGG(...) WITHIN GROUP (ORDER BY ...), delim, 1)` | `LISTAGG` truncates at 65535 chars; pick a delimiter that never appears in the data. Id-cluster stability degrades past ~50 ids per cluster, so large clusters can overflow or return the wrong value. |

> Warning: On Redshift, treat `min_by`/`max_by` over high-cardinality clusters as best-effort. If a cluster can exceed ~50 ids or the concatenated values can pass 65535 chars, prefer a discrete (non-incremental) computation for that feature.
