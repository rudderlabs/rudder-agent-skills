# Propensity YAML Template

Use this only after the user confirms the label, prediction window, eligible population, and output names.

## `models/profiles-ml.yaml`

Schema verified against `profiles-mlcorelib` (`py_native/propensity.py` `BuildSpecSchema` + its sample projects). The spec splits into `training:` and `prediction:` blocks plus a required `inputs:` list — there are no top-level `label:`/`prediction_window_days:` fields. Unknown fields are rejected.

```yaml
models:
  - name: [propensity_model_name]
    model_type: propensity
    model_spec:
      entity_key: [entity_name]
      training:
        predict_var: [entity_var_or_cohort_path]   # the label var, e.g. entity/user/is_churned_7_days
        predict_window_days: [n]                    # how far ahead to predict
        label_value: 1                              # which value of predict_var is the positive class
        type: classification                        # or regression
        eligible_users: "[sql_condition]"           # e.g. days_since_last_seen <= 120 — columns must be entity_vars
        validity: day                               # how long a trained model stays valid: day | week | month
      prediction:
        output_columns:
          percentile:
            name: [percentile_column_name]
            description: "[description]"
          score:
            name: [score_column_name]
            description: "[description]"
            is_feature: false                       # optional; defaults to true
        eligible_users: "[sql_condition]"
      inputs:                                       # required — entity_var paths the model trains on (min 1)
        - entity/[entity_name]/[feature_1]
        - entity/[entity_name]/[feature_2]
        # package features use the package path: packages/[pkg]/entity/[entity_name]/[feature]
```

`training.predict_var` and `training.predict_window_days` are required; so are `prediction.output_columns` and `inputs`.

## `pb_project.yaml` addition

```yaml
python_requirements:
  - profiles_mlcorelib>=0.8.1
```

Verify the installed version (`pb version` or `uv pip list | grep profiles_mlcorelib`); upgrade if below 0.8.1.

## Macro Rules

All date-based entity vars that feed propensity models should use macros, not direct date functions. The macros are **project-defined** (in `models/macros.yaml`), not pb built-ins — confirm they exist before using, or copy them from a sample project.

### Strongly discouraged in propensity features (no automatic check)

These compile fine — pb does not block them — but they corrupt training data because they evaluate at query time, not at the historical training-snapshot time (label leak).

| Function | Why it breaks point-in-time training |
|----------|--------------------------------------|
| `current_date()` / `current_timestamp()` | Evaluate at query time, not snapshot time |
| `datediff()` (bare warehouse function) | Not snapshot-aware; use `{{macro_datediff(...)}}` |
| `sysdate` / `getdate()` / `now()` | Warehouse-specific and not snapshot-aware |

### Conventional macros

| Macro | Signature | Returns |
|-------|-----------|---------|
| `{{macro_datediff('column')}}` | `(column)` | Days between `column` and the project's `end_time` |
| `{{macro_datediff_n('column', N)}}` | `(column, integer N)` | Boolean predicate `datediff(day, column, end_time) <= N` — **second arg is an integer day count, not a unit string** |

### Why macros matter

During training the model builds historical snapshots at different reference dates. Direct date functions evaluate at query time, making every snapshot use today's date instead of its own reference date — the model peeks into the future relative to each snapshot (label leak) and fails at real prediction time. The `macro_datediff*` macros expand to the project's `end_time` so they stay anchored to the snapshot date.

## Confirmation Flow

Before writing propensity YAML, confirm all four with the user:

1. **Label** — what binary outcome? (e.g. "churned within 30 days")
2. **Prediction window** — how far ahead? (`predict_window_days`)
3. **Eligible users** — which users qualify for scoring?
4. **Output names** — model name and the percentile/score column names.

## Validation

1. `validate_propensity_model_config()` — structural correctness.
2. `evaluate_eligible_user_filters()` — confirm the eligible-user filter returns a reasonable population.
3. `pb compile` — catch anything remaining.
