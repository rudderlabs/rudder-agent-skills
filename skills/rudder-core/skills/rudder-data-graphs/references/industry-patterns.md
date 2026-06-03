# Industry Patterns

Starting shapes for common verticals. Load only the section matching the customer's vertical.

## Property Management

**Root entity:** Branches (the business units being measured and activated)

**Typical entities:**
- `branches` — office locations, each with staff and a portfolio
- `contacts` — landlords, tenants, vendors
- `properties` — managed real estate units
- `staff` — property managers, agents

**Typical events:**
- `leads_sent` — lead submission to a branch or agent
- `viewings_booked` — property showing scheduled
- `contracts_signed` — lease or management agreement executed
- `maintenance_requests` — tenant service requests

**Common graph shape:**

```
branches (entity, root)
    ├── one-to-many → contacts (entity)
    ├── one-to-many → properties (entity)
    ├── one-to-many → leads_sent (event)
    └── one-to-many → viewings_booked (event)

contacts (entity)
    ├── many-to-one → branches (entity)
    ├── one-to-many → leads_sent (event)
    └── one-to-many → contracts_signed (event)

properties (entity)
    ├── many-to-one → branches (entity)
    └── one-to-many → viewings_booked (event)
```

**High-value segment ideas:**
- Branches with no leads in 30 days
- Landlords who haven't renewed in 12 months
- Properties with high maintenance request volume
- Contacts by branch region + lifecycle stage

---

## E-Commerce

**Root entity:** Customers (the people buying things)

**Typical entities:**
- `customers` — registered users with profile data
- `accounts` — B2B accounts (if applicable)
- `products` — catalog items
- `categories` — product groupings

**Typical events:**
- `orders` — completed purchases
- `cart_additions` — product added to cart
- `page_views` — product page visits
- `reviews_submitted` — customer reviews

**Common graph shape:**

```
customers (entity, root)
    ├── many-to-one → accounts (entity)  # if B2B
    ├── one-to-many → orders (event)
    ├── one-to-many → cart_additions (event)
    └── one-to-many → page_views (event)

accounts (entity)
    └── one-to-many → customers (entity)

products (entity)
    ├── many-to-one → categories (entity)
    └── one-to-many → orders (event, via line items)
```

**High-value segment ideas:**
- Customers who added to cart but didn't purchase (last 7 days)
- High-LTV customers by order frequency
- Customers by product category affinity
- Churned customers (no order in 90 days, previously active)
- Customers by region + tier

---

## SaaS / Subscription

**Root entity:** Users or Accounts (depending on B2C vs B2B)

**Typical entities:**
- `users` — individual product users
- `accounts` / `organizations` — paying entities (B2B)
- `workspaces` / `projects` — user-created containers
- `plans` — subscription tiers

**Typical events:**
- `feature_used` — product feature engagement
- `logins` — session starts
- `subscription_changes` — upgrades, downgrades, cancellations
- `support_tickets` — customer service interactions

**Common graph shape (B2B):**

```
accounts (entity, root)
    ├── many-to-one → plans (entity)
    ├── one-to-many → users (entity)
    ├── one-to-many → workspaces (entity)
    └── one-to-many → subscription_changes (event)

users (entity)
    ├── many-to-one → accounts (entity)
    ├── one-to-many → feature_used (event)
    └── one-to-many → logins (event)

workspaces (entity)
    ├── many-to-one → accounts (entity)
    └── one-to-many → feature_used (event)
```

**High-value segment ideas:**
- Accounts approaching usage limits (upsell candidates)
- Users who haven't logged in for 14 days (churn risk)
- Accounts with high feature adoption (case study candidates)
- Trial accounts with high engagement (conversion targets)
- Accounts by plan tier + region

---

## Healthcare / Clinics

**Root entity:** Patients or Providers (depending on use case)

**Typical entities:**
- `patients` — individuals receiving care
- `providers` — doctors, nurses, staff
- `locations` — clinics, hospitals
- `insurance_plans` — payer information

**Typical events:**
- `appointments` — scheduled visits
- `visits_completed` — actual encounters
- `prescriptions` — medication orders
- `lab_results` — test completions

**Common graph shape:**

```
patients (entity, root)
    ├── many-to-one → locations (entity, primary clinic)
    ├── one-to-many → appointments (event)
    ├── one-to-many → visits_completed (event)
    └── one-to-many → prescriptions (event)

providers (entity)
    ├── many-to-one → locations (entity)
    └── one-to-many → visits_completed (event)

locations (entity)
    ├── one-to-many → patients (entity)
    └── one-to-many → appointments (event)
```

**High-value segment ideas:**
- Patients overdue for annual checkup
- Patients by chronic condition + last visit date
- High-utilization patients (care management candidates)
- Patients by provider + location

---

## Selecting the right root entity

The root entity should be:

1. **The "who" you activate on** — who receives the marketing message, the personalization, the outreach?
2. **Stable and well-keyed** — has a reliable primary key that doesn't change.
3. **Rich with relationships** — connects to events and other entities that enable interesting segments.

If unsure, ask: "When this customer builds an audience, what are they counting? Branches? Customers? Users?" That's the root.
