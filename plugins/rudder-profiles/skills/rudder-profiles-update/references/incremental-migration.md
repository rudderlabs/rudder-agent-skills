# Incremental Migration

Curated for customer projects from the RudderStack `migrate-pb-to-incremental` workflow. Treat incremental as a controlled migration, not a small edit.

## Before anything else

- **Work on a copy of the project**, never the production checkout. Restore production references only after validation passes.
- **Check schema_version vs pb version.** Incremental fields (`is_append_only`, `merge`, `merge_where`) need a current schema. If the project is on an old `schema_version`, run `pb migrate auto --inplace` on the copy first. If `pb` is older than the project (symptom: `field X not found in type`), upgrade pb.
- **Never claim success from exit code 0.** `pb run` exiting 0 means it executed, not that the output is correct. Require an independent discrete-vs-incremental zero-diff before declaring done (see Validation).

## Readiness Checks

- The input declares `contract: { is_event_stream: true, is_append_only: true }` plus `app_defaults.occurred_at_col` (pb rejects `is_append_only` without the timestamp). Without this contract the input has no `incr_delta` child material and migration can't proceed without a checkpoint-invalidating schema bump.
- **Verify append-only with SQL — don't trust the table name:**

```sql
-- Duplicates on the row identifier mean rows get updated → NOT append-only
select [row_id], count(*) from [database.schema.table]
group by 1 having count(*) > 1 limit 10;
```

  Also grep the project for `max_by`/`last_value` reads of the same input — "latest value of X" features often signal a mutable snapshot. **Never mark a mutable input `is_append_only`** — it compiles and runs fine but silently produces wrong values. "99.99% append-only" counts as NOT append-only. (Gotcha #1 in `known-gotchas.md`.)
- The discrete project already compiles and runs cleanly, and you have a recent discrete run to compare against.

## Merge syntax (exact)

`merge:` is a **SQL expression string** that combines the previous checkpoint with the delta, referencing prior values as `{{rowset.<var_name>}}`. It is NOT a structured object — there is no `merge: { type: ... }`.

```yaml
- entity_var:
    name: total_revenue
    select: sum(amount)
    from: inputs/orders
    merge: sum({{rowset.total_revenue}})
```

`merge_where:` is a separate sibling string field (a predicate restricting which baseline rows re-merge), not a key under `merge:`.

## Feature classification (decision tree)

| Aggregation in `select:` | Mergeable? | Approach |
|--------------------------|-----------|----------|
| `count`, `sum`, `min`, `max` | ✅ Direct | Add `merge:` with the matching combiner. **COUNT merges as `sum(...)`**, not `count(...)`. |
| `count(case when … then 1 end)` | ✅ Direct | Merges as `sum({{rowset.var}})`. |
| `avg` | ⚠️ Decompose | sum + count helpers, derive avg — `references/compound-aggregator-cookbook.md`. |
| `min_by` / `max_by` / "latest value of X" | ⚠️ Helper | Needs a `_by_param` helper + warehouse shim — cookbook + `references/warehouse-shims.md`. |
| `count(distinct …)`, `median`, `percentile_cont` | ❌ Not exactly mergeable | Keep discrete, OR use warehouse state-emitting approximates — `references/approximate-aggregators.md`. |
| `first_value` / `last_value` | ⚠️ Risky | Depends on the window's `ORDER BY`; prefer `min_by`/`max_by`. |
| `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `PERCENT_RANK`, `CUME_DIST`, `NTILE` | ❌ Banned with `merge:` | Ordinal positions are meaningless across a merged baseline+delta. Remove `merge:`. |
| `LAG`, `LEAD`, `NTH_VALUE` | ⚠️ Risky | Depends on row ordering across the merge boundary. Prefer `min_by`/`max_by`. |
| Rolling windows (`last_30_days_*`) | ❌ Not via `merge:` | A plain merge never expires old rows — values drift upward. Use a bounded-window incremental SQL model; leave the downstream entity_var non-incremental. |

**Critical:** pb does NOT validate the select/merge combination. A banned function paired with `merge:` compiles and runs and silently produces wrong output. Always cross-check the `select:` aggregator against this table before adding `merge:`. See `known-gotchas.md` for the silent failure modes.

## Migration pattern

1. Migrate one entity_var at a time. Add its `merge:` expression, `pb compile`.
2. Validate with a **cutoff-replay** comparison — a single run can't exercise the merge path:
   - **Run A (ground truth):** `pb run --rebase_incremental` against schema/target A — full data, no checkpoints.
   - **Run B1:** `pb run --rebase_incremental --end_time <CUTOFF>` against schema/target B — builds a checkpoint from ~70% of the data.
   - **Run B2:** plain `pb run` against target B — consumes B1's checkpoint, merging post-cutoff rows as delta.
   - **Gate:** A ≡ B2 on the feature table, compared with a key-based diff that ignores row/column order.

```sql
-- Per-entity feature diff between ground-truth (A) and merged (B2) outputs
select a.[entity_id], a.[feature] as full_run_value, b.[feature] as incremental_value
from [run_a_output] a
join [run_b2_output] b on a.[entity_id] = b.[entity_id]
where a.[feature] is distinct from b.[feature]
limit 100;
```

3. Zero diff → next var. Diverging values → match the diff *shape* against the diff-pattern table in `rudder-profiles-debug/references/incremental-debugging.md`.
4. **Never relax the diff to make it pass** (excluding columns, tolerances) without documenting exactly why each excluded column is expected to differ.

## Incremental SQL models (beyond entity_vars)

Window functions and multi-step transforms that can't merge as entity_vars can become incremental `sql_template` models. The canonical setup declares all DeRefs at the top, **never inside `{% if %}` blocks** (dependency discovery breaks):

```
{%- set lastThis = this.DeRef(pre_existing=true, dependency="optional", checkpoint_name="[unique_name]") -%}
{%- set inputDelta = this.DeRef("inputs/[X]/incr_delta_tbl", prereqs=[lastThis]) -%}
{%- set inputFull  = this.DeRef("inputs/[X]", prereqs=[inputDelta.Except()]) -%}
```

- **`checkpoint_name` must be unique per model.** Reusing one name (e.g. `"baseline"`) across two incremental models makes incrementality fire for both or neither.
- When the ID stitcher is incremental, remap baseline rows through the cluster delta: `COALESCE(delta.new_main_id, baseline.<entity>_main_id)` via a LEFT JOIN on the stitcher's `id_clusters_delta` — without it, users whose clusters merged keep stale values.
- `single_sql` is wrapped in pb's own CTE chain, so a top-level `WITH` breaks; inline subqueries or use `multi_sql`.

## Out of scope — do not migrate these

- **ID stitchers are already incremental by default.** Do not add `run_type: incremental` as part of a feature migration.
- Cohorts (views inheriting from upstream), activations, PyNative/ML models, CSV/static inputs — skip with a note.
- Package-imported models and S3-hosted inputs — hard blockers; surface options to the user instead of editing.

## Checkpoints, baselines, and recovery

An incremental run consumes a **baseline** (the previous checkpoint, by `seq_no`) and produces a new checkpoint by combining baseline + delta via `merge:`. The delta is the newly-arrived rows since the baseline's `end_time`, from the input's auto-generated `incr_delta` material.

| Symptom | Recovery |
|---------|----------|
| Run crashed mid-sequence (network, timeout, kill) | `pb run --seq_no N` — resumes the failed sequence using the existing baseline |
| `baseline not found` / `checkpoint not found`, OR output diverged from discrete | `pb run --rebase_incremental` — discards the checkpoint and rebuilds the baseline from scratch |

Never substitute one for the other — `--seq_no N` reuses (possibly drifted) state; `--rebase_incremental` throws state away. Docs also recommend an occasional `--rebase_incremental` as hygiene so slow drift never accumulates. Full triage in `rudder-profiles-debug/references/incremental-debugging.md`.

## Reference docs

- `references/compound-aggregator-cookbook.md` — AVG, min_by/max_by, distinct, ratios, `merge_where`.
- `references/warehouse-shims.md` — per-warehouse `min_by`/`max_by` macros.
- `references/approximate-aggregators.md` — HLL / approximate percentiles for distinct/percentile features.
- `references/known-gotchas.md` — the silent failure modes, symptom/cause/detection/fix.
- `rudder-profiles-debug/references/incremental-debugging.md` — DeRef crashes, checkpoint/baseline failures, diff-pattern triage.
