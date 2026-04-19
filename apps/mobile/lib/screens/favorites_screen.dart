import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_scope.dart';
import 'c_home_screen.dart' show CColors;

class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  bool _loading = true;
  String _projectName = 'your project';
  String _trade = 'foreman';
  List<Map<String, dynamic>> _recommended = [];
  List<Map<String, dynamic>> _projectFavorites = [];
  List<Map<String, dynamic>> _recentItems = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final prefs = await SharedPreferences.getInstance();
      final me = await AppScope.api.me();
      final catalog = await AppScope.api.products(pageSize: 100);
      final orders = await AppScope.api.orders(pageSize: 10);

      final projectName = prefs.getString('comstruct.selectedProjectName') ?? 'your project';
      final trade = prefs.getString('comstruct.userPosition') ?? (me['role']?.toString() ?? 'foreman');

      final recentItems = _extractRecent(orders, catalog).take(10).toList();
      final projectFavorites = recentItems.isNotEmpty ? recentItems.take(6).toList() : catalog.take(6).toList();

      List<Map<String, dynamic>> recommended = [];
      try {
        final rec = await AppScope.api.recommend(
          'Suggest likely construction materials for today.',
          projectName: projectName,
          trade: trade,
        );
        recommended = List<Map<String, dynamic>>.from((rec['items'] as List?) ?? []);
      } catch (_) {}

      if (recommended.isEmpty) {
        recommended = projectFavorites;
      }

      if (!mounted) return;
      setState(() {
        _projectName = projectName;
        _trade = trade;
        _recommended = recommended;
        _projectFavorites = projectFavorites;
        _recentItems = recentItems;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  List<Map<String, dynamic>> _extractRecent(
    List<Map<String, dynamic>> orders,
    List<Map<String, dynamic>> fallbackCatalog,
  ) {
    final seen = <String>{};
    final result = <Map<String, dynamic>>[];

    for (final order in orders) {
      final items = List<Map<String, dynamic>>.from((order['items'] as List?) ?? const []);
      for (final item in items) {
        final snapshot = Map<String, dynamic>.from((item['product_snapshot'] as Map?) ?? const {});
        final name = (snapshot['name'] ?? item['name'] ?? '').toString();
        if (name.isEmpty || seen.contains(name)) continue;
        seen.add(name);
        result.add({
          'name': name,
          'category': snapshot['category'] ?? item['category'] ?? 'General',
          'unit_price': snapshot['unit_price'] ?? item['unit_price'],
          'product_id': snapshot['id'] ?? item['product_id'],
        });
      }
    }

    if (result.isEmpty) {
      return fallbackCatalog.take(10).toList();
    }

    return result;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      body: SafeArea(
        child: _loading
            ? const Center(child: CircularProgressIndicator(color: CColors.teal))
            : RefreshIndicator(
                onRefresh: _load,
                child: ListView(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
                  children: [
                    Row(
                      children: [
                        IconButton(
                          icon: const Icon(Icons.arrow_back, color: CColors.tealDark),
                          onPressed: () => context.canPop() ? context.pop() : context.go('/c-home'),
                        ),
                        const Icon(Icons.favorite, color: Colors.redAccent, size: 30),
                        const SizedBox(width: 10),
                        const Expanded(
                          child: Text(
                            'Favorites',
                            style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: CColors.tealDark),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      'Live recommendations for $_trade on $_projectName.',
                      style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.black54),
                    ),
                    const SizedBox(height: 18),
                    _SectionList(title: 'Recommended for your role', items: _recommended),
                    const SizedBox(height: 18),
                    _SectionList(title: 'Most ordered on this project', items: _projectFavorites),
                    const SizedBox(height: 18),
                    _SectionList(title: 'Your recent items', items: _recentItems),
                    const SizedBox(height: 18),
                    SizedBox(
                      height: 60,
                      child: ElevatedButton.icon(
                        onPressed: () => context.go('/c-home'),
                        icon: const Icon(Icons.add_circle_outline),
                        label: const Text('Create new order'),
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _SectionList extends StatelessWidget {
  const _SectionList({required this.title, required this.items});

  final String title;
  final List<Map<String, dynamic>> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: CColors.tealDark)),
        const SizedBox(height: 10),
        if (items.isEmpty)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
            child: const Text('No items available yet.', style: TextStyle(color: Colors.black54)),
          )
        else
          ...items.map((item) {
            final rawPrice = item['unit_price'];
            final price = rawPrice is num
                ? rawPrice.toStringAsFixed(2)
                : double.tryParse('${rawPrice ?? ''}')?.toStringAsFixed(2) ?? '?';
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Container(
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: const Color(0xFFE1E7EE)),
                ),
                child: Row(
                  children: [
                    Container(
                      width: 46,
                      height: 46,
                      decoration: BoxDecoration(
                        color: CColors.tealLighter,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: const Icon(Icons.inventory_2_outlined, color: CColors.teal),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(item['name'] as String? ?? 'Material', style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          const SizedBox(height: 3),
                          Text('${item['category'] ?? 'General'} • EUR $price', style: const TextStyle(color: Colors.black54)),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
            );
          }),
      ],
    );
  }
}
