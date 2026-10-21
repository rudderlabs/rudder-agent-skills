# Local verification

`rudder-cli sources listen` is a capture server on your machine. It answers the SDK the way RudderStack
ingestion does, needs no account and no write key, and sends nothing to the cloud. It prints each accepted
event on stdout as one JSON line, exactly as the SDK sent it, and each refused request on stderr as a
`refused: STATUS METHOD ROUTE: REASON` line. It checks nothing itself.

`check-events.jq`, beside this file, compares what arrived with `rudder/plan.events.json`. Run it unchanged and
write no jq of your own. In the commands below, `<CHECK>` is its absolute path (see "Files shipped with this
skill" in SKILL.md).

## Pick a recipe

- **Two calls** where background processes outlive a shell call, as measured in Claude Code: start the listener
  and the app, the user acts, then check.
- **One call** where the agent stops background processes when a call returns (Codex): start, wait while the
  user acts, check and stop, all in one call.
- When you are not sure, as in Cursor, start with two calls. If the mark command says the listener is not
  running, the agent stopped it; switch to one call.
- A mobile app on an emulator or simulator uses two calls with the changes under "Mobile apps".

Each shell call is a new shell, so a variable set in one call is gone in the next. Each command prints the
values the next one needs. Write them into the next command where it shows `<D>`, `<PID>`, `<URL>`, `<APP>`,
`<FROM>`, `<LOGFROM>` and `<CUR>`.

## Exit codes

| Exit | Meaning | What to do |
|---|---|---|
| 0 | Pass: every planned event arrived with the agreed property types | Stop the listener and the app, go to step 8 |
| 1 | The check failed: a planned event is missing, or a property has another type | Read the table and the diagnosis under it, fix the code, run another pass |
| 2 | The checker could not run: `rudder/plan.events.json` is missing or malformed, or `<CHECK>` is wrong | Fix that and check again. It is not a failed check |
| 3 | The listener is not running | Read the lines printed from its log and start again. If it was running at the end of the start call and gone by the next one, this agent stops background processes: use one call |
| 4 | This rudder-cli has no `sources listen` | Tell the user, as below |
| 5 | The app did not start, or the one-call recipe's port is taken | Read the lines printed from `<D>/app.log`, stop what holds the port or fix the start command, and run again. It is not a failed check |

Only missing events and wrong types fail a check. Events outside the plan, refused requests and lines that are not
JSON show in the table as "reported, not a failure", because an app may already send other events, and an SDK
retry can leave a refused request behind.

`sources listen` first ships in rudder-cli 0.29.0. On exit 4, tell the user: "Your rudder-cli has no `sources
listen`, which checks events on this machine before anything reaches RudderStack. It needs rudder-cli 0.29.0 or
later. I will skip this check; step 8 still checks delivery at the destination." Then skip to step 8. Do not
install or upgrade rudder-cli during the workflow. The installer writes to `~/.local/bin`, and an older rudder-cli
earlier on PATH would still run.

## Two calls

### 1. Start the listener

```sh
export RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_SOURCES_LISTEN=true
rudder-cli sources listen --help >/dev/null 2>&1 || { rudder-cli --version; echo 'this rudder-cli has no sources listen'; exit 4; }
d=$(mktemp -d)
rudder-cli sources listen --port 0 --store >"$d/events" 2>"$d/log" &
pid=$!
until grep -qs '^{"ready":true' "$d/log"; do kill -0 "$pid" 2>/dev/null || { tail -n 3 "$d/log" >&2; exit 3; }; sleep 0.1; done
echo "D=$d PID=$pid URL=$(grep -m1 '^{"ready":true' "$d/log" | jq -r .url)"
```

- `sources` is experimental. The export turns it on for this call, which is the only one that needs it.
- `--port 0` takes a free port. `--store` keeps every request in memory, so the check can say why nothing arrived.
- `<D>/events` gets the accepted events and `<D>/log` the ready line and the refused requests.

### 2. Start the app against it

Both the data plane and the config URL must be the listener, or the SDK fetches its config from the cloud, gets a
400 for the local key and sends nothing at all. For a Vite app:

```sh
VITE_RUDDERSTACK_WRITE_KEY=dev VITE_RUDDERSTACK_DATA_PLANE_URL='<URL>' VITE_RUDDERSTACK_CONFIG_URL='<URL>' npm run dev >'<D>/app.log' 2>&1 &
echo "APP=$!"
```

Variables set in the process environment win over `.env.local`, so nothing in the app changes. Read the local
address from `<D>/app.log` and give it to the user. If the log shows an error and no address, the app did not
start. Fix that before the mark. Serve the app from `http://localhost`: Chrome blocks a public
HTTPS page from sending to a loopback address. Mobile SDKs take the URL as `controlPlaneUrl` too (see "Mobile
apps"), and server SDKs must flush before the process exits.

### 3. Mark the start of each pass

Run this before every pass, the first one included, and keep the three numbers it prints:

```sh
d='<D>'; url='<URL>'
info=$(curl -fsS "$url/_dev/v1/info") || { echo 'the listener is not running'; tail -n 3 "$d/log" >&2; exit 3; }
echo "FROM=$(( $(wc -l <"$d/events") )) LOGFROM=$(( $(wc -l <"$d/log") )) CUR=$(echo "$info" | jq .cursor)"
```

FROM and LOGFROM are line counts, so the check reads only what arrives after them. CUR is the listener's own
cursor, for the diagnosis. Then ask the user to go through the flows and say done.

### 4. Check

```sh
d='<D>'; pid='<PID>'; url='<URL>'; check='<CHECK>'; from=<FROM>; logfrom=<LOGFROM>; cur=<CUR>
kill -0 "$pid" 2>/dev/null || { echo 'the listener is not running'; tail -n 3 "$d/log" >&2; exit 3; }
for i in $(seq 50); do
  jq -n --slurpfile plan rudder/plan.events.json --rawfile events "$d/events" --rawfile log "$d/log" \
     --argjson from "$from" --argjson logfrom "$logfrom" -f "$check" >"$d/report.json" || exit 2
  jq -e .complete "$d/report.json" >/dev/null && break
  sleep 0.2
done
jq -r .table "$d/report.json"
jq -e .pass "$d/report.json" >/dev/null && exit 0
echo; echo 'Failed requests since the mark:'
curl -fsS "$url/_dev/v1/requests?kind=all&failed=true&since=$cur&view=compact" | jq -c '.requests[] | {seq, route, statusCode, kind, reason: .rejection.reason}'
echo 'Diagnosis:'
curl -fsS "$url/_dev/v1/events?view=counts&since=$cur" | jq -c '.summary.diagnosis[] | {code, message}'
exit 1
```

The loop waits up to 10 seconds for events still in flight, and stops early once every planned event has
arrived. A last line the listener is still writing is left for the next read, never parsed half-written.

### 5. Stop

```sh
kill <PID> <APP>
```

The listener exits 0. The files in `<D>` stay until you delete them.

## One call

Tell the user first, because they cannot answer while the call runs: "When I run the next command, open
http://localhost:5199 and go through <the flows>. It waits up to 5 minutes and finishes as soon as every planned
event has arrived." The recipe uses port 5199, not the app's usual port, so a dev server the user already runs
cannot answer in its place. Give the call a timeout longer than the wait, for example 6 minutes. Replace the app
line with the app's own start command, pointed at `$url`, on `$port`.

```sh
export RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_SOURCES_LISTEN=true
check='<CHECK>'; port=5199; wait_s=300
rudder-cli sources listen --help >/dev/null 2>&1 || { rudder-cli --version; echo 'this rudder-cli has no sources listen'; exit 4; }
! curl -s -o /dev/null --max-time 2 "http://localhost:$port" || { echo "port $port is in use. Stop what serves it, or set port to a free one and tell the user"; exit 5; }
d=$(mktemp -d)
rudder-cli sources listen --port 0 --store >"$d/events" 2>"$d/log" &
pid=$!; app=
trap 'kill $pid $app 2>/dev/null' EXIT
trap 'exit 143' HUP INT TERM
echo "D=$d PID=$pid"
until grep -qs '^{"ready":true' "$d/log"; do kill -0 "$pid" 2>/dev/null || { tail -n 3 "$d/log" >&2; exit 3; }; sleep 0.1; done
url=$(grep -m1 '^{"ready":true' "$d/log" | jq -r .url)
VITE_RUDDERSTACK_WRITE_KEY=dev VITE_RUDDERSTACK_DATA_PLANE_URL="$url" VITE_RUDDERSTACK_CONFIG_URL="$url" npm run dev -- --port "$port" --strictPort >"$d/app.log" 2>&1 &
app=$!
echo "APP=$app"
end=$(( $(date +%s) + wait_s ))
while :; do
  kill -0 "$pid" 2>/dev/null || { tail -n 3 "$d/log" >&2; exit 3; }
  kill -0 "$app" 2>/dev/null || { echo 'the app stopped'; tail -n 20 "$d/app.log" >&2; exit 5; }
  jq -n --slurpfile plan rudder/plan.events.json --rawfile events "$d/events" --rawfile log "$d/log" \
     --argjson from 0 --argjson logfrom 0 -f "$check" >"$d/report.json" || exit 2
  jq -e .complete "$d/report.json" >/dev/null && break
  [ "$(date +%s)" -lt "$end" ] || break
  sleep 1
done
jq -r .table "$d/report.json"
jq -e .pass "$d/report.json" >/dev/null && exit 0
echo; echo 'Failed requests:'
curl -fsS "$url/_dev/v1/requests?kind=all&failed=true&view=compact" | jq -c '.requests[] | {seq, route, statusCode, kind, reason: .rejection.reason}'
echo 'Diagnosis:'
curl -fsS "$url/_dev/v1/events?view=counts" | jq -c '.summary.diagnosis[] | {code, message}'
exit 1
```

The exit codes are the same as in the two-call recipe. The listener and the app stop when the call ends, also
when the agent interrupts it. If the agent kills the call outright, they keep running. Stop them with
`kill <PID> <APP>`, from the numbers the call printed first. For another pass, fix the code and run the whole
call again.

## Mobile apps

An app on an Android emulator or the iOS Simulator can send to the listener too. It reads its URLs when it is built
or launched, so use the two-call recipe with the changes below. A physical device cannot reach a listener on this
machine's loopback, so step 7 is skipped for it.

1. In the start command, replace `--port 0` with a fixed port, `--port 4321`, so a build keeps working when the
   listener starts again. If it exits 3 and the last line it prints says `port_in_use`, pick another port and use
   it below.
2. Instead of section 2, install or launch the debug build with the listener's values. The write key can be any
   value, such as `dev`. The SDK fetches its config from the control plane URL, so set it to the listener too.
   - **Android emulator.** The emulator reaches this machine at `10.0.2.2`, so the URL is `http://10.0.2.2:4321`.
     With the emulator running (`adb devices` lists it), run this from the Gradle root, with the application
     module's name in place of `app`:

     ```sh
     ./gradlew :app:installDebug -PRUDDERSTACK_WRITE_KEY=dev -PRUDDERSTACK_DATA_PLANE_URL=http://10.0.2.2:4321 -PRUDDERSTACK_CONTROL_PLANE_URL=http://10.0.2.2:4321
     ```

     Gradle properties win over `.env.local`, and the debug build allows plain HTTP to `10.0.2.2` (Android
     instrumentation reference). Ask the user to open the app from the emulator's app drawer, not with Run in
     Android Studio, which builds it again with the real values from `.env.local`.
   - **iOS Simulator.** The simulator shares this machine's loopback, so the URL is `http://127.0.0.1:4321`. Build
     the debug build and install it on a booted simulator without launching it, for example with `xcodebuild -scheme
     '<scheme>' -destination 'generic/platform=iOS Simulator' -derivedDataPath '<D>/xcode' build` and `xcrun simctl
     install booted '<D>/xcode/Build/Products/Debug-iphonesimulator/<app>.app'`. Run in Xcode installs it too, but
     launches it with the real values first, so those first events go to the live data plane. Then launch it with
     the listener's values in its environment, which a debug build reads first (iOS instrumentation reference), and
     ask the user to use it without pressing Run again. `<bundle id>` is the target's `PRODUCT_BUNDLE_IDENTIFIER`:

     ```sh
     SIMCTL_CHILD_RUDDERSTACK_WRITE_KEY=dev SIMCTL_CHILD_RUDDERSTACK_DATA_PLANE_URL=http://127.0.0.1:4321 SIMCTL_CHILD_RUDDERSTACK_CONTROL_PLANE_URL=http://127.0.0.1:4321 xcrun simctl launch --terminate-running-process booted '<bundle id>'
     ```

   - **Flutter and React Native.** Set the SDK's data plane and control plane URLs to the same addresses in a debug
     build, as the SDK's documentation shows, and start the app on the emulator or simulator. Both platforms refuse
     plain HTTP unless the app allows it. A Flutter app needs the two debug files from the Android instrumentation
     reference under `android/app/src/debug/`, and `NSAllowsLocalNetworking` in `ios/Runner/Info.plist`, or the
     check sees `nothing_received`. React Native's templates already allow both in debug builds, for Metro; check
     that the app still does.
3. The mobile SDKs send in batches, every 10 seconds or every 30 events. Ask the user to wait 15 seconds after the
   last action before saying done. The check waits up to 10 seconds more.

The mark, check and stop commands are unchanged; there is no `<APP>` to stop. `no_browser_traffic` in the diagnosis
is expected from a mobile app.

## Read the result

`jq -r .table` prints one row per planned event: the expected properties, how many arrived with which types, and
`ok`, `missing` or `wrong type`. A number sent as a string, such as `"$38.00"`, is the common bug. `integer` means
a whole number and also satisfies `number`. The report in `<D>/report.json` has the same facts as JSON: `pass`,
`complete`, `events[]` with each property's `expected` and `received` types, `unexpected`, `refused`, `unparsed`
and `pending` (1 while a line is half-written).

The diagnosis explains an empty or short pass:

- `nothing_received`: no event request reached the listener. The app is not pointed at it; check both URLs.
- `nothing_new`: requests arrived, but none after the mark.
- `sdk_loaded_no_events`: the SDK loaded its config and sent nothing. The action never ran, or the SDK's
  plugins did not load.
- `sdk_config_rejected`: the SDK's config request was refused, so it sent nothing. The listener was started with
  a write-key allowlist that does not have the app's key.
- `preflight_only`: only browser CORS preflights arrived.
- `body_rejected` and `auth_rejected`: requests were refused; the failed requests above say why.
- `missing_write_key`: requests arrived with no write key. The listener accepts them, but RudderStack would
  answer 401, so the app's key is not set.
- `no_browser_traffic`: requests arrived, none of them from a browser SDK. Expected when a server SDK or curl
  sends; for a browser app, the page never reached the listener.
- `all_accepted`: every request that arrived was accepted. It says nothing about events that never came; the
  table does.
