# Typed instrumentation, end to end

You have a web app. You want analytics events that are **defined once, enforced by the
compiler, and reviewable in a pull request** — instead of string literals scattered
across components that nobody can audit.

This is a working reference for that, plus the steps to set it up in your own app.

```
   your tracking plan                    your app
   ─────────────────                     ────────
   data-catalog/                         src/analytics/generated/   generated,
     events/        ──┐                    index.ts                 committed,
     properties/      │   rudder-cli                                never edited
     custom-types/    ├──  typer      ──▶
   tracking-plans/  ──┘   generate       src/analytics/client.ts    you write once
     storefront.yaml       --local
                                         src/**                     call sites
```

**The tracking plan is the contract. The client is a build artifact of it.** Your app
consumes the artifact and never invents an event shape of its own.

---

## Why this is different from what you do today

| | Before | With a generated client |
| --- | --- | --- |
| Event name | `track('checkout_startd', …)` — typo ships | `trackCheckoutStarted(…)` — method doesn't exist, build fails |
| Payload | whatever the caller passed | interface from the plan; missing or misspelt property is a compile error |
| Enum values | any string | union type — `'btc'` where you allow `usd \| eur \| gbp` won't compile |
| "Is this property always sent?" | ask an analyst, guess | `required` in the plan, non-optional in the type |
| Changing an event | grep, hope | change the YAML, recompile, the compiler lists every call site |
| Reviewing a change | read the diff of every component | read one diff of the generated client |

Nothing here needs a RudderStack workspace at development time. Generation reads YAML off
your disk — no login, no network, no `apply`, nothing published. That is what makes the
loop fast enough to use on every change.

---

# Part 1 — Run the reference

Prove the loop works before you wire it into anything of yours. With `rudder-cli`
already installed, the whole of Part 1 is seconds — installing the CLI is the wall clock.

## Prerequisites

