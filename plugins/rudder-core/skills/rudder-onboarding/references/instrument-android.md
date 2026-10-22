# Android instrumentation

The Kotlin SDK, `com.rudderstack.sdk.kotlin:android` 2.0.0 on Maven Central, for an `android_kotlin` source. It has
a Java API too, so the same SDK serves an app written in Java. Read from rudder-sdk-kotlin `origin/main` (671ff81) on
21 Oct 2026. This skill has not built it into an app yet. Adapt the names to the app; keep the shape. `app` below is
the application module; a Kotlin Multiplatform app usually calls it `composeApp`.

## Requirements

Check these in the Gradle files and the version catalog before adding the SDK:

- `compileSdk` 35 or higher, and the Android Gradle plugin 8.6 or later. The SDK depends on androidx.core 1.16.0,
  and the build's AAR metadata check fails when either is lower.
- `minSdk` 21 or higher.
- In an app written in Kotlin, the Kotlin Gradle plugin 2.0 or later. The SDK is built with Kotlin 2.1.21, and Kotlin
  1.9 and earlier cannot read its classes. An app written in Java needs no Kotlin plugin.

If any is lower, tell the user which one and ask before upgrading it. Raising the Android Gradle plugin or Kotlin can
change the whole build, so the user may prefer to do it on their own first; then wait for continue and check again.
If the user declines, add nothing: set `sender` to `curl`, so step 6 changes no code and step 8 sends the first
planned event with curl.

## Dependency

In the app module's `build.gradle.kts`:

```kotlin
dependencies {
    implementation("com.rudderstack.sdk.kotlin:android:2.0.0")
}
```

With a version catalog, add `rudderstack-android = { module = "com.rudderstack.sdk.kotlin:android", version =
"2.0.0" }` to `gradle/libs.versions.toml` and write `implementation(libs.rudderstack.android)`. The SDK's manifest
declares no permissions, so the app's main manifest needs
`<uses-permission android:name="android.permission.INTERNET" />`, which most apps already have.

## Keys out of git

The values live in `.env.local` at the Gradle root, the folder that holds `settings.gradle.kts`. It is the file and
the names every other path of this skill uses, so step 8's probe reads it unchanged, and step 1 git-ignored it.
Check with `git check-ignore -q .env.local` before writing it. Add these lines, or update them, and keep the file's
other lines.

```text
RUDDERSTACK_WRITE_KEY=<write key from MCP list_sources>
RUDDERSTACK_DATA_PLANE_URL=<dataPlaneURL from rudder-cli workspace info --json>
```

Add `RUDDERSTACK_CONTROL_PLANE_URL` only when the control plane is not RudderStack cloud.

The app module's `build.gradle.kts` reads the file into `BuildConfig`. A Gradle property of the same name wins over
the file, which is how step 7 points a debug build at the local listener without editing `.env.local`:

```kotlin
import java.util.Properties

val rudderstackEnv = Properties().apply {
    rootProject.file(".env.local").takeIf { it.isFile }?.reader()?.use { load(it) }
}

fun rudderstack(name: String): String =
    "\"" + (providers.gradleProperty(name).orNull ?: rudderstackEnv.getProperty(name, "")) + "\""

android {
    defaultConfig {
        buildConfigField("String", "RUDDERSTACK_WRITE_KEY", rudderstack("RUDDERSTACK_WRITE_KEY"))
        buildConfigField("String", "RUDDERSTACK_DATA_PLANE_URL", rudderstack("RUDDERSTACK_DATA_PLANE_URL"))
        buildConfigField("String", "RUDDERSTACK_CONTROL_PLANE_URL", rudderstack("RUDDERSTACK_CONTROL_PLANE_URL"))
    }
    buildFeatures { buildConfig = true }
}
```

Merge these lines into the existing `android` block; never add a second one. In a Groovy `build.gradle`, write the
same with `def`.

A release build or a CI build has no `.env.local`, so its `BuildConfig` values are empty and the SDK stays off.
Tell the user to pass the values there as Gradle properties (`-PRUDDERSTACK_WRITE_KEY=...`) from their secret
store.

