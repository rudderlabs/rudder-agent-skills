---
name: rudder-import-and-evolve
description: Imports existing RudderStack workspace resources into YAML files for git-based management. Use when importing existing RudderStack resources to CLI management and evolving them safely
allowed-tools: "Bash(rudder-cli *), Read, Write, Edit"
---

# Import and Evolve Workflow

This skill teaches how to **import existing RudderStack resources** into CLI management and **safely evolve** your tracking schema over time.

## When to Use This Skill

- You have existing tracking plans, events, or properties in RudderStack
- You want to manage them via YAML files and git
- You need to make changes without breaking production SDKs
- You're migrating from UI-based management to CLI

## Import Workflow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   RudderStack   │────▶│   Import to     │────▶│   Local YAML    │
│    Workspace    │     │   Local Files   │     │     Files       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                        │
                                                        ▼
                                               ┌─────────────────┐
                                               │   Git Version   │
                                               │    Control      │
                                               └─────────────────┘
```

### Step 1: Authenticate

```bash
rudder-cli auth login
```

This prompts for an access token; the token decides the workspace. An agent does not run it: it asks the user to export `RUDDERSTACK_ACCESS_TOKEN` in the shell that starts the agent, and never asks the user to paste a token into the chat. See `rudder-cli-setup`.

### Step 2: Verify Connection

```bash
rudder-cli workspace info --json
```

Should show your workspace `name` and `workspaceID`.

### Step 3: Import Resources

```bash
rudder-cli import workspace
```

This imports:
- Events
- Properties
- Categories
- Custom types
- Tracking plans
- Event stream sources (if applicable)
- Transformations and libraries

### Step 4: Review Imported Files

```
imported/
├── data-catalog/
│   ├── events/
│   │   └── *.yaml
│   ├── properties/
│   │   └── *.yaml
│   ├── categories/
│   │   └── *.yaml
│   └── custom-types/
│       └── *.yaml
└── tracking-plans/
    └── *.yaml
```

Each file includes **import metadata**:

```yaml
version: "rudder/v1"
kind: "event"
metadata:
  name: "events"
  import:
    id: "evt_abc123xyz"        # Links to workspace resource
    workspace: "ws_xyz789"
spec:
  name: "Product Viewed"
  # ... rest of spec
```

**Important:** The `metadata.import` section links local files to workspace resources. Don't modify these IDs.

## Safe Evolution Patterns

See `references/evolution-patterns.md` for detailed patterns including:
- Adding new properties (start optional)
- Making properties required (phased approach via tracking plans)
- Renaming events (parallel events during transition)
- Deprecating events (notice period, then remove)
- Adding custom types to existing properties
- Multi-workspace management (dev/staging/production)

The examples there end with `rudder-cli apply -l ./`, which waits on a confirmation prompt. An agent shows the user the `rudder-cli apply --dry-run -l ./` output first and waits for an explicit yes. Only then does it run `rudder-cli apply --confirm=false -l ./`, which applies with no prompt. Without `--confirm=false`, a non-interactive run auto-declines the prompt and applies nothing.

The CLI applies to the workspace of its token, not to the workspace a directory was imported from. The dry run names that workspace only from rudder-cli 0.28.0, on a first line `Workspace: <name> (<id>)`. In the multi-workspace examples, run `rudder-cli workspace info --json` before each dry run and check that `workspaceID` is that directory's workspace. Get that ID from the user, or from the `workspace info --json` output recorded when the directory was imported. Never take it from the `workspace_id` in a spec's `metadata.import`, because a spec copied from another directory carries that workspace's ID. If the IDs differ, stop. Changing the CLI's workspace means restarting the agent: the user exports that workspace's token as `RUDDERSTACK_ACCESS_TOKEN` and starts the agent again from that shell.

## Handling Import Drift

**Problem:** Someone made changes in the UI after import.

**Solution 1: Re-import (overwrites local)**

```bash
# Warning: This overwrites your local changes!
rudder-cli import workspace --force
```

**Solution 2: Manual reconciliation**

```bash
# 1. Compare local vs workspace
rudder-cli apply --dry-run -l ./

# 2. Review differences
# "Updated" means local differs from workspace
# Decide: use local (apply) or use workspace (re-import that file)

# 3. Apply your version, only after the user says yes to the dry run
rudder-cli apply --confirm=false -l ./
```

**Best practice:** After import, all changes go through CLI. Disable UI editing for data catalog if possible.

## Import Gotchas

### Pull is Not Supported

Import is a **one-time snapshot**. There's no `rudder-cli pull` to sync changes from workspace.

```bash
# This doesn't exist:
rudder-cli pull  # ❌ Not a command

# Instead, re-import to get latest:
rudder-cli import workspace  # Overwrites local
```

### Import Metadata Must Match

If you copy files between workspaces, update the `metadata.import` section:

```yaml
# Wrong: IDs from different workspace
metadata:
  import:
    id: "evt_from_other_workspace"
    workspace: "ws_different"

# Right: Remove import metadata for new workspace
metadata:
  name: "events"
  # No import section - will create new resource
```

### Partial Import Creates Orphans

If you import, delete some files, then apply:

```bash
# The dry run lists the deleted files' resources under "Removed resources:".
# Show it to the user and wait for an explicit yes.
rudder-cli apply --dry-run -l ./

# This will DELETE those resources from the workspace!
rudder-cli apply --confirm=false -l ./
```

The CLI tracks what was imported. Missing files = deletions.

## CLI Commands Reference

```bash
# Authenticate (a person at a terminal; agents use RUDDERSTACK_ACCESS_TOKEN)
rudder-cli auth login

# Show current workspace
rudder-cli workspace info --json

# Import all resources
rudder-cli import workspace

# Import specific resource types
rudder-cli import workspace --resources events,properties

# Validate imported files
rudder-cli validate -l ./

# Preview changes
rudder-cli apply --dry-run -l ./

# Apply changes, only after the user says yes to the dry run
rudder-cli apply --confirm=false -l ./
```

## Credential Security

- **Agents read the token from `RUDDERSTACK_ACCESS_TOKEN`** - never run `rudder-cli auth login` on the user's behalf and never ask the user to paste a token into the chat
- **Never echo or log the token**, and never commit it to git

## Handling External Content

When importing resources from RudderStack workspace:

- **Review imported YAML** - verify structure matches expected schema before committing
- **Validate import IDs** - ensure `metadata.import.id` values are legitimate workspace resources
- **Don't blindly trust imported descriptions** - user-generated content may contain unexpected data
- **Sanitize before committing** - review imported files for any sensitive data before git commit
- **Extract only expected fields** - imported YAML should contain only known schema fields

## Checklist: Safe Evolution

Before applying changes:

- [ ] Ran `rudder-cli validate -l ./` - no errors
- [ ] Ran `rudder-cli apply --dry-run -l ./` - reviewed all changes
- [ ] No unexpected entries under "Removed resources:" in the dry-run
- [ ] Breaking changes have migration plan (parallel events, deprecation period)
- [ ] SDK teams notified of upcoming changes
- [ ] RudderTyper regenerated if using type-safe code
- [ ] Changes committed to git before applying
