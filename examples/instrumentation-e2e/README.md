# End-to-end typed instrumentation (`--local`)

A working storefront app whose analytics client is **generated from YAML on disk** —
no workspace, no `apply`, no auth, no network. Clone, generate, typecheck, run.

This is the flow RudderStack dogfooded in `rudder-webapp`, reduced to something you
can run in a minute and read in ten.

```
catalog/                          app/
  data-catalog/     ──┐             src/analytics/generated/index.ts   (generated)
  tracking-plans/     ├─ typer ──▶  src/analytics/client.ts            (you write, once)
  data-graphs/      ──┘             src/App.tsx                        (call sites)
```

## Why `--local` changes the shape of the work

The remote flow needs a personal dev workspace, a tracking-plan ID, a gitignored
config file, a `rudder-cli apply`, and an authenticated round-trip **before you can
see a single type**. Every iteration on an event's shape mutates a live workspace.

`--local` reads the specs straight off your checkout. Generation publishes nothing,
so the design loop — reshape the event, regenerate, look at the compiler errors —
costs a second and touches no shared state. That is what makes the loop short enough
for an agent to drive.

## Prerequisites

- `rudder-cli` **>= 0.22.0** on your PATH — [releases](https://github.com/rudderlabs/rudder-iac/releases)
- Node 20+

Nothing else. No workspace, no access token, no `rudder-cli auth login`.

## Run it

```bash
cd app
npm install
npm run tp:sync      # catalog/ -> src/analytics/generated/
npm run typecheck
npm test
npm run dev
```

`tp:sync` is [`scripts/tp-sync.sh`](app/scripts/tp-sync.sh) — a ~40-line wrapper you
are meant to copy and adapt. It does four things the raw command does not:

| | |
| --- | --- |
| Pins a minimum CLI version | 0.22.0 changed the generated constructor; older output does not match `client.ts` |
| Sets `TMPDIR` next to the repo | the CLI renames a temp file onto the target — a cross-device link fails when the repo is on another volume |
| Sets both experimental flags | `--local` is gated twice; see [Enabling `--local`](#enabling---local) |
| Writes `SOURCE.md` | records which catalog commit produced the client |

## The loop this demo exists to show

Change what the catalog says, and the compiler tells you every place that no longer
complies. Make `couponCode` required in
[`catalog/tracking-plans/storefront.yaml`](catalog/tracking-plans/storefront.yaml):

```diff
         - property: "#property:coupon_code"
-          required: false
+          required: true
```

Then:

```bash
npm run tp:sync && npm run typecheck
```

```
src/App.tsx(5,7): error TS2741: Property 'couponCode' is missing in type
  '{ cartId: string; itemCount: number; cartTotal: number; currency: "usd"; }'
  but required in type 'CheckoutStarted'.
```

Four call sites break, in this app and in its tests. Nothing was applied anywhere;
revert the YAML, regenerate, and they are green again.

**When the types fight you, the finding is usually in the catalog.** In the webapp
dogfooding this exact failure mode turned out to be a real bug: two `identify` traits
were marked `required: true` but were absent on ~40% of production calls, because the
app fired `identify` before the billing store had hydrated. The old generator had
leaked `| undefined` into required fields, so it compiled and shipped for years. The
fix was to correct the contract, not to cast at the call site.

Never reach for `as` or `?? ''` to make a generated type accept your payload.

## What the generated client looks like

```ts
export interface CheckoutStarted {
  cartId: string;
  cartTotal: number;
  couponCode?: string;             // required: false in the plan
  currency: CustomTypeCurrencyType; // custom type -> union of its enum
  itemCount: number;
}

export class RudderTyper {
  constructor(resolveAnalytics: () => RudderAnalytics) { ... }

  public trackCheckoutStarted(props: CheckoutStarted, ...): void
  public identify(userId: string, traits?: IdentifyTraits, ...): void
}
```

Two things to notice:

**Track events are `track`-prefixed.** `trackCheckoutStarted`, not `checkoutStarted`.
`identify` / `group` / `page` / `screen` keep their plain names — the prefix is what
keeps an event named `page` from colliding with the SDK's own `page` method.

**The constructor takes a resolver, not an instance.** This is not a style choice.

## The footgun the dogfooding found

The standard RudderStack snippet installs a *buffering preloader* on
`window.rudderanalytics`, then swaps in the real SDK when the async script lands. A
client constructed at import time — before the swap — that captured the instance
would hold the preloader forever, and every event fired after the SDK loaded would go
into an abandoned queue. No error, no type error, no failed build. Events just quietly
stop arriving.

Since rudder-cli 0.22.0 the constructor is **resolver-only**, so the unsafe form is a
compile error rather than a convention:

```ts
new RudderTyper(window.rudderanalytics);   // error TS2345
new RudderTyper(() => window.rudderanalytics);  // re-resolved on every call
```

[`src/analytics/client.ts`](app/src/analytics/client.ts) is the single construction
point, and [`client.test.ts`](app/src/analytics/__tests__/client.test.ts) pins the
behaviour by simulating the swap. [`contract.type-test.ts`](app/src/analytics/contract.type-test.ts)
pins the compile errors: it is never executed, but every `@ts-expect-error` in it fails
`npm run typecheck` if the line stops being an error.

One gap remains: the generated code calls `this.analytics.track(...)` unguarded, so a
*missing* SDK still throws. This demo absorbs it with a stub proxy in `client.ts`;
upstream that is [DEX-554](https://linear.app/rudderstack/issue/DEX-554).

## Provenance, and why CI needs a check

The client is a build artifact of **another repository's state**. A stale or
wrong-branch catalog checkout silently produces a *different, valid-looking* client
that compiles and passes tests. Nothing in the type system notices.

`tp:sync` writes [`SOURCE.md`](app/src/analytics/generated/SOURCE.md) beside the client
recording the catalog commit, branch, and whether the working tree was dirty. Read it
before committing, and in review.

That is a convention, and conventions hold exactly as long as everyone remembers them.
[`ci/typed-client-drift.yml`](ci/typed-client-drift.yml) is the mechanical version:
`npm run tp:check` regenerates against the catalog's **default branch** and fails if
the committed client differs. Copy it into `.github/workflows/`.

It also enforces the merge order for free. Catalog PR merges first, consumer PR
second — because the check asks "is the committed client reproducible from catalog
main?", a consumer PR that lands ahead of its catalog change cannot pass.

> `rudder-webapp` does not have this check today. The discipline lives in `CLAUDE.md`
> and a skill, which is why the workflow is worth automating rather than documenting
> twice.

## Enabling `--local`

`--local` sits behind **two** gates, and both must be on. Each can be set by
environment variable or persisted in `~/.rudder/config.json`:

| Gate | Environment variable | Config file |
| --- | --- | --- |
| Umbrella experimental switch | `RUDDERSTACK_CLI_EXPERIMENTAL=true` | `"experimental": true` |
| The `localTyper` flag | `RUDDERSTACK_X_LOCAL_TYPER=true` | `"flags": { "localTyper": true }` |

The umbrella gate zeroes *every* experimental flag when it is off, so setting only
`RUDDERSTACK_X_LOCAL_TYPER` on a fresh install does nothing. The error message names
both environment variables; if you already have `"experimental": true` persisted, the
env var alone is enough — which is why the same command can appear to work on one
machine and not another.

## Mixed-kind projects

`catalog/` contains a [`data-graphs/`](catalog/data-graphs/storefront.yaml) spec that
code generation does not read. `typer generate --local` registers only the data
catalog provider and **skips kinds no registered provider owns**.

This is load-bearing. Before [rudder-iac#671](https://github.com/rudderlabs/rudder-iac/pull/671)
the legal `kind:` list was derived from the registered providers, so a `data-graph` or
`transformation` spec sitting beside the catalog failed syntax validation and aborted
the load — which made `--local` unusable in the very repository it was written for. A
tracking plan needs its catalog loaded alongside it, and the two only coexist at the
repo root, which is exactly where the other kinds live.

`rudder-cli apply` is unaffected: it builds the full provider set and still validates
every kind.

## Layout

```
instrumentation-e2e/
├── catalog/                     stands in for a data-gov repo
│   ├── data-catalog/
│   │   ├── categories/          event categories
│   │   ├── custom-types/        reusable enums (currency, plan tier)
│   │   ├── events/              event definitions
│   │   └── properties/          property definitions
│   ├── data-graphs/             a kind generation skips (see above)
│   └── tracking-plans/
│       └── storefront.yaml      rules binding events to properties
├── app/
│   ├── scripts/tp-sync.sh       regenerate + provenance + --check
│   ├── index.html               the SDK snippet, and the preloader swap
│   └── src/analytics/
│       ├── generated/           index.ts + SOURCE.md — committed, never edited
│       ├── client.ts            the single construction point
│       ├── index.ts             re-exports value and types separately
│       └── contract.type-test.ts
└── ci/typed-client-drift.yml    the drift check to copy
```

## Adapting this to your app

1. Point `CATALOG_PATH` at your catalog repo (defaults to `../catalog`).
2. Set `TRACKING_PLAN_ID` to your plan's `spec.id`. With exactly one plan in the
   project the flag is optional; with more than one the CLI lists the available IDs.
3. Copy `scripts/tp-sync.sh` and `ci/typed-client-drift.yml`, and adjust paths.
4. Keep one construction point for the client, and a resolver that returns the SDK.

Kotlin and Swift work the same way — `--platform kotlin|swift`, with
`rudder-cli typer options --platform <p>` listing the per-platform options.