## Load the SDK once

`analytics/RudderStack.kt` in the app's package, called from `Application.onCreate`. If the app has no
`Application` subclass, add one and name it in the manifest's `<application android:name=...>`.

```kotlin
package com.example.shop.analytics

import android.app.Application
import android.util.Log
import com.example.shop.BuildConfig
import com.rudderstack.sdk.kotlin.android.Analytics
import com.rudderstack.sdk.kotlin.android.Configuration
import kotlinx.serialization.json.JsonObject

object RudderStack {
    @Volatile private var analytics: Analytics? = null

    fun load(application: Application) {
        if (analytics != null) return
        val writeKey = BuildConfig.RUDDERSTACK_WRITE_KEY
        val dataPlaneUrl = BuildConfig.RUDDERSTACK_DATA_PLANE_URL
        if (writeKey.isEmpty() || dataPlaneUrl.isEmpty()) {
            if (BuildConfig.DEBUG) {
                Log.e("analytics", "RUDDERSTACK_WRITE_KEY or RUDDERSTACK_DATA_PLANE_URL is not set in .env.local. " +
                    "No events are sent until they are.")
            }
            return
        }
        val controlPlaneUrl = BuildConfig.RUDDERSTACK_CONTROL_PLANE_URL
        analytics = Analytics(
            configuration = if (controlPlaneUrl.isEmpty()) {
                Configuration(writeKey = writeKey, application = application, dataPlaneUrl = dataPlaneUrl)
            } else {
                Configuration(writeKey = writeKey, application = application, dataPlaneUrl = dataPlaneUrl,
                    controlPlaneUrl = controlPlaneUrl)
            },
        )
    }

    internal fun track(event: String, properties: JsonObject) {
        try {
            analytics?.track(event, properties)
        } catch (e: Exception) {
            Log.w("analytics", "$event was not sent", e)
        }
    }
}
```

## One typed function per event

`analytics/Events.kt`. The SDK exposes `kotlinx.serialization.json`, so `buildJsonObject` needs no other dependency.

```kotlin
package com.example.shop.analytics

import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

object Events {
    fun orderCompleted(orderId: String, total: Double, currency: String, itemCount: Int) =
        RudderStack.track("Order Completed", buildJsonObject {
            put("order_id", orderId)
            put("total", total)
            put("currency", currency)
            put("item_count", itemCount)
        })
    // one function per agreed event
}
```

Types follow `rudder/plan.events.json`: `string` is `String`, `number` is `Double`, `integer` is `Int` or `Long`, and
`boolean` is `Boolean`. Call the functions where the moment happens (the click handler, the screen, the success
callback), with values the code already has.

## An app written in Java

When the app module applies no Kotlin plugin (`org.jetbrains.kotlin.android` or `kotlin-android`), `.kt` files do
not compile there. Write the two files in Java with the SDK's Java API, `javacompat`. The dependency, the
`BuildConfig` fields and the debug network config stay the same.

`analytics/RudderStack.java`, called from `Application.onCreate`:

```java
package com.example.shop.analytics;

import android.app.Application;
import android.util.Log;
import com.example.shop.BuildConfig;
import com.rudderstack.sdk.kotlin.android.javacompat.ConfigurationBuilder;
import com.rudderstack.sdk.kotlin.android.javacompat.JavaAnalytics;
import java.util.Map;

public final class RudderStack {
    private static volatile JavaAnalytics analytics;

    private RudderStack() {}

    public static synchronized void load(Application application) {
        if (analytics != null) return;
        String writeKey = BuildConfig.RUDDERSTACK_WRITE_KEY;
        String dataPlaneUrl = BuildConfig.RUDDERSTACK_DATA_PLANE_URL;
        if (writeKey.isEmpty() || dataPlaneUrl.isEmpty()) {
            if (BuildConfig.DEBUG) {
                Log.e("analytics", "RUDDERSTACK_WRITE_KEY or RUDDERSTACK_DATA_PLANE_URL is not set in .env.local. "
                        + "No events are sent until they are.");
            }
            return;
        }
        ConfigurationBuilder builder = new ConfigurationBuilder(application, writeKey, dataPlaneUrl);
        String controlPlaneUrl = BuildConfig.RUDDERSTACK_CONTROL_PLANE_URL;
        if (!controlPlaneUrl.isEmpty()) {
            builder.setControlPlaneUrl(controlPlaneUrl);
        }
        analytics = new JavaAnalytics(builder.build());
    }

    static void track(String event, Map<String, Object> properties) {
        JavaAnalytics client = analytics;
        if (client == null) return;
        try {
            client.track(event, properties);
        } catch (RuntimeException e) {
            Log.w("analytics", event + " was not sent", e);
        }
    }
}
```

