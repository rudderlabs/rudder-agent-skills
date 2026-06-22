# Data Graph Workflow Example

A complete example demonstrating how to create and manage [RudderStack Data Graphs](https://www.rudderstack.com/docs/audiences/data-graph/) for the Audiences feature using the [Rudder CLI](https://github.com/rudderlabs/rudder-iac).

## Overview

This example shows how to:

- Define Data Graphs using YAML specs
- Model entities (customers, accounts, branches) and events (orders, leads)
- Create relationships between models
- Validate and deploy Data Graphs using the Rudder CLI

## Directory Structure

```
data-graphs/
├── ecommerce-data-graph.yaml     # E-commerce example (B2C + B2B)
└── property-data-graph.yaml      # Property management example
```

## Prerequisites

- [Rudder CLI](https://github.com/rudderlabs/rudder-iac) installed
- Authenticated to a RudderStack workspace with Audiences enabled:
  ```bash
  rudder-cli auth login
  rudder-cli workspace info
  ```
- Warehouse tables that match the table references in the YAML specs

## Quick Start

1. **Update the specs** with your actual warehouse details:
   - Replace `account_id` with your warehouse account ID
   - Replace table references (`catalog.schema.table`) with your actual tables

2. **Validate the specs:**
   ```bash
   rudder-cli validate -l ./
   ```

3. **Preview changes:**
   ```bash
   rudder-cli apply --dry-run -l ./
   ```

4. **Deploy to your workspace:**
   ```bash
   rudder-cli apply -l ./
   ```

## Examples

### E-Commerce Data Graph

The `ecommerce-data-graph.yaml` demonstrates a typical B2C/B2B e-commerce setup:

**Entities:**
- `customers` — Individual buyers with profile data
- `accounts` — B2B accounts (companies) that customers belong to

**Events:**
- `orders` — Purchase transactions with timestamps

**Relationships:**
- Customer → Account (many-to-one): Each customer belongs to one account
- Customer → Orders (one-to-many): Each customer can have many orders

**Audiences you can build:**
- "Customers who ordered in the last 30 days"
- "Customers whose Account is Enterprise tier"
- "Customers who haven't ordered in 90 days" (churn risk)

### Property Management Data Graph

The `property-data-graph.yaml` demonstrates a property management vertical:

**Entities:**
- `branches` — Office locations (root entity)
- `contacts` — Landlords and tenants

**Events:**
- `leads_sent` — Lead submission events

**Relationships:**
- Branch → Contacts (one-to-many): Each branch manages many contacts
- Branch → Leads Sent (one-to-many): Each branch receives many leads
- Contact → Branch (many-to-one): Each contact belongs to one branch
- Contact → Leads Sent (one-to-many): Each contact can have many leads

**Audiences you can build:**
- "Branches with no leads in the last 30 days"
- "Contacts who received a lead but didn't convert"
- "Branches by region with high contact volume"

## Key Concepts

### Entity vs Event

| Type | Description | Required Field | Example |
|------|-------------|----------------|---------|
| Entity | Stable business object with durable PK | `primary_id` | customers, accounts, products |
| Event | Timestamped action/occurrence | `timestamp` | orders, page_views, leads |

### Relationship Cardinality

| Cardinality | Meaning | Example |
|-------------|---------|---------|
| `one-to-one` | Each source row maps to exactly one target row | user → user_profile |
| `one-to-many` | Each source row maps to multiple target rows | customer → orders |
| `many-to-one` | Multiple source rows map to one target row | customers → account |

### Relationship Rules

- **Entity → Event** must be `one-to-many`
- **Event → Entity** must be `many-to-one`
- **Entity → Entity** can be any cardinality
- **Event → Event** relationships are **not allowed**

## Validation Rules

The CLI validates these rules before deployment:

- `table` must be 3-part: `catalog.schema.table`
- Entity models require `primary_id`, must not have `timestamp`
- Event models require `timestamp`, must not have `primary_id`
- All `display_name` values must be unique across models and relationships
- `target` must use URN syntax: `#data-graph-model:<model-id>`

## CLI Commands Reference

| Command | Description |
|---------|-------------|
| `rudder-cli validate -l ./` | Validate YAML specs |
| `rudder-cli apply --dry-run -l ./` | Preview changes without applying |
| `rudder-cli apply -l ./` | Apply changes to workspace |

## Using with Claude Code Skills

Install the skills using the Skills CLI (recommended):

```bash
npx skills add rudderlabs/rudder-agent-skills
```

Or install manually via symlinks (from this example directory):

```bash
mkdir -p .claude/skills
ln -s ../../plugins/rudder-core/skills/rudder-data-graphs .claude/skills/
ln -s ../../plugins/rudder-cli/skills/rudder-cli-workflow .claude/skills/
```

Then Claude Code can help you:
- Analyze your RETL sources and design a Data Graph
- Identify untapped audience segments from your data model
- Debug validation errors
- Generate demo warehouse specs

## Troubleshooting

### "primary_id required for entity type"

You set `type: "entity"` but forgot `primary_id`. Add the column that uniquely identifies rows.

### "timestamp required for event type"

You set `type: "event"` but forgot `timestamp`. Add the business-time column (not `loaded_at` or ETL metadata).

### "Event to event relationships are not allowed"

Events must relate to entities, not to other events. Restructure your graph.

### "Invalid table reference"

The `table` must be 3-part: `catalog.schema.table`. Check for missing catalog prefix.

### Validation passes but audiences return wrong data

Likely cause: wrong join keys. The YAML is syntactically valid but semantically wrong. Verify join keys match actual FK relationships in your warehouse.

## Resources

- [Audiences Overview](https://www.rudderstack.com/docs/audiences/overview/)
- [Data Graph Documentation](https://www.rudderstack.com/docs/audiences/data-graph/)
- [Data Graph YAML Reference](https://www.rudderstack.com/docs/audiences/data-graph/cli-reference/)
- [Visual Builder Guide](https://www.rudderstack.com/docs/audiences/data-graph/create-data-graph/)
- [Rudder CLI Documentation](https://github.com/rudderlabs/rudder-iac)
