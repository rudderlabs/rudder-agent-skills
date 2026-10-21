# iOS instrumentation

The Swift SDK, for an `ios_swift` source: the Swift package `https://github.com/rudderlabs/rudder-sdk-swift`,
product `RudderStackAnalytics`, 1.4.0, for iOS 15 or later. It ships as a Swift package only, with no CocoaPods pod.
Read from rudder-sdk-swift `origin/main` (eb66043) on 21 Oct 2026. This skill has not built it into an app yet. Adapt
the names to the app; keep the shape.

## Dependency

In an Xcode app, add the package and link `RudderStackAnalytics` to the app target: File, Add Package Dependencies,
the URL above, Up to Next Major Version from 1.4.0. That changes `project.pbxproj` and `Package.resolved`. If you
cannot drive Xcode, ask the user to do this one step and say continue.

In a `Package.swift`:

```swift
dependencies: [
    .package(url: "https://github.com/rudderlabs/rudder-sdk-swift.git", .upToNextMajor(from: "1.4.0")),
],
targets: [
    .target(name: "Shop", dependencies: [.product(name: "RudderStackAnalytics", package: "rudder-sdk-swift")]),
]
```

## Keys out of git

An xcconfig file holds the values, and `Info.plist` passes them to the app.

`RudderStack.xcconfig`, committed. Its empty values keep a fresh clone building:

```text
RUDDERSTACK_WRITE_KEY =
RUDDERSTACK_DATA_PLANE_URL =
RUDDERSTACK_CONTROL_PLANE_URL =
#include? "RudderStack.local.xcconfig"
```

`RudderStack.local.xcconfig`, git-ignored, with the real values. Step 6 checks that git ignores it before writing
it. `//` starts a comment in an xcconfig file, so write each URL with `$()` between the two slashes:

```text
RUDDERSTACK_WRITE_KEY = <write key from MCP list_sources>
RUDDERSTACK_DATA_PLANE_URL = https:/$()/<data plane host>
```

Then:

- Set `RudderStack.xcconfig` as the app target's configuration file for Debug and Release (the project's Info tab,
  Configurations). If the target already has one, add `#include "RudderStack.xcconfig"` to it. When CocoaPods
  generated that file, ask the user where their own build settings live instead.
- Add three String keys to the target's `Info.plist`: `RudderStackWriteKey` set to `$(RUDDERSTACK_WRITE_KEY)`,
  `RudderStackDataPlaneURL` set to `$(RUDDERSTACK_DATA_PLANE_URL)` and `RudderStackControlPlaneURL` set to
  `$(RUDDERSTACK_CONTROL_PLANE_URL)`. A target without an `Info.plist` file takes them in its Info tab, Custom iOS
  Target Properties.
- Add `NSAppTransportSecurity` with `NSAllowsLocalNetworking` set to YES, so a debug build can send plain HTTP to
  step 7's listener on the Mac's loopback. It does not allow plain HTTP to public hosts.
- Write the write key and data plane URL to `.env.local` too, as `RUDDERSTACK_WRITE_KEY` and
  `RUDDERSTACK_DATA_PLANE_URL`, with plain URLs. Step 8's probe reads them there.

## Load the SDK once

`Analytics/RudderStack.swift`, called once at launch, from the `@main` App's `init()` or from
`application(_:didFinishLaunchingWithOptions:)`:

```swift
import Foundation
import RudderStackAnalytics

enum RudderStack {
    private(set) static var analytics: Analytics?

    static func load() {
        guard analytics == nil else { return }
        let writeKey = setting("RUDDERSTACK_WRITE_KEY", "RudderStackWriteKey")
        let dataPlaneUrl = setting("RUDDERSTACK_DATA_PLANE_URL", "RudderStackDataPlaneURL")
        guard !writeKey.isEmpty, !dataPlaneUrl.isEmpty else {
            #if DEBUG
            print("[analytics] RUDDERSTACK_WRITE_KEY or RUDDERSTACK_DATA_PLANE_URL is not set in RudderStack.local.xcconfig. "
                + "No events are sent until they are.")
            #endif
            return
        }
        let controlPlaneUrl = setting("RUDDERSTACK_CONTROL_PLANE_URL", "RudderStackControlPlaneURL")
        let config = controlPlaneUrl.isEmpty
            ? Configuration(writeKey: writeKey, dataPlaneUrl: dataPlaneUrl)
            : Configuration(writeKey: writeKey, dataPlaneUrl: dataPlaneUrl, controlPlaneUrl: controlPlaneUrl)
        analytics = Analytics(configuration: config)
    }

    // A debug build reads the launch environment first, which is how step 7 points it at the local listener.
    private static func setting(_ environmentName: String, _ plistKey: String) -> String {
        #if DEBUG
        if let value = ProcessInfo.processInfo.environment[environmentName], !value.isEmpty { return value }
        #endif
        return (Bundle.main.object(forInfoDictionaryKey: plistKey) as? String) ?? ""
    }
}
```

## One typed function per event

`Analytics/Events.swift`:

```swift
enum Events {
    static func orderCompleted(orderId: String, total: Double, currency: String, itemCount: Int) {
        RudderStack.analytics?.track(name: "Order Completed", properties: [
            "order_id": orderId,
            "total": total,
            "currency": currency,
            "item_count": itemCount,
        ])
    }
    // one function per agreed event
}
```

Types follow `rudder/plan.events.json`: `string` is `String`, `number` is `Double`, `integer` is `Int`, and `boolean`
is `Bool`. Call the functions where the moment happens (the button action, the view's `onAppear`, the success
callback), with values the code already has.

## Check

- Where Xcode is installed, `xcodebuild -scheme <app scheme> -destination 'generic/platform=iOS Simulator' build`
  passes. Command Line Tools alone cannot build an app; then ask the user to build in Xcode.
- `git status` shows `RudderStack.local.xcconfig` and `.env.local` untracked and ignored.
- Commit `RudderStack.xcconfig`, `project.pbxproj`, `Package.resolved`, `Info.plist` and the new sources.
