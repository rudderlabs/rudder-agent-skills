# Attribution YAML Template

Attribution models compute first-touch and last-touch credit for conversions across user→campaign journeys. They are PyNative models (`model_type: attribution`) shipped in `profiles_mlcorelib`. Schema verified against `profiles-mlcorelib` (`py_native/attribution_report.py` `BuildSpecSchema` + `samples/attribution_project`).

## Prerequisites (build these first)

1. A separate **campaign** entity in `pb_project.yaml` with its own id_types (campaign joins to a different entity than user).
2. A **`campaign_id_graph`** id_stitcher model for the campaign entity.
3. Campaign entity_vars for the campaign start/end dates.
4. `python_requirements: - profiles_mlcorelib>=0.8.1` in `pb_project.yaml`.

## Confirmation flow

Before writing the model, confirm with the user:

1. **Conversion event(s)** — what outcome is attributed (orders, signups, subscriptions)? Multiple are supported.
2. **Conversion timing & value** — for each conversion: which user entity_var holds the conversion timestamp, and (optional) which holds the value (revenue/MRR).
3. **Attribution window** — how long after a touchpoint can a conversion still be credited (e.g. `"30d"`)?
4. **Touchpoints** — which input/SQL models capture the user↔campaign interactions (marketing pages, ad clicks).
5. **Campaign data** — campaign start/end date vars, and any cost/impression/click facts to report.

## `models/attribution.yaml`

```yaml
models:
  # Campaign entity needs its own id_stitcher (separate from the user id_stitcher).
  - name: campaign_id_graph
    model_type: id_stitcher
    model_spec:
      validity_time: 24h
      entity_key: campaign
      edge_sources:
        - from: inputs/[campaign_history_source]
        - from: inputs/[marketing_pages_source]

  - name: [attribution_report_name]
    model_type: attribution
    model_spec:
      entity_key: user
      conversion:                          # required: touchpoints + conversion_vars
        touchpoints:                        # the user-journey events
          - from: models/[marketing_sql_model]
            where: date(timestamp) > {{user.Var('[first_touch_date_var]')}}
          - from: inputs/[marketing_pages]
            where: date(timestamp) > {{user.Var('[first_touch_date_var]')}}
        conversion_vars:                    # one per outcome; required: name + timestamp
          - name: [conversion_1]            # e.g. sf_order
            timestamp: user.Var('[conversion_time_var]')
            value: user.Var('[conversion_value_var]')   # optional → adds a *_value column
            conversion_window: "30d"        # optional; default = no limit
          - name: [conversion_2]
            timestamp: user.Var('[other_conversion_time_var]')
      campaign:                            # required
        entity_key: campaign
        campaign_start_date: [campaign_start_date_var]   # a campaign entity_var NAME
        campaign_end_date: [campaign_end_date_var]
        campaign_vars:                      # optional: campaign entity_vars reported as columns
          - [fb_ads_impressions_var]
          - [google_ads_clicks_var]
        campaign_details:                   # optional: per-day campaign facts from raw sources
          - cost:
              - from: inputs/[google_ads_stats]
                date: date
                select: sum(cost_micros / 1000000)
              - from: inputs/[fb_basic_campaign]
                date: date
                select: sum(spend)
          - impressions:
              - from: inputs/[google_ads_stats]
                date: date
                select: sum(impressions)
```

## What it produces

For each `conversion_vars[N]`, the model emits both **first-touch** and **last-touch** attribution:

- `<conversion_name>_first_touch`, `<conversion_name>_last_touch` — conversions credited
- `<conversion_name>_first_touch_value`, `<conversion_name>_last_touch_value` — only if `value:` was set
- plus the `campaign_vars` columns and `campaign_details` facts, grouped by date and campaign.

## Critical rules

- **The campaign entity needs its own `id_stitcher`** — attributing to a campaign entity without one fails compile (`entity not found: campaign`).
- **`campaign_start_date` / `campaign_end_date` are entity_var NAMES on the campaign entity**, not date literals. If you don't have real dates, build campaign entity_vars that default sensibly.
- **`conversion_vars[*].timestamp` is a `user.Var('...')` reference**, not a column name — the model needs to know when each user converted, and conversion timing lives on the user entity.
- **`conversion_window` is a string duration** (`"30d"`), not an integer.
- **The schema is `additionalProperties: False`** under `conversion:` and `campaign:` — unknown fields are rejected. Required: `conversion.{touchpoints, conversion_vars}`, each `conversion_vars` item `{name, timestamp}`, and `campaign`.
- Don't over-filter touchpoints — a `where:` that excludes most users yields an empty report; verify touchpoint counts with `run_query()` first.

## Common mistakes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Missing `campaign_id_graph` id_stitcher | `entity not found: campaign` at compile | Add the id_stitcher first |
| String literal for `campaign_start_date` | Type error | Use a campaign entity_var name |
| Column name for `conversion_vars[*].timestamp` | Compile error / empty results | Use `user.Var('var_name')` |
| `conversion_window` as integer `30` | Validation error | Use `"30d"` |
| Touchpoint `where:` excludes most users | Empty report | Loosen the filter; verify with a touchpoint count |
