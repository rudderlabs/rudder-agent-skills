# E-Commerce Tracking Plans Example

Complete example showing how different applications use the same event catalog with different tracking plan configurations.

## Scenario

An e-commerce company has:
- **Web App** - Full shopping experience
- **Mobile App** - Simplified checkout flow
- **Kiosk** - In-store product lookup only

Each needs different tracking rules from the same event catalog.

## Shared Events (Data Catalog)

```yaml
# events/ecommerce.yaml
version: "rudder/v1"
kind: "event"
metadata:
  name: "events"
spec:
  name: "Product Viewed"
  description: "User viewed a product detail page"
  category: "urn:rudder:category/ecommerce"
  rules:
    - property: "urn:rudder:property/product"
      required: true
      customType: "urn:rudder:custom-type/product-type"
    - property: "urn:rudder:property/page_url"
    - property: "urn:rudder:property/referrer_url"
    - property: "urn:rudder:property/session_id"
    - property: "urn:rudder:property/device_id"
---
version: "rudder/v1"
kind: "event"
metadata:
  name: "events"
spec:
  name: "Product Added to Cart"
  description: "User added a product to their cart"
  category: "urn:rudder:category/ecommerce"
  rules:
    - property: "urn:rudder:property/product"
      required: true
      customType: "urn:rudder:custom-type/product-type"
    - property: "urn:rudder:property/quantity"
      required: true
    - property: "urn:rudder:property/cart_total"
    - property: "urn:rudder:property/session_id"
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
    - property: "urn:rudder:property/customer_email"
      required: true
    - property: "urn:rudder:property/products"
      required: true
    - property: "urn:rudder:property/shipping_address"
      customType: "urn:rudder:custom-type/address-type"
    - property: "urn:rudder:property/billing_address"
      customType: "urn:rudder:custom-type/address-type"
```

## Web App Tracking Plan

Full e-commerce funnel with attribution tracking:

```yaml
# tracking-plans/web-app.yaml
version: "rudder/v1"
kind: "tracking-plan"
metadata:
  name: "tracking-plans"
spec:
  name: "Web App Tracking Plan"
  description: "Full e-commerce experience for web browsers"
  events:
    - event: "urn:rudder:event/product-viewed"
      rules:
        # Require page context for web attribution
        - property: "urn:rudder:property/page_url"
          required: true
        - property: "urn:rudder:property/referrer_url"
          required: true
    - event: "urn:rudder:event/product-added-to-cart"
    - event: "urn:rudder:event/order-completed"
      rules:
        # Require both addresses for web orders
        - property: "urn:rudder:property/shipping_address"
          required: true
        - property: "urn:rudder:property/billing_address"
          required: true
```

## Mobile App Tracking Plan

Mobile-specific requirements:

```yaml
# tracking-plans/mobile-app.yaml
version: "rudder/v1"
kind: "tracking-plan"
metadata:
  name: "tracking-plans"
spec:
  name: "Mobile App Tracking Plan"
  description: "iOS and Android shopping apps"
  events:
    - event: "urn:rudder:event/product-viewed"
      rules:
        # Require device_id for mobile attribution (not page_url)
        - property: "urn:rudder:property/device_id"
          required: true
    - event: "urn:rudder:event/product-added-to-cart"
      rules:
        - property: "urn:rudder:property/device_id"
          required: true
    - event: "urn:rudder:event/order-completed"
      rules:
        # Mobile uses saved addresses, only shipping required
        - property: "urn:rudder:property/shipping_address"
          required: true
        - property: "urn:rudder:property/device_id"
          required: true
```

## Kiosk Tracking Plan

Limited event set for in-store kiosks:

```yaml
# tracking-plans/kiosk.yaml
version: "rudder/v1"
kind: "tracking-plan"
metadata:
  name: "tracking-plans"
spec:
  name: "Kiosk Tracking Plan"
  description: "In-store product lookup kiosks"
  events:
    # Only Product Viewed - no cart or checkout
    - event: "urn:rudder:event/product-viewed"
      rules:
        - property: "urn:rudder:property/kiosk_id"
          required: true
        - property: "urn:rudder:property/store_id"
          required: true
```

## Environment-Specific Plans

```yaml
# tracking-plans/web-app-production.yaml
spec:
  name: "Web App - Production"
  governance:
    unplannedEvents: block      # Strict in production
    violatingEvents: block

# tracking-plans/web-app-development.yaml
spec:
  name: "Web App - Development"
  governance:
    unplannedEvents: log        # Lenient in development
    violatingEvents: forward
```

## Gradual Rollout Pattern

Start permissive, tighten over time:

```yaml
# Phase 1: Log only
governance:
  unplannedEvents: log
  violatingEvents: log

# Phase 2: Forward violations
governance:
  unplannedEvents: forward
  violatingEvents: forward

# Phase 3: Block violations
governance:
  unplannedEvents: block
  violatingEvents: block
```
