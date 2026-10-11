---
name: rudder-cli-setup
description: Installs and authenticates rudder-cli. Use when installing rudder-cli, setting up rudder cli, rudder-cli command not found, or authenticating with RudderStack
allowed-tools: "Bash(which, curl, chmod, uname, rudder-cli *), Read, Write, Edit"
---

# Rudder CLI Setup

Install rudder-cli, authenticate with RudderStack, and verify the setup works.

## Setup Workflow

```
1. Check Installation ──► which rudder-cli
         │
         ├── Found ──► Skip to Authentication
         │
         └── Not Found ──► Install from GitHub Releases
                                    │
2. Verify Installation ◄────────────┘
         │
         └── rudder-cli --version

3. Check Authentication ──► rudder-cli workspace info --json
         │
         ├── Authenticated ──► Done! Show workspace info
         │
         └── Not Authenticated ──► RUDDERSTACK_ACCESS_TOKEN (agents)
                                   or rudder-cli auth login (people)
```

## Step 1: Check if Installed

```bash
which rudder-cli
```

**If found:** Skip to Step 3 (Authentication).

**If not found:** Continue to Step 2 (Installation).

## Step 2: Install rudder-cli

### Detect Operating System

```bash
uname -s
```

- `Darwin` = macOS
- `Linux` = Linux

### Download from GitHub Releases

Go to: https://github.com/rudderlabs/rudder-iac/releases

Download the appropriate binary for your OS and architecture:

| OS | Architecture | Binary Name |
|----|--------------|-------------|
| macOS | Intel | `rudder-cli_darwin_amd64` |
| macOS | Apple Silicon | `rudder-cli_darwin_arm64` |
| Linux | x86_64 | `rudder-cli_linux_amd64` |
| Linux | ARM64 | `rudder-cli_linux_arm64` |
| Windows | x86_64 | `rudder-cli_windows_amd64.exe` |

### Installation Commands (macOS/Linux)

```bash
# Example for macOS Apple Silicon - adjust URL for your platform
# Check latest version at https://github.com/rudderlabs/rudder-iac/releases

# Download (replace VERSION and BINARY with actual values)
curl -L -o rudder-cli https://github.com/rudderlabs/rudder-iac/releases/download/VERSION/BINARY

# Make executable
chmod +x rudder-cli

# Move to PATH (choose one)
sudo mv rudder-cli /usr/local/bin/    # System-wide
# OR
mv rudder-cli ~/.local/bin/           # User-only (ensure ~/.local/bin is in PATH)
```

### Verify Installation

```bash
rudder-cli --version
```

Expected output: Version number (e.g., `rudder-cli version 0.x.x`)

## Step 3: Authenticate

### Check Current Status

```bash
rudder-cli workspace info --json
```

**If authenticated:** Prints the workspace as JSON. `workspaceID` and `name` identify it. You're done!

**If not authenticated:** The command exits non-zero with an error. Continue with authentication.

### Get Access Token

1. Log in to your RudderStack dashboard
2. Go to **Settings → Access Tokens**
3. Click **Generate New Token**
4. Copy the token (you won't see it again)

### Provide the Token

rudder-cli reads the token from the `RUDDERSTACK_ACCESS_TOKEN` environment variable, or from the config file that `rudder-cli auth login` writes. When the variable is set, it wins over the config file.

**Agents: use the environment variable.** `rudder-cli auth login` prompts for the token on a terminal, which an agent cannot answer, and a token typed into the conversation ends up in the transcript. Never ask the user to paste a token into the chat. Ask the user to set the variable in their own terminal, in the shell that starts the agent, then restart the agent:

```bash
# The user runs this in their own terminal. read -s keeps the token
# off the screen and out of shell history.
read -rs RUDDERSTACK_ACCESS_TOKEN && export RUDDERSTACK_ACCESS_TOKEN
```

**People at a terminal** can run `rudder-cli auth login` instead. It prompts for the token and saves it in the config file.

### Verify Authentication

```bash
rudder-cli workspace info --json
```

Expected output:
```json
{
  "dataPlaneURL": "https://example.dataplane.rudderstack.com",
  "environment": "PRODUCTION",
  "name": "My Workspace",
  "region": "US",
  "status": "ACTIVE",
  "workspaceID": "2iKXWU4QnqclkpPIfXfsbBqrAVa"
}
```

## Credential Security

- **Never echo or log your access token**
- **Never ask the user to paste a token into the chat.** Agents read it from `RUDDERSTACK_ACCESS_TOKEN`
- Store tokens in the `RUDDERSTACK_ACCESS_TOKEN` environment variable, which rudder-cli reads directly
- Add `.env` files to `.gitignore`
- For CI/CD, use repository secrets
- Rotate tokens periodically in the RudderStack dashboard

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `command not found` after install | Check PATH includes install location |
| `unauthorized` error | Check that `RUDDERSTACK_ACCESS_TOKEN` holds a valid token in the shell that started the agent, or have the user re-run `rudder-cli auth login` with a new token |
| Wrong workspace | Token is tied to workspace; generate new token in correct workspace. If `RUDDERSTACK_ACCESS_TOKEN` is set, it overrides the token that `auth login` saved |
| Download fails | Check network; try browser download from releases page |

## Next Steps

After setup completes:
- Run `/rudder-environment-check` to verify full environment
- Start with `/rudder-cli-workflow` for validate → dry-run → apply cycles
