# Platform reference

Everything below was produced by `rudder-cli 0.24.0` from the tracking plan in
`examples/instrumentation-e2e/catalog/`, so the shapes are what the generator
actually emits rather than an illustration of them.

## Options

`rudder-cli typer options --platform <p>` prints the live table. As of 0.24.0:

| Platform | Option | Default |
| --- | --- | --- |
| all | `outputFileName` | `RudderTyper.ts` / `Main.kt` / `RudderTyper.swift` |
| kotlin | `packageName` | `com.rudderstack.ruddertyper` |
| kotlin | `composeImmutable` | `false` — adds `@androidx.compose.runtime.Immutable` to generated data classes so Compose treats them as stable. Requires `androidx.compose.runtime` on the consuming module's classpath. |

There is no option to filter events, prefix or suffix method names, or change the
package on TypeScript/Swift. If you need a subset of events, that is a tracking plan
concern, not a generation concern.

## What is the same everywhere

- Track methods are `track`-prefixed; `identify` / `group` / `page` / `screen` are not.
- Custom types become a shared named enum/union; a property-level `enum` becomes a
  type scoped to that property (`PropertyPaymentMethod`).
- Plan-optional properties become optional fields.
- Every call is stamped with a `ruddertyper` context block — `platform`,
  `rudderCLIVersion`, `trackingPlanId`, `trackingPlanVersion` — merged into whatever
  options the caller passed. This is how typed traffic is identified downstream, and
  it is why the generated file changes when you change CLI version.

## The one thing that is not the same: construction

**TypeScript takes a resolver. Kotlin and Swift take an instance.**

```ts
// TypeScript — resolver-only since 0.22.0, re-invoked per call
export const storefront = new RudderTyper(() => window.rudderanalytics);
```
```kotlin
// Kotlin — captured once
val storefront = RudderAnalytics(analytics)
```
```swift
// Swift — captured once
let storefront = RudderTyperAnalytics(analytics: analytics)
```

This asymmetry is deliberate, not an oversight. The hazard the resolver exists for is
browser-specific: the JS snippet installs a buffering preloader on
`window.rudderanalytics` and swaps in the real SDK asynchronously, so anything holding
the instance from before the swap is holding a dead queue. Mobile apps construct the
SDK themselves and hand it over, so there is nothing to re-resolve.

Do not "fix" the mobile clients to take a lambda, and do not carry a TypeScript
resolver pattern into Kotlin or Swift.

## TypeScript

```ts
import type { RudderAnalytics } from "@rudderstack/analytics-js";

export type CustomTypeCurrencyType = "usd" | "eur" | "gbp";
export type PropertyPaymentMethod = "card" | "paypal" | "apple_pay";

export interface CheckoutStarted {
  cartId: string;
  cartTotal: number;
  couponCode?: string;
  currency: CustomTypeCurrencyType;
  itemCount: number;
}

export class RudderTyper {
  constructor(resolveAnalytics: () => RudderAnalytics);
  public identify(userId: string, traits?: IdentifyTraits, options?, callback?): void;
  public trackCheckoutStarted(props: CheckoutStarted, options?, callback?): void;
}
```

- Payload interfaces are named after the event (`CheckoutStarted`).
- Wiring: the client is a plain class; export one instance from one module. Re-export
  the payload types under a separate name — a value and a type namespace cannot share
  one:
  ```ts
  export { storefront } from './client';
  export type * as storefrontTypes from './generated';
  ```
- `identify` is overloaded — `(userId, traits?)` or `(traits?)`.
- SDK: [`@rudderstack/analytics-js`](https://github.com/rudderlabs/rudder-sdk-js).

## Kotlin

```kotlin
package com.example.storefront.analytics

import com.rudderstack.sdk.kotlin.core.Analytics
import com.rudderstack.sdk.kotlin.core.internals.models.RudderOption

enum class CustomTypeCurrencyType { USD, EUR, GBP }

data class TrackCheckoutStartedProperties(
    val cartId: String,
    val cartTotal: Double,
    val currency: CustomTypeCurrencyType,
    val itemCount: Long,
    val couponCode: String? = null,
)

class RudderAnalytics(private val analytics: Analytics) {
    fun trackCheckoutStarted(
        properties: TrackCheckoutStartedProperties,
        options: RudderOption? = null,
    )
}
```

- Payload classes are named `Track<Event>Properties`, not after the event alone.
- Integers become `Long`, numbers become `Double`.
- Serialization goes through `kotlinx.serialization`; the file emits its own private
  `rudderSerialize()` extensions, so the consuming module needs
  `org.jetbrains.kotlinx:kotlinx-serialization-json` on the classpath.
- **Name collision to watch:** the generated class is called `RudderAnalytics`, while
  the SDK type it wraps is `Analytics`. In a file that imports both, alias the import
  or fully qualify. Set `packageName` to something app-specific so this stays local.
- SDK: [`rudder-sdk-kotlin`](https://github.com/rudderlabs/rudder-sdk-kotlin).

## Swift

```swift
public enum CustomTypeCurrencyType: String, CaseIterable {
    case usd = "usd"
}

public struct TrackCheckoutStartedProperties {
    public init(cartId: String, cartTotal: Double, currency: CustomTypeCurrencyType,
                itemCount: Int, couponCode: String? = nil)
}

public class RudderTyperAnalytics {
    public init(analytics: Analytics)
    public func trackCheckoutStarted(properties: TrackCheckoutStartedProperties,
                                     options: RudderOption? = nil)
}
```

- The class is `RudderTyperAnalytics` — different from both the TypeScript
  (`RudderTyper`) and Kotlin (`RudderAnalytics`) names. Do not assume one name across
  platforms in shared docs or scripts.
- Enums are `String`-raw-valued and `CaseIterable`.
- Structs get a memberwise `public init` with optionals defaulted to `nil`.
- SDK: [`rudder-sdk-swift`](https://github.com/rudderlabs/rudder-sdk-swift).

## Generating for several platforms from one plan

One plan, one command per platform, different output directories:

```bash
export RUDDERSTACK_CLI_EXPERIMENTAL=true RUDDERSTACK_X_LOCAL_TYPER=true
for p in typescript kotlin swift; do
  rudder-cli typer generate --local --location ../catalog \
    --tracking-plan-id storefront --platform "$p" --output "clients/$p"
done
```

Regenerate every consumer from the same catalog commit, and record that commit beside
each generated client. A plan change that lands in one platform's client and not
another's is the mobile/web version of the drift problem — same cause, same fix.
