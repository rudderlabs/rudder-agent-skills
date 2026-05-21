# Propensity YAML Template

Use this only after the user confirms the label, prediction window, eligible population, and output names.

## `models/profiles-ml.yaml`

```yaml
models:
  - name: [propensity_model_name]
    model_type: propensity
    entity_key: [entity_name]
    label:
      select: [label_expression]
    eligible_users:
      select: [eligible_user_expression]
    prediction_window_days: [n]
```

## `pb_project.yaml` addition

Ensure this is present:

```yaml
python_requirements:
  - profiles_mlcorelib>=0.8.1
```

## Macro Rules

All date-based entity vars that feed propensity models MUST use macros, not direct date functions.

### Banned functions

Never use these in entity vars consumed by propensity models:

| Function | Why banned |
|----------|-----------|
| `current_date()` | Evaluates at query time, not training snapshot time |
| `current_timestamp()` | Same — breaks point-in-time accuracy |
| `datediff()` | Direct warehouse function, not macro-aware |
| `sysdate` | Oracle/Snowflake-specific, not macro-aware |
| `getdate()` | SQL Server/Snowflake-specific, not macro-aware |
| `now()` | Evaluates at query time |

### Required macros

| Macro | Purpose | Example |
|-------|---------|---------|
| `{{macro_datediff('column')}}` | Days between column and reference date | `{{macro_datediff('last_purchase_date')}}` |
| `{{macro_datediff_n('column', 'unit')}}` | Configurable time unit | `{{macro_datediff_n('signup_date', 'months')}}` |

### Why macros matter

During ML training, the model creates historical snapshots at different points in time. Direct date functions like `current_date()` would evaluate at query time, making every snapshot use today's date instead of the snapshot date. This corrupts the training data and produces a model that cannot generalize.

## Confirmation Flow

Before writing propensity YAML, confirm all four with the user:

1. **Label**: What binary outcome? (e.g., "did the user churn within 30 days?")
2. **Prediction window**: How far ahead? (e.g., 30 days, 90 days)
3. **Eligible users**: Which users qualify for scoring? (e.g., "active in last 60 days")
4. **Output names**: What should the output model and score column be called?

## Validation

After generating the YAML:

1. Call `validate_propensity_model_config()` to check structural correctness.
2. Call `evaluate_eligible_user_filters()` to verify the eligible-user filter returns a reasonable population.
3. Run `pb compile` to catch any remaining issues.
