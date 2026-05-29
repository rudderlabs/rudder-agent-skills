# Data Graph YAML Template

Full annotated template for Data Graph specs with worked examples and troubleshooting.

## Complete annotated template

```yaml
version: "rudder/v1"                    # Required. Schema version.
kind: "data-graph"                       # Required. Resource type.
metadata:
  name: "acme-ecommerce-data-graph"      # Required. Human-readable name for the graph.
spec:
  id: "acme-ecommerce-data-graph"        # Required. Unique identifier used in syncs.
  account_id: "2abc123xyz"               # Required. Warehouse account ID from RETL source config.
  models:
    # ─────────────────────────────────────────────────────────────
    # ENTITY: Root entity (the "who" being activated)
    # ─────────────────────────────────────────────────────────────
    - id: "customers"                    # Unique model identifier (snake_case or kebab-case).
      display_name: "Customers"          # UI label. Must be unique across ALL models.
      type: "entity"                     # "entity" = dimension-like table with durable PK.
      table: "ACME_DB.ECOMMERCE.DIM_CUSTOMERS"  # 3-part: catalog.schema.table
      description: "Customer records with demographics and loyalty tier"  # Tooltip in Audience Builder.
      primary_id: "CUSTOMER_KEY"         # Required for entity. Column that uniquely identifies rows.
      relationships:
        # Entity → Event relationship
        - id: "customer-has-orders"
          display_name: "Has Orders"     # Must be unique across ALL relationships.
          cardinality: "one-to-many"     # Entity→Event must be one-to-many.
          target: "#data-graph-model:orders"  # URN syntax required.
          source_join_key: "CUSTOMER_KEY"     # Column on THIS model.
          target_join_key: "CUSTOMER_KEY"     # Column on TARGET model.
        # Entity → Entity relationship
        - id: "customer-belongs-to-account"
          display_name: "Belongs To Account"
          cardinality: "many-to-one"     # Many customers → one account.
          target: "#data-graph-model:accounts"
          source_join_key: "ACCOUNT_KEY"
          target_join_key: "ACCOUNT_KEY"

    # ─────────────────────────────────────────────────────────────
    # ENTITY: Related entity (FK target)
    # ─────────────────────────────────────────────────────────────
    - id: "accounts"
      display_name: "Accounts"
      type: "entity"
      table: "ACME_DB.ECOMMERCE.DIM_ACCOUNTS"
      description: "B2B account records"
      primary_id: "ACCOUNT_KEY"
      # No relationships needed if this is a leaf node.

    # ─────────────────────────────────────────────────────────────
    # EVENT: Timestamped activity table
    # ─────────────────────────────────────────────────────────────
    - id: "orders"
      display_name: "Orders"
      type: "event"                      # "event" = fact-like table with timestamp.
      table: "ACME_DB.ECOMMERCE.FACT_ORDERS"
      description: "Order transactions"
      timestamp: "ORDERED_AT"            # Required for event. True business timestamp.
      # Events cannot have primary_id.
      # Events cannot have relationships to other events.
```

## Field reference

### Top-level fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | String | Yes | Schema version: `"rudder/v1"` |
| `kind` | String | Yes | Resource type: `"data-graph"` |
| `metadata.name` | String | Yes | Human-readable name |
| `spec.id` | String | Yes | Unique identifier for syncs |
| `spec.account_id` | String | Yes | Warehouse account ID (from RETL source config) |
| `spec.models` | List | Yes | Entity and event models |

### Model fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes | Unique model identifier |
| `display_name` | String | Yes | UI label (must be unique across all models) |
| `type` | String | Yes | `"entity"` or `"event"` |
| `table` | String | Yes | Fully qualified: `catalog.schema.table` |
| `description` | String | No | Tooltip in Audience Builder |
| `primary_id` | String | Entity only | Column that uniquely identifies rows |
| `timestamp` | String | Event only | Event timestamp column |
| `relationships` | List | No | Relationships to other models |

### Relationship fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | String | Yes | Unique relationship identifier |
| `display_name` | String | Yes | UI label (must be unique) |
| `cardinality` | String | Yes | `"one-to-one"`, `"one-to-many"`, or `"many-to-one"` |
| `target` | String | Yes | Target model: `#data-graph-model:<model-id>` |
| `source_join_key` | String | Yes | Column on source model for join |
| `target_join_key` | String | Yes | Column on target model for join |

