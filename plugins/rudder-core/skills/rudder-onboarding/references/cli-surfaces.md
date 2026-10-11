# CLI surfaces, with fallbacks

Four rudder-cli features that this skill uses are not in a release as of v0.28.0. This file says what each one does on its pull request branch and how to work without it.

How this was checked. The JSON shapes and the exit-code table were read from the branches in rudder-iac, and the branches were built and run. `validate --json` was run against a webhook project. `apply --dry-run --json` and the exit codes were run on the exit-codes build against a stub API that answers only the workspace and list calls. Nothing was applied to a real workspace. The `dev listen` and `dev events` commands were run on the `#936` build. Re-check against the release you have, because these branches can still change.

## Probing for each feature

```bash
rudder-cli validate --help 2>&1 | grep -q -- '--json'        && echo validate-json
rudder-cli apply --help    2>&1 | grep -q -- '--json'        && echo apply-json
rudder-cli --help          2>&1 | grep -qi 'exit codes'      && echo exit-codes
RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_DEV_LISTEN=true \
  rudder-cli dev listen --help >/dev/null 2>&1               && echo dev-listen
```

Each line prints only when the feature exists.

## validate --json

Pull request rudder-iac#877, branch `feature/dex-905-validate-json`. Requires the rudder-cli release that ships #877. Flag is `--json` or `-j`.

```bash
rudder-cli validate -l . --var-file secrets.vars.yaml --json
```

stdout holds one document and nothing else.

```json
{
  "diagnostics": [
    {
      "ruleId": "destination/spec-syntax-valid",
      "severity": "error",
      "message": "unknown config field \"webhookUrl\"",
      "file": "destinations/storefront-webhook.yaml",
      "line": 12,
      "column": 5
    }
  ],
  "summary": { "errors": 1, "warnings": 0 }
}
```

- An empty `diagnostics` array means the project validated clean.
- A failure with no diagnostics of its own, such as a bad `--location`, appears as an error with `ruleId` `project/load-failed`.
- The `ruleId` values `project/var-substitution` and `project/spec-syntax-parse-valid` come from the loader.
- A failure before a project exists, such as an unreadable `--var-file`, prints nothing on stdout and an error on stderr.
- Exit code is 1 on failure on this branch alone, and 2 with the exit-codes change.

Check clean: `jq -e '.summary.errors == 0 and .summary.warnings == 0'`.

Without it, parse the text. Errors and the summary go to stdout and the final `Error:` line goes to stderr.

```text
error[destination/spec-syntax-valid]: unknown config field "webhookUrl"
  --> destinations/storefront-webhook.yaml:12:5
...
Found 1 error(s), 0 warning(s)
```

A clean run prints `Project configuration is valid`. A warning prints `warning[<rule>]: ...` and the clean line too, so read the `Found N error(s), M warning(s)` line when it appears.

## apply --json

Pull request rudder-iac#880, branch `feature/dex-905-apply-json`. Requires the release that ships #880. Flag is `--json` or `-j`.

```bash
rudder-cli apply -l . --var-file secrets.vars.yaml --dry-run --json
rudder-cli apply -l . --var-file secrets.vars.yaml --confirm=false --json
```

```json
{
  "dryRun": true,
  "plan": {
    "operations": [
      { "type": "create", "urn": "event-stream-source:storefront-source" }
    ],
    "summary": { "create": 1, "delete": 0, "import": 0, "update": 0 }
  },
  "results": []
}
```

- `type` is `create`, `update`, `delete` or `import`.
- An update lists `properties`, which are field names only, never values. `secretOnly: true` marks a resource that differs only by a secret the API cannot return, so it re-applies on every run.
- `results` is filled by a real apply. Each entry is `{ "urn", "status": "ok" | "failed", "error" }`.
- The JSON reporter always declines confirmation. Pass `--confirm=false` to apply.
- A declined or empty apply still prints a document, with `results` as `[]`. Empty `results` with `dryRun: false` and a non-empty plan means nothing was applied.
- When the project fails to load, stdout holds the validate-style `diagnostics` document instead. Test for a `diagnostics` key before reading `plan`.

Checks.

```bash
# before applying, no deletes
jq -e '.plan.summary.delete == 0'
# after applying, everything planned ran and succeeded
jq -e '(.results | length) == (.plan.operations | length) and all(.results[]; .status == "ok")'
```

Without it, parse the text plan. Sections are `New resources:`, `Updated resources:` and `Removed resources:`, one `- <kind>:<id>` line per resource. A run with nothing to do prints `No changes to apply`. A non-empty `Removed resources:` section is a delete. To confirm an apply happened, run the dry run again and expect `No changes to apply`.

## Exit codes

Pull request rudder-iac#881, branch `feature/dex-905-exit-codes`. Requires the release that ships #881. `rudder-cli --help` prints the table when present.

| Code | Meaning | What to do |
|---|---|---|
| 0 | Success | Check evidence, not the code (see below) |
| 1 | Unclassified failure | Read the message and report it |
| 2 | The project's specs are wrong | Fix the specs and retry |
| 3 | Not authenticated, or the token lacks permission | Stop and ask the user to fix the token |
| 4 | The API rejected or could not serve the request | Retry once after 30 seconds, then stop |

Classification uses error type and HTTP status, never message text. Code 0 can still mean "nothing applied", because a declined confirmation is a success. Without this change every failure is exit 1. Classify by message. `access token is required` or an HTTP 401 or 403 means authentication. `syntax validation failed` or `semantic validation failed` means the specs.

## dev listen and dev events

Pull request rudder-iac#936, branch `feat/act2-904-dev-listen-1-gate`. Experimental, hidden behind two variables. Rename proposal in #952 is described in `SKILL.md`.

```bash
export RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_DEV_LISTEN=true
export RUDDERSTACK_CLI_TELEMETRY_DISABLED=true
```

With the gate off, every `dev` command exits 1 and the message names both variables.

| Command | Does |
|---|---|
| `dev listen --port 0` | Runs the server in the foreground. Prints one JSON ready line with `url`, `port`, `pid`, `serverId`, `cursor`, `writeKey`, `writeKeyPolicy` and `ui`. Exits 0 on kill |
| `dev events --url U --since C --json` | Prints a summary (about 1 KB) and a `diagnosis` |
| `dev events list --url U --since C --json` | Prints the accepted events, one JSON object per line, exactly as the SDK sent them |

Flags that matter on the read commands. `--event NAME` (exact, or a prefix ending in `*`), `--type`, `--user-id`, `--anonymous-id`, `--write-key`, `--wait 20s` (holds until `--min` matching events exist, at most 110s), `--fields properties` and `--server-id`.

The URL comes from `--url`, else from `RUDDERSTACK_DEV_URL`. Filters narrow the counts. Read the unfiltered summary when you assert on `requests.failed`.

Summary fields used by this skill.

```json
{
  "cursor": 17,
  "timedOut": false,
  "summary": {
    "requests": { "total": 1, "failed": 0 },
    "byEvent": { "Order Completed": 1 },
    "rejected": { "events": 0, "byEvent": {} },
    "diagnosis": [ { "code": "all_accepted", "count": 1, "message": "...", "next": "..." } ]
  }
}
```

Exit code is 0 for every successful read, including an empty one and a `--wait` that timed out (`timedOut: true`). Errors exit 1 with a `next` command. Assert with `jq -e`.

There is no `--summary` flag on `dev listen`. Reading is done by `dev events`.

Without the feature, skip step 7 and say so. A browser network tab confirms only that the SDK posted to the data plane. It says nothing about property types.
