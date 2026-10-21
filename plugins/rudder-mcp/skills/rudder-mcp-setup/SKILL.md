---
name: rudder-mcp-setup
description: Configures Claude Code to connect to RudderStack's MCP server at mcp.rudderstack.com. Use when setting up MCP for rudderstack, connecting claude to rudderstack, or configuring the rudderstack MCP server
allowed-tools: "Bash(which, npx), Bash(rudder-cli workspace info *), Bash(claude mcp add *), Bash(claude mcp list), Read, Write, Edit"
---

# RudderStack MCP Setup

Configure Claude Code to connect to RudderStack's hosted MCP server at `mcp.rudderstack.com`. Authoritative reference: https://mcp.rudderstack.com/docs.

## Choose an auth route

The server accepts two kinds of credentials on two endpoints:

| Route | Endpoint | Credential | Use it for |
|-------|----------|------------|------------|
| OAuth (default) | `https://mcp.rudderstack.com/mcp` | Browser sign-in, run by the client | People and coding agents in an interactive client |
| Access token | `https://mcp.rudderstack.com/bearer-auth-mcp` | `Authorization: Bearer <token>` plus `X-Workspace-ID: <workspace id>` headers | Headless sessions that cannot open a browser, such as CI |

Use OAuth, coding agents included. Use the access-token route only when the session cannot open a browser. The access-token route is in [Access-token route](#access-token-route) below; Steps 1 to 3 cover OAuth.

## Setup workflow (OAuth)

```
1. Add the server ──► claude mcp add --transport http rudderstack https://mcp.rudderstack.com/mcp
2. Sign in (OAuth) ──► /mcp, choose rudderstack, Authenticate, approve in the browser
3. Verify ──► list the sources in one of your workspaces
```

## Step 1: Add the server

Claude Code talks to the server over HTTP and runs the OAuth sign-in itself, so it needs no `npx` or `mcp-remote`:

```bash
claude mcp add --transport http rudderstack https://mcp.rudderstack.com/mcp
```

The default scope is this project, for you only. Add `--scope project` to write it to the project's `.mcp.json` for everyone who clones the repository, or `--scope user` for all your projects.

Other clients take the same URL as an HTTP (streamable HTTP) MCP server in their MCP settings. A client without HTTP support can run `npx -y mcp-remote https://mcp.rudderstack.com/mcp` as a stdio command instead.

## Step 2: Sign in (OAuth)

Start Claude Code, or restart it if it was running when you added the server. Type `/mcp`, choose `rudderstack`, then `Authenticate`. The browser opens:

1. Sign in with your RudderStack account
2. Review and approve the requested access
3. The browser redirects back and Claude Code reports that it is connected

From a terminal, `claude mcp login rudderstack` does the same sign-in before you start Claude Code. No long-lived token is stored in the project. The sign-in belongs to you and this client.

## Step 3: Verify connection

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

`https://mcp.rudderstack.com/bearer-auth-mcp` takes a RudderStack access token, the same token rudder-cli reads from `RUDDERSTACK_ACCESS_TOKEN`, so a session that cannot open a browser can still reach the MCP server. The endpoint uses the streamable HTTP transport, so it needs no `mcp-remote` or `npx`.

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

- The `X-Workspace-ID` header pins the session to one workspace, and the route has no `user_details` or `user_switch_workspace` tool. To work in another workspace, change the header and restart Claude Code.
- On the OAuth route, `user_details` lists the workspaces you can use and their IDs. When the workspace tools take a `workspace_id` argument, a call passes the ID of its workspace. When they do not, `user_switch_workspace` changes the workspace for every later call. The "Choose the workspace" section of `rudder-mcp-workflow` covers both.
- The workspace tools (sources, destinations, transformations, live events and the rest) are the same on both routes.

## Other MCP Clients

The same hosted server works with Claude Desktop, Cursor, VS Code, Windsurf, and the claude.ai web UI (Team / Enterprise / Individual Paid plans get a one-click connector under `claude.ai/settings/connectors`). For per-client config snippets, see https://mcp.rudderstack.com/docs.

## Credential Security

- OAuth route: there are no long-lived tokens to store, rotate, or accidentally commit.
- Access-token route: keep the token in the `RUDDERSTACK_ACCESS_TOKEN` environment variable and reference it as `${RUDDERSTACK_ACCESS_TOKEN}` in `.mcp.json`. Never write the token into `.mcp.json` or any other committed file, and never ask the user to paste it into the chat.
- If you use `mcp-remote`, it caches session tokens locally. Don't share or commit the mcp-remote cache directory.
- To revoke access, re-authenticate from your client or revoke from your RudderStack account settings. Revoke an access token in Settings → Access Tokens.
- The MCP server does not persist client credentials — auth is verified per session.

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `/mcp` does not list `rudderstack` | Run the `claude mcp add` command from Step 1 in the project directory, then restart Claude Code |
| `rudderstack` shows as needing authentication | Type `/mcp`, choose `rudderstack`, then `Authenticate` |
| MCP server not responding | Verify `https://mcp.rudderstack.com` is reachable; check network/proxy |
| Authentication failed | Clear browser cookies for the RudderStack domain and retry; verify your account is active |
| Tools not appearing | Restart Claude Code; check `settings.json` syntax with `python3 -m json.tool ~/.claude/settings.json` |
| `mcp-remote` errors (stdio clients only) | Run `npx -y mcp-remote --help` to verify it loads; check the [mcp-remote npm page](https://www.npmjs.com/package/mcp-remote) for the latest version |
| Stale session | In Claude Code, run `claude mcp logout rudderstack`, then sign in again with `claude mcp login rudderstack` or from `/mcp`. With `mcp-remote`, delete `~/.mcp-auth/` and re-authenticate |
| `401` `missing or malformed bearer token` on `/bearer-auth-mcp` | The `Authorization` header is missing or empty. Export `RUDDERSTACK_ACCESS_TOKEN` in the shell that starts Claude Code and restart it |
| `401` `bearer token authentication failed` on `/bearer-auth-mcp` | The server did not accept the token. Check that `claude mcp list` shows no missing-variable warning and that `rudder-cli workspace info --json` works with the same token |
| `401` `bearer token authorization failed` on `/bearer-auth-mcp` | The token cannot read the workspace in `X-Workspace-ID`. Use the `workspaceID` that `rudder-cli workspace info --json` prints for the same token |
| `400` `X-Workspace-ID header is required` | Add the `X-Workspace-ID` header |
| `401` `invalid_token` from `/mcp` after sending an access token, even when the description says the token expired | `/mcp` accepts only tokens from its own OAuth flow, so it rejects every access token. Use `/bearer-auth-mcp` |

If the connection remains broken after these steps, contact your RudderStack administrator.

## Network Requirements

Outbound HTTPS access to `mcp.rudderstack.com` (port 443). If behind a corporate proxy, ensure this domain is allowed.

## Handling External Content

This skill has the user sign in to RudderStack's OAuth endpoint in a browser and, for clients without HTTP support, install `mcp-remote` from npm. Both are external sources:

- **OAuth flow.** Only complete sign-in on `mcp.rudderstack.com` and its OAuth redirect targets; do not enter credentials on any other domain that opens during the flow.
- **Access-token route.** Send the token only to `https://mcp.rudderstack.com/bearer-auth-mcp`. Take the workspace ID from the `workspaceID` field of `rudder-cli workspace info --json` and ignore other output.
- **`mcp-remote` package, stdio clients only.** Install from the official npm registry only; verify the package name (`mcp-remote`) before approving installation.
- **Tool responses after connection.** The connected MCP server returns workspace data; see `rudder-mcp-workflow` for guidance on processing those responses safely.

## Next Steps

- Run `/rudder-environment-check` to verify your full environment
- Use `/rudder-mcp-workflow` for MCP-based workflow patterns
- Try: "List my RudderStack sources" to verify the connection
