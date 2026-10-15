# Browser instrumentation

Verified with `@rudderstack/analytics-js` 3.34.3, Vite 8 and React 19 on 2 Oct 2026. Adapt the file names to
the app's layout; keep the shape.

## Environment

`.env.local` (Vite reads `VITE_*` variables; most templates already git-ignore `*.local`):

```text
VITE_RUDDERSTACK_WRITE_KEY=<write key from MCP list_sources>
VITE_RUDDERSTACK_DATA_PLANE_URL=<dataPlaneURL from rudder-cli workspace info --json>
```

Add `VITE_RUDDERSTACK_CONFIG_URL` only when the workspace's control plane is not RudderStack cloud, for example a
self-hosted or local stack; the SDK then fetches the source's config from there. Leave it unset otherwise.

Variables already set in the process environment win over `.env` files, which is how step 7 points the
app at the local server without editing `.env.local`.

Type them in `src/vite-env.d.ts`:

```ts
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_RUDDERSTACK_WRITE_KEY?: string
  readonly VITE_RUDDERSTACK_DATA_PLANE_URL?: string
  readonly VITE_RUDDERSTACK_CONFIG_URL?: string
}
```

For Next.js use `NEXT_PUBLIC_` names; for Create React App, `REACT_APP_`.

## Load the SDK once

`src/analytics/rudderstack.ts`, called once before the app renders (for example in `main.tsx`):

```ts
import { RudderAnalytics } from '@rudderstack/analytics-js/bundled'

const writeKey = import.meta.env.VITE_RUDDERSTACK_WRITE_KEY
const dataPlaneUrl = import.meta.env.VITE_RUDDERSTACK_DATA_PLANE_URL
// Set only when the control plane is not RudderStack cloud (self-hosted or a local stack).
const configUrl = import.meta.env.VITE_RUDDERSTACK_CONFIG_URL

export function loadRudderStack(): void {
  if (window.rudderanalytics) return
  if (!writeKey || !dataPlaneUrl) {
    if (import.meta.env.DEV) {
      console.error(
        '[analytics] VITE_RUDDERSTACK_WRITE_KEY or VITE_RUDDERSTACK_DATA_PLANE_URL is not set. ' +
          'No events are sent until they are.',
      )
    }
    return
  }
  const sdk = new RudderAnalytics()
  sdk.load(writeKey, dataPlaneUrl, configUrl ? { configUrl } : {})
  window.rudderanalytics = sdk
}
```

- `/bundled` ships the SDK plugins inside the package, so nothing is fetched from the CDN.
- The SDK declares `window.rudderanalytics` itself. Do not redeclare it; derive types from
  `NonNullable<Window['rudderanalytics']>`, or the build fails.

## One typed function per event

`src/analytics/client.ts`. Read the global on every call (a resolver, never a captured instance), and never
let analytics break the click handler that calls it:

```ts
import type { ApiObject } from '@rudderstack/analytics-js'

type Tracker = NonNullable<Window['rudderanalytics']>
const absent: Tracker = { track: () => undefined }

function tracker(): Tracker {
  const t = window.rudderanalytics
  return t && typeof t.track === 'function' ? t : absent
}

function track(event: string, properties: ApiObject): void {
  try {
    tracker().track(event, properties)
  } catch (error) {
    console.warn(`[analytics] ${event} was not sent`, error)
  }
}

export type OrderCompleted = { order_id: string; total: number; currency: string; item_count: number }

export const analytics = {
  orderCompleted: (p: OrderCompleted) => track('Order Completed', p),
  // one function per agreed event
}
```

Property names follow the app's conventions; snake_case is RudderStack's default. Money is a number in the
currency's major unit, never a formatted string.

## Call sites

Call the functions where the moment happens (the click handler, the route change, the success callback),
with values the code already has. Do not add state just to track it.

## Check

- `npx tsc --noEmit` (or `npm run build`) passes.
- `git status` shows `.env.local` untracked and ignored.
