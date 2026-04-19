import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api_client.dart';
import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../favorites_store.dart';
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
  Set<String> _favoriteIds = <String>{};
  List<Map<String, dynamic>> _favorites = [];
  List<Map<String, dynamic>> _recommended = [];
  List<Map<String, dynamic>> _projectFavorites = [];
  List<Map<String, dynamic>> _recentItems = [];

  final _favoritesKey = GlobalKey();
  final _recommendedKey = GlobalKey();
  final _projectKey = GlobalKey();
  final _recentKey = GlobalKey();

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
      final favoriteIds = await FavoritesStore.load();

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

      final pool = _dedupeItems([
        ...catalog.map((e) => Map<String, dynamic>.from(e)),
        ...recommended,
        ...projectFavorites,
        ...recentItems,
      ]);

      if (!mounted) return;
      setState(() {
        _projectName = projectName;
        _trade = trade;
        _favoriteIds = favoriteIds;
        _favorites = _resolveFavoriteItems(favoriteIds, pool);
        _recommended = _dedupeItems(recommended);
        _projectFavorites = _dedupeItems(projectFavorites);
        _recentItems = _dedupeItems(recentItems);
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
          'id': snapshot['id'] ?? item['product_id'],
          'product_id': snapshot['id'] ?? item['product_id'],
          'name': name,
          'category': snapshot['category'] ?? item['category'] ?? 'General',
          'unit_price': snapshot['unit_price'] ?? item['unit_price'],
          'supplier_name': snapshot['supplier_name'] ?? item['supplier_name'],
        });
      }
    }

    if (result.isEmpty) {
      return fallbackCatalog.take(10).map((e) => Map<String, dynamic>.from(e)).toList();
    }

    return result;
  }

  List<Map<String, dynamic>> _dedupeItems(Iterable<Map<String, dynamic>> items) {
    final seen = <String>{};
    final result = <Map<String, dynamic>>[];
    for (final raw in items) {
      final item = Map<String, dynamic>.from(raw);
      final key = _itemProductId(item) ?? (item['name']?.toString().toLowerCase() ?? '');
      if (key.isEmpty || !seen.add(key)) continue;
      result.add(item);
    }
    return result;
  }

  List<Map<String, dynamic>> _resolveFavoriteItems(
    Set<String> favoriteIds,
    List<Map<String, dynamic>> pool,
  ) {
    final byId = <String, Map<String, dynamic>>{};
    for (final item in pool) {
      final id = _itemProductId(item);
      if (id != null && id.isNotEmpty) {
        byId[id] = item;
      }
    }
    return favoriteIds.map((id) => byId[id]).whereType<Map<String, dynamic>>().toList();
  }

  String? _itemProductId(Map<String, dynamic> item) {
    final value = item['product_id'] ?? item['id'];
    final id = value?.toString();
    if (id == null || id.isEmpty) return null;
    return id;
  }

  Future<void> _scrollTo(GlobalKey key) async {
    final context = key.currentContext;
    if (context == null) return;
    await Scrollable.ensureVisible(
      context,
      duration: const Duration(milliseconds: 260),
      curve: Curves.easeOutCubic,
    );
  }

  Future<void> _toggleFavorite(Map<String, dynamic> item) async {
    final productId = _itemProductId(item);
    if (productId == null) return;
    final ids = await FavoritesStore.toggle(productId);
    if (!mounted) return;
    final pool = _dedupeItems([..._recommended, ..._projectFavorites, ..._recentItems, ..._favorites]);
    setState(() {
      _favoriteIds = ids;
      _favorites = _resolveFavoriteItems(ids, pool);
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ids.contains(productId) ? 'Saved to favorites' : 'Removed from favorites')),
    );
  }

  Future<void> _addToReview(Map<String, dynamic> item) async {
    final productId = _itemProductId(item);
    if (productId == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('This item is not ready to add yet')),
      );
      return;
    }
    final quantity = parseFlexibleNumber(item['suggested_qty']) ?? 1;
    final ok = await context.read<CartCubit>().add(productId, quantity);
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(ok ? 'Added to order review' : 'Could not add item')),
    );
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
                      'Only the most useful lists for $_trade on $_projectName — with your saved favorites first.',
                      style: const TextStyle(fontSize: 15, height: 1.4, color: Colors.black54),
                    ),
                    const SizedBox(height: 18),
                    Wrap(
                      spacing: 10,
                      runSpacing: 10,
                      children: [
                        _ShortcutCard(
                          label: 'Your favorites',
                          count: _favorites.length,
                          icon: Icons.favorite,
                          color: Colors.redAccent,
                          onTap: () => _scrollTo(_favoritesKey),
                        ),
                        _ShortcutCard(
                          label: 'Role picks',
                          count: _recommended.length,
                          icon: Icons.auto_awesome,
                          color: CColors.teal,
                          onTap: () => _scrollTo(_recommendedKey),
                        ),
                        _ShortcutCard(
                          label: 'Most ordered',
                          count: _projectFavorites.length,
                          icon: Icons.trending_up,
                          color: Colors.orange,
                          onTap: () => _scrollTo(_projectKey),
                        ),
                        _ShortcutCard(
                          label: 'Recent items',
                          count: _recentItems.length,
                          icon: Icons.history,
                          color: Colors.indigo,
                          onTap: () => _scrollTo(_recentKey),
                        ),
                      ],
                    ),
                    const SizedBox(height: 18),
                    _SectionList(
                      sectionKey: _favoritesKey,
                      title: 'Your favorites',
                      subtitle: 'Tap the heart on any material to save it here for later.',
                      emptyMessage: 'You have no saved favorites yet. Use the heart button on any item below.',
                      items: _favorites,
                      favoriteIds: _favoriteIds,
                      onToggleFavorite: _toggleFavorite,
                      onAddToReview: _addToReview,
                    ),
                    const SizedBox(height: 18),
                    _SectionList(
                      sectionKey: _recommendedKey,
                      title: 'Recommendations for your role',
                      subtitle: 'Useful items picked for today’s work profile.',
                      items: _recommended,
                      favoriteIds: _favoriteIds,
                      onToggleFavorite: _toggleFavorite,
                      onAddToReview: _addToReview,
                    ),
                    const SizedBox(height: 18),
                    _SectionList(
                      sectionKey: _projectKey,
                      title: 'Most ordered on this project',
                      subtitle: 'Common materials that this project uses again and again.',
                      items: _projectFavorites,
                      favoriteIds: _favoriteIds,
                      onToggleFavorite: _toggleFavorite,
                      onAddToReview: _addToReview,
                    ),
                    const SizedBox(height: 18),
                    _SectionList(
                      sectionKey: _recentKey,
                      title: 'Your recent items',
                      subtitle: 'Fast re-order for things you used recently.',
                      items: _recentItems,
                      favoriteIds: _favoriteIds,
                      onToggleFavorite: _toggleFavorite,
                      onAddToReview: _addToReview,
                    ),
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

