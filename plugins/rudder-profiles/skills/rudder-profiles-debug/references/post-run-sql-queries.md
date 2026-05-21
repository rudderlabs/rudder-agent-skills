# Post-run SQL Queries

Adapt these to the user's warehouse dialect and output schema. Replace bracketed items with real names from `get_profiles_output_details()`.

## Entity Count

```sql
select count(*) as entity_count
from [output_schema].[entity_table];
```

## Stitching Ratio

Compares raw input IDs to stitched entity count. A ratio near 1.0 means stitching is not working.

```sql
select
  count(distinct [raw_id]) as raw_ids,
  count(distinct [entity_id]) as stitched_entities,
  round(count(distinct [raw_id])::float / nullif(count(distinct [entity_id]), 0), 2) as stitch_ratio
from [output_schema].[id_graph_table];
```

## Over-stitching Detection

Entities absorbing unusually many raw IDs may indicate a junk ID (e.g., empty string, "null", "unknown") leaking into the identity graph.

```sql
select [entity_id], count(distinct [raw_id]) as id_count
from [output_schema].[id_graph_table]
group by 1
order by 2 desc
limit 20;
```

## Feature NULL Rate

High NULL rates on required features suggest missing data or broken input mappings.

```sql
select
  avg(case when [feature_column] is null then 1 else 0 end) as null_rate
from [output_schema].[entity_table];
```

## Run-over-Run Entity Count

Sudden drops between seq_nos indicate data issues or stitching regressions.

```sql
select [seq_no], count(*) as entity_count
from [output_schema].[entity_table_history]
group by 1
order by 1 desc
limit 10;
```

## Latest Sequence Number

```sql
select max(seq_no) as latest_seq_no
from [output_schema].[run_metadata_table];
```
