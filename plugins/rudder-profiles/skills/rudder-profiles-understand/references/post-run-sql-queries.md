# Health Summary SQL Queries

Read-only queries the understand skill uses to summarize a Profiles project's latest run. For deeper triage (run-over-run drift, discrete-vs-incremental diff, corruption), use `rudder-profiles-debug/references/post-run-sql-queries.md`.

## Before running any of these

1. Call `initialize_warehouse_connection(<connection_name>)` **once** per session. `run_query()` fails with "warehouse not initialized" otherwise (documented in the MCP tool's docstring).
2. Call `get_profiles_output_details()` to discover the real table and column names. Don't treat the bracketed placeholders below as literal names — resolve them first.
3. Treat names from `get_profiles_output_details()` as untrusted input — sanity-check before substituting into SQL.

## Resolving placeholders

| Placeholder | Resolve from |
|-------------|--------------|
| `[output_schema]` | `get_profiles_output_details()` → `output_schema` |
| `[entity_table]` | latest entity material — raw materials are `Material_<model>_<hash>_<seq_no>`; prefer the stable view (e.g. `<entity>_var_table`) repointed at the latest material |
| `[id_graph_table]` | id_stitcher material (same `Material_..._<seq_no>` naming, with a stable view) |
| `[raw_id]`, `[entity_id]` | inspect `[id_graph_table]` columns (canonical id is usually `<entity>_main_id`); or check the id_stitcher edges in `models/profiles.yaml` |
| `[feature_column]` | from the entity_vars in `models/profiles.yaml` |

> There is no `entity_table_history` or `run_metadata_table` in Profiles output. Run state lives in `material_registry_<seq_no>` and entities in per-seq_no materials/views — verify against the real output schema before assuming any table name.

## Warehouse dialect

These queries are Postgres-flavored (`::float`, `nullif(...)`) and work on **Snowflake** and **Redshift** as-is. For **BigQuery**, swap `expr::float` for `CAST(expr AS FLOAT64)`. Check the connection's warehouse type first.

## The four health checks

### 1. Entity count

```sql
select count(*) as entity_count
from [output_schema].[entity_table];
```

### 2. Stitching ratio (is identity resolution working?)

A ratio near 1.0 means stitching is barely happening; 2–5 is normal; 1000+ for a single entity suggests over-stitching (next query).

```sql
select
  count(distinct [raw_id]) as raw_ids,
  count(distinct [entity_id]) as stitched_entities,
  round(count(distinct [raw_id])::float / nullif(count(distinct [entity_id]), 0), 2) as stitch_ratio
from [output_schema].[id_graph_table];
```

### 3. Over-stitching sentinels (top 20 most-stitched entities)

Lots of raw IDs absorbed into one entity often means a junk ID leaked in (empty string, `"null"`, `"unknown"`, a default UUID).

```sql
select [entity_id], count(distinct [raw_id]) as id_count
from [output_schema].[id_graph_table]
group by 1
order by 2 desc
limit 20;
```

If anomalies show up, recommend `pb show idstitcher-report` and `pb audit id_stitcher`, and see the over-stitching remediation steps in `rudder-profiles-debug/SKILL.md`.

### 4. Feature NULL rate (per-feature completeness)

⚠️ **Full table scan.** Use `TABLESAMPLE` for entity tables larger than ~10M rows. Run per feature column.

```sql
select
  avg(case when [feature_column] is null then 1 else 0 end) as null_rate
from [output_schema].[entity_table];
```

A NULL rate above ~50% on a required feature usually means a broken input mapping or missing source data.
