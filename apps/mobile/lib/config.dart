import 'package:flutter/foundation.dart';

/// Environment-based configuration.
/// Pass values via --dart-define at build time:
///   flutter run --dart-define=API_BASE_URL=https://api.comstruct.com
class AppConfig {
  static const _envApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

  static String get apiBaseUrl {
    if (_envApiBaseUrl.isNotEmpty) return _envApiBaseUrl;

    if (kIsWeb) return 'http://127.0.0.1:8001';

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        // Android emulators access the host machine via 10.0.2.2 by default.
        return 'http://10.0.2.2:8001';
      default:
        return 'http://127.0.0.1:8001';
    }
  }

  static String get backendConnectionHelp {
    if (kIsWeb) return 'Verify the gateway is running on port 8001.';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'Android emulator: use 10.0.2.2:8001. Physical phone: run adb reverse tcp:8001 tcp:8001 or set API_BASE_URL to your laptop LAN IP.';
    }
    return 'Verify the gateway is reachable on port 8001.';
  }

  static const openAiApiKey = String.fromEnvironment(
    'OPENAI_API_KEY',
    defaultValue: '',
  );

  static const openAiModel = String.fromEnvironment(
    'OPENAI_MODEL',
    defaultValue: 'gpt-4o-mini',
  );

  /// Whether to prefer the on-device Gemma model when offline.
  static const bool enableLocalLlm = true;

  /// Local Gemma model file name (placed in assets/models/).
  static const localModelName = 'gemma-3-1b-it-int4.task';

  /// Maximum tokens for on-device generation.
  static const int localMaxTokens = 512;
}
