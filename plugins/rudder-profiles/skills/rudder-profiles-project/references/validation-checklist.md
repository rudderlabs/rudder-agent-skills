# Validation Checklist

Run this review before `pb compile`:

## Project consistency

- `pb_project.yaml` references the right `connection`.
- Every `model_folders` entry exists.
- Entity names and id_types match across files.

## Discovery grounding

- Every table was discovered from MCP or existing project files.
- Every column was confirmed with `describe_table()`.
- No placeholder names remain.

## Profiles rules

- Every `from`-based entity var aggregates in `select`.
- Entity var references use `'{{entity.Var("name")}}'`.
- Date windows are not hard-coded into YAML when runtime flags should control them.

## User confirmation

- The user approved the connection.
- The user approved the tables.
- The user approved IDs and timestamps.
- The user approved the entity and features.
- The user approved the final YAML before files were written.
