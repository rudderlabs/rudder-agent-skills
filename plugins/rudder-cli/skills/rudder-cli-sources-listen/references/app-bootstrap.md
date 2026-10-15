# Point an App at `sources listen`

App wiring is the longest step. `$url` comes from the ready line. The write key is `dev` by default, or the own key of each service. Without `sources listen --write-key`, the listener accepts every key, a missing key included. The app must accept a data plane URL, a config URL and a write key at runtime or at build time. If it does not, add that option first. `rudder-cli sources --help` has the same essentials.

Suggested environment variable names for the app: `RUDDERSTACK_DATA_PLANE_URL`, `RUDDERSTACK_CONFIG_URL`, `RUDDERSTACK_WRITE_KEY`.

## Checklist

1. Set the data plane URL to `$url`.
2. Set the config URL to `$url`: `configUrl` for web SDKs, `controlPlaneUrl` for mobile SDKs (Kotlin, Swift, Android and iOS legacy, React Native, Flutter, Cordova, Unity). In a web app, you can pass `getSourceConfig` instead. Without a config URL, the SDK calls `https://api.rudderstack.com`. JS v1.1 then sends nothing, and mobile SDKs take their config from production.
3. If the app gates analytics by host name or environment, turn on a force opt-in. When the gate is compiled into the build, the opt-in must be a build-time value too.
4. Build-time values need a fixed `--port` and a restart or rebuild. Next.js inlines `NEXT_PUBLIC_*` when `next dev` starts and at `next build`. Vite inlines `import.meta.env.VITE_*` and `define` entries at start and at build.
5. React Strict Mode mounts components twice in development. Two `/sourceConfig` records per page load are expected.
6. Offline: import `@rudderstack/analytics-js/bundled`. The default entry loads plugins from `cdn.rudderlabs.com`, and `sources listen` does not serve them.
7. Browser: set `polyfillIfRequired: false`.
8. Node and Go: flush before exit. In development, set the SDK to flush after 1 event.
9. The URL that the app uses must be equal to the ready line `url`. With several listeners, each app or service targets its own listener.
10. Prove that the server accepts events: `curl -fsS -u 'dev:' -H 'Content-Type: application/json' -d '{"event":"dev check","userId":"dev"}' "$url/v1/track"` prints `ok`, and a line appears on stdout.
11. Prove that the SDK loaded (with `--store`): `curl -fsS "$url/_dev/v1/requests?kind=control"` shows a `/sourceConfig` request with status 200. The Requests tab of the review page, kind control, shows the same.
12. List the hosts that the browser really calls (Playwright):

```ts
const hosts = new Set<string>();
page.on('request', r => hosts.add(new URL(r.url()).host));
await page.goto('/'); await page.getByRole('button', { name: 'Complete order' }).click();
await page.waitForTimeout(2000);
console.log([...hosts]);  // expect 127.0.0.1:<port>; api.rudderstack.com = configUrl unset; cdn.rudderlabs.com = default entry
```

## SDK Recipes

Browser, `@rudderstack/analytics-js` v3:

```ts
import { RudderAnalytics } from '@rudderstack/analytics-js/bundled';
const analytics = new RudderAnalytics();
analytics.load(WK, URL, { configUrl: URL, polyfillIfRequired: false });
```

Offline, without a config request: add `getSourceConfig: () => ({ source: { id: 'dev', config: {}, destinations: [] } })`.

Node, `@rudderstack/rudder-sdk-node`:

```js
const client = new Analytics(WK, { dataPlaneUrl: URL });
// ... track calls ...
await client.flush();
```

The Node SDK sends its first event at once and buffers the rest. To test flush on exit:

1. Send one warm-up event and wait for its line on stdout.
2. Count the lines: `n=$(wc -l < "$d/events")`.
3. Queue the events and call `flush()`.
4. Wait until the file has `n + 2` lines.

Go: `analytics.NewWithConfig(WK, analytics.Config{DataPlaneUrl: URL})`, and `Close()` before exit.

Kotlin: set `dataPlaneUrl` and `controlPlaneUrl` to `URL`. The Android emulator reaches the host at `http://10.0.2.2:<port>`. Allow cleartext HTTP in the debug build.

Swift: set the same two fields. The simulator shares the host loopback. Allow local networking in ATS (`NSAllowsLocalNetworking`).

Mobile builds read the URL at build time. Use a fixed `--port`.

Other server SDKs:

- Python: `host=` or `dataPlaneUrl`.
- Java: `setDataPlaneUrl` with the base URL only.
- .NET: `RudderConfig(dataPlaneUrl:)`.
- Rust: the data plane URL.
- Ruby: `data_plane_url`, plus `use_ssl: false` for the sync gem or `ssl: false` for the async gem.
- PHP: `data_plane_url` plus `ssl: false`. The socket consumer cannot target http. Use `lib_curl` or `fork_curl`.

In Chrome, a public HTTPS page cannot reach an http loopback listener. Test from `http://localhost`.

## Several Services, One Listener

Give each service its own write key (`web`, `api`, `worker`) in its SDK config. The listener accepts all of them. stdout does not show the key. With `--store`, `rudder-cli sources events --write-key web` reads one service. For full isolation, start one listener per service with `--port 0`, each with its own files.

## Proof Order When the App Looks Correct but Nothing Arrives

1. `grep '^refused:' "$d/log"` is empty: nothing was refused.
2. The curl test (item 10) prints `ok`: the server works.
3. With `--store`, `curl -fsS "$url/_dev/v1/requests?kind=control"` shows `/sourceConfig`: the SDK loaded with the correct URL.
4. The host list (item 12) shows where the app really sends.
