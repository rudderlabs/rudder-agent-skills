# Compound Aggregator Cookbook (incremental)

Purpose: recipes for aggregators that are not directly mergeable, but can be made incremental by **decomposing** them into mergeable helper `entity_var`s plus a derived `entity_var` that recombines them. Each helper carries a `merge:` SQL expression string that folds the previous checkpoint (`{{rowset.<var>}}`) into the new delta. Derived vars have **no `from:` and no `merge:`** — they only reference sibling vars.

> All features below live under `var_groups:` → `vars:`, each item nested under `entity_var:`. `merge:` is a **SQL expression string**, never a structured object like `merge: { type: sum }`.

## 1. AVG — decompose into sum + count

You cannot merge an average directly. Keep a running `sum` and a running `count`, then divide.

```yaml
- entity_var:
    name: sum_amount
    select: sum(amount)
    from: inputs/rsOrders
    merge: sum({{rowset.sum_amount}})
    is_feature: false          # helper, not surfaced as a feature
- entity_var:
    name: count_amount
    select: count(*)            # NOT count(amount) unless you must exclude nulls
    from: inputs/rsOrders
    merge: sum({{rowset.count_amount}})   # COUNT MERGES AS SUM
- entity_var:
    name: avg_amount            # derived: no from:, no merge:
    select: '{{user.sum_amount}} / nullif({{user.count_amount}}, 0)'
```

> **Classic mistake:** merging the count with `count({{rowset.count_amount}})`. A count must merge as `sum(...)` — otherwise the incremental value collapses to 1.

## 2. Latest / earliest value of X (min_by / max_by)

`min_by`/`max_by` needs a `_by_param` helper holding the **ordering key** (the timestamp), defined in the **same `var_group`** and **before** the main var.

```yaml
- entity_var:
    name: latest_status_by_param        # helper FIRST
    select: max(timestamp)
    from: inputs/rsTracks
    merge: max({{rowset.latest_status_by_param}})
    is_feature: false
- entity_var:
    name: latest_status                 # main var, AFTER the helper
    select: '{{max_by(rsTracks.status, rsTracks.timestamp)}}'
    from: inputs/rsTracks
    merge: '{{max_by(rowset.latest_status, rowset.latest_status_by_param)}}'
```

> The merge must use **bare `rowset.X` identifiers**, not quoted string literals inside the merge args, so pb registers the dependency.
> Helper **after** main → `cyclic dependency detected`. Missing helper → `column "latest_status_by_param" does not exist in rowset`.

## 3. Exact distinct count — array_agg + array-union

The `merge:` is an aggregate over the combined rowset that unions the per-checkpoint arrays. The function names are warehouse-specific — Snowflake shown here (`ARRAY_UNION_AGG` to union, `ARRAY_SIZE` for length); on BigQuery union via `ARRAY_CONCAT_AGG` + `ARRAY(SELECT DISTINCT …)` and length via `ARRAY_LENGTH`; on Postgres via `array_agg` + `unnest`/`array_length`.

```yaml
- entity_var:
    name: distinct_skus_set
    select: array_agg(distinct sku)
    from: inputs/rsOrders
    merge: array_union_agg({{rowset.distinct_skus_set}})   # Snowflake; warehouse-specific
    is_feature: false
- entity_var:
    name: distinct_skus_count           # derived length, no from:/merge:
    select: 'array_size({{user.distinct_skus_set}})'
```

> **Warning:** the stored array grows unbounded on high-cardinality columns — checkpoint size and merge cost balloon. For large domains prefer an **approximate (HLL) distinct count** — see `approximate-aggregators.md`. Use exact array-union only for small, bounded domains.

## 4. Conditional counts

A filtered count is still a count, so it merges as `sum(...)`.

```yaml
- entity_var:
    name: paid_order_count
    select: count(case when status = 'paid' then 1 end)
    from: inputs/rsOrders
    merge: sum({{rowset.paid_order_count}})
```

## 5. Ratio / rate features

Decompose numerator and denominator into mergeable helpers, then derive the ratio in a no-`from`/no-`merge` var.

```yaml
- entity_var:
    name: clicks
    select: count(case when event = 'click' then 1 end)
    from: inputs/rsTracks
    merge: sum({{rowset.clicks}})
    is_feature: false
- entity_var:
    name: impressions
    select: count(case when event = 'impression' then 1 end)
    from: inputs/rsTracks
    merge: sum({{rowset.impressions}})
    is_feature: false
- entity_var:
    name: click_through_rate
    select: '{{user.clicks}} / nullif({{user.impressions}}, 0)'
```

## 6. merge_where — recency optimization

`merge_where:` is a **sibling string field of `merge:`** that restricts which baseline rows re-merge, cutting work on large checkpoints.

```yaml
- entity_var:
    name: recent_event_count
    select: count(*)
    from: inputs/rsTracks
    merge: sum({{rowset.recent_event_count}})
    merge_where: '{{rowset.last_event_date}} >= dateadd(day, -7, {{end_time_sql}})'
```

> Use `{{end_time_sql}}` for the run boundary, **never** `current_date` — `current_date` is non-deterministic across reruns and `--rebase_incremental`. See `known-gotchas.md`.
