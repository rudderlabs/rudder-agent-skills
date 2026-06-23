🚀 Just launched <b><a href="https://www.rudderstack.com/product/rudderai/">RudderAI</a></b> - the agentic layer for the entire customer data lifecycle

# RudderStack Agent Skills

[![skills.sh](https://skills.sh/b/rudderlabs/rudder-agent-skills)](https://skills.sh/rudderlabs/rudder-agent-skills)
[![Agent Skills](https://img.shields.io/badge/Agent_Skills-open_format-5436DA)](https://agentskills.io)
[![Claude Code](https://img.shields.io/badge/Claude_Code-plugin_marketplace-D97757)](https://code.claude.com/docs/en/plugins)
[![Cursor](https://img.shields.io/badge/Cursor-directory-000000)](https://cursor.directory/plugins/rudder-agent-skills)
[![MCP](https://img.shields.io/badge/MCP-server_included-1F6FEB)](https://mcp.rudderstack.com/docs)
[![CLI](https://img.shields.io/badge/CLI-included-0E7490)](https://github.com/rudderlabs/rudder-iac)
[![works with 40+ agents](https://img.shields.io/badge/works_with-40%2B_agents-2EA44F)](https://github.com/vercel-labs/skills#supported-agents)
[![License: MIT](https://img.shields.io/github/license/rudderlabs/rudder-agent-skills)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/rudderlabs/rudder-agent-skills?style=flat)](https://github.com/rudderlabs/rudder-agent-skills/stargazers)

A Claude Code plugin **marketplace** and [Agent Skills](https://agentskills.io) collection that teaches your AI coding agent how to drive every programmatic [RudderStack](https://www.rudderstack.com/) surface — CLI, MCP server, Terraform, and Profiles — with the right preflight checks, commands, and recovery paths. Works with Claude Code, Cursor, and 40+ agents.

## What's inside

One marketplace (`rudder-agent-skills`) bundling five plugins. Install the ones you use.

| Plugin | Status | Scope |
|---|---|---|
| [`rudder-core`](plugins/rudder-core/) | ✅ Available | Cross-tool domain knowledge: data catalog, tracking plans, data graphs, instrumentation planning & debugging |
| [`rudder-cli`](plugins/rudder-cli/) | ✅ Available | Workflows for [`rudder-cli`](https://github.com/rudderlabs/rudder-iac) and [`rudder-typer`](https://www.rudderstack.com/docs/features/ruddertyper/) |
| [`rudder-mcp`](plugins/rudder-mcp/) | ✅ Available | Workflows for [RudderStack's hosted MCP server](https://mcp.rudderstack.com/docs) at `mcp.rudderstack.com` |
| [`rudder-terraform`](plugins/rudder-terraform/) | ✅ Available | Workflows for the [Terraform provider](https://github.com/rudderlabs/terraform-provider-rudderstack) |
| [`rudder-profiles`](plugins/rudder-profiles/) | ✅ Available | Workflows for [RudderStack Profiles](https://github.com/rudderlabs/profiles-mcp): setup, project creation, analysis, updates, and debugging |

Most users drive RudderStack with more than one tool. Install `rudder-core` plus whichever tool plugins you use; the domain knowledge lives in `rudder-core` so it never duplicates across tool-specific plugins.

## Installation

One command, any agent — no cloning, no local setup.

### Any agent — Skills CLI (recommended)

The [Skills CLI](https://github.com/vercel-labs/skills) installs these skills into Claude Code, Cursor, Cline, OpenCode, and [40+ agents](https://github.com/vercel-labs/skills#supported-agents):

```bash
# Interactive — pick skills and your agent
npx skills add rudderlabs/rudder-agent-skills

# Or: list first · install everything globally · target one agent
npx skills add rudderlabs/rudder-agent-skills --list
npx skills add rudderlabs/rudder-agent-skills -g --all
npx skills add rudderlabs/rudder-agent-skills -a claude-code --skill rudder-cli-workflow

# Update anytime
npx skills update
```

### Claude Code — plugin marketplace

```bash
/plugin marketplace add rudderlabs/rudder-agent-skills
/plugin install rudder-core@rudder-agent-skills      # then add whichever tool plugins you use
```

Non-interactive equivalent: `claude plugin marketplace add rudderlabs/rudder-agent-skills` then `claude plugin install <plugin>@rudder-agent-skills`. Update with `/plugin marketplace update rudder-agent-skills`.

> Cursor, manual symlink, git submodule, agent-specific paths, and troubleshooting live in [`docs/installation.md`](docs/installation.md).

## Available skills

### `rudder-core`

| Skill | When to use |
|---|---|
| `rudder-data-catalog` | Creating or managing events, properties, categories, or custom types |
| `rudder-data-graphs` | Modeling entities, events, and relationships for Audiences |
| `rudder-tracking-plans` | Creating tracking plans to group events for specific sources |
| `rudder-instrumentation-planning` | Designing event taxonomy from scratch or restructuring |
| `rudder-instrumentation-debugging` | Fixing validation errors, schema issues, or instrumentation problems |
| `rudder-environment-check` | Checking prerequisites and setup status |

### `rudder-cli`

| Skill | When to use |
|---|---|
| `rudder-cli-workflow` | Iterating on RudderStack resources with validate → dry-run → apply |
| `rudder-import-and-evolve` | Importing existing RudderStack resources to CLI management |
| `rudder-typer-workflow` | Generating type-safe SDKs (Swift/Kotlin) from tracking plans |
| `rudder-transformations` | Creating, editing, or managing transformations and libraries |
| `rudder-cli-setup` | Installing and authenticating rudder-cli |

### `rudder-mcp`

| Skill | When to use |
|---|---|
| `rudder-mcp-workflow` | Connecting AI/LLM agents to RudderStack via MCP server |
| `rudder-mcp-setup` | Configuring Claude Code to connect to MCP server |

### `rudder-terraform`

| Skill | When to use |
|---|---|
| `rudder-terraform-workflow` | Managing RudderStack resources via Terraform provider |
| `rudder-terraform-setup` | Installing Terraform and the RudderStack provider |

### `rudder-profiles`

| Skill | When to use |
|---|---|
| `rudder-profiles-setup` | Installing and wiring the Profiles toolchain and Profiles MCP |
| `rudder-profiles-project` | Bootstrapping a new Profiles project from discovered warehouse resources |
| `rudder-profiles-understand` | Explaining an existing Profiles project, its features, and latest outputs |
| `rudder-profiles-update` | Updating a Profiles project with features, inputs, propensity, or incremental changes |
| `rudder-profiles-debug` | Diagnosing compile failures, run failures, and output-quality issues |

## How skills work together

```
                       ┌───────────────────────────────┐
                       │ instrumentation-planning      │
                       │ (design the taxonomy)         │
                       └──────────────┬────────────────┘
                                      │
               ┌──────────────────────┼──────────────────────┐
               │                      │                      │
               ▼                      ▼                      ▼
        ┌─────────────┐        ┌──────────────┐        ┌─────────────┐
        │data-catalog │        │  import-and  │        │  tracking   │
        │(build vocab)│        │    evolve    │        │   plans     │
        └──────┬──────┘        └──────┬───────┘        └──────┬──────┘
               └──────────────────────┼───────────────────────┘
                                      ▼
                          ┌───────────────────────┐
                          │   cli-workflow        │
                          │  (validate / apply)   │
                          └───────────┬───────────┘
                                      │
             ┌────────────────────────┼────────────────────────┐
             ▼                        ▼                        ▼
     ┌───────────────┐      ┌────────────────┐       ┌──────────────────┐
     │ typer-workflow│      │ transformations│       │    debugging     │
     │(generate code)│      │ (data transform│       │  (fix issues)    │
     └───────────────┘      └────────────────┘       └──────────────────┘
```

## Directory structure

```
rudder-agent-skills/
├── README.md                    # this file
├── CONTRIBUTING.md              # authoring + PR guidelines
├── LICENSE
├── .claude-plugin/
│   └── marketplace.json
├── docs/
│   └── installation.md          # full install guide
├── examples/                    # end-to-end worked examples
└── plugins/
    └── <plugin>/                     # rudder-core, rudder-cli, rudder-mcp, rudder-terraform, rudder-profiles
        ├── .claude-plugin/plugin.json
        └── skills/<skill>/SKILL.md
```

## Prerequisites

A compatible AI coding agent (Claude Code, Cursor, Cline, OpenCode, or any of the [40+ supported agents](https://github.com/vercel-labs/skills)).

Each plugin includes a setup skill that guides you through installing and configuring tool-specific prerequisites:

| Plugin | Setup Skill | What it installs |
|--------|-------------|------------------|
| `rudder-cli` | `/rudder-cli-setup` | Downloads `rudder-cli` binary, authenticates with RudderStack |
| `rudder-mcp` | `/rudder-mcp-setup` | Configures Claude Code to connect to RudderStack's MCP server at `mcp.rudderstack.com` |
| `rudder-terraform` | `/rudder-terraform-setup` | Installs Terraform, configures the RudderStack provider |
| `rudder-profiles` | `/rudder-profiles-setup` | Installs `pb`, configures `profiles-mcp`, and wires editor MCP settings |

After installing a plugin, run its setup skill to get started. Use `/rudder-environment-check` to verify your full setup.

## Examples

`examples/` contains worked end-to-end projects that demonstrate skills in action — the current example covers the transformations workflow.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for authoring conventions, testing steps, and PR expectations.

## License

MIT License — see [LICENSE](LICENSE) for details.
