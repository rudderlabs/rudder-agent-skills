# rudder-mcp

Skills that connect your coding agent to RudderStack's hosted MCP server at `https://mcp.rudderstack.com/mcp`, and walk it through common workspace tasks with the server's tools.

## What's included

- `rudder-mcp-setup`: adds the server to Claude Code, signs in with OAuth in the browser, and checks the connection by listing sources in a workspace. It also covers the access-token route for headless sessions such as CI.
- `rudder-mcp-workflow`: step-by-step workflows for the MCP tools, such as checking event delivery, reviewing tracking plan violations, testing transformations and building audiences.

## Install

```
/plugin marketplace add rudderlabs/rudder-agent-skills
/plugin install rudder-mcp@rudder-agent-skills
```

## Data handling

The plugin ships skills only. It stores no data and sends nothing anywhere. Your agent talks to `mcp.rudderstack.com` using your own RudderStack sign-in, so the server sees only what your account is allowed to see.

## Links

- Setup guide: https://www.rudderstack.com/docs/ai-features/rudderstack-mcp/connect/
- Docs: https://www.rudderstack.com/docs/ai-features/rudderstack-mcp/
- Repository: https://github.com/rudderlabs/rudder-agent-skills
- License: MIT
