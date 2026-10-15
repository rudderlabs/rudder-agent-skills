# `sources listen` in CI

Run the listener inside the job, send its stdout to a file, act, then check the file with `jq -e`. The listener never asserts. A test file can read the same file.

## Listener Inside the Job (GitHub Actions, Unix Runners)

```yaml
jobs:
  tracking:
    runs-on: ubuntu-latest
    env:
      RUDDERSTACK_CLI_EXPERIMENTAL: "true"
      RUDDERSTACK_X_SOURCES_LISTEN: "true"
      RUDDERSTACK_CLI_TELEMETRY_DISABLED: "true"
      RUDDERSTACK_DATA_PLANE_URL: http://127.0.0.1:4321
      RUDDERSTACK_CONFIG_URL: http://127.0.0.1:4321
      RUDDERSTACK_WRITE_KEY: dev
    steps:
      - uses: actions/checkout@<full commit SHA>  # pin every action to a SHA
      # install rudder-cli, install deps, build the app with the env above, install the browser
      - name: Capture, act, check
        shell: bash
        run: |
          set -euo pipefail
          d=$(mktemp -d)
          rudder-cli sources listen --port 4321 >"$d/events" 2>"$d/log" &
          pid=$!
          # bash -e ends the step at a failed check. The trap prints the log, refusals included, on any failure.
          trap 'rc=$?; [ "$rc" -eq 0 ] || cat "$d/log" >&2; kill "$pid" 2>/dev/null; exit "$rc"' EXIT
          until grep -q '^{"ready":true' "$d/log"; do kill -0 "$pid" 2>/dev/null || { cat "$d/log" >&2; exit 1; }; sleep 0.1; done
          pnpm exec playwright test tracking.spec.ts --workers=1
          for i in $(seq 150); do grep -q '"event":"Order Completed"' "$d/events" && break; sleep 0.2; done
          jq -e -s '[.[] | select(.event == "Order Completed")] | length == 1' "$d/events"
          jq -e -s '[.[] | select(.event == "Order Completed")] | length > 0 and all(.[]; .properties.total == 42)' "$d/events"
          if grep '^refused:' "$d/log"; then exit 1; fi
          cp "$d/events" events.ndjson   # evidence for an upload step
```

Rules:

- Keep the checks in the inline `run:` block, or start a check script with `set -euo pipefail`. A script that a step calls does not get the step's `-e`, so a failed `jq -e` in it would not fail the job.
- Never write a check as `! grep ...`. `set -e` ignores a command that starts with `!`. Use `if grep ...; then exit 1; fi`.
- The wait loop on the file replaces a server-side wait. 150 rounds of 0.2 s is 30 s.
- Use `jq -e -s` on the file. `length > 0` stops an empty file from passing, because `all()` over nothing is true.
- A refused request never reaches stdout. The `refused:` check catches a bad body or a rejected key that would otherwise look like a missing event.
- Take the expected names and values from the tracking plan YAML or the test, never from the capture.
- Several services in one job: run one listener per service with `--port 0` and its own files. stdout has no write key. To check keys on one listener, use `--store` and the request records.
- On a public repository, use synthetic data and the key `dev`. Do not print properties into the log unless the job fails.
- Windows runners have no `kill` and no SIGTERM. The recipe is for Unix runners.

## From a Test File (Playwright, Node 18 or Later)

Start the listener before the test runner, with stdout in a file the test can read, for example `EVENTS=$d/events`.

```ts
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

const file = process.env.EVENTS ?? 'events.ndjson';
const lines = () => readFileSync(file, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
const named = (name: string) => lines().filter(e => e.event === name);

test('a purchase sends Order Completed once, with a numeric total', async ({ page }) => {
  const before = named('Order Completed').length;
  await page.goto('/');
  await page.getByRole('button', { name: 'Buy' }).click();
  await expect.poll(() => named('Order Completed').length, { timeout: 30_000 }).toBe(before + 1);
  for (const e of named('Order Completed').slice(before)) expect(typeof e.properties.total).toBe('number');
});
```

The file only grows, so count from the length before the action. A line that is half written fails `JSON.parse` only while the listener writes it, and `expect.poll` retries. For parallel workers, give each test its own `anonymousId` and filter on it.

## Docker

A `run:` step can start the CLI image with arguments. Without `--store` the events go to `docker logs`:

```bash
docker run -d --name sources-listen -p 127.0.0.1:4321:4321 \
  -e RUDDERSTACK_CLI_EXPERIMENTAL=true -e RUDDERSTACK_X_SOURCES_LISTEN=true \
  rudderlabs/rudder-cli:<version> sources listen --bind 0.0.0.0 --port 4321
until docker logs sources-listen 2>&1 | grep -q '^{"ready":true'; do
  [ "$(docker inspect -f '{{.State.Running}}' sources-listen)" = true ] || { docker logs sources-listen; exit 1; }
  sleep 0.2
done
# ... act ...
docker logs sources-listen 2>/dev/null > events.ndjson   # stdout only
```

Pin `<version>` to a release that has `sources listen`. Publish the port on loopback only: a bare `-p 4321:4321` opens it on every host interface. With `--store`, a peer container that reaches the query API by name needs `--allow-host NAME`. GitHub Actions `services:` cannot pass arguments to the image, so a service container does not work yet.

## The HTTP API (`--store` Only)

- `GET /_dev/v1/`: the index, with every route, its parameters and an example URL.
- `/_dev/v1/info`: identity, cursor and store statistics. Use it as a readiness probe.
- `/_dev/v1/events`: the stored events as NDJSON. `view=counts` is the summary the review page reads.
- `/_dev/v1/requests` and `/_dev/v1/requests/{seq}`: the request records.
- `/_dev/v1/guide`: the guide.

Call the API from the test process, never from `page.evaluate`. A fetch from the app's origin is cross-site and gets 403 `browser_origin`.
