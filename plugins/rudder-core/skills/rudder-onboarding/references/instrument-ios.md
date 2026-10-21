# iOS instrumentation

The Swift SDK, for an `ios_swift` source: the Swift package `https://github.com/rudderlabs/rudder-sdk-swift`,
product `RudderStackAnalytics`, 1.4.0, for iOS 15 or later. It ships as a Swift package only, with no CocoaPods pod.
It has an Objective-C API too, so the same SDK serves an app written in Objective-C. Read from rudder-sdk-swift
`origin/main` (eb66043) on 21 Oct 2026. This skill has not built it into an app yet. Adapt the names to the app; keep
the shape.

## Dependency

The SDK needs iOS 15 or later. Check the app target's `IPHONEOS_DEPLOYMENT_TARGET` in `project.pbxproj` (and
`platform :ios` in a `Podfile`). If it is lower, tell the user and ask before raising it, because the app then no
longer installs on older iOS versions. Adding the package fails until it is raised.

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

A CI or archive build has no `RudderStack.local.xcconfig`, so its values are empty and the SDK stays off. Tell the
user to create that file in the build from their secret store.

## Load the SDK once

`Analytics/RudderStack.swift`, called once at launch, from the `@main` App's `init()` or from
`application(_:didFinishLaunchingWithOptions:)`:

```swift
import Foundation
import RudderStackAnalytics

enum RudderStack {
    // Set once at launch and only read after that. `nonisolated(unsafe)` keeps Swift 6 language mode building.
    nonisolated(unsafe) private(set) static var analytics: Analytics?

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
import RudderStackAnalytics

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

## An app written in Objective-C

Swift `enum`s cannot be called from Objective-C, so write the two files in Objective-C with the SDK's Objective-C
API (`RSSConfigurationBuilder`, `RSSAnalytics`). The package, the xcconfig files and `Info.plist` stay the same.
Call `[RudderStack start];` once from `application:didFinishLaunchingWithOptions:`. Never name the method `load`:
`+load` is a method the Objective-C runtime calls on its own.

`Analytics/RudderStack.h`:

```objc
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface RudderStack : NSObject
+ (void)start;
+ (void)track:(NSString *)event properties:(NSDictionary<NSString *, id> *)properties;
@end

NS_ASSUME_NONNULL_END
```

`Analytics/RudderStack.m`:

```objc
#import "RudderStack.h"
@import RudderStackAnalytics;

static RSSAnalytics *analytics;

// A debug build reads the launch environment first, which is how step 7 points it at the local listener.
static NSString *RudderStackSetting(NSString *environmentName, NSString *plistKey) {
#if DEBUG
    NSString *value = NSProcessInfo.processInfo.environment[environmentName];
    if (value.length > 0) return value;
#endif
    id plistValue = [NSBundle.mainBundle objectForInfoDictionaryKey:plistKey];
    return [plistValue isKindOfClass:NSString.class] ? plistValue : @"";
}

@implementation RudderStack

+ (void)start {
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        NSString *writeKey = RudderStackSetting(@"RUDDERSTACK_WRITE_KEY", @"RudderStackWriteKey");
        NSString *dataPlaneUrl = RudderStackSetting(@"RUDDERSTACK_DATA_PLANE_URL", @"RudderStackDataPlaneURL");
        if (writeKey.length == 0 || dataPlaneUrl.length == 0) {
#if DEBUG
            NSLog(@"[analytics] RUDDERSTACK_WRITE_KEY or RUDDERSTACK_DATA_PLANE_URL is not set in "
                  @"RudderStack.local.xcconfig. No events are sent until they are.");
#endif
            return;
        }
        RSSConfigurationBuilder *builder = [[RSSConfigurationBuilder alloc] initWithWriteKey:writeKey
                                                                                 dataPlaneUrl:dataPlaneUrl];
        NSString *controlPlaneUrl = RudderStackSetting(@"RUDDERSTACK_CONTROL_PLANE_URL", @"RudderStackControlPlaneURL");
        if (controlPlaneUrl.length > 0) {
            [builder setControlPlaneUrl:controlPlaneUrl];
        }
        analytics = [[RSSAnalytics alloc] initWithConfiguration:[builder build]];
    });
}

+ (void)track:(NSString *)event properties:(NSDictionary<NSString *, id> *)properties {
    [analytics track:event properties:properties];
}

@end
```

`Analytics/Events.h` and `Analytics/Events.m`, one class method per agreed event:

```objc
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface Events : NSObject
+ (void)orderCompletedWithOrderId:(NSString *)orderId total:(double)total currency:(NSString *)currency
                        itemCount:(NSInteger)itemCount;
@end

NS_ASSUME_NONNULL_END
```

```objc
#import "Events.h"
#import "RudderStack.h"

@implementation Events

+ (void)orderCompletedWithOrderId:(NSString *)orderId total:(double)total currency:(NSString *)currency
                        itemCount:(NSInteger)itemCount {
    [RudderStack track:@"Order Completed" properties:@{
        @"order_id": orderId,
        @"total": @(total),
        @"currency": currency,
        @"item_count": @(itemCount),
    }];
}
// one method per agreed event

@end
```

`string` is `NSString *`, `number` is `double`, `integer` is `NSInteger`, and `boolean` is `BOOL`, boxed with `@()`.
The SDK sends a boxed `BOOL` as `true` or `false` and a boxed `NSInteger` as a whole number.

## An app with the legacy iOS SDK

The `Rudder` pod and the `rudder-sdk-ios` package are the legacy iOS (Objective-C) SDK, and its source type is
`ios`.

- **Keep it.** Install nothing. Find where the app calls `[RSClient getInstance:config:]` (`RSClient.getInstance` in
  Swift), and give its `RSConfigBuilder` this source's write key and data plane URL, and the control plane URL when
  one is set, read the way this reference reads them. Add the typed functions with the legacy SDK's own track call.
  The source keeps the type `ios`.
- **Move to the Swift SDK.** Add the Swift SDK as above; the source type is `ios_swift`. RudderStack's migration
  guide lists what changes: https://www.rudderstack.com/docs/sources/event-streams/sdks/swift-sdk/migration-guide/.
  Before removing the legacy SDK, ask the user: "Remove the legacy SDK and move its other calls to the Swift SDK now,
  or keep it beside the Swift SDK for now?" Kept, it still sends the app's other events to the source it uses today.
  Never leave both SDKs sending the same event to the new source.

## Check

- Where Xcode is installed, `xcodebuild -scheme <app scheme> -destination 'generic/platform=iOS Simulator' build`
  passes. Command Line Tools alone cannot build an app; then ask the user to build in Xcode.
- `git status` shows `RudderStack.local.xcconfig` and `.env.local` untracked and ignored.
- Commit `RudderStack.xcconfig`, `project.pbxproj`, `Package.resolved`, `Info.plist` and the new sources, the
  `.h` and `.m` files in an Objective-C app.