`analytics/Events.java`:

```java
package com.example.shop.analytics;

import java.util.LinkedHashMap;
import java.util.Map;

public final class Events {
    private Events() {}

    public static void orderCompleted(String orderId, double total, String currency, int itemCount) {
        Map<String, Object> properties = new LinkedHashMap<>();
        properties.put("order_id", orderId);
        properties.put("total", total);
        properties.put("currency", currency);
        properties.put("item_count", itemCount);
        RudderStack.track("Order Completed", properties);
    }
    // one method per agreed event
}
```

`string` is `String`, `number` is `double`, `integer` is `int` or `long`, and `boolean` is `boolean`.

## An app with the legacy Android SDK

`com.rudderstack.android.sdk` is the legacy Android (Java) SDK, and its source type is `android`.

- **Keep it.** Install nothing. Find where the app calls `RudderClient.getInstance`, and give it this source's write key
  and data plane URL, and the control plane URL when one is set, from the `BuildConfig` fields above. Add the typed
  functions with the legacy SDK's own track call. The source keeps the type `android`.
- **Move to the Kotlin SDK.** Add the Kotlin SDK as above; the source type is `android_kotlin`. RudderStack's
  migration guide lists what changes:
  https://www.rudderstack.com/docs/sources/event-streams/sdks/kotlin-sdk/migration-guide/. Before removing the
  legacy SDK, ask the user: "Remove the legacy SDK and move its other calls to the Kotlin SDK now, or keep it beside
  the Kotlin SDK for now?" Kept, it still sends the app's other events to the source it uses today. Never leave both
  SDKs sending the same event to the new source.

## Plain HTTP to the emulator's host, in debug only

Step 7's listener is `http://10.0.2.2:<port>` from the emulator, and Android refuses plain HTTP unless the network
security config allows the host. Allow that one host in the debug build, with two files under `app/src/debug/`.

`app/src/debug/res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config cleartextTrafficPermitted="true">
        <domain includeSubdomains="false">10.0.2.2</domain>
    </domain-config>
</network-security-config>
```

`app/src/debug/AndroidManifest.xml`:

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:networkSecurityConfig="@xml/network_security_config" />
</manifest>
```

If a manifest the debug build uses already sets `android:usesCleartextTraffic="true"`, add neither file. Plain HTTP
to `10.0.2.2` is allowed already, and Android 7.0 and later ignore that attribute once a network security config is
present, so the config would block plain HTTP to every other host in the debug build.

If `app/src/debug/AndroidManifest.xml` already exists, add the attribute to its `<application>` instead of
replacing the file. If the main manifest already sets `android:networkSecurityConfig`, copy that file's rules into
the debug file, add `xmlns:tools="http://schemas.android.com/tools"` to the debug `<manifest>`, and add
`tools:replace="android:networkSecurityConfig"` to the debug `<application>`.

## Check

- `./gradlew :app:assembleDebug` passes, run from the Gradle root, with the application module's name in place of
  `app`. The first run downloads Gradle and the dependencies.
- `git status` shows `.env.local` untracked and ignored.
- Commit the Gradle files, the version catalog, the manifests, `app/src/debug/` and the new sources.
