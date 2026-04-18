# Mobile App

Flutter foreman app for the thinc! April 2026 comstruct hackathon build.

## What is already here

This folder currently contains the mobile app's feature source code:

- `lib/main.dart` bootstraps the app, router, auth state, and cart state
- `lib/api_client.dart` provides a lightweight API client with token refresh
- `lib/screens/` contains the foreman flows:
  - login
  - project selection
  - catalog browsing
  - cart
  - orders
  - AI-powered smart add
- `lib/cubits/` contains auth and cart state
- `lib/theme.dart` defines the design tokens used by the app
- `pubspec.yaml` declares the Flutter dependencies

## Current gap

This started as a source-first snapshot, not a full generated Flutter app scaffold.

The Android bootstrap and standard repo metadata now exist:

- `android/`
- `.metadata`
- `.gitignore`

The following platform folders are still not present:

- `ios/`
- `web/`
- `macos/`
- `linux/`
- `windows/`

That means the folder is now much closer to a normal Flutter project, but it still needs additional platform scaffolding if you want non-Android targets.

## Recommended next step

From `apps/mobile`, run a Flutter scaffold command in a machine with Flutter installed so the remaining platform files are generated around the existing source:

```bash
flutter create --platforms=ios,web,linux,macos,windows .
```

If you want Flutter to also fully refresh Android wrapper files, run:

```bash
flutter create .
```

Then restore any overwritten source files if Flutter generates defaults that conflict with the existing implementation.

## Notes from analysis

- `lib/screens/projects_screen.dart` was cleaned up so the duplicate implementation no longer blocks analysis.
- Flutter is not installed in the current environment, so `flutter analyze` and `flutter run` could not be verified here.
