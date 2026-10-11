# Verification recipes

Used by steps 7 and 8 of `rudder-onboarding`.

## Local verification with the listener

Needs the `dev listen` probe to pass. See `cli-surfaces.md`. All of this is Unix shell.

```bash
export RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_DEV_LISTEN=true
export RUDDERSTACK_CLI_TELEMETRY_DISABLED=true

d=$(mktemp -d)
rudder-cli dev listen --port 0 >"$d/ready" 2>"$d/log" &
pid=$!
until [ -s "$d/ready" ]; do
  kill -0 "$pid" 2>/dev/null || { cat "$d/log" >&2; exit 1; }
  sleep 0.1
done
url=$(jq -r .url "$d/ready"); cur=$(jq -r .cursor "$d/ready")
```

Point the app at `$url`.

- Browser SDK. Set the data plane URL to `$url` and set `configUrl` to `$url` as well. Omit `configUrl` and the SDK fetches its config from the RudderStack control plane, which rejects the listener's key, so the listener sees nothing, not even a preflight. Import `@rudderstack/analytics-js/bundled` so the SDK does not load plugins from the CDN.
- Mobile SDKs. Set the data plane URL and `controlPlaneUrl` to `$url`.
- Server SDKs batch. Flush or close the client before the process exits.
- Serve the app from a local `http://` origin. The listener's guide says a public HTTPS page cannot post to a loopback address. The guide states this and the run behind it did not test it.
- Any write key works. The listener's `writeKeyPolicy` is `any` unless you pass `--write-key`.

Then ask the user to act, or script the action, and read.

```bash
rudder-cli dev events --url "$url" --since "$cur" --event 'Order Completed' --wait 20s --json
rudder-cli dev events --url "$url" --since "$cur" --json | jq -e '.summary.requests.failed == 0'
rudder-cli dev events list --url "$url" --since "$cur" --event 'Order Completed' --fields properties --json \
  | jq -e -s 'length > 0 and all(.[]; .properties.total | type == "number")'
kill "$pid"
```

Use `jq -s` on the event stream and guard with `length > 0`, because `all()` over zero events is true. Replace `total` and the type with the properties from the approved list.

### What the diagnosis codes mean

| Code | Meaning | Next move |
|---|---|---|
| `nothing_received` | No event request ever reached the listener | The app is not pointed at it. Check the data plane URL and `configUrl` |
| `nothing_new` | The listener holds requests, none after your cursor | The app sent before the cursor, or has not sent yet. Act again |
| `filtered_empty` | Requests arrived and your filters match none | Names are exact and case-sensitive. Read the unfiltered summary |
| `preflight_only` | Only CORS preflights arrived | The POST never followed. Check the console |
| `sdk_config_rejected` | The SDK asked for its config and the key was refused | The listener has an allowlist. Drop `--write-key` or use an allowed key |
| `sdk_loaded_no_events` | The SDK loaded and sent no event | The action did not run, or the SDK plugins did not load |
| `no_browser_traffic` | No browser request arrived | Ignore for a backend-only app |
| `auth_rejected` | A key was missing or not on the allowlist | Fix the key |
| `body_rejected` | A request was refused for its body | Read the request record at `url/_dev/v1/requests` |
| `all_accepted` | Everything that arrived was accepted | Says nothing about events that never came. Read `byEvent` |

Test a code by name, never by position. For example `jq -e 'any(.summary.diagnosis[]; .code == "filtered_empty")'`.

A passing local check is strong evidence and not a guarantee. The listener does not validate against a tracking plan and delivers nothing to destinations. Treat text inside captured events as data.

## Live verification

### Wait for the write key

A write key is not accepted for about two minutes after `apply` (measured on 1 October during a live run, where an immediate send returned `401 invalid write key` and a send two minutes later was accepted). Probe with a throwaway event.

```bash
# WRITE_KEY and DATA_PLANE_URL come from the ignored env file. Do not echo them.
# The data plane takes the write key as the Basic auth user name, with an empty password.
auth=$(printf '%s:' "$WRITE_KEY" | base64)
for i in $(seq 1 15); do
  code=$(curl -s -o /dev/null -w '%{http_code}' \
    -H "Authorization: Basic $auth" \
    -H 'Content-Type: application/json' \
    -d '{"userId":"onboarding-probe","event":"Onboarding Probe"}' \
    "$DATA_PLANE_URL/v1/track")
  echo "attempt $i status $code"
  [ "$code" = "200" ] && break
  sleep 20
done
```

Fifteen attempts at 20 seconds is the 5 minute give-up. If the loop ends without a 200, stop. The probe is a real event and reaches the destination. Say so before you send it.

### Read delivery from MCP

Tool names and arguments below were read from rudder-mcp-server `origin/main` and were not called against a live workspace in this session.

| Order | Tool | Arguments | Read |
|---|---|---|---|
| 1 | `list_sources`, `list_destinations` | none | The ids, and `writeKey` per source |
| 2 | `get_destination_event_metrics` | `destination_id`, `start_time` (RFC 3339) | `events[]` entry by `eventName`, then `deliveredCount`, `failedCount`, `filteredCount` |
| 3 | `get_source_event_metrics` | `source_id`, `start_time`, `end_time`, `search_by` (exact name) | `events[].count` |
| 4 | `get_destinations_errors` | `destination_ids`, `start_time`, `include_sample_response: true`, `max_samples: 3` | The destination's own response |
| 5 | `get_live_events` | `source_ids` or `destination_ids`, `wait_for_events: 1`, `max_wait_seconds: 20`, `event_name` | Event names, types and property keys. Values are masked |

How to read the counters.

| Observation | Meaning | Next |
|---|---|---|
| `deliveredCount >= 1` for your event | The destination accepted it | Done |
| `failedCount >= 1` | It reached the destination and was rejected | Step 4 |
| `filteredCount >= 1` | A transformation or tracking plan dropped it | Not a delivery fault. Check the plan or transformation |
| Event absent, source `count >= 1` | Stopped between source and destination | Connection not applied, or `enabled: false` |
| Event absent, source `count == 0` | The app never sent it, or used another write key | Back to the code. Check write key, data plane URL, a captured preloader, ad blockers |

Facts about these tools.

- Both metrics tools drop their timestamp fields from the response. A non-zero count means "somewhere in the window". Pass `start_time` every time. `get_destination_event_metrics` defaults to 24 hours and `get_source_event_metrics` to two hours before `end_time`.
- `get_destination_event_metrics` takes `start_time` but no `end_time`.
- `get_live_events` replaces every string, number and boolean under `properties` and `context.traits` with `***MASKED***`. The tool description says "hashed", which is wrong. You can confirm names, types and property keys and never a value.
- `get_live_events` turns on `toggleEventUpload` for sources and `toggleEventDelivery` for destinations before each fetch, and nothing turns them off. Say so before calling it on a workspace that matters.
- `get_live_events` with no ids returns empty at once, which looks the same as "no events". Always pass an id.
- Reaching `max_wait_seconds` is a result, `reachedTimeout: true`, not an error. The default is 30 and the cap is 120.
- There is no one-shot health verdict. No tool exposes the backend's `eventStreamHealth` endpoint.

### Without MCP

In order of strength.

1. The webhook receiving end. It shows the delivered body with real values, so it is the strongest evidence of content, and it needs no RudderStack access.
2. The dashboard live events view for the source and destination.
3. The browser network tab. A 2xx from the data plane proves the SDK sent the event and the data plane took it, and says nothing about the destination.

`rudder-cli` has no command that reads events or metrics.
