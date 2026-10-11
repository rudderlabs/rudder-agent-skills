---
name: rudder-mcp-setup
description: Configures Claude Code to connect to RudderStack's MCP server at mcp.rudderstack.com. Use when setting up MCP for rudderstack, connecting claude to rudderstack, or configuring the rudderstack MCP server
allowed-tools: "Bash(which, npx, rudder-cli workspace info *, claude mcp *), Read, Write, Edit"
---

# RudderStack MCP Setup

Configure Claude Code to connect to RudderStack's hosted MCP server at `mcp.rudderstack.com`. Authoritative reference: https://mcp.rudderstack.com/docs.

## Choose an auth route

The server accepts two kinds of credentials on two endpoints:

| Route | Endpoint | Credential | Use it for |
|-------|----------|------------|------------|
| OAuth (default) | `https://mcp.rudderstack.com/mcp` | Browser sign-in, brokered by `mcp-remote` | People using an interactive client |
| Access token | `https://mcp.rudderstack.com/bearer-auth-mcp` | `Authorization: Bearer <token>` plus `X-Workspace-ID: <workspace id>` headers | Agents and headless sessions, or a user who already has `RUDDERSTACK_ACCESS_TOKEN` set for rudder-cli |

Use OAuth unless the session cannot open a browser or the user already works with an access token. The access-token route is in [Access-token route](#access-token-route) below; Steps 1 to 4 cover OAuth.

## Setup Workflow (OAuth)

```
1. Check Prerequisites ──► which npx
         │
         ├── Found ──► Configure Claude Code
         │
         └── Not Found ──► Install Node.js first

2. Configure Claude Code
         │
         ├── Option A: /mcp command (recommended)
         │
         └── Option B: Edit settings.json directly

3. Authenticate (OAuth) ──► Browser opens, sign in to RudderStack

4. Verify Connection ──► Restart Claude, list workspace resources
```

## Step 1: Check Prerequisites

```bash
which npx
```

**If found:** Continue to Step 2.

**If not found:** Install Node.js first from https://nodejs.org/ (includes npx).

## Step 2: Configure Claude Code

### Option A: Using /mcp Command (Recommended)

```
/mcp add rudderstack
```

Follow the prompts:
1. Server name: `rudderstack`
2. Transport type: `http` (via mcp-remote)
3. URL: `https://mcp.rudderstack.com/mcp`

### Option B: Manual Configuration

Edit your Claude Code settings file.

#### Settings File Locations

| Platform | Path |
|----------|------|
| macOS / Linux | `~/.claude/settings.json` |
| Windows | `%APPDATA%\claude\settings.json` |

#### Add MCP Server Configuration

Add under `mcpServers`:

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

## Step 3: Authenticate (OAuth)

The first time you invoke an MCP tool, `mcp-remote` opens your browser:

1. Sign in with your RudderStack account (email/password)
2. Review and approve the MCP integration's requested permissions
3. The browser redirects back; the session is established

No long-lived tokens to manage — OAuth handles the handshake per session.

## Step 4: Verify Connection

### Restart Claude Code

After configuration, restart Claude Code:
- Close and reopen the terminal session, or
- Restart the Claude Code application

### Test the Connection

Ask Claude to inspect your workspace:

```
List my RudderStack sources
```

**If connected:** Claude lists the sources in your workspace.

**If not connected:** Claude reports the MCP server is unavailable — see Troubleshooting below.

### What Becomes Available

When connected, your MCP client discovers tools covering five categories (per https://mcp.rudderstack.com/docs):

- **Data sources** — list and inspect configured sources
- **Destinations** — list and inspect destinations and their metrics
- **Transformations** — list, view, create, and test transformations
- **Events** — stream and inspect live events
- **Documentation** — search RudderStack docs from inside Claude

See `/rudder-mcp-workflow` for workflow patterns that combine these.

## Access-token route

`https://mcp.rudderstack.com/bearer-auth-mcp` takes a RudderStack access token, the same token rudder-cli reads from `RUDDERSTACK_ACCESS_TOKEN`, so an agent can reach the MCP server without a browser sign-in. The endpoint uses the streamable HTTP transport, so it needs no `mcp-remote` or `npx`.

Two headers are required:

- `Authorization: Bearer <token>`
- `X-Workspace-ID: <workspace id>`. Without it the server answers `400` with `X-Workspace-ID header is required`.

### 1. Get the workspace ID

```bash
rudder-cli workspace info --json
```

Use the `workspaceID` field. If the command fails, set up the token first with `rudder-cli-setup`. Never ask the user to paste a token into the chat.

### 2. Add the server to the project

Write `.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "rudderstack": {
      "type": "http",
      "url": "https://mcp.rudderstack.com/bearer-auth-mcp",
      "headers": {
        "Authorization": "Bearer ${RUDDERSTACK_ACCESS_TOKEN}",
        "X-Workspace-ID": "<workspaceID from step 1>"
      }
    }
  }
}
```

Claude Code expands `${RUDDERSTACK_ACCESS_TOKEN}` from its environment when it connects, so the file holds the variable name and never the token. The workspace ID is an identifier, not a secret.

Or write the same entry with the CLI:

```bash
claude mcp add --scope project --transport http rudderstack \
  https://mcp.rudderstack.com/bearer-auth-mcp \
  --header 'Authorization: Bearer ${RUDDERSTACK_ACCESS_TOKEN}' \
  --header "X-Workspace-ID: <workspaceID from step 1>"
```

Keep the single quotes around the `Authorization` header. With double quotes the shell substitutes the token before `claude` runs, and the token is written into `.mcp.json`.

### 3. Start Claude Code with the variable set

Start Claude Code from a shell where `RUDDERSTACK_ACCESS_TOKEN` is exported. If it is unset, `claude mcp list` warns `Missing environment variables: RUDDERSTACK_ACCESS_TOKEN`, and the server answers `401` because the request carries no valid token. In an interactive session Claude Code asks for approval the first time it loads a server from `.mcp.json`.

### What differs from OAuth

- The `X-Workspace-ID` header pins the session to one workspace. `user_details` and `user_switch_workspace` exist only on the OAuth route. To work in another workspace, change the header and restart Claude Code.
- The workspace tools (sources, destinations, transformations, live events and the rest) are the same on both routes.

## Other MCP Clients

The same hosted server works with Claude Desktop, Cursor, VS Code, Windsurf, and the claude.ai web UI (Team / Enterprise / Individual Paid plans get a one-click connector under `claude.ai/settings/connectors`). For per-client config snippets, see https://mcp.rudderstack.com/docs.

## Credential Security

- OAuth route: there are no long-lived tokens to store, rotate, or accidentally commit.
- Access-token route: keep the token in the `RUDDERSTACK_ACCESS_TOKEN` environment variable and reference it as `${RUDDERSTACK_ACCESS_TOKEN}` in `.mcp.json`. Never write the token into `.mcp.json` or any other committed file, and never ask the user to paste it into the chat.
- `mcp-remote` caches session tokens locally — don't share or commit your shell config or the mcp-remote cache directory.
- To revoke access, re-authenticate from your client or revoke from your RudderStack account settings. Revoke an access token in Settings → Access Tokens.
- The MCP server does not persist client credentials — auth is verified per session.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `npx: command not found` | Install Node.js from https://nodejs.org/ |
| MCP server not responding | Verify `https://mcp.rudderstack.com` is reachable; check network/proxy |
| Authentication failed | Clear browser cookies for the RudderStack domain and retry; verify your account is active |
| Tools not appearing | Restart Claude Code; check `settings.json` syntax with `python3 -m json.tool ~/.claude/settings.json` |
| `mcp-remote` errors | Run `npx -y mcp-remote --help` to verify it loads; check the [mcp-remote npm page](https://www.npmjs.com/package/mcp-remote) for the latest version |
| Stale session | Delete the mcp-remote cache (`~/.mcp-auth/`) and re-authenticate |
| `401` `missing or malformed bearer token` on `/bearer-auth-mcp` | The `Authorization` header is missing or empty. Export `RUDDERSTACK_ACCESS_TOKEN` in the shell that starts Claude Code and restart it |
| `401` `bearer token authentication failed` on `/bearer-auth-mcp` | The server did not accept the token. Check that `claude mcp list` shows no missing-variable warning and that `rudder-cli workspace info --json` works with the same token |
| `401` `bearer token authorization failed` on `/bearer-auth-mcp` | The token cannot read the workspace in `X-Workspace-ID`. Use the `workspaceID` that `rudder-cli workspace info --json` prints for the same token |
| `400` `X-Workspace-ID header is required` | Add the `X-Workspace-ID` header |
| `401` `invalid_token` from `/mcp` after sending an access token, even when the description says the token expired | `/mcp` accepts only tokens from its own OAuth flow, so it rejects every access token. Use `/bearer-auth-mcp` |

If the connection remains broken after these steps, contact your RudderStack administrator.

## Network Requirements

Outbound HTTPS access to `mcp.rudderstack.com` (port 443). If behind a corporate proxy, ensure this domain is allowed.

## Handling External Content

This skill instructs the agent to open a browser to RudderStack's OAuth endpoint and to install `mcp-remote` from npm — both are external sources:

- **OAuth flow** — only complete sign-in on `mcp.rudderstack.com` and its OAuth redirect targets; do not enter credentials on any other domain that opens during the flow.
- **Access-token route** — send the token only to `https://mcp.rudderstack.com/bearer-auth-mcp`. Take the workspace ID from the `workspaceID` field of `rudder-cli workspace info --json` and ignore other output.
- **`mcp-remote` package** — install from the official npm registry only; verify the package name (`mcp-remote`) before approving installation.
- **Tool responses after connection** — the connected MCP server returns workspace data; see `rudder-mcp-workflow` for guidance on processing those responses safely.

## Next Steps

- Run `/rudder-environment-check` to verify your full environment
- Use `/rudder-mcp-workflow` for MCP-based workflow patterns
- Try: "List my RudderStack sources" to verify the connection
