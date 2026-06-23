# Real-World Code-First Instrumentation Examples

These examples demonstrate the full code-first instrumentation workflow applied to common scenarios.

## Example 1: E-Commerce Store Instrumentation

### Starting Point: Existing Code Types

```typescript
// src/types/product.ts
export enum ProductCategory {
  FOOTWEAR = 'footwear',
  CLOTHING = 'clothing',
  ACCESSORIES = 'accessories',
  ELECTRONICS = 'electronics',
}

export enum Currency {
  USD = 'usd',
  EUR = 'eur',
  GBP = 'gbp',
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  price: number;
  currency: Currency;
  inStock: boolean;
}
```

### Step 1: Map to Properties

```yaml
# properties/product-properties.yaml
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "product_category"
  type: "string"
  description: "Product category"
  config:
    enum:
      - "footwear"
      - "clothing"
      - "accessories"
      - "electronics"
---
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "currency"
  type: "string"
  description: "Currency code"
  config:
    enum:
      - "usd"
      - "eur"
      - "gbp"
```

### Step 2: Identify Events from Code

```typescript
// Found in src/services/cartService.ts
async function addToCart(product: Product, quantity: number): Promise<Cart> {
  // ... add to cart logic
}

async function removeFromCart(productId: string): Promise<Cart> {
  // ... remove logic
}

// Found in src/services/checkoutService.ts
async function completeCheckout(cart: Cart, payment: PaymentMethod): Promise<Order> {
  // ... checkout logic
}
```

Events to track:
- Product Added to Cart
- Product Removed from Cart
- Order Completed

### Step 3: Build Events

```yaml
# events/ecommerce.yaml
version: "rudder/v1"
kind: "event"
metadata:
  name: "events"
spec:
  name: "Product Added to Cart"
  description: "User added a product to their cart"
  category: "urn:rudder:category/ecommerce"
  rules:
    - property: "urn:rudder:property/product_id"
      required: true
    - property: "urn:rudder:property/product_sku"
      required: true
    - property: "urn:rudder:property/product_name"
      required: true
    - property: "urn:rudder:property/product_category"
      required: true
    - property: "urn:rudder:property/product_price"
      required: true
    - property: "urn:rudder:property/currency"
      required: true
    - property: "urn:rudder:property/quantity"
      required: true
---
version: "rudder/v1"
kind: "event"
metadata:
  name: "events"
spec:
  name: "Order Completed"
  description: "Customer completed a purchase"
  category: "urn:rudder:category/ecommerce"
  rules:
    - property: "urn:rudder:property/order_id"
      required: true
    - property: "urn:rudder:property/order_total"
      required: true
    - property: "urn:rudder:property/currency"
      required: true
    - property: "urn:rudder:property/products"
      required: true
```

### Step 4: Instrument with Type Safety

```typescript
import { Product, ProductCategory, Currency } from './types/product';

function trackProductAddedToCart(product: Product, quantity: number) {
  analytics.track('Product Added to Cart', {
    product_id: product.id,
    product_sku: product.sku,
    product_name: product.name,
    product_category: product.category,  // TypeScript ensures valid ProductCategory
    product_price: product.price,
    currency: product.currency,           // TypeScript ensures valid Currency
    quantity: quantity,
  });
}
```

---

## Example 2: Subscription Billing

### Code Types

```typescript
// src/types/subscription.ts
export enum BillingCycle {
  MONTHLY = 'monthly',
  QUARTERLY = 'quarterly',
  ANNUAL = 'annual',
}

export enum SubscriptionStatus {
  TRIAL = 'trial',
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
}

export interface Subscription {
  id: string;
  planName: string;
  cycle: BillingCycle;
  status: SubscriptionStatus;
  startDate: string;
  nextBillingDate: string;
}
```

### Derived Tracking Plan

```yaml
# properties/subscription-properties.yaml
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "billing_cycle"
  type: "string"
  description: "Subscription billing frequency"
  config:
    enum:
      - "monthly"
      - "quarterly"
      - "annual"
---
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "subscription_status"
  type: "string"
  description: "Current subscription status"
  config:
    enum:
      - "trial"
      - "active"
      - "past_due"
      - "canceled"
```

### Instrumentation

```typescript
function trackSubscriptionCreated(subscription: Subscription) {
  analytics.track('Subscription Created', {
    subscription_id: subscription.id,
    plan_name: subscription.planName,
    billing_cycle: subscription.cycle,           // Valid BillingCycle value
    subscription_status: subscription.status,    // Valid SubscriptionStatus value
    start_date: subscription.startDate,
  });
}
```
