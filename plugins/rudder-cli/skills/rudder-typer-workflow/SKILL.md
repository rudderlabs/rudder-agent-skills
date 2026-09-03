---
name: rudder-typer-workflow
description: Generates a type-safe analytics client (TypeScript, Kotlin, Swift) from a RudderStack tracking plan, including the offline `--local` flow needing no workspace, apply or auth. Use when generating typed tracking code, wiring a generated client into an app, or setting up the catalog-to-code loop.
allowed-tools: "Bash(rudder-cli *), Read, Write, Edit"
---

# RudderTyper workflow

Generate a type-safe analytics client from a tracking plan, so event names and
payload shapes are enforced by the compiler instead of by review.

**A complete, runnable example lives at `examples/instrumentation-e2e/`** in this
repo — a storefront app with a catalog, a sync script, a drift check and tests.
Read it when you need working code rather than instructions.

## Two ways to generate

| | Reads from | Needs auth/network | Use for |
| --- | --- | --- | --- |
| `--local` | tracking plan YAML on disk | no | the design loop, CI, monorepos with the catalog in-repo or a sibling checkout |
| default | the tracking plan in your workspace | yes | generating against a plan you did not author, or one that only exists remotely |

`--local` is what makes the loop short. Generation publishes nothing, so reshaping an
event and regenerating costs a second and mutates no shared state. The remote flow
needs a workspace, a plan ID, an `apply` and an authenticated round-trip before you
can see a single type.

**Do not put `rudder-cli apply` in the iteration loop.** Applying is how a catalog
change reaches a workspace, which is a merge-time concern. It is not a prerequisite
for generating code.

## Enabling `--local`

Experimental, behind **two** gates. Both must be on; each can be an environment
variable or a persisted setting in `~/.rudder/config.json`:

| Gate | Environment variable | `~/.rudder/config.json` |
| --- | --- | --- |
| Umbrella experimental switch | `RUDDERSTACK_CLI_EXPERIMENTAL=true` | `"experimental": true` |
| The `localTyper` flag | `RUDDERSTACK_X_LOCAL_TYPER=true` | `"flags": { "localTyper": true }` |

The umbrella gate zeroes *every* experimental flag when off, so setting only
`RUDDERSTACK_X_LOCAL_TYPER` on a fresh install does nothing. If the user already has
`"experimental": true` persisted, the env var alone works — which is why the same
command can succeed on one machine and fail on another. When it fails, check both.

