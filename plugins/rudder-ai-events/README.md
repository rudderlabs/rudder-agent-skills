# rudder-ai-events

Skills for adding RudderStack AI events to an existing app with the Node.js, Python or Go SDK: find the AI surfaces, plan them in an `ai-events.md` file, add the instrumentation, and verify the events locally.

## What's included

- `rudder-ai-events-instrument`: Adds RudderStack AI events code from an approved ai-events.md plan: installs @rudderstack/ai, rudderstack-ai or ai-sdk-go, wraps model clients and MCP servers, opens interactions and tasks, wires feedback and browser events.
- `rudder-ai-events-setup`: Onboards an app to RudderStack AI events, including moving existing RudderStack LLM, chat or agent events to them: discovers chat, agent, browser and MCP surfaces and drafts ai-events.md.
- `rudder-ai-events-verify`: Verifies RudderStack AI events locally and checks a move from existing RudderStack events: validates captures against the v0.4 schema, joins, switches and legacy events.

## Install

```
/plugin marketplace add rudderlabs/rudder-agent-skills
/plugin install rudder-ai-events@rudder-agent-skills
```

To pick single skills instead, or to use another agent such as Cursor, use the Skills CLI: `npx skills add rudderlabs/rudder-agent-skills --skill <skill-name>`.

## Data handling

The plugin ships skills only. It stores no data and sends nothing anywhere itself. The tools your agent runs because of these skills use your own RudderStack credentials, so they only see what your account is allowed to see.

## Links

- Repository: https://github.com/rudderlabs/rudder-agent-skills
- Homepage: https://www.rudderstack.com/
- License: MIT
