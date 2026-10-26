---
name: rudder-cli-setup
description: Installs and authenticates rudder-cli. Use when installing rudder-cli, setting up rudder cli, rudder-cli command not found, or authenticating with RudderStack
allowed-tools: "Bash(which, curl, chmod, uname, rudder-cli *), Read, Write, Edit"
---

# Rudder CLI Setup

Install rudder-cli, authenticate with RudderStack, and verify the setup works.

## Setup Workflow

```
1. Check Installation ──► command -v rudder-cli, then ~/.local/bin
         │
         ├── Found ──► Skip to Authentication
         │
         └── Not Found ──► Install the latest release into ~/.local/bin
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
command -v rudder-cli || ls "$HOME/.local/bin/rudder-cli"
```

**If `command -v` prints a path:** Skip to Step 3 (Authentication).

**If only `~/.local/bin/rudder-cli` exists:** An earlier install put it there, and that folder is not on PATH. Follow "If `~/.local/bin` is not on PATH" below, then skip to Step 3.

**If neither exists:** Continue to Step 2 (Installation).

## Step 2: Install rudder-cli

Both commands below install the latest release from [GitHub Releases](https://github.com/rudderlabs/rudder-iac/releases) on macOS or Linux, on x86_64 or arm64 (Linux also on i386). They check the archive against the release's checksums file, put `rudder-cli` in `~/.local/bin` without `sudo`, and replace no copy elsewhere. On Windows, download the `.zip` for your CPU from the [latest release](https://github.com/rudderlabs/rudder-iac/releases/latest) instead.

Never install rudder-cli with npm, npx or Homebrew. No npm package or Homebrew tap ships it, and the npm package named `rudder-cli` belongs to someone else.

### Run the install script

Download the script, then run it. Do not pipe it into a shell.

```bash
curl -fsSL https://raw.githubusercontent.com/rudderlabs/rudder-iac/main/install.sh -o /tmp/install-rudder-cli.sh && sh /tmp/install-rudder-cli.sh
```

### If the script download fails with 404

The script is not published yet. Install the release archive directly instead. This block does what the script does. It runs in a subshell, so an error ends the block and leaves the shell running:

```bash
(
  set -e
  releases=https://github.com/rudderlabs/rudder-iac/releases
  tag=$(curl -fsSLI -o /dev/null -w '%{url_effective}' "$releases/latest"); tag=${tag##*/}
  case "$(uname -m)" in
    x86_64 | amd64) arch=x86_64 ;;
    arm64 | aarch64) arch=arm64 ;;
    i386 | i486 | i586 | i686) arch=i386 ;;
    *) echo "no rudder-cli build for $(uname -m)" >&2; exit 1 ;;
  esac
  archive="rudder-cli_$(uname -s)_$arch.tar.gz"
  d=$(mktemp -d); trap 'rm -rf "$d"' EXIT
  curl -fsSL -o "$d/$archive" "$releases/download/$tag/$archive"
  curl -fsSL -o "$d/checksums.txt" "$releases/download/$tag/rudder-cli_${tag#v}_checksums.txt"
  want=$(awk -v f="$archive" '$2 == f { print $1 }' "$d/checksums.txt")
  got=$(sha256sum "$d/$archive" 2>/dev/null || shasum -a 256 "$d/$archive"); got=${got%% *}
  [ -n "$want" ] && [ "$got" = "$want" ] || { echo "checksum mismatch for $archive; not installing" >&2; exit 1; }
  tar -xzf "$d/$archive" -C "$d" rudder-cli
  mkdir -p "$HOME/.local/bin" && mv "$d/rudder-cli" "$HOME/.local/bin/rudder-cli"
  "$HOME/.local/bin/rudder-cli" --version
)
```

In the first minutes after a new release, its files may still be uploading, and a download fails. Wait a few minutes and run the block again.

### If `~/.local/bin` is not on PATH

After either install, check which rudder-cli a plain `rudder-cli` runs:

```bash
command -v rudder-cli
```

If it prints the path of `~/.local/bin/rudder-cli`, go on. If it prints nothing, `~/.local/bin` is not on PATH. If it prints another path, an older copy comes first on PATH. In both cases:

- Do not stop, and do not ask the user to edit their shell profile or restart you now. The install script prints an `export PATH` line for the profile and says to open a new terminal. That line goes in your closing summary instead.
- For the rest of the session, run `"$HOME/.local/bin/rudder-cli"` wherever this skill or another RudderStack skill says `rudder-cli`.
- In your closing summary, show the line the user adds to their shell profile (`~/.zshrc`, `~/.bashrc` or `~/.profile`) so that a new terminal runs this copy:

```bash
export PATH="$HOME/.local/bin:$PATH"
```

### Verify Installation

```bash
rudder-cli --version
```

Use `"$HOME/.local/bin/rudder-cli" --version` if `~/.local/bin` is not on PATH.

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
| `command not found` after install | `~/.local/bin` is not on PATH. Run `"$HOME/.local/bin/rudder-cli"` for the rest of the session, and show the `export PATH` line from Step 2 in the closing summary |
| `unauthorized` error | Check that `RUDDERSTACK_ACCESS_TOKEN` holds a valid token in the shell that started the agent, or have the user re-run `rudder-cli auth login` with a new token |
| Wrong workspace | Token is tied to workspace; generate new token in correct workspace. If `RUDDERSTACK_ACCESS_TOKEN` is set, it overrides the token that `auth login` saved |
| Download fails | A 404 for `install.sh` means the script is not published yet; use the release archive block in Step 2. Otherwise check the network, or wait a few minutes if a release came out just now |
| `checksum mismatch` | Install nothing. Run the block again once; if it fails the same way, stop and tell the user |

## Next Steps

After setup completes:
- Run `/rudder-environment-check` to verify full environment
- Start with `/rudder-cli-workflow` for validate → dry-run → apply cycles
