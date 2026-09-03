# Tracking Plan Workflow Example

A complete example of a [RudderStack Data Catalog](https://www.rudderstack.com/docs/data-catalog/) and [Tracking Plans](https://www.rudderstack.com/docs/data-governance/tracking-plans/) managed with the [Rudder CLI](https://github.com/rudderlabs/rudder-iac).

## Overview

This example shows how to:

- Define reusable object custom types (`ProductType`, `AddressType`)
- Create properties with type constraints, including arrays of a custom type
- Organize events into categories
- Build tracking plans that attach properties to events with per-plan requirements
- Ship two plans over one catalog: a permissive web plan and a strict mobile plan

## Directory Structure

```
data-catalog/
├── custom-types/
│   ├── product-type.yaml         # ProductType object schema
│   └── address-type.yaml         # AddressType object schema
├── properties/
│   ├── product-properties.yaml   # Product-related properties
│   └── customer-properties.yaml  # Order, address and attribution properties
├── categories/
│   └── categories.yaml           # Event categories
└── events/
    └── ecommerce.yaml            # E-commerce event definitions

tracking-plans/
├── web-app.yaml                  # Web app plan
└── mobile-app.yaml               # Mobile app plan (stricter)
```

One spec per file. A file holding several YAML documents separated by `---` is rejected.

## Spec Shape

Every file starts with the same three keys:

```yaml
version: rudder/v0.1
kind: <categories | properties | custom-types | events | tp>
metadata:
  name: <group-name>      # the group other files reference this file's entries by
spec:
  ...
```

`metadata.name` matters: it is the middle segment of every reference to the entries in that file.

## Reference System

Resources reference each other with `#/<kind>/<group>/<id>`, where `<group>` is the
referenced file's `metadata.name` and `<id>` is the entry's `id`:

| Target | Pattern | Example |
|--------|---------|---------|
| Property | `#/properties/<group>/<id>` | `#/properties/product-properties/product_id` |
| Event | `#/events/<group>/<id>` | `#/events/ecommerce-events/product_viewed` |
| Category | `#/categories/<group>/<id>` | `#/categories/event-categories/ecommerce` |
| Custom type | `#/custom-types/<group>/<id>` | `#/custom-types/product-types/product_type` |

## Contents

### Categories

`kind: categories`, group `event-categories`. One category, `ecommerce`, referenced by every event.

### Properties

`kind: properties`. Each entry has an `id`, a wire `name`, a `type`, and optional
constraints under `propConfig`.

A property's `type` is either a primitive (`string`, `number`, `integer`,
`boolean`, `null`, `array`, `object`) or a custom type reference:

```yaml
- id: shipping_address
  name: shipping_address
  type: "#/custom-types/address-types/address_type"
```

Arrays name their element type in `propConfig.itemTypes`:

```yaml
- id: products
  name: products
  type: array
  propConfig:
    itemTypes: ["#/custom-types/product-types/product_type"]
    minItems: 1
```

`propConfig.format` accepts only `date-time`, `date`, `time`, `email`, `uuid`,
`hostname`, `ipv4` and `ipv6` — there is no `uri` format, so URL properties use
`maxLength` instead.

### Custom Types

`kind: custom-types`. A type has an `id`, a `name` starting with an uppercase
letter, a primitive `type`, and — for `type: object` — a list of property refs:

```yaml
- id: product_type
  name: ProductType
  type: object
  properties:
    - $ref: "#/properties/product-properties/product_id"
      required: true
    - $ref: "#/properties/product-properties/product_msrp"
      required: false
```

Scalar custom types carry constraints under `config` (note: `config` on custom
types, `propConfig` on properties).

**ProductType** — product_id, product_sku, product_name, product_category,
product_price required; product_msrp optional.

**AddressType** — address, city, state, zipcode, all required.

### Events

`kind: events`, group `ecommerce-events`. An event declares only its identity:

```yaml
- id: product_viewed
  name: Product Viewed        # the wire name; "" for identify/group/page calls
  event_type: track           # track | screen | identify | group | page
  description: "User viewed a product detail page"
  category: "#/categories/event-categories/ecommerce"
```

Events carry no property rules. Which properties an event has, and whether they
are required, is decided per tracking plan — that is what lets the mobile plan be
stricter than the web plan over the same event.

| Event | id |
|-------|----|
| Product Viewed | `product_viewed` |
| Product Added to Cart | `product_added_to_cart` |
| Order Completed | `order_completed` |

