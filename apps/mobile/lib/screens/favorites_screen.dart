import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../favorites_store.dart';
import 'c_home_screen.dart' show CColors;

class FavoritesScreen extends StatefulWidget {
  const FavoritesScreen({super.key});

  @override
  State<FavoritesScreen> createState() => _FavoritesScreenState();
}

class _FavoritesScreenState extends State<FavoritesScreen> {
  bool _loading = true;
  List<Map<String, dynamic>> _items = [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _loading = true);
    try {
      final favoriteIds = await FavoritesStore.load();
      final catalog = await AppScope.api.products(pageSize: 200);
      final items = catalog
          .where((item) => favoriteIds.contains(item['id']))
          .toList()
        ..sort((a, b) => (a['name'] as String? ?? '').compareTo(b['name'] as String? ?? ''));
      if (!mounted) return;
      setState(() {
        _items = items;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _loading = false);
    }
  }

  Future<void> _removeFavorite(String productId) async {
    await FavoritesStore.toggle(productId);
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
              child: Row(
                children: [
                  const Icon(Icons.favorite, color: Colors.redAccent, size: 30),
                  const SizedBox(width: 10),
                  const Expanded(
                    child: Text(
                      'Saved Materials',
                      style: TextStyle(
                        fontSize: 28,
                        fontWeight: FontWeight.w800,
                        color: Color(0xFF1A1A1A),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
              child: Container(
                width: double.infinity,
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: CColors.tealLight),
                ),
                child: const Text(
                  'Only your manually saved materials appear here. No auto-generated kits, no project templates, and no company-wide bundles.',
                  style: TextStyle(fontSize: 15, height: 1.4, color: Colors.black87),
                ),
              ),
            ),
            Expanded(
              child: _loading
                  ? const Center(child: CircularProgressIndicator(color: CColors.teal))
                  : _items.isEmpty
                      ? Center(
                          child: Padding(
                            padding: const EdgeInsets.all(24),
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                const Icon(Icons.favorite_border, size: 64, color: Colors.black26),
                                const SizedBox(height: 12),
                                const Text(
                                  'No saved items yet.',
                                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700),
                                ),
                                const SizedBox(height: 8),
                                const Text(
                                  'Tap the heart on any catalog item to keep it ready for the next order.',
                                  textAlign: TextAlign.center,
                                  style: TextStyle(fontSize: 15, color: Colors.black54),
                                ),
                                const SizedBox(height: 18),
                                SizedBox(
                                  width: double.infinity,
                                  child: ElevatedButton.icon(
                                    onPressed: () => context.go('/c-home'),
                                    icon: const Icon(Icons.add_circle_outline),
                                    label: const Text('Find Materials'),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        )
                      : RefreshIndicator(
                          onRefresh: _load,
                          child: ListView.separated(
                            padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                            itemCount: _items.length,
                            separatorBuilder: (_, __) => const SizedBox(height: 10),
                            itemBuilder: (_, i) {
                              final item = _items[i];
                              final price = (item['unit_price'] as num?)?.toStringAsFixed(2) ?? '?';
                              return Container(
                                padding: const EdgeInsets.all(16),
                                decoration: BoxDecoration(
                                  color: Colors.white,
                                  borderRadius: BorderRadius.circular(16),
                                  border: Border.all(color: const Color(0xFFE1E7EE)),
                                ),
                                child: Row(
                                  children: [
                                    Container(
                                      width: 52,
                                      height: 52,
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
                                          Text(
                                            item['name'] as String? ?? 'Material',
                                            style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                            '${item['category'] ?? 'General'} • EUR $price',
                                            style: const TextStyle(fontSize: 14, color: Colors.black54),
                                          ),
                                        ],
                                      ),
                                    ),
                                    IconButton(
                                      onPressed: () => _removeFavorite(item['id'] as String),
                                      icon: const Icon(Icons.favorite, color: Colors.redAccent, size: 28),
                                    ),
                                  ],
                                ),
                              );
                            },
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}
