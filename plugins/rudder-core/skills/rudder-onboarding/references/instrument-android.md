# Android instrumentation

The Kotlin SDK, `com.rudderstack.sdk.kotlin:android` 2.0.0 on Maven Central, for an `android_kotlin` source. Read
from rudder-sdk-kotlin `origin/main` (671ff81) on 21 Oct 2026. This skill has not built it into an app yet. Adapt
the names to the app; keep the shape.

## Dependency

In the app module's `build.gradle.kts`:

```kotlin
dependencies {
    implementation("com.rudderstack.sdk.kotlin:android:2.0.0")
}
```

With a version catalog, add `rudderstack-android = { module = "com.rudderstack.sdk.kotlin:android", version =
"2.0.0" }` to `gradle/libs.versions.toml` and write `implementation(libs.rudderstack.android)`. The SDK needs
`minSdk` 21 or higher. Its manifest declares no permissions, so the app's main manifest needs
`<uses-permission android:name="android.permission.INTERNET" />`, which most apps already have.

## Keys out of git

The values live in `.env.local` at the Gradle root, the folder that holds `settings.gradle.kts`. It is the file and
the names every other path of this skill uses, so step 8's probe reads it unchanged, and step 1 git-ignored it.
Check with `git check-ignore -q .env.local` before writing it.

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

If the main manifest already sets `android:networkSecurityConfig`, copy that file's rules into the debug file and
add `tools:replace="android:networkSecurityConfig"` to the debug `<application>`.

## Check

- `./gradlew :app:assembleDebug` passes, run from the Gradle root. The first run downloads Gradle and the
  dependencies.
- `git status` shows `.env.local` untracked and ignored.
- Commit the Gradle files, the version catalog, the manifests, `app/src/debug/` and the new sources.
