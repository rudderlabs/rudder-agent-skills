# RudderStack (rudder-cli)

<!--
Copy this file to the root of a repo that manages RudderStack resources as code.
It is the zero-install baseline: every agent that reads AGENTS.md picks it up
with no plugin, no marketplace, no MCP server.

If your agent supports Agent Skills, install the full skills instead — they go
much deeper than this file can:
  npx skills add rudderlabs/rudder-agent-skills
-->

RudderStack resources in this repo are managed declaratively: YAML specs in the
working tree, applied to a workspace through `rudder-cli`. The model is
Terraform's — local specs are the desired state, `apply` reconciles the
workspace to them.

## Before anything else

```bash
rudder-cli workspace info      # who am I, and which workspace am I pointed at
```

Never run `apply` without confirming the workspace first. The CLI targets one
workspace at a time and the wrong one is not obvious from the diff.

If it errors, the user needs to authenticate — `rudder-cli auth login` prompts
for an access token from Settings → Access Tokens. Do not attempt to supply a
token yourself.

## The loop

Always in this order. Do not skip to `apply`.

```bash
rudder-cli validate -l ./                  # structure + semantics, no network writes
rudder-cli apply --dry-run -l ./           # the plan: what would change
rudder-cli apply --confirm=false -l ./     # execute
```

`--confirm=false` is required in any non-interactive context — without it
`apply` blocks on a prompt that will never be answered.

Show the user the `--dry-run` plan and get agreement before the real `apply`.
`apply` mutates a live workspace; deletes in that plan are real deletes.

## Reading CLI output

Commands that list things need `--json` when you are not a human at a terminal:

```bash
rudder-cli workspace accounts list --json
rudder-cli workspace tracking-plans list --json
rudder-cli workspace event-stream-sources list --json
```

The default table rendering requires a TTY and fails with `could not open a new
TTY` when piped. Reach for `--json` by default, not as a fallback.

Account IDs referenced in specs (`account_id`) come from
`workspace accounts list --json` — resolve them, never guess them. Use
`definition.category` to pick the right one (`wht` = warehouse, `source` =
source connection) and `options` to disambiguate same-named accounts.

## Spec files

Every spec file carries four top-level keys. Omitting any of them is the most
common validation failure:

```yaml
version: rudder/v1     # rudder/v0.1 and rudder/0.1 are legacy and deprecated
kind: events           # categories | custom-types | properties | events | tracking-plan | ...
metadata:
  name: my-events
spec:
  ...
```

Kinds are hyphenated (`custom-types`, `tracking-plan`) even where the
conventional filename is not (`customtypes.yaml`). Never infer a kind from a
filename — copy it from an existing spec of the same type.

Validation failures name the rule that fired, e.g.
`error[datacatalog/properties/unique-name]`. Fix the spec the rule points at
rather than working around it — the rules encode server-side constraints, so a
spec that dodges one locally still fails at `apply`.

## Things that will bite you

- **`import-manifest.yaml` is generated.** It maps local resources to remote IDs.
  Never hand-edit it, and never delete it to "start clean" — you will orphan
  every remote resource it tracked.
- **Adopt before you create.** Against a workspace that already has resources,
  run `rudder-cli import workspace -l ./` first. Applying fresh specs over an
  existing workspace creates duplicates instead of adopting what is there.
- **Secrets do not belong in specs.** Use `--var-file` with a `.vars.yaml` kept
  out of version control. If `validate` reports `undefined variable "X"`, a var
  file is missing from the command, not from the spec.
- **A failing `validate` is information, not an obstacle.** It is cheaper than a
  failed `apply` and it runs without touching the workspace. Run it after every
  edit.
