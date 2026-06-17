# Change Risk Classification

## Safe

Changes that do not affect existing models or identity resolution.

| Change | Guard |
|--------|-------|
| Add a new entity_var | If it has `from`, require aggregation in `select` |
| Add a new input source | Confirm table and columns exist with `describe_table()` |

Primary concern: discovery mistakes, missing aggregation, and typos in column names.

## Moderate

Changes that affect identity resolution, downstream references, or introduce ML workflows.

| Change | Guard |
|--------|-------|
| Add a new id_type | Will change the identity graph; may merge or split entities |
| Modify an existing entity_var | Downstream entity_var refs like `'{{user.Var("name")}}'` may break; invalidates incremental checkpoints |
| Add a propensity model | Date handling rules change completely; must use macros for all time-based features |

Primary concern: identity-resolution behavior changes, broken cross-references, and point-in-time ML correctness.

## Breaking

Changes that require a full re-run or may break downstream consumers.

| Change | Guard |
|--------|-------|
| Remove an entity_var | Scan all files for `Var("name")` references first; warn about warehouse consumers |
| Remove an input model | Scan for `from: inputs/<name>`, `edge_sources` entries, and `{{<name>.column}}` references first |
| Rename heavily referenced models | Treat as remove + add; all refs must update |
| Change entity design | Full re-run required; all checkpoints invalidated |
| Change id_stitcher logic | Full re-run required; identity graph is rebuilt from scratch |

Primary concern: downstream breakage, checkpoint invalidation, and data pipeline disruption.

## Review Pattern

Before writing any change:

1. Name the risk class.
2. Name the expected blast radius (which files, models, and downstream consumers are affected).
3. Tell the user what validation will prove the change is safe.
4. For moderate and breaking changes, get explicit user confirmation before proceeding.
