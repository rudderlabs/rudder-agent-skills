# Cohorts & Feature Views

These are how Profiles features reach activation. **Feature views** expose the entity table keyed by the id a destination uses (email for an ESP, user_id for a product tool). **Cohorts** are filtered subsets of an entity (e.g. "known users", "power users") that the dashboard syncs to destinations. Shapes verified against the `sample_cohort_project` sample.

## Feature views

Declared under an entity in `pb_project.yaml`. A default feature view keyed on the entity's main id is always created; `using_ids` adds extra views keyed on other id_types so a destination can join on the id it knows.

```yaml
entities:
  - name: users
    id_stitcher: models/id_graph_users
    id_types: [user_id, anonymous_id, email]
    feature_views:
      using_ids:
        - id: user_id
          name: user_id_stitched_features
        - id: email
          name: email_features
```

- Each `using_ids` entry needs `id` (an id_type declared on the entity) and `name` (the view name).
- Use this when an activation/destination keys on something other than the main id — e.g. an email tool joining on `email`.
- No code change to features is needed; feature views only re-key the existing entity output.

## Entity cohorts

A cohort is a model that filters a parent cohort (`<entity>/all`, the full entity) down to a subset, using boolean expressions over **features defined on the parent**.

```yaml
models:
  - name: knownUsers
    model_type: entity_cohort
    model_spec:
      extends: users/all                 # parent cohort — the full entity
      materialization:
        output_type: table               # or view
      filter_pipeline:
        - type: exclude                   # include | exclude, applied in order
          value: "{{ users.Var('id_type_email_count_daily') }} = 0"
```

- `extends:` is `<entity>/all` for a top-level cohort, or another cohort's path to nest.
- `filter_pipeline` is an ordered list of `{type: include|exclude, value: "<sql boolean>"}`. Each `value` is a SQL predicate that may reference a parent feature via `{{ <entity>.Var("var_name") }}`.
- **The features used in filters must exist in the parent's var_group** (`entity_key: <entity>`), not only in the cohort's own group — otherwise the reference won't resolve.

### Computing features on a cohort

A var_group scoped to a cohort uses `entity_cohort:` instead of `entity_key:`. Its vars compute over just the cohort's members:

```yaml
var_groups:
  - name: user_all_vars            # parent group — feeds cohort filters
    entity_key: users
    vars:
      - entity_var:
          name: id_type_email_count_daily
          from: models/id_graph_users
          select: sum(case when other_id_type = 'email' then 1 else 0 end)
  - name: user_known_vars          # cohort-scoped group
    entity_cohort: models/knownUsers
    vars:
      - entity_var:
          name: first_activity_time
          select: min(timestamp)
          from: inputs/rsPages
```

### Selecting cohort features into a feature table

`feature_table_model` materializes a chosen subset of a cohort's features:

```yaml
models:
  - name: user_profiles
    model_type: feature_table_model
    model_spec:
      entity_cohort: models/knownUsers
      features:
        - first_activity_time
        - campaign_name
```

## How they connect to activation

Cohorts and feature views are consumed in the RudderStack **dashboard**: a cohort becomes an audience you sync to a destination (Braze, Mailchimp, etc.) via an auto-created Reverse ETL source; feature views give that sync the right join key. The YAML defines them; activation is wired in the dashboard, not in `pb`.

## Authoring checklist

- Confirm with the user: which subset (cohort filter), and which id the destination joins on (feature view key).
- Every filter feature is defined in the parent `entity_key` var_group.
- Filter `value` expressions are SQL booleans referencing `{{ <entity>.Var("...") }}`.
- `using_ids[].id` is an id_type actually declared on the entity.
- Adding/removing a cohort or feature view does not invalidate entity-var checkpoints, but a re-run is needed to materialize the new objects.
