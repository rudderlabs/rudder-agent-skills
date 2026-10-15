# Running `sources listen` in the Background

`rudder-cli sources listen` is a foreground server, like `python -m http.server` or `nc -l`. After it binds its port, it prints one JSON ready line on stderr. Then it prints each accepted event on stdout and each refused request on stderr, until SIGINT or SIGTERM.

An agent shell call waits for the command to exit. A foreground `sources listen` never exits on its own, so the call hangs until the shell timeout. Three rules prevent this in every agent:

1. Put the process in the background with `&`.
2. Send stdout and stderr to files.
3. Read the files, not the process.

## The Recipe (Any POSIX Shell)

```bash
export RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_SOURCES_LISTEN=true
d=$(mktemp -d)
rudder-cli sources listen --port 0 >"$d/events" 2>"$d/log" &
pid=$!; trap 'kill "$pid" 2>/dev/null' EXIT
until grep -q '^{"ready":true' "$d/log"; do kill -0 "$pid" 2>/dev/null || { cat "$d/log" >&2; exit 1; }; sleep 0.1; done
url=$(grep -m1 '^{"ready":true' "$d/log" | jq -r .url)
```

- The ready line is the first `{"ready":true` line in `$d/log` as soon as the port is bound. Its `pid` equals `$!`. On a non-loopback bind a warning line comes before it.
- The `kill -0` guard ends the loop when the process stopped at startup. The last line of `$d/log` gives the reason. `port_in_use` names `--port 0`. The gate refusal names both environment variables.
- `--port 0` gives every listener its own free port, so several can run at the same time. Listeners share nothing: no state file, no discovery file.
- `$d/events` only grows. To check one action, count before and after it, or start a new listener.

## Stop

```bash
kill "$pid"                                                     # same shell
kill "$(grep -m1 '^{"ready":true' "$d/log" | jq -r .pid)"       # a later shell call
```

SIGTERM and SIGINT finish the requests in progress and exit 0. `sources listen` does not stop on its own. Limit a forgotten server with the `trap` above, or `timeout 30m rudder-cli sources listen ...` where `timeout` exists. The files stay after the process exits.

## Per Agent

| Agent or context | How to run the loop | Where the state is |
|---|---|---|
| Claude Code | the recipe in one Bash call, then later calls with the same `$d` | `$d/events`, `$d/log` |
| Codex CLI and other sandboxes that stop background processes when a call returns | the recipe, the action and the checks in one call | inside the call |
| Cursor, Cline, OpenCode and other agents | the recipe | `$d/events`, `$d/log` |
| A person | `rudder-cli sources listen --port 4321` in its own terminal, piped to `grep` or `jq` as needed | the terminal |
| CI | the recipe inside the job step (`ci.md`) | the step |

## Fixed Port

Use `--port <n>` in these cases:

- The app already targets a fixed data plane URL.
- The app reads the URL at build or start time: Vite `define` and `import.meta.env`, Next.js `NEXT_PUBLIC_*`, a mobile build.
- The server runs in a container behind a port mapping.

Start `sources listen` first. Then set the app environment, and then start or restart the app. A port that is in use fails at once with `port_in_use`. Two listeners never share a port.
