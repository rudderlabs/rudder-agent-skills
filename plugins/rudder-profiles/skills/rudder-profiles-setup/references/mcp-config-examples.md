# MCP Config Examples

Use these examples only as shape references. Prefer the current `profiles-mcp` README if its setup differs.

## Claude Code

Typical flow:

```bash
claude mcp add profiles -- /absolute/path/to/profiles-mcp/.venv/bin/python /absolute/path/to/profiles-mcp/server.py
```

(`claude mcp add <name> -- <command> [args...]` — there are no `--command`/`--arg` flags; everything after `--` is the launch command.)

If the local environment uses a wrapper script, register that instead of hard-coding Python paths.

## Cursor / VS Code

Common MCP config shape:

```json
{
  "mcpServers": {
    "profiles": {
      "command": "/absolute/path/to/profiles-mcp/.venv/bin/python",
      "args": ["/absolute/path/to/profiles-mcp/server.py"],
      "env": {
        "PROFILES_ENV_FILE": "/absolute/path/to/profiles-mcp/.env"
      }
    }
  }
}
```

## Post-setup checks

- Restart the editor if MCP servers are loaded only at startup.
- Ask the agent to list available Profiles tools.
- Run `pb version`.
- If tools do not appear, re-check absolute paths first.