Requires **rudder-cli >= 0.22.0**. Check with `rudder-cli --version` before anything
else; older versions generate a client with a different constructor (see
[The event-drop footgun](#the-event-drop-footgun)).

## Commands

There are exactly two subcommands.

```bash
rudder-cli typer generate --platform <typescript|kotlin|swift> [flags]
rudder-cli typer options  --platform <typescript|kotlin|swift>
```

There is **no `typer init`**, no `ruddertyper.yml`, no `--config` and no `--verbose`.
If you are reaching for a config file, you are thinking of the retired npm
`rudder-typer` v1. Everything is flags.

| Flag | Notes |
| --- | --- |
| `--platform` | **required** — `typescript`, `kotlin` or `swift` |
| `--local` | read specs from disk instead of the workspace |
| `-l`, `--location` | project directory or spec file for `--local` (default `.`) |
| `--tracking-plan-id` | the workspace plan ID; with `--local`, the plan's `spec.id`. Optional when the project has exactly one plan — with more, the CLI lists the available IDs |
| `-o`, `--output` | output directory (default `.`) |
| `--option k=v` | platform option, repeatable — run `typer options` for the list |

```bash
# offline, from a catalog checked out beside the app
RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_LOCAL_TYPER=true \
  rudder-cli typer generate \
    --local --location ../rudder-data-gov \
    --tracking-plan-id webapp \
    --platform typescript \
    --output src/analytics/generated \
    --option outputFileName=index.ts
```

Platform options are few and real: `outputFileName` on all three, plus `packageName`
and `composeImmutable` on Kotlin. See `references/platforms.md` for output shapes and
SDK wiring per platform.

## The loop

```
edit the catalog  ──▶  regenerate  ──▶  typecheck / build  ──▶  fix call sites
      ▲                                                              │
      └──────────  types awkward? the catalog is wrong  ◀────────────┘
```

1. **Edit the catalog** — event, properties, and the tracking-plan rule binding them.
2. **Regenerate** — `typer generate --local`. Nothing is published.
3. **Compile.** The generated types are now the contract; the compiler lists every
   call site that no longer complies.
4. **If the types fight you, fix the YAML.** Go back to 1.

Only when the call sites need no adapters do you open PRs.

### Never cast to satisfy a generated type

An `as` cast, a `?? ''`, or a sentinel like `'none'` to make a payload fit is not a
workaround — it is a finding about the catalog being suppressed.

In the rudder-webapp dogfooding this exact failure mode was a real bug: two `identify`
traits were `required: true` in the plan but absent on ~40% of production calls,
because the app fired `identify` before its billing store had hydrated. The previous
generator leaked `| undefined` into required fields, so it compiled and shipped that
way for years. The fix was to correct the contract, not the call site.

If a property is genuinely not always available, mark it `required: false` and let it
be optional in the generated type.

## Reading the generated client

Track events are **`track`-prefixed** — `trackCheckoutStarted`, not `checkoutStarted`.
`identify`, `group`, `page` and `screen` keep their plain names. The prefix is what
keeps an event named `page` from colliding with the SDK's own `page` method, and it is
consistent across all three platforms.

Custom types become named unions/enums shared across events; a property's `enum`
becomes a union scoped to that property. Optional plan properties become optional
fields. The client also stamps a `ruddertyper` context block (platform, CLI version,
plan ID and version) onto every call, which is how you tell typed traffic apart
downstream.

## The event-drop footgun

The TypeScript constructor takes a **resolver, not an instance**:

```ts
export const analytics = new RudderTyper(() => window.rudderanalytics);
```

The standard RudderStack snippet installs a buffering preloader on
`window.rudderanalytics` and swaps in the real SDK when the async script lands. A
client that captured the instance at import time — before the swap — holds the
preloader forever, and every event fired after the SDK loads goes into an abandoned
queue. No error, no type error, no failed build. Events simply stop arriving.

Since 0.22.0 the constructor is resolver-only, so the unsafe form does not compile.
Construct the client **exactly once**, in one module, and export that instance.

Two related gaps to know about:

- The generated code calls `analytics.track(...)` unguarded, so an *absent* SDK (no
  write key configured) throws rather than no-opping. Absorb it in your construction
  point with a stub — `examples/instrumentation-e2e/app/src/analytics/client.ts` shows
  one. Tracked upstream as DEX-554.
- Wrap `track` calls in `try {} catch {}` when they sit inside a `try` whose `catch`
  shows the user an error, or a blocked SDK will make a successful action report as a
  failure. Analytics must never change behaviour.

## Provenance: the client is a build artifact of someone else's repo

Types come from specs on disk, so a stale or wrong-branch catalog checkout silently
produces a **different, valid-looking** client that compiles and passes tests. Nothing
in the type system notices, and the default catalog path is usually a directory that
exists and is usually on some other branch.

Write a `SOURCE.md` beside the generated client recording the catalog commit, branch
and whether the tree was dirty, and regenerate it on every sync. Check it before
committing, and when reviewing either side of the pair — it is the only thing tying
the two repos together.

Wrap the raw command in a small sync script rather than asking people to remember the
flags. Copy `examples/instrumentation-e2e/app/scripts/tp-sync.sh`, which also pins the
minimum CLI version, sets `TMPDIR` beside the repo (the CLI renames a temp file onto
the target, which fails across volumes on older CLIs), and offers a `--check` mode.

### Merge order, when the catalog is a separate repo

Catalog PR **first**, consumer PR second. The committed client has to be reproducible
by regenerating off the catalog's default branch; merging the consumer first makes a
regen off main produce a different client, so the committed one drifts and its
`SOURCE.md` becomes false. Keep the catalog PR rebased on main while it is open, or a
regen off a stale branch silently drops whatever else landed.

### Enforce it in CI

The above is a convention, and conventions hold as long as everyone remembers them.
`examples/instrumentation-e2e/ci/typed-client-drift.yml` regenerates against the
catalog's default branch and fails if the committed client differs — which enforces
the merge order mechanically, because a consumer PR ahead of its catalog change cannot
pass. Pin the CLI version in that job: the generated header embeds it, so an unpinned
CLI turns every release into a spurious diff.

## Mixed-kind projects

`typer generate --local` registers only the data catalog provider and **skips kinds no
registered provider owns**, so `data-graphs/` and `transformations/` specs can sit
beside the catalog without breaking the load. This matters because a tracking plan
needs its catalog loaded alongside it, and the two usually only coexist at the repo
root — which is exactly where the other kinds live. `rudder-cli apply` is unaffected
and still validates every kind.

## Troubleshooting

| Symptom | Cause |
| --- | --- |
| `--local is experimental; enable it by setting both …` | one or both gates are off — see [Enabling `--local`](#enabling---local) |
| `unsupported platform: …` | `--platform` is required and must be `typescript`, `kotlin` or `swift` |
| `multiple tracking plans found, specify --tracking-plan-id` | pass the plan's `spec.id`; the error lists the available ones |
| `'kind' must be one of [...]` | the project holds a kind generation does not own, on a CLI older than 0.21.0 — upgrade |
| `cross-device link` on generate | repo on a different volume than `/tmp` on a CLI older than 0.22.0 — set `TMPDIR` beside the repo |
| `error TS2345: … not assignable to parameter of type '() => RudderAnalytics'` | you passed an SDK instance; pass a resolver |
| Events stop arriving after the SDK loads, no errors | an instance was captured at construction — the resolver is the fix |
| Generated client changes with no catalog change | a different CLI version; the header embeds it. Pin the CLI |
| Regenerating drops events you did not touch | you generated from a stale catalog branch. Check `SOURCE.md` |

## Red flags — stop

- Writing a `ruddertyper.yml`, or running `rudder-cli typer init` → neither exists
- Hand-writing TypeScript types to mirror a tracking plan → TypeScript is generated
- `rudder-cli apply` inside the design loop → applying is a merge-time concern
- An `as` cast or `?? ''` to satisfy a generated type → fix the catalog
- Editing the generated file → it is overwritten on the next sync
- Constructing the client in more than one place, or with an instance
- Committing a client whose `SOURCE.md` does not match the paired catalog change
- A consumer PR with a new event and no catalog PR linked → incomplete, not "phase two"
