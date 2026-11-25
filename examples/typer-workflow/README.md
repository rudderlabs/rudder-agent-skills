# RudderTyper Workflow Example

A complete example demonstrating how to use [RudderTyper](https://www.rudderstack.com/docs/sources/event-streams/sdks/ruddertyper/) to generate type-safe SDKs from your tracking plan.

## Overview

This example shows how to:

- Configure RudderTyper for your project
- Generate type-safe Kotlin code for Android
- Generate type-safe Swift code for iOS
- Integrate generated code into your mobile apps
- Iterate when tracking plans change

## Directory Structure

```
typer-workflow/
├── ruddertyper.yml               # RudderTyper configuration
├── generated-kotlin/
│   └── Analytics.kt              # Example generated Kotlin code
└── generated-swift/
    └── Analytics.swift           # Example generated Swift code
```

## Prerequisites

- [Rudder CLI](https://github.com/rudderlabs/rudder-iac) installed and authenticated
- A tracking plan deployed to your RudderStack workspace
- For full workflow: see `tracking-plan-workflow` example first

## Quick Start

### Step 1: Initialize RudderTyper

```bash
rudder-cli typer init
```

This creates `ruddertyper.yml` with your workspace configuration.

### Step 2: Configure for Your Platform

Edit `ruddertyper.yml`:

```yaml
# For Android/Kotlin
language: kotlin
output:
  path: ./app/src/main/java/com/example/analytics

# For iOS/Swift
language: swift
output:
  path: ./Analytics
```

### Step 3: Generate Code

```bash
rudder-cli typer generate
```

### Step 4: Integrate

Add the generated directory to your project and import the Analytics class.

## Configuration

### ruddertyper.yml

```yaml
version: "1.0.0"

trackingPlan:
  id: "tp_abc123"              # Your tracking plan ID
  workspace: "ws_xyz789"       # Your workspace ID

language: kotlin               # "kotlin" or "swift"

output:
  path: ./generated            # Output directory

# Optional: filter events
events:
  include:                     # Only generate these events
    - "Product Viewed"
    - "Product Added to Cart"
    - "Order Completed"
  # OR use exclude to skip specific events
```

## Generated Code Examples

### Kotlin (Android)

The generated code provides type-safe methods for each event:

```kotlin
// Before RudderTyper (error-prone)
analytics.track("Product Viewd", mapOf(      // Typo!
    "product_id" to "shoes-001",
    "proudct_name" to "Running Shoes",       // Typo!
    "price" to "89.99"                       // Wrong type!
))

// After RudderTyper (type-safe)
analytics.productViewed(
    product = ProductType(
        productId = "shoes-001",
        productSku = "RUN-001",
        productName = "Running Shoes",
        productCategory = ProductCategory.FOOTWEAR,
        productPrice = 89.99
    )
)
```

See `generated-kotlin/Analytics.kt` for the full example.

### Swift (iOS)

```swift
// Before RudderTyper
analytics.track("Product Viewed", properties: [
    "product_id": "shoes-001",
    "product_name": "Running Shoes"
])

// After RudderTyper
analytics.productViewed(
    product: ProductType(
        productId: "shoes-001",
        productSku: "RUN-001",
        productName: "Running Shoes",
        productCategory: .footwear,
        productPrice: 89.99
    )
)
```

See `generated-swift/Analytics.swift` for the full example.

## Benefits of Type-Safe Tracking

| Problem | Before | After |
|---------|--------|-------|
| Event name typo | Runtime error or silent data loss | Compile error |
| Property typo | Silent data loss | Compile error |
| Wrong type | Silent data corruption | Compile error |
| Missing required property | Silent data loss | Compile error |
| Enum value typo | Silent data corruption | Compile error |

## Iteration Workflow

When your tracking plan changes:

```
1. Update data catalog/tracking plan YAML
2. rudder-cli validate -l ./
3. rudder-cli apply -l ./
4. rudder-cli typer generate
5. Fix compile errors in app code
6. Commit spec changes + generated code together
```

### Example: Adding a New Required Property

1. Add property to event in data catalog
2. Validate and apply
3. Regenerate code
4. Compiler shows where to add the new property
5. Update all call sites
6. Commit

## CI/CD Integration

### GitHub Actions

```yaml
name: Validate Tracking Plan
on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install Rudder CLI
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

      - name: Validate
        run: rudder-cli validate -l ./

      - name: Generate and verify
        run: |
          rudder-cli typer generate
          # Check for uncommitted changes
          git diff --exit-code generated/
```

### Pre-commit Hook

```bash
#!/bin/bash
# .git/hooks/pre-commit

rudder-cli validate -l ./
if [ $? -ne 0 ]; then
  echo "Tracking plan validation failed"
  exit 1
fi

rudder-cli typer generate
git add generated/
```

## Troubleshooting

### "Tracking plan not found"

Ensure you've applied the tracking plan to your workspace:

```bash
rudder-cli apply -l ./
```

### "Type mismatch in generated code"

Check property types in your data catalog match expected usage:

```yaml
# Wrong
spec:
  name: "product_price"
  type: "string"           # Should be number!

# Right
spec:
  name: "product_price"
  type: "number"
```

### "Missing required properties"

Generated methods require all `required: true` properties. Check your event definitions.

## CLI Commands Reference

| Command | Description |
|---------|-------------|
| `rudder-cli typer init` | Initialize configuration |
| `rudder-cli typer generate` | Generate code from tracking plan |
| `rudder-cli typer generate --verbose` | Generate with detailed output |

## Using with Claude Code Skills

```bash
npx skills add rudderlabs/rudder-agent-skills
```

Claude Code can help you:
- Configure RudderTyper for your project
- Debug generation errors
- Update app code when tracking plans change

## Resources

- [RudderTyper Documentation](https://www.rudderstack.com/docs/sources/event-streams/sdks/ruddertyper/)
- [Rudder CLI Documentation](https://github.com/rudderlabs/rudder-iac)
- [Tracking Plan Workflow Example](../tracking-plan-workflow/)
