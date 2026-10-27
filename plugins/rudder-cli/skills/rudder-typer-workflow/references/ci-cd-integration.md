# RudderTyper CI/CD Integration

Automation patterns for keeping generated analytics code in sync.

## GitHub Actions

```yaml
name: Validate Analytics

on:
  pull_request:
    paths:
      - 'tracking-plan/**'
      - 'ruddertyper.yml'

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install rudder-cli
        # Installs the latest release after checking it against the release's
        # checksums file. To pin a release, replace the two tag= lines with tag=v0.28.0.
        run: |
          cd "$RUNNER_TEMP"
          tag=$(curl -fsSLI -o /dev/null -w '%{url_effective}' https://github.com/rudderlabs/rudder-iac/releases/latest)
          tag=${tag##*/}
          url=https://github.com/rudderlabs/rudder-iac/releases/download/$tag
          curl -fsSLO "$url/rudder-cli_Linux_x86_64.tar.gz"
          curl -fsSL "$url/rudder-cli_${tag#v}_checksums.txt" | grep ' rudder-cli_Linux_x86_64.tar.gz$' | sha256sum -c -
          tar -xzf rudder-cli_Linux_x86_64.tar.gz rudder-cli
          mkdir -p "$HOME/.local/bin" && mv rudder-cli "$HOME/.local/bin/"
          echo "$HOME/.local/bin" >> "$GITHUB_PATH"

      - name: Validate tracking plan
        run: rudder-cli validate -l ./tracking-plan

      - name: Generate code
        run: rudder-cli typer generate

      - name: Check for changes
        run: |
          if [[ -n $(git status --porcelain generated/) ]]; then
            echo "Generated code is out of date!"
            echo "Run 'rudder-cli typer generate' and commit the changes."
            exit 1
          fi
```

## Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

# Regenerate and check for uncommitted changes
rudder-cli typer generate

if [[ -n $(git diff --name-only generated/) ]]; then
    echo "Error: Generated analytics code is out of sync."
    echo "Please run 'rudder-cli typer generate' and stage the changes."
    exit 1
fi
```

## Multi-Platform Projects

For apps with both iOS and Android:

```yaml
# ruddertyper-android.yml
version: "1.0.0"
trackingPlan:
  id: "tp_abc123"
  workspace: "ws_xyz789"
language: kotlin
output:
  path: ./android/app/src/main/java/analytics
```

```yaml
# ruddertyper-ios.yml
version: "1.0.0"
trackingPlan:
  id: "tp_abc123"
  workspace: "ws_xyz789"
language: swift
output:
  path: ./ios/Analytics
```

Generate both:

```bash
rudder-cli typer generate --config ruddertyper-android.yml
rudder-cli typer generate --config ruddertyper-ios.yml
```

## Common Patterns

### Shared Analytics Module

```
project/
├── analytics/                    # Shared tracking plan
│   ├── tracking-plan.yaml
│   └── ruddertyper.yml
├── android/
│   └── app/src/main/java/
│       └── generated/            # Kotlin output
└── ios/
    └── Generated/                # Swift output
```

### Monorepo with Multiple Apps

```
monorepo/
├── packages/
│   └── analytics-schema/         # Single source of truth
│       ├── tracking-plan.yaml
│       └── ruddertyper.yml
├── apps/
│   ├── mobile-android/
│   │   └── generated/
│   ├── mobile-ios/
│   │   └── Generated/
│   └── web/                      # TypeScript types (manual for now)
```

### Feature Flags for New Events

When adding events that aren't ready for all clients:

```yaml
# events.yaml - add new event
spec:
  name: "Checkout Started"
  description: "User started checkout process (beta)"

# tracking-plan.yaml - only add to beta plan
spec:
  name: "Mobile App - Beta"
  events:
    - event: "urn:rudder:event/checkout-started"
```
