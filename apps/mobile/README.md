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

## Running Gemma locally on the phone

Current status in this repo:

- the app now has a native Android bridge for local Gemma inference
- the Flutter client calls that bridge through [lib/local_llm.dart](lib/local_llm.dart)
- the remaining requirement is a real Gemma task model file on the device
- [assets/models](assets/models) still only contains a placeholder, so you must provide the model file yourself

That means the app is now ready for real on-device inference as soon as the model file is deployed to the phone.

### What you need to do

1. Put a real task model file into the app assets
   - download a MediaPipe-compatible Gemma task model
   - use the file name already referenced by the app: gemma-3-1b-it-int4.task
   - place it under the assets/models folder

2. Push the model onto the phone
   - use the helper at [scripts/push-phone-model.ps1](../scripts/push-phone-model.ps1)
   - it copies the model to the device path used by the Android bridge

3. Build and install to the device
   - from the mobile folder run Flutter pub get
   - then run Flutter run on the connected Android phone

4. Test in the Smart Add screen
   - disconnect the backend or disable network
   - open Smart Add
   - enter a construction request
   - the response should now come from the embedded model instead of the fallback summary

### Short truth

If you want it working immediately today, use the backend AI on the phone.
If you want true offline phone inference, the remaining missing piece is the real Gemma task file on the device.
