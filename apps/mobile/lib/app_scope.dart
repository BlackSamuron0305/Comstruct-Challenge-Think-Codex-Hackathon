/// Tiny service-locator-style holder so screens can grab the ApiClient
/// without lugging it through GoRouter constructors.
import 'api_client.dart';

class AppScope {
  static late ApiClient api;
}
