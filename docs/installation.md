# Installation Guide

This guide covers installing RudderStack agent skills for various coding agents.

## Prerequisites

### Rudder CLI

Install the Rudder CLI from the [rudder-iac repository](https://github.com/rudderlabs/rudder-iac):

```bash
# macOS (Homebrew)
brew tap rudderlabs/rudder-iac
brew install rudder-cli

# Or download from releases
# https://github.com/rudderlabs/rudder-iac/releases
```

### RudderStack Authentication

Get an access token from your RudderStack dashboard:

1. Go to **Settings → Access Tokens**
2. Create a new token with appropriate permissions
3. Run `rudder-cli auth login` and enter your token

Verify authentication:

```bash
rudder-cli workspace info
```

## Installing Skills

### Option 1: Skills CLI (Recommended)

The [Skills CLI](https://github.com/vercel-labs/skills) is the universal package manager for agent skills. It works with 40+ coding agents including Claude Code, Cursor, Cline, OpenCode, Codex, and more.

#### Pre-release Installation

Until this repository is published under `rudderlabs/rudder-agent-skills`, clone and install from local:

```bash
# Clone the repository
git clone https://github.com/rudderlabs/rudder-agent-skills.git ~/rudder-agent-skills

# Install skills from local clone
npx skills add ~/rudder-agent-skills --list              # List available skills
npx skills add ~/rudder-agent-skills                     # Interactive install
npx skills add ~/rudder-agent-skills -g --all            # Install all globally
```

To update:

```bash
cd ~/rudder-agent-skills && git pull
npx skills update
```

#### After Release

Once published to GitHub:

```bash
# List available skills
npx skills add rudderlabs/rudder-agent-skills --list

# Interactive installation (prompts for agents and skills)
npx skills add rudderlabs/rudder-agent-skills

# Install specific skills to specific agents
npx skills add rudderlabs/rudder-agent-skills -a claude-code --skill rudder-cli-workflow --skill rudder-data-catalog

# Install all skills globally (available across all projects)
npx skills add rudderlabs/rudder-agent-skills -g --all

# Non-interactive CI/CD installation
npx skills add rudderlabs/rudder-agent-skills -g -y --skill rudder-cli-workflow -a claude-code
```

#### Skills CLI Options

| Option | Description |
|--------|-------------|
| `-g, --global` | Install to user directory instead of project |
| `-a, --agent <agents...>` | Target specific agents (e.g., `claude-code`, `cursor`) |
| `-s, --skill <skills...>` | Install specific skills by name |
| `-l, --list` | List available skills without installing |
| `--copy` | Copy files instead of symlinking |
| `-y, --yes` | Skip all confirmation prompts |
| `--all` | Install all skills to all agents |

#### Updating Skills

```bash
# Update all installed skills
npx skills update

# Update specific skill
npx skills update rudder-cli-workflow

# List installed skills
npx skills list
```

### Option 2: Claude Code Plugin System

For Claude Code specifically, you can use the native plugin system.

#### Pre-release / Manual Installation

```bash
# Clone to the marketplaces directory (directory name must be "rudder-agent-skills")
git clone https://github.com/rudderlabs/rudder-agent-skills.git \
  ~/.claude/plugins/marketplaces/rudder-agent-skills

# Then in Claude Code, install the plugins:
/plugin install rudder-core@rudder-agent-skills
/plugin install rudder-cli@rudder-agent-skills
```

To update:

```bash
cd ~/.claude/plugins/marketplaces/rudder-agent-skills && git pull
```

#### After Release

```bash
# Add marketplace and install plugins
/plugin marketplace add rudderlabs/rudder-agent-skills
/plugin install rudder-core@rudder-agent-skills
/plugin install rudder-cli@rudder-agent-skills
```

Or non-interactively:

```bash
claude plugin marketplace add rudderlabs/rudder-agent-skills
claude plugin install rudder-core@rudder-agent-skills
claude plugin install rudder-cli@rudder-agent-skills
```

### Option 3: Manual Symlink

For maximum control, symlink skills directly:

```bash
# Clone once
git clone https://github.com/rudderlabs/rudder-agent-skills.git ~/rudder-agent-skills

# Create symlinks for Claude Code
mkdir -p ~/.claude/skills
ln -s ~/rudder-agent-skills/plugins/rudder-core/skills/rudder-data-catalog ~/.claude/skills/
ln -s ~/rudder-agent-skills/plugins/rudder-cli/skills/rudder-cli-workflow ~/.claude/skills/

# Create symlinks for Cursor
mkdir -p .cursor/skills
ln -s ~/rudder-agent-skills/plugins/rudder-core/skills/rudder-data-catalog .cursor/skills/
ln -s ~/rudder-agent-skills/plugins/rudder-cli/skills/rudder-cli-workflow .cursor/skills/
```

### Option 4: Copy

Copy skills directly into your project:

```bash
git clone https://github.com/rudderlabs/rudder-agent-skills.git /tmp/rudder-agent-skills

mkdir -p .claude/skills
cp -r /tmp/rudder-agent-skills/plugins/rudder-core/skills/* .claude/skills/
cp -r /tmp/rudder-agent-skills/plugins/rudder-cli/skills/* .claude/skills/
```

### Option 5: Git Submodule

Add as a submodule for version-controlled dependency:

```bash
# Add submodule
git submodule add https://github.com/rudderlabs/rudder-agent-skills.git .rudder-skills

# Create symlinks
mkdir -p .claude/skills
ln -s ../.rudder-skills/plugins/rudder-cli/skills/rudder-cli-workflow .claude/skills/
```

## Verifying Installation

### With Skills CLI

```bash
npx skills list
```

### With Claude Code

```bash
claude

# Ask about available skills
You: What RudderStack skills do you have available?
```

Claude should list skills like `rudder-cli-workflow`, `rudder-data-catalog`, etc.

## Project Structure (after installation)

```
your-project/
├── .claude/
│   └── skills/
│       ├── rudder-cli-workflow/
│       │   └── SKILL.md
│       ├── rudder-data-catalog/
│       │   └── SKILL.md
│       └── ...
├── transformations/          # Your transformation specs
│   ├── my-lib.yaml
│   └── javascript/
│       └── my-lib.js
└── ...
```

## Supported Agents

Skills can be installed to any of these agents via the Skills CLI:

| Agent | `--agent` flag | Project Path | Global Path |
|-------|----------------|--------------|-------------|
| Claude Code | `claude-code` | `.claude/skills/` | `~/.claude/skills/` |
| Cursor | `cursor` | `.agents/skills/` | `~/.cursor/skills/` |
| Cline | `cline` | `.agents/skills/` | `~/.agents/skills/` |
| OpenCode | `opencode` | `.agents/skills/` | `~/.config/opencode/skills/` |
| Codex | `codex` | `.agents/skills/` | `~/.codex/skills/` |
| Windsurf | `windsurf` | `.windsurf/skills/` | `~/.codeium/windsurf/skills/` |

See the [Skills CLI documentation](https://github.com/vercel-labs/skills#supported-agents) for the full list of 40+ supported agents.

## Optional: Claude Code Settings

You can add project-specific Claude Code settings in `.claude/settings.local.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(rudder-cli validate -l ./)",
      "Bash(rudder-cli apply --dry-run -l ./)",
      "Bash(rudder-cli transformations test --all -l ./)"
    ]
  }
}
```

This pre-approves common Rudder CLI commands. Note: Do not commit `settings.local.json` to version control (it's user-specific).

## Troubleshooting

### Skills not detected

1. Verify the directory structure: `<agent>/skills/<skill-name>/SKILL.md`
2. Check file permissions
3. Restart your coding agent
4. Run `npx skills list` to see installed skills

### "rudder-cli not found"

1. Ensure Rudder CLI is installed: `which rudder-cli`
2. Check your PATH includes the CLI location
3. Try the full path: `/usr/local/bin/rudder-cli`

### Authentication errors

```bash
# Re-authenticate
rudder-cli auth login

# Verify
rudder-cli workspace info
```

### Skills CLI issues

```bash
# Clear npx cache and retry
npx clear-npx-cache
npx skills add rudderlabs/rudder-agent-skills --list
```
