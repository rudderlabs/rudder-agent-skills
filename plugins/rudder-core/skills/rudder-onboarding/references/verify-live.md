# Live verification

## 1. Record the start time

```bash
# Rounded down to the minute: metrics count in one-minute buckets, and a start inside a minute drops it.
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:00Z)
```

Every metrics call below passes it as `start_time`. The metrics tools return counts without timestamps, so
without it an old count looks like a new delivery.

## 2. Wait for the write key

A new write key is refused for about two minutes after apply. Probe it without sending an event: an empty
batch is authenticated first and then rejected for being empty, so nothing is ingested. This call reads the key
and the URL from `.env.local`, the `VITE_RUDDERSTACK_` names in a Vite app or the `RUDDERSTACK_` names on the curl
path and in a mobile app, so neither appears on the command line or in the output. It reads only those lines and
never runs the file, which is the app's dotenv file, not a shell script. It probes every 20 seconds for up to 5
minutes; give the call a timeout of 6 minutes.

```bash
f=.env.local
val() { sed -n "s/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}$1[[:space:]]*=[[:space:]]*//p" "$f" | tail -n 1 |
  sed -e 's/[[:space:]]*$//' -e "s/^'\(.*\)'\$/\1/" -e 's/^"\(.*\)"$/\1/'; }
key=$(val RUDDERSTACK_WRITE_KEY); [ -n "$key" ] || key=$(val VITE_RUDDERSTACK_WRITE_KEY)
dp=$(val RUDDERSTACK_DATA_PLANE_URL); [ -n "$dp" ] || dp=$(val VITE_RUDDERSTACK_DATA_PLANE_URL)
[ -n "$key" ] || { echo "no write key in $f"; exit 2; }
[ -n "$dp" ] || { echo "no data plane URL in $f"; exit 2; }
for i in $(seq 15); do
  code=$(curl -s -o /dev/null --max-time 10 -w '%{http_code}' -H "Authorization: Basic $(printf '%s:' "$key" | base64)" \
    -H 'Content-Type: application/json' -d '{"batch":[]}' "${dp%/}/v1/batch")
  [ "$code" = 401 ] || break
  sleep 20
done
echo "write key probe: $code"
case $code in 400|2??) exit 0 ;; 401) exit 1 ;; *) echo "check the data plane URL: ${dp%/}"; exit 3 ;; esac
```

- Exit 0, status `400` (or a `2xx`): the key is accepted.
- Exit 1, status `401`: still not active after 5 minutes. Report it and stop.
- Exit 3, any other status: the data plane URL is wrong, or the network does not reach it. `000` means no answer
  within 10 seconds, as with a mistyped host, a proxy or no network; `404` or a `5xx` means something else
  answered. Show the URL and the status, ask the user to compare the URL with the one in the RudderStack dashboard,
  and stop. Do not ask the user to send events.
- Exit 2: `.env.local` has no write key or no data plane URL under these names.

When the app is in a subfolder, set `f` to its `.env.local`. In a framework with other names for the two values,
such as `NEXT_PUBLIC_` in Next.js, put those names in the `key=` and `dp=` lines.

## 3. Send real events

Start the app against `.env.local` (no overrides) and ask the user to go through the flow once.

A mobile app runs with its real values, not the listener's from step 7, on an emulator, a simulator or a device:

- Android: `./gradlew :app:installDebug`, with the application module's name in place of `app`, and no `-P`
  values, so the build reads `.env.local` again.
- iOS: Run in Xcode, or `xcrun simctl launch --terminate-running-process booted '<bundle id>'` with no
  `SIMCTL_CHILD_` values, so the app reads `RudderStack.local.xcconfig` through `Info.plist`.

The SDK sends in batches, every 10 seconds or every 30 events, so ask the user to wait 15 seconds after the last
action before saying done.

### No app here: send the first planned event with curl

When `sender` is `curl`, send the first event in `rudder/plan.events.json` yourself, once the probe above stops
answering `401`. Run this command as written. It builds the body from the plan, so the event name and property
names match it exactly, and gives each property a sample value of its agreed type: `"sample"` for `string`,
`42.5` for `number`, `42` for `integer` and `true` for `boolean`. The key and the URL come from `.env.local`, read
as in section 2, so neither appears on the command line:

```bash
f=.env.local
val() { sed -n "s/^[[:space:]]*\(export[[:space:]]\{1,\}\)\{0,1\}$1[[:space:]]*=[[:space:]]*//p" "$f" | tail -n 1 |
  sed -e 's/[[:space:]]*$//' -e "s/^'\(.*\)'\$/\1/" -e 's/^"\(.*\)"$/\1/'; }
key=$(val RUDDERSTACK_WRITE_KEY); dp=$(val RUDDERSTACK_DATA_PLANE_URL)
[ -n "$key" ] && [ -n "$dp" ] || { echo "no write key or data plane URL in $f"; exit 2; }
body=$(jq -c 'to_entries[0] | {type: "track", event: .key, anonymousId: "rudderstack-first-event",
  properties: (.value | with_entries(.value |= {string: "sample", number: 42.5, integer: 42, boolean: true}[.]))}' \
  rudder/plan.events.json) || exit 2
echo "$body"
curl -sS -o /dev/null --max-time 10 -w '%{http_code}\n' \
  -H "Authorization: Basic $(printf '%s:' "$key" | base64)" \
  -H 'Content-Type: application/json' -d "$body" "${dp%/}/v1/track"
```

`200` means RudderStack accepted the event. `401` means the key is not active yet: probe again as in section 2.
Send it once; every send is a real event at the destination.

## 4. Confirm delivery

Call the MCP tool:

```text
get_destination_event_metrics(destination_id=<remote destination id>, start_time=<STARTED_AT>)
```

Poll every 30 seconds for up to 10 minutes. Wait between polls without blocking the session; some agents
refuse a long foreground `sleep`, so use a background timer where the agent has one. Done when each agreed
event has `deliveredCount >= 1` and `failedCount == 0`. Metrics lag delivery, and unevenly by event: on 15 Oct one event showed after 2 minutes
and another after 4 to 8. When the destination is one the user can read, check the payload (section 5)
first; it arrives within seconds.

- `failedCount > 0`: call `get_destinations_errors` for the destination and show the error.
- Nothing at all after 10 minutes: call `get_source_event_metrics(source_id=..., start_time=<STARTED_AT>)`.
  Source metrics lag the same way, so wait the full 10 minutes before reading anything into them. If the source
  saw nothing, the app is not sending (check the browser console and the network tab for the data plane
  request). If the source saw events and the destination did not, check the connection is enabled.

## 5. Check the payload

MCP hashes property values, so it cannot show `total: 128.5`. The destination's own copy can. For a webhook
the user can read (a request bin, or an endpoint the user runs), check the event names, the values and their
JSON types there.