- **rudder-cli ≥ 0.22.0** — check with `rudder-cli --version`. If you don't have it:

  ```bash
  curl -fsSL https://github.com/rudderlabs/rudder-iac/releases/latest/download/rudder-cli_Darwin_arm64.tar.gz \
    | tar -xz -C /usr/local/bin rudder-cli
  ```

  Swap the asset for your platform — [all releases](https://github.com/rudderlabs/rudder-iac/releases).
  Installing the CLI is the only slow part here; everything after it takes seconds.
- **Node 20+**

No account, no access token, no `rudder-cli auth login`.

## Enable local generation

> **Being removed.** `--local` is promoted to GA in
> [rudder-iac#821](https://github.com/rudderlabs/rudder-iac/pull/821); once that ships,
> no flags are needed and the command works out of the box. The gates below apply to
> rudder-cli **0.24.0 and earlier**, and setting them on a later release is harmless.

It is currently behind two feature flags, and **both** must be on. Each can be an
environment variable or a persisted setting in `~/.rudder/config.json`:

| Gate | Environment variable | `~/.rudder/config.json` |
| --- | --- | --- |
| Umbrella experimental switch | `RUDDERSTACK_CLI_EXPERIMENTAL=true` | `"experimental": true` |
| The `localTyper` flag | `RUDDERSTACK_X_LOCAL_TYPER=true` | `"flags": { "localTyper": true }` |

The umbrella gate zeroes *every* experimental flag when it is off, so setting only
`RUDDERSTACK_X_LOCAL_TYPER` on a fresh install does nothing. If you already have
`"experimental": true` saved, the environment variable alone is enough — which is why the
same command can work on a colleague's machine and not yours. When it fails, check both.

## Run it

```bash
cd app
npm install
npm run tp:sync      # ../catalog -> src/analytics/generated/
npm run typecheck
npm test
npm run dev
```

Open the app, click through **Sign in → Checkout → Pay by card**, and watch the console.
It stays empty and error-free: no write key is configured, so the events are swallowed by
a stub (see [Handling a missing SDK](#handling-a-missing-sdk)) while the payload shapes are
still enforced at compile time.

## See the loop actually work

Make one property required in [`catalog/tracking-plans/storefront.yaml`](catalog/tracking-plans/storefront.yaml):

`coupon_code` appears in **both** checkout rules — flip both, which is what the
command below does:

```diff
         - property: "#property:coupon_code"
-          required: false
+          required: true
```

```bash
sed -i '' '/#property:coupon_code/{n;s/required: false/required: true/;}' \
  ../catalog/tracking-plans/storefront.yaml
```

Then:

```bash
npm run tp:sync && npm run typecheck
```

```
src/App.tsx:5:7 - error TS2741: Property 'couponCode' is missing in type
  '{ cartId: string; itemCount: number; cartTotal: number; currency: "usd"; }'
  but required in type 'CheckoutStarted'.
```

**Every call site that no longer complies, from one line of YAML** — production code and
tests alike. You changed a governance decision and the compiler enumerated its entire
blast radius, before anything was applied to a workspace and with nothing published.

(The exact count moves as the example gains call sites, which is the point: it is derived
from your code, not asserted here.)

Revert the line, run `npm run tp:sync` again, and you are green. The regenerated client is
byte-identical to the committed one: generation is deterministic given the same catalog and
CLI version.

---

# Part 2 — Set it up in your own app

Two starting points. Pick the one that matches you.

**You already have a tracking plan in RudderStack** — pull it into YAML and skip to step 3:

```bash
rudder-cli auth login
rudder-cli import workspace -l ./my-catalog
```

**You are starting from nothing** — there is no `init` command; copy this example's
`catalog/` directory and edit it. That is what it is for.

## Step 1 — Create the catalog

Put it in its own repository if more than one app will consume it, or in a `catalog/`
directory beside your app if only one will. Four kinds of file:

```
catalog/
├── data-catalog/
│   ├── categories/     grouping, for the RudderStack UI
│   ├── properties/     every property, defined once
│   ├── custom-types/   reusable shapes and enums
│   └── events/         event identity only — no property rules
└── tracking-plans/
    └── storefront.yaml which events, which properties, which are required
```

**Events declare identity; plans decide requirements.** That separation is what lets the
same event be strict on mobile and permissive on web.

```yaml
# data-catalog/events/checkout.yaml
version: "rudder/v1"
kind: "events"
metadata:
  name: "checkout-events"
spec:
  events:
    - id: "checkout_started"
      name: "checkoutStarted"        # the name on the wire
      event_type: "track"            # track | identify | group | page | screen
      description: "Shopper opened the checkout drawer with a non-empty cart"
      category: "#category:checkout"
```

```yaml
# tracking-plans/storefront.yaml
version: "rudder/v1"
kind: "tracking-plan"
metadata:
  name: "storefront"
spec:
  id: "storefront"
  display_name: "Storefront Tracking Plan"
  rules:
    - type: "event_rule"
      id: "checkout_started_rule"
      event: "#event:checkout_started"
      additional_properties: false
      properties:
        - property: "#property:cart_id"
          required: true
        - property: "#property:coupon_code"
          required: false
```

References address by kind and id — `#event:`, `#property:`, `#category:`,
`#custom-type:`. Ids are unique across the project, so a reference never names the file it
points into.

See [`catalog/`](catalog/) for the full working set, including a custom type and an enum.

## Step 2 — Decide required vs optional honestly

This is the one decision worth slowing down for, and it is a **factual question, not a
style preference**: is this property present on every single call?

If you already send the event, the warehouse can answer it. If you are guessing, mark it
optional. Marking something required that is sometimes absent produces a type your code
cannot satisfy, and the pressure at that point is to paper over it — which is how the
contract quietly becomes a lie.

> A common shape: an `identify` trait marked required, fired on login before the store
> holding it has hydrated. It is absent on a large share of real calls, but a generator
> that leaks `| undefined` into required fields will compile it anyway — and every
> analysis that segments on that trait is quietly wrong for as long as it ships.

## Step 3 — Add a sync script

Copy [`app/scripts/tp-sync.sh`](app/scripts/tp-sync.sh) and point `CATALOG_PATH` at your
catalog. Wire it up in `package.json`:

```json
"scripts": {
  "tp:sync":  "bash scripts/tp-sync.sh",
  "tp:check": "bash scripts/tp-sync.sh --check"
}
```

Do not ask your team to remember the raw command. The script does four things the bare
command does not:

| | |
| --- | --- |
| Enforces a minimum CLI version | 0.22.0 changed the generated constructor; older output silently mismatches your `client.ts` |
| Sets `TMPDIR` beside the repo | the CLI renames a temp file onto the target, which fails across volumes on older releases |
| Sets both feature flags | so nobody debugs the two-gate problem twice |
| Writes `SOURCE.md` | records which catalog commit produced this client — **only when the catalog is a separate repo**, see below |

## Step 4 — Wire the client (the only file you write by hand)

```ts
// src/analytics/client.ts
import type { RudderAnalytics } from '@rudderstack/analytics-js';
import { RudderTyper } from './generated';

const noop = () => undefined;
const absentAnalytics = new Proxy({} as RudderAnalytics, { get: () => noop });

export const analytics = new RudderTyper(
  () => (window.rudderanalytics ?? absentAnalytics) as RudderAnalytics,
);
```

Three rules, and each one exists because of a real bug:

**Pass a resolver, never an instance.** The RudderStack snippet installs a buffering
preloader on `window.rudderanalytics` and swaps in the real SDK when the script loads. A
client that captured the instance at import time holds the preloader forever, and every
event after load goes into an abandoned queue — no error, no type error, no failed build.
Since 0.22.0 the unsafe form does not compile.

**Construct it exactly once**, in this file, and export the instance.

**Handle a missing SDK.**<a id="handling-a-missing-sdk"></a> The generated code calls
`analytics.track(...)` unguarded, so when no write key is configured and
`window.rudderanalytics` is `undefined`, firing an event throws a `TypeError`. The stub
above swallows it. Without it, an event fired inside a `try` whose `catch` shows the user an
error will report a *successful* action as a failure. (Being fixed upstream in
a future release; until then, every consumer needs these two lines.)

> Kotlin and Swift clients take an SDK instance rather than a resolver — mobile apps
> construct the SDK themselves, so there is no swap to survive. Do not carry this pattern
> across platforms.

## Step 5 — Fire your first event

```ts
import { storefront } from './analytics';

storefront.trackCheckoutStarted({
  cartId: cart.id,
  itemCount: cart.items.length,
  cartTotal: cart.total,
  currency: 'usd',
});
```

Track methods are `track`-prefixed. `identify`, `group`, `page` and `screen` keep their
plain names — the prefix is what stops an event called `page` colliding with the SDK's own
`page` method.

Two habits worth adopting immediately:

- **Never cast to satisfy a generated type.** An `as`, a `?? ''`, or a sentinel like
  `'none'` is not a fix — it is a finding about your plan being suppressed. Go change the
  YAML.
- **Never let analytics change behaviour.** Wrap `track` in `try {} catch {}` when it sits
  inside a `try` whose `catch` shows the user an error, and never fetch data to enrich a
  payload — use what the page already has.

## Step 6 — Commit both sides, and add the CI gate

Commit the generated `index.ts`. Committing the artifact is deliberate:
your build stays independent of the CLI, and **the diff of the generated client is the most
reviewable thing in the whole workflow** — it shows exactly which shapes changed, next to
the call sites that use them.

Then copy [`ci/typed-client-drift.yml`](ci/typed-client-drift.yml). It regenerates against
the catalog and fails if the committed client differs.

You need this because a stale client is not broken — it is *plausible*. In this example,
changing only an event's `description` and forgetting to regenerate leaves you with:

```
typecheck: PASS      tests: PASS      build: PASS
tp:check:  FAIL   ← the only gate that notices
```

Pin the CLI version in that job. The generated header embeds it, so an unpinned CLI turns
every release into a diff that looks like a change and isn't.

---

# Part 3 — Day-two workflows

The setup above happens once. These are the changes you will actually make.

Every one of them is the same three moves — **edit the catalog, regenerate, fix what the
compiler points at** — and none of them require a workspace.

## Add a new event

1. Add any new properties to `data-catalog/properties/`.
2. Add the event to `data-catalog/events/`.
3. Add an `event_rule` to each plan that should carry it.
4. `npm run tp:sync` — the new `trackYourEvent` method appears.
5. Add the call sites. `npm run typecheck`.

**You cannot do this from the app repo alone.** If your catalog is a separate repository,
an app PR that invents an event without a matching catalog PR is incomplete by
construction — see [Two repositories](#two-repositories).

## Add a property to an existing event

Add it to `data-catalog/properties/`, then reference it from the rule:

```yaml
      properties:
        - property: "#property:discount_applied"
          required: false      # start optional; you cannot backfill history
```

**Add it as optional unless every existing call site can supply it.** Required on an event
you already emit means old data violates the new contract, and every call site breaks at
once.

## Make an optional property required

The interesting one, because it is the change that finds bugs.

```diff
-          required: false
+          required: true
```

Regenerate, and the compiler lists every call site that cannot supply it. Now read that
list honestly:

- **Every site can supply it** → good, the tightening was correct.
- **Some site genuinely cannot** → your data does not have this property always. Revert to
  optional. That failing typecheck just told you something true about production.

Never resolve this with a cast.

## Change a property's type or allowed values

Adding an enum value is safe — the union widens. Removing one breaks any call site using
it, which is the point:

```yaml
    - id: "payment_method"
      name: "paymentMethod"
      type: "string"
      config:
        enum: ["card", "paypal", "apple_pay"]
```

Constraint keys live under `config` in snake_case — `min_length`, `max_length`, `minimum`,
`maximum`, `min_items`, `enum`, `format`. `format` accepts only `date-time`, `date`, `time`,
`email`, `uuid`, `hostname`, `ipv4`, `ipv6`; there is no `uri`, so URL properties use
`max_length`.

Note that regex and length constraints **cannot** be enforced at compile time — only enums
can, because only enums are a finite set of values. Everything else is a runtime concern.

## Reuse a shape across many events

Define it once as a custom type and reference it everywhere:

```yaml
# data-catalog/custom-types/shared-types.yaml
    - id: "currency_type"
      name: "Currency_type"
      type: "string"
      config:
        enum: ["usd", "eur", "gbp"]
```

It becomes one named union in the generated client, shared by every event that references
it. Change the enum once and every consumer updates. Object custom types work the same way
with a `properties:` list.

## Retire an event

Remove its rule from the plan and regenerate. The method disappears and every call site
fails to compile, which is exactly the list of places you need to delete.

Do **not** delete the event from `data-catalog/events/` in the same change if it is still
referenced by another plan, and do not rename an event's wire `name` casually — that name
is your warehouse table. Renaming splits your history in two.

## Different rules per platform or environment

One catalog, several plans. Copy a plan, give it a new `spec.id` and `display_name`, and
change what it requires:

```yaml
spec:
  id: "storefront_mobile"
  rules:
    - type: "event_rule"
      event: "#event:checkout_started"
      additional_properties: false     # stricter than web
      properties:
        - property: "#property:device_id"
          required: true               # mobile-only requirement
```

Then generate per plan and platform:

```bash
for p in typescript kotlin swift; do
  rudder-cli typer generate --local --location ../catalog \
    --tracking-plan-id storefront --platform "$p" --output "clients/$p"
done
```

With more than one plan in the project, `--tracking-plan-id` becomes required; the CLI
lists the available ids if you omit it.

## Publish the plan to RudderStack

Everything above is local. When you want the plan to exist in your workspace — so it shows
in the UI and can be connected to a source — that is a separate, deliberate step:

```bash
rudder-cli auth login
rudder-cli validate -l ./
rudder-cli apply --dry-run -l ./
rudder-cli apply -l ./
```

**Keep `apply` out of your development loop.** It mutates a shared workspace, and you do not
need it to generate code or to iterate on a shape. It belongs in a deploy job on the catalog
repository, after merge.

---

## Provenance, and why this example has none

The generated client is a build artifact of **another repository's state**. Generate
from a stale or wrong-branch catalog and you get a *different, valid-looking* client
that compiles and passes tests; nothing in the type system notices. That is what
`SOURCE.md` is for — it records the catalog commit, branch and clean/dirty state beside
the client, so a reviewer can check the client against the catalog change it claims to
come from.

**It only works when the catalog is a separate repository.** Then the commit it names is
already final, and the record is exact.

In a single repo — which is what this example is — it cannot be honest. Writing the
hash changes the file, which changes the hash, so the record always names the *previous*
commit; and any regeneration mid-session records `DIRTY`. Committing that is worse than
committing nothing, because it reads as evidence while asserting something untrue.

So `tp-sync.sh` detects the case and skips the file:

```
✅ typed client regenerated (catalog is in this repository — provenance is this commit)
```

Point `CATALOG_PATH` at a catalog in its own repository and you get the real thing:

```
✅ typed client regenerated from 80aa64904 (main, clean)
```

Nothing is lost here. When both sides land in one commit, that commit *is* the
provenance — and [`tp:check`](#step-6--commit-both-sides-and-add-the-ci-gate) still
proves the committed client matches the catalog, which is the guarantee that actually
matters.

## Two repositories

If your catalog is a separate repo from your app, the two pull requests are **ordered, not
simultaneous**:

1. Open the catalog PR.
2. Open the app PR — regenerated client, `SOURCE.md`, and call sites — linked to the first.
3. **Merge the catalog PR first.**
4. Rebase the app PR, regenerate, merge.

The committed client must be reproducible by regenerating from the catalog's default
branch. Merge the app side first and a regeneration off that branch produces a *different*
client, so what you committed drifts and its recorded provenance becomes false.

The CI check enforces this for free: it asks "is this client reproducible from catalog
main?", so an app PR that lands ahead of its catalog change cannot pass.

**Keep the catalog PR rebased while it is open**, or a regeneration off a stale branch
silently drops whatever else landed meanwhile.

---

## Who does what

The loop is short enough that an AI coding agent can drive most of it. The division that
works:

| | Human | Agent |
| --- | --- | --- |
| What to measure, event naming | **owns** | proposes |
| Required vs optional | **owns** — it is a data question | flags when the compiler disagrees |
| Writing the YAML | reviews | writes |
| Regenerate, add call sites, typecheck | — | **owns**, iterates freely |
| Inventorying what already fires | reviews | **owns** — grep for existing calls first |
| Casting to make the build pass | never | **never** — hard stop, go fix the YAML |
| Opening the paired PRs | approves | **owns** |
| `rudder-cli apply` | **owns** | never, unattended |

The one instruction worth giving an agent explicitly: *if the generated types fight you, the
catalog is wrong — change the YAML, not the call site.* Left to itself, an agent under
pressure to make a build green will reach for a cast, and a cast is how a wrong contract
survives.

---

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `--local is experimental; enable it by setting both …` | one or both feature flags are off — check both |
| `unsupported platform: …` | `--platform` is required: `typescript`, `kotlin` or `swift` |
| `multiple tracking plans found` | pass `--tracking-plan-id`; the error lists the ids |
| `'kind' must be one of [...]` | a resource kind generation doesn't own, on a CLI older than 0.21.0 — upgrade |
| `cross-device link` | repo on a different volume than `/tmp` on a CLI older than 0.22.0 — set `TMPDIR` beside the repo |
| `error TS2345: … not assignable to '() => RudderAnalytics'` | you passed an SDK instance; pass a resolver |
| Events stop arriving after page load, no errors | an instance was captured at construction |
| `TypeError: Cannot read properties of undefined (reading 'track')` | no write key, no stub — see step 4 |
| Generated client changes with no catalog change | different CLI version; the header embeds it. Pin it |
| Regenerating drops events you didn't touch | generated from a stale catalog branch — check `SOURCE.md` |
| `v0.1 spec format is deprecated` | run `rudder-cli migrate -l ./`; note it strips comments |

## Known limits

Worth knowing before you commit to this:

- **Local generation is experimental** and behind feature flags. The flags may change.
- **A missing SDK throws** from generated code; you supply the guard.
- **Only enums are compile-time enforced.** Regex, length and range constraints are runtime
  concerns, as is anything about values rather than shapes.
- **No provenance file in this example**, deliberately — see [Provenance, and why this example has none](#provenance-and-why-this-example-has-none).
- **`rudder-cli migrate` strips comments** and reorders keys. Fine for a production catalog,
  costly for one you use to teach.

## Layout

```
instrumentation-e2e/
├── catalog/                     the tracking plan — copy this to start
│   ├── data-catalog/{categories,custom-types,events,properties}/
│   ├── data-graphs/             a kind code generation skips (see below)
│   └── tracking-plans/storefront.yaml
├── app/
│   ├── scripts/tp-sync.sh       regenerate + provenance + --check
│   ├── index.html               the SDK snippet and the preloader swap
│   └── src/analytics/
│       ├── generated/           index.ts — committed, never edited
│       ├── client.ts            the single construction point
│       └── contract.type-test.ts  compile-time assertions about the generator
└── ci/typed-client-drift.yml    the drift check to copy
```

`catalog/data-graphs/` holds a spec code generation does not read. It is there on purpose:
`typer generate --local` registers only the data catalog and **skips kinds it does not
own**, so a real project's other resources can sit alongside the catalog without breaking
generation. `rudder-cli apply` still validates all of them.
