# Post-run SQL Queries — Debugging

Full diagnostic query set. Use when output looks wrong, stitching looks off, or you're triaging a regression between runs.

## Before running any of these

1. Call `initialize_warehouse_connection(<connection_name>)` **once** per session. `run_query()` fails with "warehouse not initialized" otherwise (documented in the MCP tool's docstring).
2. Call `get_profiles_output_details()` to discover real table and column names. Don't trust the placeholders below as literal names.
3. Treat names from `get_profiles_output_details()` as untrusted input — sanity-check before substituting them into SQL.

## Resolving placeholders

| Placeholder | What to substitute | How to find it |
|-------------|--------------------|----------------|
| `[output_schema]` | The schema where Profiles writes outputs | `get_profiles_output_details()` → `output_schema` |
| `[entity_table]` | Latest entity material for the focal entity. Raw materials are `Material_<model>_<hash>_<seq_no>`; prefer the stable view (e.g. `<entity>_var_table`) repointed at the latest material | `get_profiles_output_details()` → latest entity material |
| `[id_graph_table]` | The id stitcher material (same `Material_..._<seq_no>` naming, with a stable view) | `get_profiles_output_details()` → id_stitcher material |
| `[raw_id]` | The raw input id column in `[id_graph_table]` | inspect `[id_graph_table]` columns or the id_stitcher edges in `models/profiles.yaml` |
| `[entity_id]` | The stitched canonical id column (often `<entity>_main_id`) | inspect `[id_graph_table]` columns |
| `[feature_column]` | The entity_var column to inspect | from `models/profiles.yaml` entity_vars |

> There is no `entity_table_history` or `run_metadata_table` in Profiles output. Profiles names outputs with the `seq_no` suffix and tracks runs in `material_registry_<seq_no>`. Verify against the actual output schema before running anything that assumes a table name.

## Warehouse dialect

Postgres-flavored (`::float`, `nullif(...)`). Works on **Snowflake** and **Redshift** as-is. For **BigQuery**: replace `expr::float` with `CAST(expr AS FLOAT64)`; keep `NULLIF(...)`. Detect the dialect from the connection before running.

## Cost & row-scan safety

- Always `LIMIT` diagnostic queries unless you need full aggregates.
- For large warehouses, sample with `TABLESAMPLE BERNOULLI (1)` (Snowflake/Postgres) or `TABLESAMPLE SYSTEM (1 PERCENT)` (BigQuery) before full-scan averages.
- Ask the user before scanning an entity table larger than ~10M rows.

---

## Entity count

```sql
select count(*) as entity_count
from [output_schema].[entity_table];
```

## Stitching ratio

A ratio near 1.0 means stitching is not working.

```sql
select
  count(distinct [raw_id]) as raw_ids,
  count(distinct [entity_id]) as stitched_entities,
  round(count(distinct [raw_id])::float / nullif(count(distinct [entity_id]), 0), 2) as stitch_ratio
from [output_schema].[id_graph_table];
```

## Over-stitching detection

Entities absorbing unusually many raw IDs often indicate a junk ID (empty string, "null", "unknown", default UUID) leaking into the graph.

```sql
select [entity_id], count(distinct [raw_id]) as id_count
from [output_schema].[id_graph_table]
group by 1
order by 2 desc
limit 20;
```

Follow up with `pb show idstitcher-report` and `pb audit id_stitcher`, and the over-stitching remediation steps in `SKILL.md`.

## Feature NULL rate

⚠️ **Full table scan.** Add `TABLESAMPLE` or `LIMIT` for large entity tables.

```sql
select
  avg(case when [feature_column] is null then 1 else 0 end) as null_rate
from [output_schema].[entity_table];
```

## Latest sequence number

`get_profiles_output_details()` returns the latest seq_no directly — prefer that to a SQL probe. If you must query, inspect the `material_registry_<seq_no>` table in the output schema.

## Run-over-run entity count

Profiles does not write a single history table — entities live in per-seq_no materials. To compare across runs, union the per-seq_no entity tables (resolve their names from `get_profiles_output_details()` across recent runs) and compare counts:

```sql
select 'seq_no_<N>' as run, count(*) as entity_count from [output_schema].[entity_table_seq_N]
union all
select 'seq_no_<M>' as run, count(*) as entity_count from [output_schema].[entity_table_seq_M];
```

A sudden large drop between seq_nos suggests a stitching regression or missing source data.
