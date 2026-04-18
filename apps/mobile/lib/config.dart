/// Environment-based configuration.
/// Pass values via --dart-define at build time:
///   flutter run --dart-define=API_BASE_URL=https://api.comstruct.com
class AppConfig {
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8001',
  );

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
