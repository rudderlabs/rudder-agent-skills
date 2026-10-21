# Reading Captured Events

Agent shells cut output near 30,000 characters. Read only what the check needs: a count, then the properties of the events you care about, then a whole event only when those do not answer the question.

## The Lines on stdout

Each line is one accepted event, exactly as the SDK sent it, with the whitespace removed. Nothing is added: no `seq`, no receive time, no status, no `messageId` that the SDK did not send, no `type` for a `/v1/track` body sent without one. A batch of five events gives five lines. A refused request gives no line. A refused ingestion request has its `refused:` line on stderr.

```bash
wc -l < "$d/events"                                                    # how many events
jq -r '.event // .type' "$d/events" | sort | uniq -c                    # count by name
jq -c 'select(.event == "Order Completed") | .properties' "$d/events"   # the values you check, about 110 bytes each
jq -c 'select(.event == "Order Completed") | del(.context)' "$d/events" # the event without the SDK context
jq 'select(.event == "Order Completed")' "$d/events"                   # the full event, about 1.5 KB from a browser
```

Checks:

```bash
jq -e -s '[.[] | select(.event == "Order Completed")] | length == 1' "$d/events"
jq -e -s '[.[] | select(.event == "Order Completed")] | length > 0 and all(.[]; .properties.total | type == "number")' "$d/events"
jq -e -s '[.[] | select(.type == "track") | .event] == ["A","B","C"]' "$d/events"   # order
```

- `jq -s` makes one array and one result. Without `-s`, `jq -e` decides on the last line only.
- `all()` over zero events is true, so keep the `length > 0` guard.
- Values do not change: a string `"2"` stays a string.
- `grep '"event":"X"'` works for waiting because the lines are compact. Use `jq` for checks.
- A line the listener is still writing can be half done. `jq -R 'fromjson?'` skips it: `jq -nR '[inputs | fromjson? | select(.event == "X")] | length' < "$d/events"`.
- The file only grows. To check one action, count before and after it.

## Order

Lines come in the order in which the listener completed each request, then by position in the batch. After an SDK retry, this order can differ from the order in which the app sent the events. When order matters, compare `originalTimestamp`. Filter with `select(.type == "track")` before you compare event names, because a page call has no `event` key.

## With `--store`

`rudder-cli sources events` reads the same lines from a listener started with `--store`, with filters and paging. `--url` or `RUDDERSTACK_DEV_URL` names the listener. `--server-id` pins it.

```bash
rudder-cli sources events --url "$url" --since 41 --event 'Suggestion Clicked' --fields properties --json
rudder-cli sources events --url "$url" --since 41 --event 'Suggestion Clicked' --view compact --json
rudder-cli sources events --url "$url" --since 41 --event 'Suggestion Clicked' --json
rudder-cli sources events --url "$url" --since 5m          # a table for people
```

| Flag | Meaning |
|---|---|
| `--since N`, `--since 5m`, `--since TIME` | after cursor N, received in the last 5 minutes, or since an RFC 3339 time. The default is 0. The first cursor is in the ready line |
| `--event NAME` | an exact event name, or a prefix that ends in `*` (`'Order*'`). Repeat for OR |
| `--type TYPE` | `track`, `identify`, `page`, `screen`, `group`, `alias`. Repeat for OR |
| `--user-id ID`, `--anonymous-id ID` | an exact match |
| `--write-key KEY` | the write key of the request. Repeat for OR. `''` selects requests without a key |
| `--limit N` | events per page, 1 to 1,000, default 100. When more are left, stderr prints `more events: continue with --since N` |
| `--view list\|compact\|full`, `--fields PATH` | how much of each event to print. `compact` drops the SDK context. `--fields properties` keeps one path; repeat it, no commas. `--fields` excludes `--view` |
| `--url URL`, `--server-id ID`, `--timeout DURATION`, `--json` (`-j`) | the listener, its pin, the HTTP deadline, and JSON output |

Different flags combine with AND. The store keeps at most 10,000 requests or 64 MiB and drops the oldest whole requests first.

## The Request Records (`--store` Only)

```bash
curl -fsS "$url/_dev/v1/requests?since=41&failed=true&view=compact" | jq -r '.requests[] | "\(.seq) \(.statusCode) \(.rejection.stage): \(.rejection.reason)"'
curl -fsS "$url/_dev/v1/requests?kind=control"                              # /sourceConfig, preflights, unknown paths
curl -fsS "$url/_dev/v1/requests/44?fields=request.body" | jq -r .request.body   # the raw body that the app sent
curl -fsS "$url/_dev/v1/requests?messageId=$mid" | jq '.requests[0].seq'     # the request that carried an event
```

One record holds `seq`, `receivedAt`, `route`, `statusCode`, `outcome`, `rejection` (`stage`, `reason`, `idx`), the masked write key, six request headers, the raw body and the response. For each event it holds `idx`, `messageId` and `enrichment`: what RudderStack ingestion would add (`messageId`, `receivedAt`, `request_ip`, `rudderId`, `type`).

`/requests` parameters: `since`, `limit`, `kind` (`ingestion`, `control`, `all`), `statusCode` (such as `401` or `4xx`), `writeKey`, `failed`, `messageId`, `view` (`list`, `compact`, `full`), `fields`, `maxBytes` (default 24,000, 0 turns it off). A person reads the same data on the Requests tab of the review page. `curl -fsS "$url/_dev/v1/"` lists every route.
