# Local verification

`rudder-cli local event-stream` is a capture server on your machine. No account, no write key, nothing sent
to the cloud. It is experimental (rudder-iac#936 with the names from #952), so it needs two variables.

## Start it

```bash
export RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_LOCAL_EVENT_STREAM=true
rudder-cli local event-stream serve --port 0 > /tmp/rudder-local.json &
```

The first stdout line is one JSON object:
`{"ready":true,"url":"http://127.0.0.1:<port>","cursor":0,"serverId":"...","writeKey":"dev",...}`.
Read `url` and `cursor` from it with jq. `--port 0` picks a free port.

If your rudder-cli has no `local` command but has `dev listen`, it is the earlier name of the same server:
`rudder-cli dev listen` and `rudder-cli dev events summary`, gated by `RUDDERSTACK_X_DEV_LISTEN`.

## Point the app at it

Both the data plane and the config URL must be the server, or the SDK fetches its config from the cloud,
gets a 400 for the local key and sends nothing at all:

```bash
VITE_RUDDERSTACK_WRITE_KEY=dev \
VITE_RUDDERSTACK_DATA_PLANE_URL=$URL \
VITE_RUDDERSTACK_CONFIG_URL=$URL \
npm run dev
```

Serve the app from `http://localhost`. Then ask the user to go through the flow.

## Read what arrived

```bash
rudder-cli local event-stream events summary --url $URL --since $CURSOR --json
```

- `.summary.byEvent` maps event name to count. Compare names exactly with the agreed list.
- `.summary.diagnosis[]` explains empty results: `nothing_new` (no requests; check configUrl and the
  browser console), `filtered_empty` with `all_accepted` (a filter matched nothing; drop it to see the real
  names).
- `.cursor` is where the next read should start.
- `--wait 30 --min 4` blocks until at least four events arrive or 30 seconds pass.

## Check types

The summary does not check property types. For each event and numeric property:

```bash
rudder-cli local event-stream events list --url $URL --since $CURSOR \
  --event 'Order Completed' --fields properties --json \
  | jq -e 'select(.properties.total | type != "number")' && echo "total is not a number"
```

`events list --json` prints one event per line exactly as the SDK sent it.

## Stop

Kill the server and the dev server when the check passes. The server keeps nothing on disk.
