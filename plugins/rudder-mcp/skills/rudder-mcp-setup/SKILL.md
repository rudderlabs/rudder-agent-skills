---
name: rudder-mcp-setup
description: Configures Claude Code to connect to RudderStack's MCP server. Use when setting up MCP for rudderstack, connecting claude to rudderstack, or configuring rudder-mcp-server
allowed-tools: "Bash(which, npx), Read, Write, Edit"
---

# RudderStack MCP Setup

Configure Claude Code to connect to RudderStack's hosted MCP server at `mcp.rudderstack.com`.

## Setup Workflow

```
1. Check Prerequisites ──► which npx
         │
         ├── Found ──► Choose Configuration Method
         │
         └── Not Found ──► Install Node.js first

2. Choose Method
         │
         ├── Option A: /mcp command (recommended)
         │
         └── Option B: Manual configuration

3. Verify Connection ──► Restart Claude, test MCP tools
```

## Step 1: Check Prerequisites

```bash
which npx
```

**If found:** Continue to Step 2.

**If not found:** Install Node.js first from https://nodejs.org/ (includes npx).

## Step 2: Choose Configuration Method

### Option A: Using /mcp Command (Recommended)

The `/mcp` command provides an interactive way to configure MCP servers:

```
/mcp add rudderstack
```

Follow the prompts to configure:
1. Server name: `rudderstack`
2. Transport type: `http` (via mcp-remote)
3. URL: Choose based on auth method (see below)

### Option B: Manual Configuration

Edit your Claude Code settings file directly.

#### Settings File Locations

| Platform | Path |
|----------|------|
| macOS | `~/.claude/settings.json` |
| Linux | `~/.claude/settings.json` |
| Windows | `%APPDATA%\claude\settings.json` |

#### Choose Authentication Method

| Auth Method | Endpoint URL | When to Use |
|-------------|--------------|-------------|
| OAuth | `https://mcp.rudderstack.com/mcp` | Recommended for interactive use |
| Bearer Token | `https://mcp.rudderstack.com/bearer-auth-mcp` | For API token authentication |
| Basic Auth | `https://mcp.rudderstack.com/basic-auth-mcp` | For username/password auth |

#### Add MCP Server Configuration

Add to your settings file under `mcpServers`:

```json
{
  "mcpServers": {
    "rudderstack": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.rudderstack.com/mcp"]
    }
  }
}
```

For bearer token authentication:

```json
{
  "mcpServers": {
    "rudderstack": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.rudderstack.com/bearer-auth-mcp"],
      "env": {
        "MCP_BEARER_TOKEN": "${RUDDERSTACK_ACCESS_TOKEN}"
      }
    }
  }
}
```

## Step 3: Verify Connection

### Restart Claude Code

After configuration, restart Claude Code for changes to take effect:
- Close and reopen the Claude Code terminal
- Or restart the Claude Code application

### Test MCP Connection

Ask Claude to list your RudderStack resources:

```
List my RudderStack sources
```

**If connected:** Claude will show your workspace sources.

**If not connected:** You'll see an error about MCP server unavailability.

### Check Available Tools

When connected, these MCP tools become available:
- `list_sources`, `get_source`
- `list_destinations`, `get_destination`
- `list_transformations`, `upsert_transformation`
- `list_tracking_plans`, `list_data_catalog_events`
- And 50+ more (see `/rudder-mcp-workflow` for full catalog)

## Credential Security

- OAuth flow is recommended - no tokens to manage
- For bearer token: use environment variables, never hardcode
- Token is tied to your RudderStack workspace
- MCP server does not store credentials - authenticates per request

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `npx: command not found` | Install Node.js from https://nodejs.org/ |
| MCP server not responding | Check network; verify mcp.rudderstack.com is accessible |
| Authentication failed | Re-authenticate; check token is valid |
| Tools not appearing | Restart Claude Code; check settings file syntax |
| `mcp-remote` errors | Run `npx -y mcp-remote --help` to verify it works |

## Network Requirements

The MCP server requires outbound HTTPS access to:
- `mcp.rudderstack.com` (port 443)

If behind a corporate proxy, ensure this domain is allowed.

## Next Steps

After setup completes:
- Run `/rudder-environment-check` to verify full environment
- Use `/rudder-mcp-workflow` for MCP-based workflows
- Try: "List my RudderStack sources" to verify connection
