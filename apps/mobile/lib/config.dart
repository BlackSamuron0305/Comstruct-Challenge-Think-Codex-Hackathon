import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';

/// Environment-based configuration.
/// Pass values via --dart-define at build time, for example:
///   flutter run --dart-define=API_BASE_URL=http://127.0.0.1:8001
class AppConfig {
  static const _envApiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: '',
  );

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

  static List<String> get candidateApiBaseUrls {
    if (_envApiBaseUrl.isNotEmpty) {
      return [_normalizeLocalUrl(_envApiBaseUrl)];
    }

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

  static String get apiBaseUrl => candidateApiBaseUrls.first;

  static Future<String> resolveReachableApiBaseUrl() async {
    for (final candidate in candidateApiBaseUrls) {
      try {
        final response = await Dio(
          BaseOptions(
            baseUrl: candidate,
            connectTimeout: const Duration(seconds: 4),
            receiveTimeout: const Duration(seconds: 4),
          ),
        ).get('/health');
        if (response.statusCode == 200) {
          return candidate;
        }
      } catch (_) {
        continue;
      }
    }
    return apiBaseUrl;
  }

  static String get backendConnectionHelp {
    if (kIsWeb) return 'Verify the gateway is running on http://127.0.0.1:8001.';
    if (defaultTargetPlatform == TargetPlatform.android) {
      return 'Use http://127.0.0.1:8001 or the laptop LAN URL, not https, and keep the port as :8001. The app now also tries a LAN fallback automatically.';
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
