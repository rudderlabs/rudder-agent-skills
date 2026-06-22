# Common Event Patterns

Reference patterns for event taxonomy design.

## E-Commerce Funnel

```
Product Viewed → Product Added to Cart → Checkout Started → Order Completed
```

```yaml
events:
  - Product Viewed          # Discovery
  - Product Added to Cart   # Intent
  - Product Removed from Cart
  - Checkout Started        # Commitment
  - Payment Info Entered
  - Order Completed         # Conversion
  - Order Refunded          # Post-purchase
```

## User Lifecycle

```
Signed Up → Email Verified → Profile Completed → Subscribed → Churned
```

```yaml
events:
  - Signed Up               # Acquisition
  - Email Verified
  - Logged In
  - Profile Updated
  - Password Changed
  - Subscription Started    # Monetization
  - Subscription Cancelled
  - Account Deleted         # Churn
```

## Feature Engagement

```yaml
events:
  - Feature Used            # Generic with feature_name property
  - Search Performed
  - Filter Applied
  - Export Requested
  - Share Clicked
```

## Error Tracking

```yaml
events:
  - Error Occurred          # Generic with error_code, error_message
  - Checkout Failed
  - Payment Declined
  - Validation Failed
```

## Anti-Patterns to Avoid

### Too Granular

**Bad:**
```yaml
- Button Clicked
- Link Clicked
- Image Clicked
- Input Focused
- Input Blurred
```

**Good:**
```yaml
- Feature Used              # With feature_name property
- CTA Clicked               # With cta_name, cta_location
```

### Inconsistent Naming

**Bad:**
```yaml
- productView               # camelCase
- Product Viewed            # Title Case
- product_viewed            # snake_case
- PRODUCT_VIEWED            # SCREAMING
```

**Good:**
```yaml
- Product Viewed            # Consistent Title Case
- Order Completed
- Feature Used
```

### Missing Context

**Bad:**
```yaml
# Can't determine source or session
- Product Viewed
    properties:
      - product_id
```

**Good:**
```yaml
# Can attribute and analyze
- Product Viewed
    properties:
      - product_id
      - page_url
      - referrer_url
      - session_id
      - user_id
```

### Property Explosion

**Bad:**
```yaml
# 14 separate properties
- shipping_street
- shipping_city
- shipping_state
- shipping_zip
- billing_street
- billing_city
- billing_state
- billing_zip
```

**Good:**
```yaml
# 2 custom types
- AddressType (street, city, state, zip)
- shipping_address: AddressType
- billing_address: AddressType
```
