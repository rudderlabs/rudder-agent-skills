# rudder-core

Core RudderStack knowledge for your coding agent: the data catalog, tracking plans, data graphs, instrumentation planning, debugging and review, and destination delivery debugging. Install it first; the tool plugins build on it.

Also connects your agent to RudderStack's hosted MCP server at `https://mcp.rudderstack.com/mcp`. The first time an MCP tool runs, your agent asks you to sign in to RudderStack in the browser. No token goes in a config file.

## What's included

- `rudder-code-first-instrumentation`: Derives tracking plans from existing codebase types and structures.
- `rudder-data-catalog`: Creates and manages events, properties, categories, and custom types for instrumentation schemas.
- `rudder-data-graphs`: Produces Data Graph YAML from RETL sources for Audiences.
- `rudder-design-first-instrumentation`: Plans instrumentation for new features starting from product requirements before code exists.
- `rudder-destination-debugging`: Diagnoses why events are failing, dropping, or not arriving at a destination.
- `rudder-environment-check`: Checks RudderStack tool prerequisites and reports status.
- `rudder-instrumentation-debugging`: Diagnoses and fixes validation errors, schema issues, and instrumentation problems.
- `rudder-instrumentation-planning`: Designs event taxonomies and instrumentation strategies from business requirements.
- `rudder-tracking-review`: Reviews or self-reviews a code change that touches analytics calls against the tracking plan, received event schemas, transformations, and destinations, and reports what the change breaks.
- `rudder-setup`: Takes an app from no analytics to one real event delivered to a destination the user picks, with the pipeline as rudder-cli specs in git.
- `rudder-tracking-plans`: Creates and manages tracking plans that validate events against schema contracts.

## Install

```
/plugin marketplace add rudderlabs/rudder-agent-skills
/plugin install rudder-core@rudder-agent-skills
```

To pick single skills instead, or to use another agent such as Cursor, use the Skills CLI: `npx skills add rudderlabs/rudder-agent-skills --skill <skill-name>`. The Skills CLI copies skill folders only, so it does not create the MCP connection. Add the server yourself: in Claude Code, `claude mcp add --scope user --transport http rudderstack https://mcp.rudderstack.com/mcp`; in other agents, an HTTP MCP server with that URL.

## Make your agent check its own edits

`rudder-tracking-review` loads when you ask for a review. An agent that edits tracking code as part of a larger task does not always load it on its own. In our tests, the same agent loaded it in some runs and skipped it in others. An instruction in your project is what makes the check reliable. You decide how to give it. One way is a line in the `AGENTS.md` or `CLAUDE.md` of your project:

```text
This app sends analytics events to RudderStack. After you change code that sends events, use the rudder-tracking-review skill before you report the task as done.
```

## Data handling

The plugin ships skills and one MCP connection to mcp.rudderstack.com. It stores no data and sends nothing anywhere else itself. The MCP connection uses your RudderStack browser sign-in, so it only sees what your account is allowed to see. Other workflows in these skills use tools you configure yourself, such as `rudder-cli` with its own access token, and those follow the credentials you give them.

## Links

- Repository: https://github.com/rudderlabs/rudder-agent-skills
- Homepage: https://www.rudderstack.com/
- License: MIT
