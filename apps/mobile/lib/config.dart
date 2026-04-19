import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Environment-based configuration.
/// Pass values via --dart-define at build time, for example:
///   flutter run --dart-define=API_BASE_URL=http://127.0.0.1:8001
class AppConfig {
  static const _envApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );
  static const _lastKnownApiBaseUrlKey = 'comstruct.lastReachableApiBaseUrl';

  static String _normalizeLocalUrl(String value) {
    var normalized = value.trim();
    if (normalized.isEmpty) return normalized;

    normalized = normalized.replaceAll('127.0.0.1.8001', '127.0.0.1:8001');
    normalized = normalized.replaceAll('localhost.8001', 'localhost:8001');

    final uri = Uri.tryParse(normalized);
    final host = uri?.host ?? '';
    final isPrivateHost = host == '127.0.0.1' ||
        host == 'localhost' ||
        host.startsWith('10.') ||
        host.startsWith('192.168.') ||
        host.startsWith('172.');

    if (normalized.startsWith('https://') && isPrivateHost) {
      normalized = normalized.replaceFirst('https://', 'http://');
    }

    return normalized;
  }

  static List<String> _defaultCandidateApiBaseUrls() {
    if (kIsWeb) {
      return ['http://127.0.0.1:8001'];
    }

    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return const [
          'http://127.0.0.1:8001',
          'http://10.0.2.2:8001',
          'http://172.16.3.26:8001',
          'http://172.19.96.1:8001',
          'http://10.5.0.2:8001',
        ];
      default:
        return const ['http://127.0.0.1:8001'];
    }
  }

  static List<String> get candidateApiBaseUrls {
    final candidates = <String>[
      if (_envApiBaseUrl.isNotEmpty) _normalizeLocalUrl(_envApiBaseUrl),
      ..._defaultCandidateApiBaseUrls(),
    ];
    final seen = <String>{};
    return candidates.where((url) => url.isNotEmpty && seen.add(url)).toList();
  }

  static String get apiBaseUrl => candidateApiBaseUrls.first;

  static Future<void> rememberReachableApiBaseUrl(String value) async {
    final normalized = _normalizeLocalUrl(value);
    if (normalized.isEmpty) return;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_lastKnownApiBaseUrlKey, normalized);
  }

  static Future<String> resolveReachableApiBaseUrl() async {
    final prefs = await SharedPreferences.getInstance();
    final stored = _normalizeLocalUrl(
      prefs.getString(_lastKnownApiBaseUrlKey) ?? '',
    );
    final candidates = <String>[
      if (stored.isNotEmpty) stored,
      ...candidateApiBaseUrls,
    ];
    final seen = <String>{};

    for (final candidate in candidates.where((url) => seen.add(url))) {
      try {
        final response = await Dio(
          BaseOptions(
            baseUrl: candidate,
            connectTimeout: const Duration(seconds: 4),
            receiveTimeout: const Duration(seconds: 4),
          ),
        ).get('/health');
        if (response.statusCode == 200) {
          await rememberReachableApiBaseUrl(candidate);
          return candidate;
        }
      } catch (_) {
        continue;
      }
    }
    return candidates.isNotEmpty ? candidates.first : apiBaseUrl;
  }

  static String get backendConnectionHelp {
    if (kIsWeb) return 'Verify the gateway is running on http://127.0.0.1:8001.';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'On a physical Android phone, http://127.0.0.1:8001 only works when USB adb reverse is active. Otherwise use the laptop LAN URL on the same Wi-Fi and keep port :8001.';
    }
    return 'Verify the gateway is reachable on http://127.0.0.1:8001.';
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