## Validation rules

- `table` must be a **3-part reference** (`catalog.schema.table`)
- Entity models require `primary_id` and must not set `timestamp`
- Event models require `timestamp` and must not set `primary_id`
- **Event↔event relationships are forbidden**
- Event→entity cardinality must be `many-to-one`
- Entity→event cardinality must be `one-to-many`
- Entity↔entity can be any cardinality
- `target` must use URN syntax `#data-graph-model:<model-id>` and resolve to a model in the same spec
- All `display_name` values must be unique across models and relationships

## Worked example: Property vertical

A property management company with branches, contacts, and lead events.

```yaml
version: "rudder/v1"
kind: "data-graph"
metadata:
  name: "propco-data-graph"
spec:
  id: "propco-data-graph"
  account_id: "2wh9abc123"
  models:
    # Root entity: Branches (the business units)
    - id: "branches"
      display_name: "Branches"
      type: "entity"
      table: "PROPCO_DW.ANALYTICS.DIM_BRANCH"
      description: "Property management branches"
      primary_id: "BRANCH_ID"
      relationships:
        - id: "branch-has-contacts"
          display_name: "Has Contacts"
          cardinality: "one-to-many"
          target: "#data-graph-model:contacts"
          source_join_key: "BRANCH_ID"
          target_join_key: "BRANCH_ID"
        - id: "branch-has-leads"
          display_name: "Has Leads Sent"
          cardinality: "one-to-many"
          target: "#data-graph-model:leads-sent"
          source_join_key: "BRANCH_ID"
          target_join_key: "BRANCH_ID"

    # Related entity: Contacts
    - id: "contacts"
      display_name: "Contacts"
      type: "entity"
      table: "PROPCO_DW.ANALYTICS.DIM_CONTACT"
      description: "Landlords and tenants"
      primary_id: "CONTACT_ID"
      relationships:
        - id: "contact-belongs-to-branch"
          display_name: "Belongs To Branch"
          cardinality: "many-to-one"
          target: "#data-graph-model:branches"
          source_join_key: "BRANCH_ID"
          target_join_key: "BRANCH_ID"
        - id: "contact-has-leads"
          display_name: "Has Leads Sent"
          cardinality: "one-to-many"
          target: "#data-graph-model:leads-sent"
          source_join_key: "CONTACT_ID"
          target_join_key: "CONTACT_ID"

    # Event: Leads sent
    - id: "leads-sent"
      display_name: "Leads Sent"
      type: "event"
      table: "PROPCO_DW.ANALYTICS.FACT_LEAD_SENT"
      description: "Lead submission events"
      timestamp: "SENT_AT"
```

**Audiences this graph enables:**

1. "Branches with no leads in the last 30 days" — Branch entity + Leads Sent event + time window
2. "Contacts who received a lead but didn't convert" — Contact + Leads Sent + conversion flag
3. "Top-performing branches by lead volume" — Branch + aggregated Leads Sent count

## Troubleshooting

### "primary_id required for entity type"

You set `type: "entity"` but forgot `primary_id`. Add the column that uniquely identifies rows.

### "timestamp required for event type"

You set `type: "event"` but forgot `timestamp`. Add the business-time column (not `loaded_at` or `snapshot_date`).

### "Event to event relationships are not allowed"

You tried to create a relationship between two event models. This is forbidden. Events must relate to entities, not to other events.

### "Invalid cardinality for entity to event relationship"

Entity→Event must be `one-to-many`. Event→Entity must be `many-to-one`. Check the direction.

### "Model reference not found"

The `target` URN doesn't match any `id` in the same spec. Check for typos. Remember: `#data-graph-model:orders` must match a model with `id: "orders"`.

### "Duplicate display_name"

Two models or relationships have the same `display_name`. Each must be unique. This applies across ALL models and relationships in the spec.

### "Invalid table reference"

The `table` must be 3-part: `catalog.schema.table`. Common mistake: using 2-part `schema.table`.

### Validation passes but audiences return wrong data

Most likely cause: wrong join keys. The YAML is syntactically valid but semantically wrong. Verify join keys match actual FK relationships in the warehouse.

## CLI commands

```bash
# Validate all data-graph specs in current directory
rudder-cli validate -l ./

# Dry run to preview changes
rudder-cli apply --dry-run -l ./

# Apply to workspace
rudder-cli apply -l ./
```