class _ShortcutCard extends StatelessWidget {
  const _ShortcutCard({
    required this.label,
    required this.count,
    required this.icon,
    required this.color,
    required this.onTap,
  });

  final String label;
  final int count;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 160,
      child: Material(
        color: Colors.white,
        borderRadius: BorderRadius.circular(18),
        child: InkWell(
          borderRadius: BorderRadius.circular(18),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, color: color, size: 26),
                const SizedBox(height: 14),
                Text(label, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                const SizedBox(height: 6),
                Text('$count items', style: const TextStyle(color: Colors.black54)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _SectionList extends StatelessWidget {
  const _SectionList({
    required this.sectionKey,
    required this.title,
    required this.subtitle,
    required this.items,
    required this.favoriteIds,
    required this.onToggleFavorite,
    required this.onAddToReview,
    this.emptyMessage = 'No items available yet.',
  });

  final GlobalKey sectionKey;
  final String title;
  final String subtitle;
  final String emptyMessage;
  final List<Map<String, dynamic>> items;
  final Set<String> favoriteIds;
  final Future<void> Function(Map<String, dynamic>) onToggleFavorite;
  final Future<void> Function(Map<String, dynamic>) onAddToReview;

  @override
  Widget build(BuildContext context) {
    return Container(
      key: sectionKey,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: CColors.tealDark)),
          const SizedBox(height: 4),
          Text(subtitle, style: const TextStyle(color: Colors.black54, height: 1.35)),
          const SizedBox(height: 12),
          if (items.isEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(18),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(18)),
              child: Text(emptyMessage, style: const TextStyle(color: Colors.black54)),
            )
          else
            ...items.map((item) {
              final productId = (item['product_id'] ?? item['id'])?.toString();
              final price = parseFlexibleNumber(item['unit_price']);
              final title = (item['display_name'] ?? item['name'] ?? 'Material').toString();
              final category = (item['category'] ?? item['taxonomy_label'] ?? 'General').toString();
              final supplier = (item['supplier_name'] ?? '').toString();
              final isFavorite = productId != null && favoriteIds.contains(productId);
              final subtitleParts = <String>[category];
              if (supplier.isNotEmpty) subtitleParts.add(supplier);
              if (price != null) subtitleParts.add('EUR ${price.toStringAsFixed(2)}');

              return Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(18),
                    onTap: productId == null ? null : () => onAddToReview(item),
                    child: Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(18),
                        border: Border.all(color: const Color(0xFFE1E7EE)),
                      ),
                      child: Column(
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Container(
                                width: 54,
                                height: 54,
                                decoration: BoxDecoration(
                                  color: CColors.tealLighter,
                                  borderRadius: BorderRadius.circular(14),
                                ),
                                child: const Icon(Icons.inventory_2_outlined, color: CColors.teal),
                              ),
                              const SizedBox(width: 12),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      title,
                                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                                    ),
                                    const SizedBox(height: 4),
                                    Text(
                                      subtitleParts.join(' • '),
                                      style: const TextStyle(color: Colors.black54, height: 1.35),
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                onPressed: productId == null ? null : () => onToggleFavorite(item),
                                icon: Icon(
                                  isFavorite ? Icons.favorite : Icons.favorite_border,
                                  color: isFavorite ? Colors.redAccent : Colors.black45,
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              OutlinedButton.icon(
                                onPressed: productId == null ? null : () => onToggleFavorite(item),
                                icon: Icon(isFavorite ? Icons.bookmark_added : Icons.bookmark_add_outlined),
                                label: Text(isFavorite ? 'Saved' : 'Save'),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: FilledButton.icon(
                                  onPressed: productId == null ? null : () => onAddToReview(item),
                                  icon: const Icon(Icons.add_shopping_cart),
                                  label: const Text('Add to review'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              );
            }),
        ],
      ),
    );
  }
}
