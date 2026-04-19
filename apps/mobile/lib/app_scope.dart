// Service locator for shared instances.
import 'api_client.dart';
import 'local_llm.dart';

class AppScope {
  static late ApiClient api;
  static late LocalLlmClient llm;
}
