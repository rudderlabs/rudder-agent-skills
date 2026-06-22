# Tracking Plan Workflow Example

A complete example demonstrating how to create a [RudderStack Data Catalog](https://www.rudderstack.com/docs/data-catalog/) and [Tracking Plans](https://www.rudderstack.com/docs/data-governance/tracking-plans/) using the [Rudder CLI](https://github.com/rudderlabs/rudder-iac).

## Overview

This example shows how to:

- Define custom types for reusable validation patterns
- Create properties with type constraints
- Organize events into categories
- Build events that reference properties and custom types
- Create tracking plans that select events for specific sources
- Override property requirements per tracking plan

## Directory Structure

```
data-catalog/
├── custom-types/
│   ├── product-type.yaml         # Reusable product schema
│   └── address-type.yaml         # Reusable address schema
├── properties/
│   ├── product-properties.yaml   # Product-related properties
│   └── customer-properties.yaml  # Customer-related properties
├── categories/
│   └── categories.yaml           # Event categories
└── events/
    └── ecommerce.yaml            # E-commerce events

tracking-plans/
├── web-app.yaml                  # Web app tracking plan
└── mobile-app.yaml               # Mobile app tracking plan (stricter)
```

## Prerequisites

- [Rudder CLI](https://github.com/rudderlabs/rudder-iac) installed
- Authenticated to a RudderStack workspace:
  ```bash
  rudder-cli auth login
  rudder-cli workspace info
  ```

## Quick Start

1. **Validate the specs** (validates all resources):
   ```bash
   rudder-cli validate -l ./
   ```

2. **Preview changes:**
   ```bash
   rudder-cli apply --dry-run -l ./
   ```

3. **Deploy to your workspace:**
   ```bash
   rudder-cli apply -l ./
   ```

## Build Order

Resources must be created bottom-up because of URN references:

```
1. Custom Types    → referenced by properties
2. Properties      → referenced by events and custom types
3. Categories      → referenced by events
4. Events          → reference properties, categories, custom types
5. Tracking Plans  → reference events
```

The CLI handles this automatically when you run `apply -l ./`.

## Contents

### Custom Types

Reusable validation patterns for complex objects:

**ProductType** — Consolidated product information with required fields:
- product_id, product_sku, product_name, product_category, product_price
- Optional: product_msrp

**AddressType** — Shipping/billing address structure:
- address, city, state, zipcode

### Properties

Individual fields with type constraints:

**Product properties:**
- `product_id` — String, 3-50 chars
- `product_name` — String, max 200 chars
- `product_price` — Number, must be > 0
- `product_category` — Enum (Footwear, Clothing, Accessories)
- `quantity` — Integer, 1-100

**Customer properties:**
- `customer_email` — String with email regex pattern
- `order_id` — String, 3-50 chars
- `order_total` — Number, must be >= 0

### Events

E-commerce funnel events:

| Event | Required Properties | Description |
|-------|---------------------|-------------|
| Product Viewed | product (ProductType) | User viewed product detail page |
| Product Added to Cart | product, quantity | User added item to cart |
| Order Completed | order_id, order_total, customer_email, products, addresses | Purchase completed |

### Tracking Plans

**Web App** — Full funnel for website:
- All three events
- Page attribution properties (page_url, referrer_url)
- Permissive governance (forward violations)

**Mobile App** — Stricter for mobile:
- All three events
- Device attribution required (device_id, session_id)
- Strict governance (block violations)

## URN Reference System

Resources reference each other using URNs:

| Resource | URN Pattern | Example |
|----------|-------------|---------|
| Event | `urn:rudder:event/<name>` | `urn:rudder:event/product-viewed` |
| Property | `urn:rudder:property/<name>` | `urn:rudder:property/product_id` |
| Category | `urn:rudder:category/<name>` | `urn:rudder:category/ecommerce` |
| Custom Type | `urn:rudder:custom-type/<name>` | `urn:rudder:custom-type/product-type` |

**Note:** URN names use kebab-case: `product-type` not `ProductType`.

## Governance Settings

Control what happens when events violate the tracking plan:

| Setting | Behavior |
|---------|----------|
| `block` | Reject event entirely |
| `forward` | Forward event with violation metadata |
| `log` | Allow event, log violation for review |

The web app uses `forward` (permissive), mobile app uses `block` (strict).

## Extending This Example

### Add a New Event

1. Create property definitions (if new properties needed)
2. Add event to `data-catalog/events/ecommerce.yaml`
3. Add event reference to relevant tracking plans
4. Validate and apply

### Add Platform-Specific Overrides

In a tracking plan, override property requirements:

```yaml
events:
  - event: "urn:rudder:event/product-viewed"
    rules:
      - property: "urn:rudder:property/device_id"
        required: true  # Required for this plan only
```

### Create Environment-Specific Plans

```yaml
# tracking-plans/web-app-production.yaml
spec:
  name: "Web App - Production"
  governance:
    unplannedEvents: block      # Strict in production

# tracking-plans/web-app-development.yaml
spec:
  name: "Web App - Development"
  governance:
    unplannedEvents: log        # Lenient in development
```

## CLI Commands Reference

| Command | Description |
|---------|-------------|
| `rudder-cli validate -l ./` | Validate all YAML specs |
| `rudder-cli apply --dry-run -l ./` | Preview changes |
| `rudder-cli apply -l ./` | Apply to workspace |

## Using with Claude Code Skills

Install the skills using the Skills CLI (recommended):

```bash
npx skills add rudderlabs/rudder-agent-skills
```

Or install manually via symlinks:

```bash
mkdir -p .claude/skills
ln -s ../../plugins/rudder-core/skills/rudder-data-catalog .claude/skills/
ln -s ../../plugins/rudder-core/skills/rudder-tracking-plans .claude/skills/
ln -s ../../plugins/rudder-cli/skills/rudder-cli-workflow .claude/skills/
```

## Next Steps

After creating your data catalog and tracking plans:

1. **Connect tracking plans to sources** in the RudderStack UI
2. **Generate type-safe SDKs** with RudderTyper (see `typer-workflow` example)
3. **Monitor violations** in the RudderStack dashboard

## Resources

- [Data Catalog Documentation](https://www.rudderstack.com/docs/data-catalog/)
- [Tracking Plans Documentation](https://www.rudderstack.com/docs/data-governance/tracking-plans/)
- [Rudder CLI Documentation](https://github.com/rudderlabs/rudder-iac)
