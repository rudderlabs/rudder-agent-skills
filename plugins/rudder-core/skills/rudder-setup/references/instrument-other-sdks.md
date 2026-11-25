# Flutter, React Native and Unity instrumentation

This skill has no worked example for these SDKs yet. Follow each SDK's own documentation and keep the shape of the
Android and iOS references: one module that loads the SDK once, one typed function per agreed event, the write key
in a git-ignored file the build reads, and a development-time error when it is missing. Add the write key and data
plane URL to `.env.local` too, as `RUDDERSTACK_WRITE_KEY` and `RUDDERSTACK_DATA_PLANE_URL`, because step 8's probe
reads them there.

## Flutter

`rudder_sdk_flutter` 3.4.0. Load it with `RudderController.instance.initialize(writeKey, config: builder.build())`,
where a `RudderConfigBuilder` sets `withDataPlaneUrl`, and `withControlPlaneUrl` for step 7.

## React Native

`@rudderstack/rudder-sdk-react-native` 3.2.1. Load it with
`await rudderClient.setup(writeKey, { dataPlaneUrl, controlPlaneUrl })`, and run `pod install` in `ios/`.

In an Expo app (`expo` in `dependencies`), install it with `npx expo install @rudderstack/rudder-sdk-react-native`
instead. Its native module is missing from Expo Go, where the SDK throws when it loads, so run a development build,
`npx expo run:android` or `npx expo run:ios`, which also runs `pod install`. That command generates `android/` or
`ios/` when the app has none; ask before running it.

## Unity

Follow RudderStack's Unity SDK documentation.
