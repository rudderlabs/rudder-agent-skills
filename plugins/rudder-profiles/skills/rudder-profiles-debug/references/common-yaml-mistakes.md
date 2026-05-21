# Common YAML Mistakes

These cause the majority of Profiles compile failures. Check for these first before investigating deeper.

## Invented Field Names

Do not copy fields from examples unless they are confirmed by the current Profiles schema. Common confusions:

| Wrong | Correct |
|-------|---------|
| `contracts:` | `contract:` |
| `materialized:` | `materialization:` |
| `source:` (for input model) | `table:` |
| `type:` (for entity var) | `model_type:` |

Rule: if you're unsure about a field name, check a working project or `search_profiles_docs()`.

## Missing Aggregation

If an entity var uses `from`, its `select` MUST contain an aggregation function.

```yaml
# WRONG — bare column reference with from
- name: last_event
  select: event_name
  from: ref('input_events')

# CORRECT — aggregated
- name: last_event
  select: last_value(event_name)
  from: ref('input_events')
```

Supported aggregations: `count`, `sum`, `max`, `min`, `avg`, `first_value`, `last_value`.

## Broken Entity Var References

Entity var cross-references require specific quoting: outer single quotes, inner double quotes.

```yaml
# WRONG — all double quotes
- name: avg_order_value
  select: "{{entity.Var(\"total_value\")}}" / nullif("{{entity.Var(\"order_count\")}}", 0)

# WRONG — all single quotes
- name: avg_order_value
  select: '{{entity.Var(''total_value'')}}' / nullif('{{entity.Var(''order_count'')}}', 0)

# CORRECT — outer single, inner double
- name: avg_order_value
  select: '{{entity.Var("total_value")}}' / nullif('{{entity.Var("order_count")}}', 0)
```

## Indentation and Structure

- YAML is whitespace-sensitive. Misaligned keys cause parse errors that point to the wrong line.
- Lists require `- ` prefix. Missing the dash converts a list item to a map key.
- Nested objects under `config:` or `merge:` need consistent indentation.

## Singular vs Plural Field Names

Do not guess from memory. Common traps:

| Context | Correct field name |
|---------|-------------------|
| Project entity list | `entities:` (plural) |
| Single entity var | `entity_key:` (singular) |
| ID type list | `id_types:` (plural) |
| Single ID mapping | `ids:` (plural — it's a list even for one) |
| Model folders | `model_folders:` (plural) |

## Date Functions in Propensity Features

Never use direct date functions in entity vars consumed by propensity models:

- `current_date()`, `current_timestamp()`, `datediff()`, `sysdate`, `getdate()`, `now()`

Use macros instead: `{{macro_datediff('column')}}`, `{{macro_datediff_n('column', 'unit')}}`.
