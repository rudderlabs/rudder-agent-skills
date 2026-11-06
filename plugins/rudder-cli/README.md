# rudder-cli

Skills for driving `rudder-cli` and `rudder-typer`: install and sign in, validate specs, preview with dry-run, apply changes, import existing resources into git, manage transformations, and generate typed tracking SDKs.

## What's included

- `rudder-cli-setup`: Installs and authenticates rudder-cli.
- `rudder-cli-workflow`: Validates, previews, and applies RudderStack resource changes via YAML specs.
- `rudder-import-and-evolve`: Imports existing RudderStack workspace resources into YAML files for git-based management.
- `rudder-transformations`: Creates and manages RudderStack transformations and libraries with local testing.
- `rudder-typer-workflow`: Generates type-safe SDKs (Swift/Kotlin) from tracking plans with compile-time validation.

## Install

```
/plugin marketplace add rudderlabs/rudder-agent-skills
/plugin install rudder-cli@rudder-agent-skills
```

To pick single skills instead, or to use another agent such as Cursor, use the Skills CLI: `npx skills add rudderlabs/rudder-agent-skills --skill <skill-name>`.

## Data handling

The plugin ships skills only. It stores no data and sends nothing anywhere itself. The tools your agent runs because of these skills use your own RudderStack credentials, so they only see what your account is allowed to see.

## Links

- Repository: https://github.com/rudderlabs/rudder-agent-skills
- Homepage: https://github.com/rudderlabs/rudder-iac
- License: MIT
