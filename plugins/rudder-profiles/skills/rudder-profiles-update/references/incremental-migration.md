# Incremental Migration

## Readiness Checks

Before migrating any feature to incremental:

- Source data is append-only or otherwise safe for incremental semantics.
- Reliable event timestamps exist on all input tables.
- The current discrete project already compiles and runs cleanly.
- You have a recent discrete run to compare against.

## Merge Strategy by Aggregation

| Aggregation | Mergeable? | Notes |
|-------------|-----------|-------|
| `count` | Yes | Direct merge |
| `sum` | Yes | Direct merge |
| `min` | Yes | Direct merge |
| `max` | Yes | Direct merge |
| `avg` | Requires decomposition | Decompose into `sum` + `count`, merge both, compute `avg` from merged values |
| `median` | No | Cannot merge partial medians |
| `count distinct` | No | Cannot merge partial distinct counts |
| `first_value` | Case-by-case | Mergeable only if ordering is stable across incremental windows |
| `last_value` | Case-by-case | Mergeable only if ordering is stable across incremental windows |

## Migration Pattern

1. Start with one entity_var.
2. Add its `merge:` strategy to the var definition.
3. Run `pb compile`.
4. Run incremental and discrete side-by-side.
5. Compare outputs using SQL:

```sql
-- Compare entity counts
select 'incremental' as mode, count(*) as entities from [incremental_output]
union all
select 'discrete' as mode, count(*) as entities from [discrete_output];

-- Compare feature values for a sample
select
  i.[entity_id],
  i.[feature] as incremental_value,
  d.[feature] as discrete_value
from [incremental_output] i
join [discrete_output] d on i.[entity_id] = d.[entity_id]
where i.[feature] != d.[feature]
limit 100;
```

6. If values match within acceptable tolerance, proceed to the next var.
7. If values diverge, check the merge strategy and data assumptions.

## AVG Decomposition

To make `avg` incremental, decompose it:

```yaml
# Instead of:
#   select: avg(order_total)
#   from: ref('orders')

# Use two vars:
- name: total_order_value
  select: sum(order_total)
  from: ref('orders')
  merge:
    type: sum

- name: order_count
  select: count(*)
  from: ref('orders')
  merge:
    type: count

# Then compute avg from the merged components:
- name: avg_order_value
  select: '{{entity.Var("total_order_value")}}' / nullif('{{entity.Var("order_count")}}', 0)
```

## Recovery

If incremental state drifts or produces incorrect results:

```bash
pb run --rebase_incremental
```

This discards the incremental checkpoint and rebuilds from scratch, then resumes incremental from the new baseline.
