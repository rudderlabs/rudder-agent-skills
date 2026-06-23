# Transformations Workflow Example

A complete example demonstrating how to manage [RudderStack transformations](https://www.rudderstack.com/docs/features/transformations/) using the [Rudder CLI](https://github.com/rudderlabs/rudder-iac).

## Overview

This example shows how to:

- Define transformations and libraries using YAML specs
- Write transformation code in JavaScript
- Create reusable transformation libraries
- Test transformations locally with input/output fixtures
- Deploy transformations using the Rudder CLI

## Directory Structure

```
transformations/
├── base64-lib.yaml              # Library YAML spec
├── test-transformation.yaml     # Transformation YAML spec
├── javascript/
│   ├── base64-lib.js            # Library implementation
│   └── test-transformation.js   # Transformation code
└── tests/
    ├── input/                   # Test input events
    │   ├── basic-event.json
    │   └── decode-event.json
    └── output/                  # Expected output events
        ├── basic-event.json
        └── decode-event.json
```

## Prerequisites

- [Rudder CLI](https://github.com/rudderlabs/rudder-iac) installed
- Authenticated to a RudderStack workspace:
  ```bash
  rudder-cli auth login
  rudder-cli workspace info
  ```

## Quick Start

1. **Validate the specs:**
   ```bash
   rudder-cli validate -l ./
   ```

2. **Run tests:**
   ```bash
   rudder-cli transformations test --all -l ./
   ```

3. **Preview changes:**
   ```bash
   rudder-cli apply --dry-run -l ./
   ```

4. **Deploy to your workspace:**
   ```bash
   rudder-cli apply -l ./
   ```

## Contents

### Base64 Library

A reusable library (`base64-lib.yaml`) providing Base64 encoding/decoding functions:

- `encode(str)` - Encode a UTF-8 string to Base64
- `decode(str)` - Decode a Base64 string to UTF-8
- `encodeURI(str)` - URL-safe Base64 encoding
- `isValid(str)` - Validate Base64 strings

The library is ported from [js-base64](https://github.com/dankogai/js-base64) and works in RudderStack's JavaScript sandbox without Node.js dependencies.

### Test Transformation

A sample transformation (`test-transformation.yaml`) demonstrating:

- Importing and using a custom library
- Accessing event metadata
- Modifying event properties
- Testing with fixtures

## Writing Your Own

### Transformation Spec

```yaml
version: "rudder/v1"
kind: "transformation"
metadata:
  name: "transformations"
spec:
  id: "my-transformation"
  name: "My Transformation"
  description: "Description of what it does"
  language: "javascript"
  file: "javascript/my-transformation.js"
  tests:
    - name: "my-tests"
      input: "./tests/input"
      output: "./tests/output"
```

### Library Spec

```yaml
version: "rudder/v1"
kind: "transformation-library"
metadata:
  name: "transformation-libraries"
spec:
  id: "my-library"
  name: "My Library"
  description: "Reusable utilities"
  language: "javascript"
  import_name: "myLibrary"    # Must be camelCase of name
  file: "javascript/my-library.js"
```

### Transformation Code

```javascript
import { encode } from "myLibrary";

export function transformEvent(event, metadata) {
    event.properties.encoded = encode(event.properties.data);
    return event;
}
```

## CLI Commands Reference

| Command | Description |
|---------|-------------|
| `rudder-cli validate -l ./` | Validate YAML specs and code |
| `rudder-cli apply --dry-run -l ./` | Preview changes without applying |
| `rudder-cli apply -l ./` | Apply changes to workspace |
| `rudder-cli transformations test --all -l ./` | Run all transformation tests |
| `rudder-cli transformations test <id> -l ./` | Test a specific transformation |

## Using with Claude Code Skills

Install the skills using the Skills CLI (recommended):

```bash
npx skills add rudderlabs/rudder-agent-skills
```

Or install manually via symlinks (from this example directory):

```bash
mkdir -p .claude/skills
ln -s ../../plugins/rudder-cli/skills/rudder-cli-workflow .claude/skills/
ln -s ../../plugins/rudder-cli/skills/rudder-transformations .claude/skills/
```

Then Claude Code can help you:
- Create new transformations following conventions
- Debug validation errors
- Port external libraries
- Write tests

## Resources

- [RudderStack Transformations Documentation](https://www.rudderstack.com/docs/features/transformations/)
- [Rudder CLI Documentation](https://github.com/rudderlabs/rudder-iac)
