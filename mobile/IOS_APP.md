# iOS App Build

This mobile app is an Expo app and can be built as a native iOS app with EAS Build.

## Prerequisites

- Expo account logged in with `npx eas login`.
- Apple Developer account for physical device, TestFlight, or App Store builds.
- The desktop/server API must be reachable from the phone. In the app registration/settings screen, use `http://电脑IP:3001/api` or a deployed HTTPS API URL.

## Local Checks

```bash
npm install
npm exec -- expo export --platform web --output-dir ../.mobile-export-check
```

Delete `../.mobile-export-check` after the export check.

## iOS Simulator Build

```bash
npm run build:ios:simulator
```

This produces an iOS Simulator build through EAS.

## iPhone / TestFlight Build

```bash
npm run build:ios -- --profile production
```

To submit the finished build to App Store Connect:

```bash
npm run submit:ios -- --profile production
```

## App Identity

- App name: 泡沫工厂 CRM
- Bundle ID: `com.kwizakh.foamfactorycrm`
- URL scheme: `foamfactorycrm`

Camera permission is required for order completion photos and material cost entry photos.
