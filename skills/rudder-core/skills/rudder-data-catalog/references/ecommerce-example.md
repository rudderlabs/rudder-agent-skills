# E-Commerce Data Catalog Example

Complete example of custom types, properties, and events for an e-commerce application.

## Custom Types

**ProductType** - Reusable across Product Viewed, Product Added to Cart:

```yaml
# custom-types/product-type.yaml
version: "rudder/v1"
kind: "custom-type"
metadata:
  name: "custom-types"
spec:
  name: "ProductType"
  type: "object"
  description: "Consolidated product information for e-commerce events"
  config:
    properties:
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
      - property: "urn:rudder:property/product_msrp"
        required: false
```

**AddressType** - Reusable for shipping AND billing:

```yaml
# custom-types/address-type.yaml
version: "rudder/v1"
kind: "custom-type"
metadata:
  name: "custom-types"
spec:
  name: "AddressType"
  type: "object"
  description: "US mailing address"
  config:
    properties:
      - property: "urn:rudder:property/address"
        required: true
      - property: "urn:rudder:property/city"
        required: true
      - property: "urn:rudder:property/state"
        required: true
      - property: "urn:rudder:property/zipcode"
        required: true
```

## Properties

```yaml
# properties/product-properties.yaml
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "product_id"
  type: "string"
  description: "Unique product identifier"
  config:
    minLength: 3
    maxLength: 50
---
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "product_sku"
  type: "string"
  description: "Product SKU code"
  config:
    minLength: 2
    maxLength: 20
---
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "product_name"
  type: "string"
  description: "Product display name"
  config:
    minLength: 2
    maxLength: 255
---
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
      - "Footwear"
      - "Clothing"
      - "Accessories"
---
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "product_price"
  type: "number"
  description: "Current product price in USD"
  config:
    minimum: 0
    exclusiveMinimum: true
```

```yaml
# properties/address-properties.yaml
version: "rudder/v1"
kind: "property"
metadata:
  name: "properties"
spec:
  name: "zipcode"
  type: "string"
  description: "US ZIP code (5 or 9 digit)"
  config:
    pattern: "^[0-9]{5}(-[0-9]{4})?$"
```

## Events

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
    - property: "urn:rudder:property/product_count"
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
    - property: "urn:rudder:property/shipping_address"
      required: true
      customType: "urn:rudder:custom-type/address-type"
    - property: "urn:rudder:property/billing_address"
      required: true
      customType: "urn:rudder:custom-type/address-type"
    - property: "urn:rudder:property/products"
      required: true
```

## Why Custom Types Matter

**Without custom types** - 14 individual properties repeated across events:
```
Product Viewed: product_id, product_sku, product_name, product_category, product_price, product_msrp
Product Added to Cart: product_id, product_sku, product_name, product_category, product_price, product_msrp
Order Completed: shipping_address, shipping_city, shipping_state, shipping_zipcode, billing_address, billing_city, billing_state, billing_zipcode
```

**With custom types** - 2 reusable types:
```
ProductType → used by Product Viewed, Product Added to Cart
AddressType → used by shipping_address AND billing_address in Order Completed
```

Benefits:
- Single source of truth for validation rules
- Change validation in one place, applies everywhere
- Cleaner event definitions
- Better data quality through enforced structure
