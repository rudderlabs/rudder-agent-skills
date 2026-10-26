---
name: rudder-environment-check
description: Checks RudderStack tool prerequisites and reports status. Use when checking prerequisites, setup status, what tools are missing, or before running RudderStack workflows for the first time
allowed-tools: "Bash(which, curl, rudder-cli *, terraform *), Read"
---

# RudderStack Environment Check

Quick diagnostic that checks all RudderStack tool prerequisites and provides actionable guidance.

## When to Use

- Before starting with RudderStack workflows
- When troubleshooting "command not found" errors
- To verify your development environment is ready

## Check Process

Run these checks in sequence:

### 1. Check rudder-cli

```bash
# Check if installed
which rudder-cli

# If installed, check authentication
rudder-cli workspace info
```

### 2. Check Terraform (if using terraform workflows)

```bash
# Check if installed
which terraform

# If installed, check version
terraform version

# Check if provider is configured (run in project directory)
terraform providers
```

### 3. Check MCP Server Connectivity

```bash
# Check if hosted MCP server is reachable
curl -s -o /dev/null -w "%{http_code}" https://mcp.rudderstack.com/health
```

### 4. Check the MCP tools

Check that the rudderstack MCP server's tools `list_sources` and `get_source` are available to you. Don't call them. Both routes have them, the OAuth one at `/mcp` and the access-token one at `/bearer-auth-mcp`; `user_details` is on the OAuth route only. They are missing when no RudderStack server is added, when it is disabled, or when the user has not signed in to it.

If they are missing, connect the server that is there before adding one. In Claude Code, `claude mcp list` prints each server's name and URL, and a RudderStack server can have any name; the rudder-core plugin's is `plugin:rudder-core:rudderstack`. If one points at `https://mcp.rudderstack.com/bearer-auth-mcp`, the access-token route, keep it: leave the plugin's entry disabled, and check that `RUDDERSTACK_ACCESS_TOKEN` is exported in the shell Claude Code was started from, because that entry signs in with the token, not with `Authenticate`. If `claude mcp list` shows that entry as disabled, enable it in `/mcp` without choosing `Authenticate`. If it shows it as pending approval, as it does for an entry in the project's `.mcp.json` until the user approves it, start Claude Code again and approve it. Otherwise, if one points at `https://mcp.rudderstack.com/mcp`, type `/mcp`, choose it, enable it if it is disabled, and choose `Authenticate`. If none does, run `claude mcp add --scope user --transport http rudderstack https://mcp.rudderstack.com/mcp`, start Claude Code again and authenticate it the same way. In other agents, add an HTTP MCP server with that URL in the agent's MCP settings and sign in. `rudder-mcp-setup` covers both routes in full.

## Output Format

Present results as a status table:

```
RudderStack Environment Check
─────────────────────────────────────────────────────
Tool                    Status      Action
─────────────────────────────────────────────────────
rudder-cli              ✓ Ready
  └─ authenticated      ✓ Ready     Workspace: <name>
terraform               ✗ Missing   Run: /rudder-terraform-setup
  └─ provider           ─ Skipped   (terraform required first)
mcp.rudderstack.com     ✓ Reachable
  └─ MCP tools          ✓ Ready
─────────────────────────────────────────────────────
```

## Status Indicators

| Status | Meaning |
|--------|---------|
| ✓ Ready | Tool installed and configured |
| ✗ Missing | Tool not found, needs installation |
| ─ Skipped | Dependency not met, check parent first |
| ⚠ Issue | Tool found but configuration problem |

## Next Steps by Status

| Tool Missing | Action |
|--------------|--------|
| rudder-cli | Run `/rudder-cli-setup` or ask "help me install rudder-cli" |
| terraform | Run `/rudder-terraform-setup` or ask "help me setup terraform for rudderstack" |
| MCP unreachable | Check network connectivity to `mcp.rudderstack.com` |
| MCP tools missing | Connect the server that is there, as step 4 says, and add one only when there is none |

## Credential Security

- This skill only checks tool availability and authentication status
- Never logs or displays access tokens
- Workspace info shows only workspace name/ID, not credentials
