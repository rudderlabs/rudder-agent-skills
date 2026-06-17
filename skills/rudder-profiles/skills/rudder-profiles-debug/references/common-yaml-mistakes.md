# Common YAML Mistakes

These cause the majority of Profiles compile failures. Check for these first before investigating deeper. pb uses strict YAML unmarshalling — unknown fields fail compile, so never guess field names.

## Invented / Wrong Field Names

| Wrong | Correct |
|-------|---------|
| `contracts:` | `contract:` |
| `materialized:` | `materialization:` |
| `source:` / `timestamp:` (input model) | `app_defaults.table:` / `app_defaults.occurred_at_col:` |
| `models:` as the top key of inputs.yaml | `inputs:` |
| `model_type: inputs` | (none — inputs live under the `inputs:` key, not as a model type) |
| `model_type: profiles` + flat `entity_vars:` | `var_groups:` → `vars:` → items nested under `entity_var:` |
| `default:` (entity var) | `default_value:` |
| `sql_type:` (id_type) | (none — id_types take `name`, `extends`, `filters`) |
| `merge: { type: sum }` | `merge: sum({{rowset.<var>}})` — a SQL expression string |

Rule: if you're unsure about a field name, check a working project or `search_profiles_docs()`.

## `ref('...')` Does Not Exist

`from:` takes a model path: `inputs/<input_name>` or `models/<model_name>`. `ref('...')` is dbt syntax — pb cannot resolve it.

```yaml
# WRONG — dbt syntax
from: ref('orders')

# CORRECT
from: inputs/orders     # or models/<name>
```

## Missing Aggregation

If an entity var uses `from`, its `select` MUST contain an aggregation function.

```yaml
# WRONG — bare column reference with from
- entity_var:
    name: last_event
    select: event_name
    from: inputs/input_events

# CORRECT — aggregated; order-dependent aggregations need a window
- entity_var:
    name: last_event
    select: last_value(event_name)
    from: inputs/input_events
    window:
      order_by:
        - timestamp asc
```

Common aggregations: `count`, `sum`, `max`, `min`, `avg`, `first_value`, `last_value`. Project-defined macros also available: `{{array_agg(col)}}`, `{{list_agg(col, ',')}}`, `{{min_by(col, ts)}}` (verify in `models/macros.yaml`).

## Wrong `merge:` Shape

`merge:` is a SQL expression string over `{{rowset.<var_name>}}`, not a structured object.

```yaml
# WRONG — invented structured form
merge:
  type: sum

# WRONG — COUNT merged with count() silently undercounts (counts checkpoint rows)
merge: count({{rowset.event_count}})

# CORRECT — counts accumulate by summing
merge: sum({{rowset.event_count}})
```

## Broken Entity Var References

The first segment is the **entity's name** from `pb_project.yaml` (e.g. `user`), not the literal word `entity`. Quote the whole `select:` with outer single quotes and use inner double quotes inside `Var(...)`.

```yaml
# WRONG — literal "entity" instead of the entity's name
- entity_var:
    name: avg_order_value
    select: '{{entity.Var("total_value")}} / nullif({{entity.Var("order_count")}}, 0)'

# WRONG — quoting each template fragment separately breaks YAML parsing
- entity_var:
    name: avg_order_value
    select: "{{user.Var(\"total_value\")}}" / nullif("{{user.Var(\"order_count\")}}", 0)

# CORRECT — entity name, whole select single-quoted, inner double quotes
- entity_var:
    name: avg_order_value
    select: '{{user.Var("total_value")}} / nullif({{user.Var("order_count")}}, 0)'
```

The shorthand `{{user.total_value}}` is also valid. A derived var like this (computed only from other entity_vars) takes no `from:` key.

## Indentation and Structure

- YAML is whitespace-sensitive. Misaligned keys cause parse errors that point to the wrong line.
- Lists require `- ` prefix. Missing the dash turns a list item into a map key.
- Remember the extra nesting level: `var_groups:` → `vars:` → `- entity_var:` → fields.

## Singular vs Plural Field Names

| Context | Correct field name |
|---------|-------------------|
| Project entity list | `entities:` (plural) |
| Single var's entity | `entity_key:` (singular) |
| ID type list | `id_types:` (plural) |
| Single ID mapping | `ids:` (plural — a list even for one) |
| Model folders | `model_folders:` (plural) |

## Date Functions in Propensity Features

Never use direct date functions in entity vars consumed by propensity models:

- `current_date()`, `current_timestamp()`, `datediff()`, `sysdate`, `getdate()`, `now()`

Use the conventional project-defined macros instead: `{{macro_datediff('column')}}` (days between column and `end_time`) and `{{macro_datediff_n('column', N)}}` (boolean "within N days" — `N` is an integer day count, not a unit string). Confirm these exist in `models/macros.yaml`; they are not pb built-ins.
