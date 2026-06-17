# Approximate Aggregators for Incremental (HLL / percentiles)

Exact `count(distinct …)` and `median`/`percentile_cont` cannot be merged incrementally — partial results don't combine. Some warehouses expose *state-emitting* approximate aggregates whose intermediate state CAN be merged across baseline+delta, giving you approximate-but-incremental distinct counts and percentiles. This trades a small error for incremental performance.

## Support matrix

| Warehouse | Distinct count | Percentile | Verdict |
|-----------|----------------|------------|---------|
| Snowflake | `HLL_ACCUMULATE` → `HLL_COMBINE` → `HLL_ESTIMATE` | `APPROX_PERCENTILE_ACCUMULATE` → `_COMBINE` → `_ESTIMATE` | Both mergeable — full support |
| BigQuery | `HLL_COUNT.INIT` → `HLL_COUNT.MERGE_PARTIAL` → `HLL_COUNT.EXTRACT` | `APPROX_QUANTILES` is NOT state-mergeable | Distinct only — keep percentiles discrete |
| Postgres | `hll` extension: `hll_add_agg` → `hll_union_agg` → `hll_cardinality` (only if installed) | None | Distinct only if `hll` installed; else none |
| Databricks | None state-emitting | None state-emitting | No approximate-incremental — keep discrete |
| Redshift | None state-emitting | None state-emitting | No approximate-incremental — keep discrete |

> Where the verdict is "keep discrete," leave the feature as a normal (non-incremental) entity_var, or move it to a non-incremental path. Do not attempt to merge `approx_count_distinct`/`approx_percentile` directly — those return final numbers, not mergeable state.

## Pattern

Three vars: a per-window var emitting the state, a `merge:` that unions states over the rowset, and a derived non-incremental var that extracts the final number. Snowflake distinct-count example:

```yaml
- entity_var:
    name: distinct_pages_state
    select: HLL_ACCUMULATE(page_url)
    from: inputs/tracks
    merge: HLL_COMBINE({{rowset.distinct_pages_state}})   # SQL expression string, not a block
    is_feature: false
- entity_var:
    name: distinct_pages
    select: 'HLL_ESTIMATE({{user.Var("distinct_pages_state")}})'
    # derived from merged state — no from:, no merge:, recomputed each run
```

BigQuery swaps the functions: `HLL_COUNT.INIT(...)` in the window var, `HLL_COUNT.MERGE_PARTIAL(rowset.<state>)` in the merge, and `HLL_COUNT.EXTRACT(...)` in the derived var. Snowflake percentiles follow the same shape with `APPROX_PERCENTILE_ACCUMULATE` / `_COMBINE` / `_ESTIMATE(state, 0.5)`.

## Error bounds

| Aggregate | Typical error |
|-----------|---------------|
| HLL distinct count | ~1.5–2% |
| Approx percentile | ~1% |

These are statistical bounds on a single estimate; merged states do not compound error meaningfully, but they are never exact.

> Important: Document for the customer that any feature built on these aggregators is **approximate, not exact**. Name the affected features explicitly so downstream consumers (dashboards, audiences, ML inputs) know the distinct counts and percentiles are estimates. If a use case requires exact values, keep that feature discrete instead of incremental.