### Tracking Plans

`kind: tp` (not `tracking-plan`). `spec.id` and `spec.display_name` are both
required. Each rule binds one event to its properties:

```yaml
spec:
  id: web_app
  display_name: "Web App Tracking Plan"
  rules:
    - type: event_rule
      id: product_viewed_rule
      event:
        $ref: "#/events/ecommerce-events/product_viewed"
        allow_unplanned: true
      properties:
        - $ref: "#/properties/product-properties/product"
          required: true
```

`allow_unplanned` on the event ref is what governs unplanned properties — there
is no separate `governance:` block.

**Web App** (`web_app`) — full funnel, page attribution (`page_url`,
`referrer_url`), `allow_unplanned: true` while the site is still being instrumented.

**Mobile App** (`mobile_app`) — same funnel, `device_id` and `session_id`
required on every event, `allow_unplanned: false`.

## Prerequisites

- [Rudder CLI](https://github.com/rudderlabs/rudder-iac) installed
- For `apply`, authentication to a workspace:
  ```bash
  rudder-cli auth login
  ```

## Quick Start

Validate the specs — no auth or network needed:

```bash
rudder-cli validate -l ./
```

Preview and apply to a workspace:

```bash
rudder-cli apply --dry-run -l ./
```

```bash
rudder-cli apply -l ./
```

## Generating Code From These Specs

RudderTyper can generate a client straight from this directory, without applying
it first. A client is generated from one tracking plan, so name the plan you want:

```bash
RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_LOCAL_TYPER=true \
  rudder-cli typer generate --local --location . \
    --tracking-plan-id web_app --platform kotlin -o ./generated
```

Swap `--tracking-plan-id mobile_app` for the mobile client, or `--platform swift`
/ `--platform typescript` for the other targets. `--local` is experimental and
needs both environment variables above.

`--tracking-plan-id` is how you call `typer generate` in general: without
`--local` it is required outright, since the plan is fetched from the workspace
by ID. `--local` adds one shortcut on top — if the directory holds exactly one
plan it uses that one — and otherwise stops and lists what it found:

```
Error: multiple tracking plans found, specify --tracking-plan-id (available: mobile_app, web_app)
```

That is the intended behaviour, not a misconfiguration: a catalog with several
plans is the normal shape, and generating from a plan you did not choose would
be worse than being asked.

For a full app instrumented against a generated client, see the
`instrumentation-e2e` example.

## Extending This Example

### Add a New Event

1. Add any new properties to `data-catalog/properties/`
2. Add the event to `data-catalog/events/ecommerce.yaml`
3. Add an `event_rule` for it to each tracking plan that should carry it
4. `rudder-cli validate -l ./`

### Add a Plan-Specific Requirement

Requirements live on the plan, not the event, so make the property required in
one plan and optional (or absent) in the other:

```yaml
# tracking-plans/mobile-app.yaml
properties:
  - $ref: "#/properties/customer-properties/device_id"
    required: true
```

### Create Environment-Specific Plans

Copy a plan file, give it a new `spec.id` and `display_name`, and tighten
`allow_unplanned`:

```yaml
spec:
  id: web_app_production
  display_name: "Web App - Production"
  rules:
    - type: event_rule
      id: product_viewed_rule
      event:
        $ref: "#/events/ecommerce-events/product_viewed"
        allow_unplanned: false
```

## CLI Commands Reference

| Command | Description |
|---------|-------------|
| `rudder-cli validate -l ./` | Validate all YAML specs |
| `rudder-cli apply --dry-run -l ./` | Preview changes |
| `rudder-cli apply -l ./` | Apply to workspace |
| `rudder-cli typer generate --local ...` | Generate a client from these specs |

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

1. **Connect tracking plans to sources** in the RudderStack UI
2. **Generate type-safe SDKs** with RudderTyper (see above, and the `instrumentation-e2e` example)
3. **Monitor violations** in the RudderStack dashboard

A production catalog in this same dialect lives at
[rudderlabs/rudder-data-gov](https://github.com/rudderlabs/rudder-data-gov).

## Resources

- [Data Catalog Documentation](https://www.rudderstack.com/docs/data-catalog/)
- [Tracking Plans Documentation](https://www.rudderstack.com/docs/data-governance/tracking-plans/)
- [Rudder CLI Documentation](https://github.com/rudderlabs/rudder-iac)
