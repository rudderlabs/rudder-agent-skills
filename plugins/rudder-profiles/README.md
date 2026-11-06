# rudder-profiles

Skills for building and maintaining RudderStack Profiles projects: set up the toolchain, create a project, understand an existing one, update features and models, and debug compile and run failures.

## What's included

- `rudder-profiles-debug`: Diagnoses RudderStack Profiles compile failures, run failures, and output-quality problems.
- `rudder-profiles-project`: Creates a new RudderStack Profiles project with discovered warehouse resources and validated YAML.
- `rudder-profiles-setup`: Installs and configures the RudderStack Profiles toolchain: profiles-mcp, Profile Builder CLI, and editor MCP wiring.
- `rudder-profiles-understand`: Explains an existing RudderStack Profiles project by reading YAML, model structure, and output metadata.
- `rudder-profiles-update`: Modifies an existing RudderStack Profiles project: features, inputs, id_types, cohorts, feature views, SQL models, optimizations, macros, propensity/attribution, or incremental migration.

## Install

```
/plugin marketplace add rudderlabs/rudder-agent-skills
/plugin install rudder-profiles@rudder-agent-skills
```

To pick single skills instead, or to use another agent such as Cursor, use the Skills CLI: `npx skills add rudderlabs/rudder-agent-skills --skill <skill-name>`.

## Data handling

The plugin ships skills only. It stores no data and sends nothing anywhere itself. Profiles projects connect to your warehouse with credentials you configure, which are separate from your RudderStack sign-in. What your agent can read or write there depends on the permissions of that warehouse role, not on your RudderStack account, so use a role with only the access you intend.

## Links

- Repository: https://github.com/rudderlabs/rudder-agent-skills
- Homepage: https://github.com/rudderlabs/profiles-mcp
- License: MIT
