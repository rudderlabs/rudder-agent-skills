# rudderstack-skills

Skills for RudderStack, the agentic CDP that runs on your warehouse. This plugin holds no skills of its own. It depends on the six RudderStack skill plugins, so installing it installs all of them in one step: 27 skills for instrumentation, tracking plans, the CLI, the MCP server, Terraform, Profiles and AI events, plus the connection to RudderStack's hosted MCP server.

## What you get

- `rudder-core`: data catalog, tracking plans, data graphs, instrumentation planning and debugging, destination debugging, and the MCP connection to `https://mcp.rudderstack.com/mcp`.
- `rudder-cli`: driving `rudder-cli` and `rudder-typer`.
- `rudder-mcp`: setting up and using RudderStack's hosted MCP server.
- `rudder-terraform`: managing RudderStack with the Terraform provider.
- `rudder-profiles`: building and maintaining Profiles projects.
- `rudder-ai-events`: adding RudderStack AI events to an app.

## Install everything

```
/plugin marketplace add rudderlabs/rudder-agent-skills
/plugin install rudderstack-skills@rudder-agent-skills
```

The first time an MCP tool runs, your agent asks you to sign in to RudderStack in the browser.

## Install only some

Skip this plugin and install the ones you need, for example:

```
/plugin install rudder-core@rudder-agent-skills
/plugin install rudder-cli@rudder-agent-skills
```

Do not install this plugin and then disable one of its plugins. The umbrella reports an error until the plugin is enabled again. To go from everything to a subset, uninstall `rudderstack-skills`, then run `claude plugin prune -y` or uninstall the plugins you do not want.

For single skills, or another agent such as Cursor, use the Skills CLI: `npx skills add rudderlabs/rudder-agent-skills --skill <skill-name>`.

## Data handling

The plugin ships no code and stores no data. The plugins it installs ship skills, and `rudder-core` adds one MCP connection to mcp.rudderstack.com. Everything your agent does through them uses your own RudderStack sign-in, so it only sees what your account is allowed to see.

## Links

- Repository: https://github.com/rudderlabs/rudder-agent-skills
- Homepage: https://www.rudderstack.com/
- License: MIT
