# RETL Audiences vs. Data Graph Capability Comparison

Use this to frame the upgrade conversation with customers.

## Comparison table

| Capability | RETL Audiences (today) | Data Graph (upgrade) |
|------------|------------------------|----------------------|
| **Entity sources** | Single table/model per audience | Multiple entities with relationships |
| **Joins** | Manual SQL in model source | Declarative relationships in YAML |
| **Events** | Not supported | First-class event models with timestamps |
| **Time windows** | Manual SQL | Built-in recency and window filters |
| **Cross-entity filters** | Requires custom model | "Customers whose Account is in tier X" |
| **Relationship traversal** | Not supported | Navigate entity→entity and entity→event |
| **Schema visibility** | Hidden in SQL | Visual entity map in Audience Builder |
| **Maintenance** | Edit SQL per audience | Edit graph once, all audiences update |
| **Version control** | Per-audience | Single YAML spec in git |
| **Validation** | Runtime errors | CLI validation before deploy |

## Talking points by row

### Entity sources

**Today:** Each audience is built on exactly one table or model. To combine customer + account data, you must create a model that joins them upstream.

**Upgrade:** Define customers and accounts as separate entities with a relationship. The Audience Builder lets marketers filter on both without touching SQL.

**Example pitch:** "Instead of maintaining a `customer_with_account_info` model, you define the relationship once and the builder handles the join."

---

### Joins

**Today:** Joins live in SQL inside model sources. Changes require editing SQL and revalidating.

**Upgrade:** Relationships are declared in YAML with explicit join keys. The system generates correct joins.

**Example pitch:** "Your SQL models stay simple. Join logic is declarative and auditable in version control."

---

### Events

**Today:** No concept of events. To filter by "ordered in last 30 days," you must pre-compute a flag or aggregate in a model.

**Upgrade:** Event models have a timestamp field. Time-window filters are native: "Customers who placed an order in the last 30 days."

**Example pitch:** "You have `fact_orders` already. With Data Graph, 'active customers' becomes a click, not a SQL change."

---

### Time windows

**Today:** Manual. You write `WHERE ordered_at > DATEADD(day, -30, CURRENT_DATE)` in a model.

**Upgrade:** Built-in. Select the event, pick the window, done.

**Example pitch:** "Marketing can change '30 days' to '7 days' without a deploy cycle."

---

### Cross-entity filters

**Today:** Requires a model that flattens the relationship. "Customers whose Account is Enterprise" means a model with account tier denormalized onto customers.

**Upgrade:** Traverse relationships in the builder. "Customers → belongs to Account → where tier = 'Enterprise'."

**Example pitch:** "Your dim_customer stays normalized. Account-level filters work without duplication."

---

### Relationship traversal

**Today:** Not supported. Each audience is a single flat table.

**Upgrade:** Navigate from entity to entity or entity to event. "Branches → that have Contacts → who received Leads in the last 14 days."

**Example pitch:** "You can finally answer 'which branches are struggling?' by combining branch, contact, and lead data."

---

### Schema visibility

**Today:** Marketers see a list of columns. Relationships are invisible.

**Upgrade:** Visual entity map shows how entities connect. Marketers understand the data model.

**Example pitch:** "Less 'what column do I use?' tickets. The graph is self-documenting."

---

### Maintenance

**Today:** Each audience has its own SQL. A schema change means editing every affected audience.

**Upgrade:** Edit the Data Graph once. All audiences using that entity update automatically.

**Example pitch:** "When you rename a column, you fix it in one place."

---

### Version control

**Today:** Audiences are configured in the UI or scattered across model SQL files.

**Upgrade:** Single YAML spec. PR reviews, git history, rollbacks.

**Example pitch:** "Your data model is code. Treat it like code."

---

### Validation

**Today:** Errors surface at runtime when the audience query fails.

**Upgrade:** `rudder-cli validate` catches errors before deploy: missing columns, invalid joins, type mismatches.

**Example pitch:** "Catch mistakes in CI, not in production."

---

## Framing the conversation

1. **Start with their pain.** What are they trying to do today that's hard? Multi-entity filters? Time windows? Denormalized models?

2. **Map pain to capability.** "You mentioned maintaining that joined model is tedious. With Data Graph, you define the relationship once."

3. **Show their data.** Use the Source Inventory and Untapped Segments from the skill output. "You already have `fact_orders`. Here's the audience you could build in 5 minutes."

4. **Quantify the unlock.** "You have 3 audience sources today. With your current entities and events, you could support 12+ segment combinations."

5. **Propose next steps.** Hand them the draft YAML. Offer to walk through validation. Schedule a builder demo.
