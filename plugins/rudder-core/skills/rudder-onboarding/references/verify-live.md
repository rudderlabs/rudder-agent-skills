# Live verification

## 1. Record the start time

```bash
STARTED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
```

Every metrics call below passes it as `start_time`. The metrics tools return counts without timestamps, so
without it an old count looks like a new delivery.

## 2. Wait for the write key

A new write key is refused for about two minutes after apply. Probe it without sending an event: an empty
batch is authenticated first and then rejected for being empty, so nothing is ingested.

```bash
curl -s -o /dev/null -w '%{http_code}' \
  -H "Authorization: Basic $(printf '%s:' "$WRITE_KEY" | base64)" \
  -H 'Content-Type: application/json' -d '{"batch":[]}' "$DATA_PLANE_URL/v1/batch"
```

- `401`: not active yet. Try again in 20 seconds. Give up after 5 minutes and report the last status.
- Any other status (typically `400`): the key is accepted.

Keep the write key in a shell variable read from `.env.local`; do not print it.

## 3. Send real events

Start the app against `.env.local` (no overrides) and ask the user to go through the flow once.

## 4. Confirm delivery

Call the MCP tool:

```text
get_destination_event_metrics(destination_id=<remote destination id>, start_time=<STARTED_AT>)
```

Poll every 30 seconds for up to 10 minutes. Done when each agreed event has `deliveredCount >= 1` and
`failedCount == 0`. Metrics lag delivery, and unevenly by event: on 15 Oct one event showed after 2 minutes
and another after 4 to 8. When the destination is one the user can read, check the payload (section 5)
first; it arrives within seconds.

- `failedCount > 0`: call `get_destinations_errors` for the destination and show the error.
- Nothing at all after 10 minutes: call `get_source_event_metrics(source_id=..., start_time=<STARTED_AT>)`.
  Source metrics lag the same way, so wait the full 10 minutes before reading anything into them. If the source
  saw nothing, the app is not sending (check the browser console and the network tab for the data plane
  request). If the source saw events and the destination did not, check the connection is enabled.

## 5. Check the payload

MCP hashes property values, so it cannot show `total: 128.5`. The destination's own copy can. For a webhook
the user can read (a local listener behind a tunnel, or a request bin), check the event names, the values and
their JSON types there.
