import 'package:shared_preferences/shared_preferences.dart';

class FavoritesStore {
  static const _key = 'comstruct.favoriteProducts';

  static Future<Set<String>> load() async {
    final prefs = await SharedPreferences.getInstance();
    return prefs.getStringList(_key)?.toSet() ?? <String>{};
  }

  static Future<bool> contains(String productId) async {
    final ids = await load();
    return ids.contains(productId);
  }

  static Future<Set<String>> toggle(String productId) async {
    final prefs = await SharedPreferences.getInstance();
    final ids = await load();
    if (ids.contains(productId)) {
      ids.remove(productId);
    } else {
      ids.add(productId);
    }
    await prefs.setStringList(_key, ids.toList()..sort());
    return ids;
  }
}
