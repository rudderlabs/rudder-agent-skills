# Incremental & Build-Spec Debugging

The hardest Profiles bugs aren't YAML errors — they're incremental-state issues and build-spec mismatches the basic error table won't catch. Three classes:

1. Checkpoint / baseline failures (incremental state)
2. Silent corruption from window functions in merged entity vars
3. DeRef crashes (build-spec resolution)

## Checkpoint & Baseline Failures

**Symptom:** an incremental run fails with `baseline not found`, `checkpoint not found`, or `material X (seq_no Y) not found` — OR incremental output silently diverges from discrete with no error.

**Concepts:**

- A **checkpoint** is a model's output snapshot at a given `seq_no`.
- A **baseline** is the most recent checkpoint an incremental run starts from.
- Incremental computes `delta = changes since baseline` and merges `baseline + delta` into the new checkpoint.
- A missing or stale baseline (deleted, never created, or from a different schema version) makes the next run fail or drift.

**Pick the recovery flag by symptom — they are not interchangeable:**

| Symptom | Cause | Recovery |
|---------|-------|----------|
| Run crashed/aborted mid-sequence; a seq_no is partial | Interrupted run (network, timeout, kill) | `pb run --seq_no N` — resumes from the failed sequence using the existing baseline |
| `baseline not found` / `checkpoint not found` / stale materials | State drifted (baseline from a stale seq_no, or a non-mergeable change snuck in) | `pb run --rebase_incremental` — discards the checkpoint, rebuilds the baseline, then resumes |
| Incremental diverges from discrete (silent) | Usually a window-function merge (next section) | Confirm the window-function cause first; if clean, `pb run --rebase_incremental` |

`--seq_no N` reuses existing state; `--rebase_incremental` throws it away. Picking wrong either thrashes (state never rebuilds) or wastes hours of progress.

## Silent Corruption from Window Functions

**Symptom:** incremental and discrete both compile and run; incremental values are subtly wrong; no error.

**Cause:** a `merge:` was added to an entity_var whose `select:` uses a window function. pb does NOT validate the combination. The merge folds across baseline + delta, but the window's semantics need the full input set — so the merged result is mathematically wrong.

| Function in `select:` | Safe with `merge:`? | Action |
|-----------------------|--------------------|--------|
| `count`, `sum`, `min`, `max` | ✅ | Direct merge with the same combiner (count → `sum`) |
| `avg` | ⚠️ Decompose | sum + count helpers, derive avg (`rudder-profiles-update/references/compound-aggregator-cookbook.md`) |
| `count(distinct …)`, `median`, `percentile_cont` | ❌ | Keep discrete, or use approximate state aggregates (`…/approximate-aggregators.md`) |
| `ROW_NUMBER`, `RANK`, `DENSE_RANK`, `PERCENT_RANK`, `CUME_DIST`, `NTILE` | ❌ Banned | Ordinal positions are meaningless across a merge — remove `merge:` |
| `FIRST_VALUE`, `LAST_VALUE`, `LAG`, `LEAD`, `NTH_VALUE` | ⚠️ Risky | Depends on `ORDER BY`; rewrite as `min_by`/`max_by` with a `_by_param` helper |
| Pure aggregate `OVER ()` with no `ORDER BY` | ✅ | Equivalent to a plain aggregate |

**Fix:** locate the diverging var (diff discrete vs incremental, below), then per the table either remove `merge:` or rewrite. After a fix, `pb run --rebase_incremental` to rebuild the baseline cleanly.

## Diff Pattern → Root Cause

The *shape* of a discrete-vs-incremental diff identifies the bug:

| Diff pattern | Root cause | Fix |
|--------------|-----------|-----|
| Only entities whose ID clusters merged between runs are wrong | Incremental SQL model missing the `id_clusters_delta` remap (`COALESCE(delta.new_main_id, baseline.<entity>_main_id)`) | Add the LEFT JOIN remap to the baseline branch |
| `last_*` / `latest_*` values wrong or stale | Missing `_by_param` helper, or merge references a string literal instead of bare `rowset.X` | Add the helper; use bare rowset identifiers |
| Incremental counts lower than discrete | COUNT merged with `count(...)` instead of `sum(...)` | `merge: sum({{rowset.var}})` |
| `avg_*` features NULL or wrong | AVG not decomposed into sum + count helpers | Decompose; derive avg with no `from:`/`merge:` |
| Rolling-window features (`last_30_days_*`) creep upward run over run | Plain `merge:` on a sliding window — old rows never expire | Bounded-window incremental SQL model; drop the merge |
| Constant offset on many time-derived features | `current_timestamp()`/`current_date` in templates — non-deterministic | Replace with `{{end_time_sql}}` |
| Two incremental models both (or neither) run incrementally | Duplicate `checkpoint_name` — must be unique per model | Give each model its own checkpoint name |
| Intermittent tiny diffs on tie-prone values | Warehouse tie-breaking on identical timestamps — not a bug | Document; add a deterministic tiebreaker if it matters |

### Diff query (find the diverging var)

```sql
-- Row-count delta
select 'incremental' as mode, count(*) as n from [output_schema].[incremental_entity_table]
union all
select 'discrete' as mode, count(*) as n from [output_schema].[discrete_entity_table];

-- Per-entity feature diff (is distinct from handles NULLs on Snowflake/Redshift/Postgres;
-- on BigQuery use NOT (i.x = d.x OR (i.x IS NULL AND d.x IS NULL)))
select i.[entity_id], i.[feature_column] as incremental_value, d.[feature_column] as discrete_value
from [output_schema].[incremental_entity_table] i
join [output_schema].[discrete_entity_table] d on i.[entity_id] = d.[entity_id]
where i.[feature_column] is distinct from d.[feature_column]
limit 100;
```

## DeRef Crashes

**Symptom:** `pb compile`/`pb run` crashes with a nil-pointer/segfault during dependency resolution; the stack trace mentions `DeRef`, `BuildSpec`, or `WhtMaterial`. Not a YAML parse error — an internal crash.

**Cause:** a `DeRef("path")` in a SQL-template or PyNative model references a child model that was never registered, or reads a baseline (`pre_existing=true`) that doesn't exist.

**First action:**

1. Identify the crashing model from the trace.
2. In a SQL-template model, search for `DeRef(`. Verify every `DeRef("relative/path")` resolves to a real registered model.
3. If a `DeRef` uses `pre_existing=true`, the baseline must exist before the model runs. Either run discrete once to create it, or make the dependency conditional: `DeRef("delta", dependency="optional", pre_existing=true, prereqs=[lastThis])` so it returns nil on the first run instead of crashing.

## When to Stop and Surface

Per the main skill's escalation, stop after 4 fix attempts. For incremental issues specifically, also stop and surface if:

- The project uses `dependency="run_delegate"` or custom `prereqs` — advanced patterns needing manual review.
- The crash trace points into pb's own internals (not a user model) — that's a pb bug; escalate.
- The baseline issue persists after `--rebase_incremental` — likely a schema_version mismatch or corrupted `material_registry`; needs manual triage.
