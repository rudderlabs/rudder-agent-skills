# Basic YAML Templates

Replace every bracketed item with real discovered values before writing files.

## `pb_project.yaml`

```yaml
schema_version: 54
connection: [connection_name]
model_folders:
  - models
entities:
  - name: [entity_name]
    id_stitcher: models/profiles.yaml
id_types:
  - name: [id_type_name]
    sql_type: string
```

## `models/inputs.yaml`

```yaml
models:
  - name: [input_model_name]
    model_type: inputs
    table: [database.schema.table]
    timestamp: [timestamp_column]
    ids:
      - name: [id_type_name]
        select: [id_column]
```

## `models/profiles.yaml`

```yaml
models:
  - name: [profiles_model_name]
    model_type: profiles
    entity_key: [entity_name]
    entity_vars:
      - name: [feature_name]
        description: [short_description]
        select: count(*)
        from: ref('[input_model_name]')
```

## Notes

- Use real connection and table names from discovery.
- If a var has `from`, aggregate in `select`.
- Keep the first compile target small.
