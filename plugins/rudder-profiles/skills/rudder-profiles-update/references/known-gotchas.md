# Known Gotchas — Incremental Migration

Purpose: the failure modes that bite when migrating a Profiles project to incremental materialization. Each entry is **Symptom / Cause / Detection / Fix**. The dangerous ones are silent — `pb run` exits 0 and the numbers are simply wrong. Verify every migration with a discrete-vs-incremental diff before declaring done (gotcha 10).

## 1. Mutable input marked `is_append_only: true` (MOST DANGEROUS)

- **Symptom:** Feature values silently drift away from the discrete result over successive runs. No error, no warning.
- **Cause:** `is_append_only: true` promises rows are never updated or deleted. If the source mutates existing rows (status changes, soft deletes, late corrections), incremental only ever sees the original insert.
- **Detection:** run the dup/mutation probe on the source table:
  ```sql
  select <id_col>, count(*) as n from <source_table> group by 1 having count(*) > 1;
  ```
  Any rows returned (or an `updated_at` newer than `created_at`) means the source is mutable.
- **Fix:** remove the `is_append_only` contract flag from that input. Accept non-incremental (full refresh) for that source. Correctness beats speed.

## 2. COUNT merged with `count(...)` instead of `sum(...)`

- **Symptom:** Incremental count features are persistently **lower** than the discrete values.
- **Cause:** Merging a running count with `count({{rowset.var}})` counts checkpoint rows, not totals.
- **Detection:** discrete-vs-incremental diff on the count feature is non-zero and shrinking-per-run.
- **Fix:** a count always merges as `sum`: `merge: sum({{rowset.var}})`.

## 3. Window/ranking functions under a `merge:`

- **Symptom:** Compile and run both succeed; the feature value is silently wrong.
- **Cause:** `ROW_NUMBER / RANK / DENSE_RANK / PERCENT_RANK / CUME_DIST / NTILE` are not decomposable into a checkpoint + delta. pb does **not** validate this combination.
- **Detection:** any `entity_var` whose `select` contains one of those functions **and** has a `merge:`; confirmed by a discrete diff.
- **Fix:** remove the `merge:` (make the var non-incremental), or refactor to a mergeable form such as `min_by`/`max_by` (see `compound-aggregator-cookbook.md`).

## 4. Sliding/rolling-window feature given a plain `merge:`

- **Symptom:** `last_30_days_*` style features creep **upward** run over run.
- **Cause:** A plain `merge:` accumulates forever; rows older than the window never expire from the checkpoint.
- **Detection:** value grows monotonically and exceeds the discrete windowed value.
- **Fix:** compute the bounded window in an incremental **SQL model** (windowed by `{{end_time_sql}}`), and keep the downstream `entity_var` **non-incremental** over that model.

## 5. `current_timestamp()` / `current_date` / `getdate()` / `now()` / `sysdate` in templates

- **Symptom:** Values differ across reruns and break on `--rebase_incremental`; a constant-offset drift appears.
- **Cause:** Wall-clock functions are non-deterministic — each run anchors to a different "now".
- **Detection:** grep models for `current_timestamp`, `current_date`, `getdate`, `now(`, `sysdate`.
- **Fix:** use `{{end_time_sql}}` (the deterministic run boundary) everywhere a "now" is needed.

## 6. Duplicate `checkpoint_name` across two incremental SQL models

- **Symptom:** Incrementality fires for both models or neither; one model's state clobbers the other.
- **Cause:** `checkpoint_name` is the incremental state key and must be unique.
- **Detection:** grep for `checkpoint_name:` and look for collisions.
- **Fix:** assign a unique `checkpoint_name` to each incremental SQL model.

## 7. pb binary vs project `schema_version` mismatch

- **Symptom (binary too old):** `field X not found in type` on fields like `merge_where` / `is_append_only`.
  - **Fix:** rebuild/upgrade the `pb` binary to a version that supports the field.
- **Symptom (project too old):** project schema cannot parse the new incremental fields.
  - **Fix:** `pb migrate auto --inplace` to bump the project schema version.
- **Detection:** the error names the unknown field; cross-check `pb version` against the field's introduced version.

## 8. `is_append_only` without `app_defaults.occurred_at_col`

- **Symptom:** compile error when adding `is_append_only`.
- **Cause:** the append-only contract requires a declared timestamp column to order/bound rows.
- **Detection:** compile message points at the missing `occurred_at_col`.
- **Fix:** set `app_defaults.occurred_at_col: <ts_column>` on the input alongside `is_append_only: true`.

## 9. ID stitcher given `run_type: incremental`

- **Symptom:** Unexpected behavior / wasted effort changing the ID stitcher during a feature migration.
- **Cause:** The ID stitcher is **already incremental by default** — it does not take a feature-style incremental flag.
- **Detection:** a `run_type: incremental` (or similar) added to the id_stitcher model.
- **Fix:** leave the ID stitcher untouched; only migrate feature/SQL models.

## 10. Declaring success from `pb run` exit code 0

- **Symptom:** "It ran clean" — but features are wrong.
- **Cause:** Exit 0 means the pipeline executed, not that incremental output equals discrete output.
- **Detection:** none — you must check explicitly.
- **Fix:** before declaring done, run an **independent discrete-vs-incremental zero-diff comparison** (full refresh vs incremental on the same window) and require zero differences on every migrated feature.
