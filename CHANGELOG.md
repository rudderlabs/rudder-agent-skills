# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **`rudder-core` / `rudder-setup` reads every destination spec from rudder-cli.** It needs
  the first rudder-cli release that contains rudderlabs/rudder-iac#989 and #990. Step 4 writes the
  spec from `rudder-cli docs destination <type> --source <source type> --id <id> --json`
  (rudder-iac#989): its `specTemplate`, then the keys, allowed values, defaults, patterns,
  connection modes and conditional rules that output lists, with each secret key holding the slot
  it prints and each variable written to the var file as `NAME:`. Its done check is validate's
  `destination/secret-reference` and `destination/secret-reference-unique` warnings
  (rudder-iac#990), which name a secret key that holds a value and a variable that fills two keys.
  Validate exits 0 with either warning, so step 5 does not go on to the dry run, or commit, while
  one shows. Step 4 turns away a destination that needs the dashboard's OAuth sign-in (a required
  `rudder_account_id`) and one that takes only device mode, which step 8 cannot confirm.
  When the output lists secret keys that nothing requires, no custom validator checks and the
  template does not hold, such as a webhook's header value, step 4 asks one question that names
  them, with No first, and adds the ones the user picks.
  Step 1 probes for both features, not for a version, and stops with upgrade instructions when
  either is missing. It first probes a copy an earlier install left in `~/.local/bin` by its full
  path, and uses that copy when it has both. After an install it probes again, by the full path
  when a plain `rudder-cli` runs another copy or none, and stops only if the latest release lacks
  them. The skill never falls back to written-down keys. When no platform is detected, the "What will send
  events" options come from `rudder-cli docs source --json`. `references/destinations.md` keeps
  only the layout, the source and connection specs, how to get a webhook endpoint, and how to
  write values in the var file, JSON keys and `'` included. It gives a command that writes a key
  file into the var file without printing it, and says that a multi-line secret, such as a PEM
  private key, cannot go through the var file yet. It names no destination keys, samples or secret
  names. `rudder-core` 0.0.10.
- **Breaking (repo layout):** renamed the top-level `skills/` directory back to
  `plugins/` (reverting the earlier `plugins/` → `skills/` rename). Each plugin
  lives at `plugins/<plugin>/skills/<skill>/SKILL.md`; marketplace `source` fields
  were updated to match. The rename to `skills/` was unnecessary — skills.sh
  discovery is manifest-driven and name-agnostic — and it broke cursor.directory,
  whose parser derives a skill's name from the first `skills/` path segment and so
  collapsed every plugin's skills into a single mis-named entry. `npx skills add`
  and Claude Code install UX are unchanged.

### Fixed

- **`rudder-profiles` / `rudder-profiles-setup`, `rudder-profiles-update`** —
  quoted the `description` frontmatter. An unquoted `: ` (colon-space) made the
  skills.sh CLI's YAML parser read it as a nested mapping and reject the
  frontmatter, silently dropping both skills from skills.sh (21/23 → 23/23 now).

### Added

- **`rudder-core` carries the RudderStack MCP server** — `plugins/rudder-core/.mcp.json`
  declares `rudderstack`, an HTTP server at `https://mcp.rudderstack.com/mcp` with no headers.
  Installing the plugin connects MCP; the client asks the user to sign in to RudderStack in the
  browser (OAuth) the first time a tool runs. Claude Code lists it as
  `plugin:rudder-core:rudderstack`, and cursor.directory picks up the same file.
  When the MCP tools are missing, `rudder-destination-debugging` and `rudder-environment-check`
  connect the server that is there before adding one. They find it by its URL under any name with
  `claude mcp list`, keep an access-token entry at `/bearer-auth-mcp` with the plugin's entry
  disabled, and have the user enable that entry in `/mcp` without `Authenticate` if it is
  disabled, or approve it at Claude Code's next start if it is pending approval. They have the user
  authenticate an entry at `/mcp`, and give the `claude mcp add` command,
  and a line for other agents, only when there is none. The environment check also looks for
  `list_sources` and `get_source`, which both routes have. Claude Code skips the
  plugin's entry when a hand-added HTTP server has the same URL, but keeps both beside a hand-added
  `npx -y mcp-remote` entry, so remove that one with `claude mcp remove rudderstack`. It also
  keeps both beside an access-token entry at `https://mcp.rudderstack.com/bearer-auth-mcp`, a
  different URL, so in that folder disable the plugin's entry in `/mcp`. The README says the
  server comes with plugin installs only, and how to add it after `npx skills add`.
- **`rudder-core` / `rudder-setup`** — nine steps from an app with no analytics to one real
  event delivered to a destination the user picks: start, explore, goal, destination and secrets,
  plan and apply, instrument, verify locally, verify live, wrap up. Specs live in `rudder/`; the
  skill carries the measured traps (silent decline without `--confirm=false`, workspace-wide
  deletes, the write key's two-minute 401 window, MCP metrics without timestamps, hashed live
  event values). References cover destination specs with secrets as variables, browser
  instrumentation, and local and live verification.
  Step 1 looks at the folder before changing anything. Outside an app (an empty folder, the home
  folder, a folder of several repositories) it recommends starting again in the app, and can
  instead continue without one, in a new subfolder unless the folder is empty, and send the first
  planned event with curl. It stops on uncommitted changes, and commits an app that was not in git
  as it is before changing it, so a `git revert` never deletes the app's files. Every commit names
  its paths, in `git add` and after `git commit --`, so changes the user staged stay out of it.
  Step 3 writes the event names and property types to `rudder/plan.events.json`, and steps 6 to 8
  read them from there. Step 7 captures events with `rudder-cli sources listen` and
  checks them against that file with a jq program shipped beside the references, in two shell
  calls, or in one for agents that stop background processes when a call returns. The destination
  reference leaves unfilled secrets as `NAME:` with no value, names every secret key of Amplitude
  and Mixpanel, and lists the 24 verified destination types. It says a secret that spans lines,
  such as a PEM key, keeps its line breaks only from rudder-cli 0.29.0, as a `|` block. Step 4 asks
  whether a webhook needs an authentication header and, on yes, for its name, `Authorization` by
  default; the user fills its value, such as `Bearer <token>`, in the var file.
  Step 1 runs its read-only checks before it changes the folder, and commits the `.gitignore` lines
  for the var file and `.env.local` on their own, so the undo (revert the instrumentation and specs
  commits, then apply) never un-ignores a secret. Step 5 shows validate's errors without the source
  lines, which print secret values. The skill needs rudder-cli 0.26.0 or later, the first release
  that accepts its destination specs without experimental flags, and step 1 installs the latest
  release when the copy it finds is older. Step 7 needs 0.29.0 or later and is skipped on an older
  one; its one-call recipe exits 5 when the app cannot start, and both recipes exit 3 when the
  listener stops during a check. Step 8 builds the curl event
  from the plan. Step 1 downloads the installer into a new temporary folder. While the installer
  is unpublished, it runs a script shipped with the skill instead, which installs the latest
  release's archive (the arm64 build under Rosetta) after checking it against the release's
  checksums file. After an install, or when only a copy an earlier install left in `~/.local/bin`
  works, and a plain `rudder-cli` runs another copy or none, the agent runs
  `"$HOME/.local/bin/rudder-cli"` for the rest of the session and gives the user that path for any
  rudder-cli command they run. Step 9's summary shows the `export PATH` line for the user's shell
  profile, and so does any stop before step 9.
  Step 2 runs a probe that names the app's source type: Flutter and React Native first, because
  their apps also hold `android/` and `ios/` folders, then Android (`android_kotlin`), iOS
  (`ios_swift`, from an Xcode project or a Podfile), web, and only then server languages; a
  `Package.swift` or a `package.json` alone makes it ask. When it finds several apps, of one type or
  several, it lists each with its folder and asks which one sends events, and an app in a subfolder
  gets its `.env.local` and its build commands in that folder; when it finds none it asks "What
  will send events to RudderStack?", the question step 1 asks outside an app, now defined once. It
  also lists the RudderStack and Segment SDKs the dependencies name, the legacy Android (Java) and
  iOS (Objective-C) SDKs included. New Android (Kotlin SDK) and iOS (Swift SDK) references add the
  dependency, keep the write key out of git, load the SDK once and give each agreed event a typed
  function, in Kotlin or Java and in Swift or Objective-C. Step 7 checks a mobile app on an Android
  emulator (`10.0.2.2`) or the iOS Simulator, or is skipped without one, and step 8 runs the app
  against the real data plane. A Capacitor or Cordova app gets the JavaScript SDK, and a Unity game
  the Unity SDK. An app that already uses a RudderStack SDK keeps its current source unless the
  user agrees to move it, and a legacy SDK is replaced only on a yes. When the app keeps its
  source, step 6 writes the new write key to `rudder/first-event.vars.yaml`, not to the app's
  `.env.local`, and step 8's probe and curl send read it from there. The iOS reference never edits
  `project.pbxproj` and gives the user its Xcode changes in one list. Neither mobile reference
  turns off plain HTTP an app already allows: iOS gets `NSAllowsLocalNetworking` only without
  `NSAllowsArbitraryLoads`, and Android's debug network config is skipped when
  `usesCleartextTraffic` is on and no network security config is set. With one, which Android 7.0
  and later obey over that attribute, the debug config copies its rules and adds `10.0.2.2`. An
  Expo app gets a development build instead of Expo Go, GA4 on a mobile source uses its Firebase
  app stream, and an app the user will not upgrade, or cannot run on any emulator, simulator or
  device, sends its first event with curl.
  Steps 7 and 8 commit each fix they make, and the undo reverts those commits with the rest. Before
  step 6 writes the write key or data plane URL to a git-ignored file, such as `.env.local` or an
  iOS app's `RudderStack.local.xcconfig`, on any path, it saves the file in the git directory under
  the app folder's own path, and afterwards records what it wrote. The undo reads that folder, in
  the same session or a later one: it puts back each file that still holds what step 6 wrote,
  deletes the ones step 6 created, and asks before replacing a file the user changed since. It then
  drops its copies of each file it dealt with, so a later onboarding saves the file as it is then.
  The undo starts with a dry run and stops if it would remove anything, because the workspace then
  holds resources that `rudder/` does not, such as another project's. After its reverts it stops
  again if the dry run would remove a resource that the reverts did not take out of `rudder/`,
  comparing kind and id, since ids are unique only per kind.
  Every validate, dry run and apply runs through a filter that keeps only the lines
  rudder-cli is known to print, because validate shows the spec line a message is about with secrets
  filled in, and a multi-line secret runs over several lines. Step 8's probe reads only its two
  values from `.env.local`, as dotenv reads them, and never runs the file as shell. It gives each
  request 10 seconds, stops on any status but 400, 2xx and 401, and prints the data plane's answer,
  so a disabled source (404), a rate limit (429) or a server error is not taken for a wrong data
  plane URL; it reruns for those a bounded number of times. The curl send waits until the probe
  accepts the key. When the workspace holds resources another project manages, step 2 stops and
  offers an empty workspace: `rudder-cli import workspace` cannot take them over, and specs copied
  from that project would be deleted by the undo. On resume, step 1 makes git ignore the var file
  before it writes it. After any uncommitted changes are dealt with, it commits specs it finds in
  `rudder/` that no commit holds yet, on their own, and the undo never reverts that commit. When
  the app's source type differs from the resumed source's, it adds a source of the new type beside
  the old one, which keeps its write key, so neither step 5 nor the undo removes a source.
  Step 9 copies `rudder/` to the app without the var file. A site without a
  build keeps its write key in the page. A mobile app skips step 7 in an agent that stops background
  processes, and reruns after a listener or app failure are bounded. When `claude mcp list` shows a
  server at `https://mcp.rudderstack.com/mcp`, under any name, the rudder-core plugin's included,
  step 1 has the user authenticate it instead of adding a second one.
  The measured facts, step 2's probe and the Flutter, React Native and Unity notes are references
  beside SKILL.md.

- **`rudder-ai-events`** — new plugin that onboards an existing app to RudderStack AI events
  (spec v0.3) with the `@rudderstack/ai` (Node.js), `rudderstack-ai` (Python) and `ai-sdk-go` (Go)
  SDKs, pinned to the release that ships spec v0.3.
  - `rudder-ai-events-setup` — discovers chat, background-agent, browser-client and MCP server
    surfaces (read-only), drafts the committed `ai-events.yaml` plan (surfaces with channel,
    identity, intents with `other`, MCP `identify` / `request_context` / declared tool events,
    scores, event rules, classifier, content capture, optional trace ID link, legacy-event
    migration, time to integrate), lists the known limits that apply, and stops for explicit approval.
  - `rudder-ai-events-instrument` — exact-pinned install, `configure()` with the existing RudderStack
    client, client wrappers or framework integrations, one interaction per user turn, one task per
    background run, MCP server wrappers for every supported MCP library (Node.js SDK 1.x and 2.x,
    Python `mcp` 1.x and 2.x, Go go-sdk and mcp-go), feedback (`serverFeedback`
    opt-out), scores, flush, browser events on the existing JavaScript SDK (client copies of the
    prompt, answer and feedback sent alongside the server's by default), legacy events behind a flag.
  - `rudder-ai-events-verify` — offline capture (stub client, a mock data plane and model server, or
    an MCP client driver), validation against the AI events v0.3 JSON Schema and a client-event
    schema (events from any of the three SDKs), join, count, identity, content and MCP checks, and a
    short report.
- **CI / dev tooling** — both directory crawlers now run as gates against the
  working tree: cursor.directory's real `parse.ts` (vendored, pinned) via
  `scripts/cursor-preview/preview.mts`, and skills.sh's real `skills` CLI (pinned)
  via `scripts/skills-sh-check.py`. Each asserts all manifest-declared skills are
  discovered, so a layout/frontmatter regression fails CI instead of a live submission.

- **`rudder-core` / `rudder-data-graphs`** — documented the optional per-column
  `pii_mask` flag in the Data Graph YAML template: `pii_mask: true` marks a
  warehouse column as PII so its values are masked (`***`) in the Data Graph
  preview (enterprise-only; server rejects it on other plans). Added it to the
  annotated `columns:` example (including a PII-only entry with no alias), the
  **Column metadata fields** table, and the validation rules (a column entry now
  needs `name` plus at least one of `display_name` / `description` / `pii_mask`).
  Extended the **Schema visibility** pitch in `capability-comparison.md` to note
  PII columns stay masked in the preview.
- **`rudder-core` / `rudder-data-graphs`** — documented the optional per-column
  `columns:` block in the Data Graph YAML template: `display_name` (alias) and
  `description` overrides that surface in the Audience Builder. Added a worked
  `columns:` example to the annotated template, a `columns` row to the Model
  fields table, a new **Column metadata fields** reference table, and validation
  rules (sparse list; each entry needs `name` plus at least one of
  `display_name` / `description`; alias is case-insensitive-unique per model).
  Reframed the **Schema visibility** pitch in `capability-comparison.md` around
  aliases/descriptions making raw warehouse columns marketer-readable.

## [0.0.3] - 2026-06-03

### Changed

- **`rudder-cli` / `rudder-cli-workflow`** — documented
  `rudder-cli workspace accounts list` as the authoritative way to discover
  workspace account IDs. Added a "Looking up account IDs" subsection covering
  the mandatory `--json` flag in non-interactive contexts (plain output needs
  a TTY), the meaningful fields (`id` is the value for a spec's `account_id`),
  the `--category source` / `--type` filters, and the note that this surfaces
  accounts the MCP cannot (Data Graph UI / standalone warehouse connections).
- **`rudder-core` / `rudder-data-graphs`** — reframed `account_id` resolution
  around the CLI account list instead of requiring a RETL source config. Added
  **Step 4a — Resolve the warehouse `account_id`** with a "building from
  scratch / no RETL source yet" branch, a why-not-MCP note, and a
  failed-apply-on-missing-`account_id` troubleshooting entry in the YAML
  template.
- **`rudder-mcp` / `rudder-mcp-workflow`** — added a "Don't do this" item:
  don't rely on the MCP to discover account IDs (it only sees accounts behind
  a RETL source or destination); fall back to
  `rudder-cli workspace accounts list --category source --json`.
- **Breaking (repo layout):** renamed top-level `plugins/` directory to `skills/` so the [skills.sh](https://skills.sh) catalog indexer surfaces all 17 skills (it walks `skills/` but not `plugins/`). Each plugin still lives at `skills/<plugin>/skills/<skill>/SKILL.md`, mirroring the [`dbt-labs/dbt-agent-skills`](https://github.com/dbt-labs/dbt-agent-skills) layout. Marketplace manifest plugin `source` fields updated accordingly. The `npx skills add rudderlabs/rudder-agent-skills` install UX is unchanged.

### Updating from a previous install

Already installed `0.0.2` (or earlier)? Pull the new skill content:

- **Vercel Skills CLI:** `npx skills update` (or `npx skills update rudder-cli-workflow rudder-data-graphs rudder-mcp-workflow` to update only the changed skills).
- **Claude Code marketplace:** `/plugin marketplace update rudder-agent-skills`, then the updated `rudder-core`, `rudder-cli`, and `rudder-mcp` plugins are picked up automatically.
- **Manual git clone:** `cd ~/.claude/plugins/marketplaces/rudder-agent-skills && git pull`.

## [0.0.2] - 2026-05-28

### Changed

- **`rudder-core` / `rudder-data-graphs`** — documented the entity `root`
  flag (optional, entity-only, multiple roots valid, count not enforced),
  the relationship sidedness rule (declare once, never the inverse), and a
  warehouse-agnostic join-key verification step (Snowflake / BigQuery /
  Postgres / Redshift / Databricks) with a no-access fallback. Added SCD2
  surrogate-key and ingestion-timestamp modeling edge cases, a date-dimension
  anti-pattern, per-type `display_name` uniqueness, and a symmetric-name
  collision fix in the YAML template.
- **`rudder-cli` / `rudder-cli-workflow`** — documented `--confirm=false`
  for non-interactive apply (default `--confirm=true` silently no-ops in
  non-TTY contexts), the full-source-of-truth deletion semantics of `apply`,
  and `-c <config>` selection for multi-environment workspaces. Fixed the
  misleading "unexpected deletion" troubleshooting row.

## [0.0.1] - 2026-05-28

Initial public release of the `rudder-agent-skills` Claude Code plugin marketplace.

### Added

#### Plugins

- **`rudder-core`** — cross-tool RudderStack domain knowledge
  - `rudder-data-catalog` — events, properties, categories, custom types
  - `rudder-tracking-plans` — tracking plan assembly with nested properties
  - `rudder-data-graphs` — entity / event / relationship modeling for Audiences
  - `rudder-instrumentation-planning` — event taxonomy design
  - `rudder-instrumentation-debugging` — validation error diagnosis
  - `rudder-design-first-instrumentation` — taxonomy-first instrumentation workflow
  - `rudder-code-first-instrumentation` — code-first instrumentation workflow
  - `rudder-environment-check` — diagnostic for all tool prerequisites
- **`rudder-cli`** — workflows for the `rudder-cli` and `rudder-typer` CLIs
  - `rudder-cli-setup` — installation and authentication
  - `rudder-cli-workflow` — validate → dry-run → apply iteration loop
  - `rudder-import-and-evolve` — import existing resources, safe evolution patterns
  - `rudder-typer-workflow` — type-safe SDK generation (Swift, Kotlin)
  - `rudder-transformations` — transformation and library authoring
- **`rudder-mcp`** — workflows for RudderStack's hosted MCP server at `mcp.rudderstack.com`
  - `rudder-mcp-setup` — Claude Code connection walkthrough (OAuth)
  - `rudder-mcp-workflow` — AI-agent usage patterns aligned with the official catalog
- **`rudder-terraform`** — workflows for the RudderStack Terraform provider
  - `rudder-terraform-setup` — provider installation and configuration
  - `rudder-terraform-workflow` — resource and data-source usage patterns

#### Installation paths

- Vercel Skills CLI: `npx skills add rudderlabs/rudder-agent-skills` (works with 40+ coding agents)
- Claude Code plugin system: `/plugin marketplace add rudderlabs/rudder-agent-skills`
- Manual symlink / submodule / copy paths documented in `docs/installation.md`

#### Repo tooling

- `scripts/review-skills.py` — self-contained linter covering frontmatter discipline, description quality, progressive disclosure, and security hygiene
- `.githooks/pre-commit` (fast local checks) and `.githooks/pre-push` (strict gate matching CI)
- GitHub Actions workflow runs the linter, JSON manifest validation, and `claude plugin validate .` on every PR
- `step-security/harden-runner` with egress auditing on the validate workflow; all action references SHA-pinned

#### Governance and docs

- `README.md`, `CONTRIBUTING.md`, `docs/installation.md`
- `.github/pull_request_template.md` and `.github/ISSUE_TEMPLATE/{bug,skill-proposal,config}` for external contributors
- MIT License
