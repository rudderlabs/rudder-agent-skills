# Safe Evolution Patterns

Patterns for safely evolving your tracking schema without breaking production SDKs.

## Pattern 1: Adding a New Property

**Scenario:** Add `discount_code` to Order Completed event.

```yaml
# properties/order-properties.yaml
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "discount_code"
  type: "string"
  description: "Applied discount code"
  config:
    maxLength: 50
```

```yaml
# events/order-completed.yaml
spec:
  name: "Order Completed"
  rules:
    # ... existing rules
    - property: "urn:rudder:property/discount_code"
      required: false  # Start optional!
```

```bash
rudder-cli validate -l ./
rudder-cli apply --dry-run -l ./
rudder-cli apply -l ./
```

**Safe because:** New optional property doesn't break existing SDKs.

## Pattern 2: Making a Property Required

**Scenario:** `session_id` was optional, now must be required.

**Phased approach:**

```yaml
# Phase 1: Add to tracking plan as required (not event definition)
# tracking-plans/web-app.yaml
spec:
  events:
    - event: "urn:rudder:event/product-viewed"
      rules:
        - property: "urn:rudder:property/session_id"
          required: true  # Required for this plan only
```

```bash
# Apply and monitor for violations
rudder-cli apply -l ./
```

```yaml
# Phase 2: After SDKs updated, make required at event level
# events/product-viewed.yaml
spec:
  rules:
    - property: "urn:rudder:property/session_id"
      required: true  # Now required everywhere
```

**Safe because:** Tracking plan override catches violations before hard requirement.

## Pattern 3: Renaming an Event (Breaking Change)

**Scenario:** Rename `Product View` to `Product Viewed`.

**Never do this directly!** It breaks existing SDKs.

```yaml
# 1. Create new event with correct name
# events/product-viewed.yaml (NEW)
version: "rudder/v1"
kind: "event"
metadata:
  name: "events"
spec:
  name: "Product Viewed"  # New name
  rules:
    # Same rules as old event
```

```yaml
# 2. Add both to tracking plans
# tracking-plans/web-app.yaml
spec:
  events:
    - event: "urn:rudder:event/product-view"      # Old (deprecated)
    - event: "urn:rudder:event/product-viewed"    # New
```

```bash
# 3. Update SDKs to use new event name
# 4. Monitor both events in analytics
# 5. After transition period, remove old event
```

```yaml
# tracking-plans/web-app.yaml (after transition)
spec:
  events:
    # - event: "urn:rudder:event/product-view"  # Removed
    - event: "urn:rudder:event/product-viewed"
```

```bash
# 6. Delete old event definition
rudder-cli apply -l ./  # Will show "Deleted [event] Product View"
```

## Pattern 4: Deprecating an Event

**Scenario:** Remove `Legacy Signup` event.

```yaml
# 1. Add deprecation notice
# events/legacy-signup.yaml
spec:
  name: "Legacy Signup"
  description: "DEPRECATED: Use 'Signed Up' instead. Will be removed 2024-06-01."
```

```yaml
# 2. Remove from tracking plans (events still validate)
# tracking-plans/web-app.yaml
spec:
  events:
    # - event: "urn:rudder:event/legacy-signup"  # Removed from plan
    - event: "urn:rudder:event/signed-up"        # Use this instead
```

```bash
# 3. Communicate to SDK teams
# 4. After deadline, delete event file and apply
rm events/legacy-signup.yaml
rudder-cli apply -l ./
```

## Pattern 5: Adding a Custom Type to Existing Properties

**Scenario:** Group shipping properties into AddressType.

```yaml
# 1. Create the custom type
# custom-types/address-type.yaml
version: "rudder/v1"
kind: "custom-type"
metadata:
  name: "custom-types"
spec:
  name: "AddressType"
  type: "object"
  config:
    properties:
      - property: "urn:rudder:property/street"
        required: true
      - property: "urn:rudder:property/city"
        required: true
      - property: "urn:rudder:property/state"
        required: true
      - property: "urn:rudder:property/zipcode"
        required: true
```

```yaml
# 2. Create wrapper property
# properties/shipping-address.yaml
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "shipping_address"
  customType: "urn:rudder:custom-type/address-type"
  description: "Customer shipping address"
```

```yaml
# 3. Update event to use new property
# events/order-completed.yaml
spec:
  rules:
    # Old individual properties (keep during transition)
    - property: "urn:rudder:property/shipping_street"
    - property: "urn:rudder:property/shipping_city"
    # ... etc

    # New custom type property
    - property: "urn:rudder:property/shipping_address"
      customType: "urn:rudder:custom-type/address-type"
```

```bash
# 4. After SDKs migrate, remove old properties
```

## Multi-Workspace Management

### Scenario: Dev/Staging/Production

```
workspaces/
├── development/
│   └── (imported from dev workspace)
├── staging/
│   └── (imported from staging workspace)
└── production/
    └── (imported from prod workspace)
```

### Switch Workspaces

```bash
# Login to different workspace
rudder-cli auth login

# Verify current workspace
rudder-cli workspace info
```

### Promote Changes

```bash
# 1. Develop and test in dev workspace
cd workspaces/development
rudder-cli apply -l ./

# 2. Copy to staging, apply
cp -r data-catalog ../staging/
cd ../staging
rudder-cli apply -l ./

# 3. After testing, copy to production
cp -r data-catalog ../production/
cd ../production
rudder-cli apply -l ./
```
