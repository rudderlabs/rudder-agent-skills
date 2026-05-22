# Contributing to rudder-agent-skills

Thanks for contributing. This repo is a Claude Code plugin **marketplace** — a catalog of plugins that bundle skills teaching Claude how to drive RudderStack's programmatic surfaces. The goal of every contribution is a skill that actually fires on the right user request and recommends the right command.

## Getting started

After cloning the repository, run the setup script to enable pre-push validation:

```bash
./scripts/setup.sh
```

This configures git hooks so `scripts/review-skills.py` runs automatically before each push, catching issues early. You can also run the linter manually:

```bash
python3 scripts/review-skills.py .          # warnings allowed
python3 scripts/review-skills.py . --strict # warnings are errors
```

## Where a new skill belongs

The marketplace ships four plugins. A new skill goes into exactly one:

| Plugin | Pick this when |
|---|---|
| `rudder-core` | The skill teaches a **cross-tool** RudderStack concept (data modeling, tracking plan design, instrumentation strategy, debugging). Content should apply regardless of whether the user drives via CLI, MCP, or Terraform. |
| `rudder-cli` | The skill teaches how to drive `rudder-cli` or `rudder-typer` — commands, flags, YAML authoring for CLI-managed resources. |
| `rudder-mcp` | The skill teaches workflows for RudderStack's MCP server at `mcp.rudderstack.com` — tool catalog, auth/setup, AI-agent patterns for managing RudderStack via MCP. |
| `rudder-terraform` | The skill teaches Terraform-provider workflows — resource/data-source usage, state management, HCL patterns specific to RudderStack. |

If a new skill spans two surfaces, default to `rudder-core` and reference surface-specific material through `references/*.md` files rather than duplicating across plugins.

## Authoring a skill

Each skill is a folder under `plugins/<plugin>/skills/<skill-name>/` containing one `SKILL.md` and optional `references/*.md` files:

```
plugins/rudder-cli/skills/my-new-skill/
├── SKILL.md                # required
└── references/             # optional; loaded on demand
    └── advanced-topic.md
```

`SKILL.md` must start with YAML frontmatter:

```yaml
---
name: my-new-skill
description: Use when the user asks to <verb-1>, <verb-2>, or mentions <noun-1>, <noun-2>.
---
```

Frontmatter rules:

- `name` must match the folder name exactly, kebab-case, ≤ 64 chars.
- `description` ≤ 1024 chars. This is the single most important field — it's loaded into Claude's system prompt and decides when the skill auto-invokes. **Front-load trigger keywords**: the specific subcommand names, workflow verbs a user would say, and the relevant nouns.
- `disable-model-invocation: true` (optional) — use only when the skill should fire on an explicit `/<skill-name>` rather than auto-invoke. Good for niche, heavy, or easily-misfiring skills.

## Naming conventions

- Every plugin and skill uses the **`rudder-`** prefix. Do not use `rudderstack-`.
- Tool-plugin seed/workflow skills keep the **`-workflow`** suffix (e.g., `rudder-cli-workflow`, `rudder-mcp-workflow`, `rudder-terraform-workflow`).
- Domain skills in `rudder-core` do not use a suffix (e.g., `rudder-data-catalog`, `rudder-tracking-plans`).

## Progressive disclosure

Keep `SKILL.md` bodies lean. Push long material — full error-code tables, schema dumps, command-reference appendices — into `references/*.md` and link to it from `SKILL.md`. Claude only loads referenced files when the task actually calls for them, so you can pack unlimited depth into a skill without paying context cost on every invocation.

Example:

```markdown
See `references/error-codes.md` for the full error-code mapping.
```

## Writing a good description

A description is good if, when Claude reads it alongside dozens of other skill descriptions, it can answer "is this skill relevant to the user's current request?" with high precision.

**Good:**
> Use when creating, editing, or managing RudderStack transformations and transformation libraries using the Rudder CLI.

**Avoid:**
- Vague: "A skill for RudderStack."
- Over-broad: "Comprehensive RudderStack helper."
- Unspecific verbs: "Performs operations."

## Testing before opening a PR

From the repo root:

```bash
claude plugin validate .
```

The validator checks JSON syntax, frontmatter schema, duplicate names, and manifest conformance. Fix all errors.

Then smoke-install the marketplace locally (from the parent directory):

```bash
claude plugin marketplace add ./rudder-agent-skills
claude plugin install <your-plugin>@rudder-agent-skills
```

Verify:

1. A natural-language prompt that **should** trigger your skill — confirm Claude auto-invokes it and recommends the right command.
2. A prompt that **should not** trigger it — confirm the skill stays quiet.
3. If the skill is `disable-model-invocation: true`, verify `/<skill-name>` loads it.

## PR expectations

Your PR description should include:

1. **What the skill does** in one sentence.
2. **Which plugin it belongs in** and why.
3. **An example prompt that should trigger it** — copy-pasteable.
4. **An example prompt that should not trigger it** — to verify you've narrowed the description.
5. **Link to the source** — if you're documenting a CLI subcommand, MCP tool, or Terraform resource, link to its implementation or docs.

## Versioning & release

- Plugin versions live in the **top-level `.claude-plugin/marketplace.json`**, not in individual `plugin.json` files.
- Bump the relevant plugin's `version` field in `marketplace.json` when your change materially alters skill behavior. Minor content tweaks don't need a bump.
- Tag releases (`git tag vX.Y.Z && git push --tags`) so users can pin with `@vX.Y.Z` when adding the marketplace.

## Governance

Review and merge authority: **TBD** — repo owner to specify the review/merge rotation. Until then, PRs are reviewed on a best-effort basis.

## Questions

Open a GitHub issue before starting a large contribution so we can sanity-check the plugin placement and naming together.
