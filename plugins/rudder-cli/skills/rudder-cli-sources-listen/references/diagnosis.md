# Diagnosis

## First: Server or App?

```bash
curl -fsS -u 'dev:' -H 'Content-Type: application/json' -d '{"event":"dev check","userId":"dev"}' "$url/v1/track"   # prints: ok
tail -1 "$d/events"                                                                                                     # the dev check line
```

A 200 `ok` and a new line on stdout prove that the server works. The problem is then in the app wiring. Under a `sources listen --write-key` allowlist, use one of the listed keys in place of `dev`.

## Refused Requests

Each refused request prints one line on stderr: `refused: STATUS METHOD ROUTE: REASON`. Its events never reach stdout.

| Line | Likely cause | Fix |
|---|---|---|
| `refused: 401 ...` | no write key, or a key outside the `--write-key` allowlist | set the SDK write key, or add it to the allowlist |
| `refused: 400 ...: invalid json` and other 400s | bad JSON, a `batch` that is not an array, no `userId` and no `anonymousId`, bad gzip | read the raw body with `--store` (below) |
| `refused: 413 ...` | a body over 2,048,000 bytes, or more than 10,000 events in one batch | send smaller batches |
| `refused: 503 ...` | more than 8 requests in flight at once | slow the sender down, or retry |
| `refused: 404 ...` | an ingestion route the listener does not know | check the data plane URL path. Java takes the base URL only |

A pixel request answers 200 even when its event is dropped. It still prints a `refused:` line.

## Nothing on stdout, Nothing on stderr

The listener saw no event request. Go through the checklist in `app-bootstrap.md`: data plane URL, config URL, build-time values, analytics gates, flush. To see the SDK's own requests, restart with `--store`:

```bash
curl -fsS "$url/_dev/v1/requests?kind=control"   # /sourceConfig and preflights
```

- No control request at all: the app does not reach `$url`. Check the URL and restart the app after an env change.
- Only CORS preflights: the browser blocked the real request. Read `response.headers` of the preflight records.
- `/sourceConfig` with 200 and no events: the SDK loaded but sent nothing. The default browser entry waits for plugins from the CDN; import `/bundled`. Or the action did not run.
- `/sourceConfig` with 401 or 400: no write key in Basic auth, or a key outside the allowlist.

## The Diagnosis on the Review Page (`--store` Only)

The review page at the ready line's `ui` shows a diagnosis when events are missing. The same data is at `curl -fsS "$url/_dev/v1/events?view=counts&since=N" | jq .summary.diagnosis`. Each item has `code`, `count`, `message` and `next`.

| Code | Meaning |
|---|---|
| `nothing_received` | the listener never received a request: wiring |
| `nothing_new` | the listener has requests, but none after your cursor: timing |
| `filtered_empty` | requests arrived, but your filters match none |
| `preflight_only` | the browser sent CORS preflights only |
| `sdk_config_rejected` | a `/sourceConfig` request failed |
| `sdk_loaded_no_events` | the SDK loaded its config but sent no event |
| `no_browser_traffic` | server SDKs sent requests, no browser request arrived (a backend-only app also gets this) |
| `auth_rejected` | a missing key, or a key outside the allowlist |
| `body_rejected` | bad JSON, batch shape, size or identity |
| `missing_write_key` | requests had no write key. The listener accepted them. RudderStack answers 401 |
| `all_accepted` | all requests that arrived were accepted. It says nothing about events that did not arrive |

## Error Codes

`sources listen` prints a startup error as one JSON object, the last line of stderr. Under `--json`, `sources events` prints a failure as one object on stderr and nothing on stdout: `{"error":{"status","code","message","param","details","next"}}`. Run `next`. On a terminal, the same error prints as `Error: <message>` and `Next: <command>`. Every command exits 1 on an error.

| Code | Meaning | Next |
|---|---|---|
| `experimental_disabled` | the gate is off | `export RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_SOURCES_LISTEN=true` |
| `port_in_use` | from `sources listen --port` | `rudder-cli sources listen --port 0` |
| `store_disabled` | `sources events` or `/_dev/` on a listener started without `--store` (404) | restart with `--store`, or read the stdout file |
| `invalid_parameter`, `unknown_parameter`, `usage` | a bad flag or value: `--limit` out of range, `--fields` with `--view`, a comma in `--fields`, a missing URL | the `--help` of the command |
| `server_unreachable` | no listener at the URL, or something else answered there | start one: `rudder-cli sources listen --port 0 --store` |
| `server_changed` | a different or restarted listener answers at that URL (409) | read the new ready line, then repeat the action |
| `host_not_allowed` | a `/_dev/` request with a Host name that the listener does not accept (403) | call it as `127.0.0.1:<port>` or `localhost:<port>`, or start the listener with `--allow-host NAME` |
| `browser_origin` | a browser page on a different site called `/_dev/` (403) | call it from a shell or a test process |
| `not_found` | no record with that `seq`, or an unknown `/_dev/` path (404) | `curl -fsS "$url/_dev/v1/requests"` lists the `seq` values |
| `shutting_down` | the listener is stopping (503) | start a new listener |

## Symptoms

| Symptom | Check |
|---|---|
| Two `/sourceConfig` records per page load | React Strict Mode mounts components twice in development. This is not a bug |
| Events arrive, properties are missing | `jq -c 'select(.event == "X") \| .properties'` on the file. Compare with the tracking plan |
| A count is short and nothing is refused | the SDK has not flushed yet, or the wait loop ended early. Flush, then wait longer |
| Events arrive in an unexpected order | compare `originalTimestamp`. The file is in arrival order |
| A Node or Go script exits and nothing arrives | the SDK buffers events. Call `flush()` or `Close()` before exit |
| The browser sends to `api.rudderstack.com` | `configUrl` is not set |
| A mobile SDK gets its config from production | `controlPlaneUrl` is not set |
| The browser requests `cdn.rudderlabs.com` | the default entry loads plugins from the CDN. Import `/bundled` when offline |
| A public HTTPS page sends nothing to the listener | Chrome blocks http loopback requests from public HTTPS pages. Test from `http://localhost` |
| Events from two services mix | run one listener per service with `--port 0` |
