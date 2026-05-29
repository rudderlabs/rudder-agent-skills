# Error Reference

Detailed error codes, causes, and fixes for instrumentation debugging.

## RudderTyper Issues

### Generated Code Has Compile Errors

**Cause:** Schema changes not regenerated.

```bash
# 1. Apply schema changes
rudder-cli apply -l ./

# 2. Regenerate code
rudder-cli typer generate

# 3. Check for changes
git diff generated/
```

**Cause:** Type mismatch between schema and usage.

```kotlin
// Error: Type mismatch
analytics.productViewed(
    product = ProductType(
        productPrice = "89.99"  // String, but schema says number!
    )
)
```

Fix: Update schema or fix code:
```yaml
# If price should be string
spec:
  name: "product_price"
  type: "string"

# If price should be number (preferred)
spec:
  name: "product_price"
  type: "number"
```

### Missing Properties in Generated Code

**Cause:** Property not added to event rules.

```yaml
# Property exists but not in event
spec:
  name: "Product Viewed"
  rules:
    - property: "urn:rudder:property/product_id"
    # Missing: product_category won't appear in generated code
```

Fix: Add to event rules:
```yaml
rules:
  - property: "urn:rudder:property/product_id"
  - property: "urn:rudder:property/product_category"  # Add it
```

### Custom Types Not in Generated Code

**Cause:** Custom type not referenced by any event.

```bash
# Check if custom type is used
grep -r "urn:rudder:custom-type/product-type" data-catalog/events/
```

Fix: Add to event rules:
```yaml
rules:
  - property: "urn:rudder:property/product"
    customType: "urn:rudder:custom-type/product-type"  # Reference it
```

## Live Event Debugging

Events failing validation at runtime:

### Check Event Name

Event names are **case-sensitive**:

```json
// Wrong
{ "event": "product viewed" }  // lowercase

// Right
{ "event": "Product Viewed" }  // Title Case
```

### Check Required Properties

```json
// Missing required property
{
  "event": "Order Completed",
  "properties": {
    "order_id": "123"
    // Missing: order_total, customer_email
  }
}
```

Debug: Check event rules for required properties:
```bash
grep -A 20 "name: \"Order Completed\"" data-catalog/events/
```

### Check Property Types

```json
// Wrong type
{
  "properties": {
    "product_price": "89.99"  // String, should be number
  }
}
```

### Check Tracking Plan Connection

Ensure source is connected to the correct tracking plan:
1. Check source configuration in RudderStack UI
2. Verify tracking plan includes the event
3. Check governance settings (block vs. forward vs. log)

## Config Options by Type

| Type | Valid Config |
|------|--------------|
| `string` | minLength, maxLength, pattern, format, enum |
| `number` | minimum, maximum, exclusiveMinimum, exclusiveMaximum |
| `integer` | minimum, maximum, exclusiveMinimum, exclusiveMaximum |
| `array` | items, minItems, maxItems |
| `object` | properties (with required flags) |
| `boolean` | (none) |

## Quick Reference: Error → Fix

| Error | Likely Cause | Quick Fix |
|-------|--------------|-----------|
| `not found` | Typo in URN | Check spelling, use grep to find |
| `duplicate` | Same name twice | Remove duplicate file |
| `invalid config` | Wrong config for type | Match config to type |
| `circular reference` | Types reference each other | Restructure to avoid loops |
| `syntax error` | Bad YAML | Check indentation, use YAML linter |
| `unexpected deletion` | Missing file | Restore from git or re-import |
| `no changes` | Files not saved | Save files, check directory |
