import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../translations.dart';
import 'c_home_screen.dart' show CColors;

// ── Product image placeholder painter ──────────────────────────────
class _ProductPlaceholder extends StatelessWidget {
  const _ProductPlaceholder({required this.category});
  final String category;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 110, height: 110,
      decoration: BoxDecoration(
        color: CColors.bg,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: CColors.tealLight),
      ),
      child: Icon(
        _iconFor(category),
        size: 52,
        color: CColors.teal.withValues(alpha: 0.6),
      ),
    );
  }

  IconData _iconFor(String cat) {
    switch (cat) {
      case 'fasteners':   return Icons.construction;
      case 'consumables': return Icons.science_outlined;
      case 'ppe':         return Icons.safety_check_outlined;
      case 'tools':       return Icons.home_repair_service_outlined;
      case 'tapes':       return Icons.circle_outlined;
      default:            return Icons.inventory_2_outlined;
    }
  }
}

class CCatalogScreen extends StatefulWidget {
  final String? category;
  const CCatalogScreen({super.key, this.category});

  @override
  State<CCatalogScreen> createState() => _CCatalogScreenState();
}

class _CCatalogScreenState extends State<CCatalogScreen> {
  final _searchCtrl = TextEditingController();
  late Future<List<Map<String, dynamic>>> _future;
  String? _expandedId;
  final Map<String, TextEditingController> _qtyCtrlMap = {};

  @override
  void initState() {
    super.initState();
    _load();
    context.read<CartCubit>().refresh();
  }

  void _load([String? q]) {
    setState(() {
      _future = _loadProducts(q: q);
    });
  }

  Future<List<Map<String, dynamic>>> _loadProducts({String? q}) async {
    final query = q?.trim();

    if (widget.category == null || widget.category!.isEmpty) {
      return AppScope.api.products(q: query, category: null, pageSize: 200);
    }

    final all = await AppScope.api.products(pageSize: 200);
    return all.where((product) {
      if (!_matchesCategory(product, widget.category!)) return false;
      if (query == null || query.isEmpty) return true;
      final haystack = '${product['name'] ?? ''} ${product['sku'] ?? ''} ${product['category'] ?? ''}'.toLowerCase();
      return haystack.contains(query.toLowerCase());
    }).toList();
  }

  bool _matchesCategory(Map<String, dynamic> product, String categoryId) {
    final category = (product['category'] ?? '').toString().toLowerCase();
    final name = (product['name'] ?? '').toString().toLowerCase();
    final text = '$category $name';

    switch (categoryId) {
      case 'fasteners':
        return category.contains('fastener') || category.contains('anchor') || text.contains('screw') || text.contains('anchor') || text.contains('bolt');
      case 'consumables':
        return category.contains('consumable') || category.contains('drywall') || text.contains('foam') || text.contains('adhesive') || text.contains('seal');
      case 'ppe':
        return category.contains('ppe') || text.contains('glove') || text.contains('mask') || text.contains('goggle') || text.contains('helmet');
      case 'tools':
        return category.contains('tool') || text.contains('hammer') || text.contains('drill') || text.contains('blade') || text.contains('knife');
      case 'tapes':
        return text.contains('tape') || text.contains('seal') || text.contains('foam') || text.contains('silicone');
      case 'supplies':
        return category.contains('site supplies') || category.contains('electrical') || category.contains('sanitary') || text.contains('battery') || text.contains('bag') || text.contains('marker');
      default:
        return true;
    }
  }

  TextEditingController _qtyCtrl(String id, int currentQty) {
    _qtyCtrlMap.putIfAbsent(id, () => TextEditingController());
    final ctrl = _qtyCtrlMap[id]!;
    if (ctrl.text.isEmpty) {
      ctrl.text = currentQty > 0 ? '$currentQty' : '';
    }
    return ctrl;
  }

  double _asDouble(dynamic value) {
    if (value is num) return value.toDouble();
    return double.tryParse('${value ?? ''}') ?? 0;
  }

  @override
  void dispose() {
    _searchCtrl.dispose();
    for (final c in _qtyCtrlMap.values) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/c-home'),
        ),
        title: Text(widget.category != null
            ? t(context, 'cat${_tKeyFor(widget.category!)}')
            : t(context, 'appTitle')),
      ),
      bottomNavigationBar: BlocBuilder<CartCubit, CartState>(
        builder: (_, cartState) {
          if (cartState.lines.isEmpty) return const SizedBox.shrink();
          return SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
              child: SizedBox(
                height: 64,
                child: ElevatedButton.icon(
                  onPressed: () => context.go('/cart'),
                  icon: const Icon(Icons.check_circle_outline, size: 24),
                  label: Text('Review ${cartState.lines.length} item(s)'),
                ),
              ),
            ),
          );
        },
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: TextField(
            controller: _searchCtrl,
            onChanged: (v) => _load(v.isEmpty ? null : v),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search, color: Colors.black38),
              hintText: t(context, 'searchArticles'),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              contentPadding: EdgeInsets.zero,
              filled: true,
              fillColor: Colors.white,
            ),
          ),
        ),
        Expanded(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: _future,
            builder: (_, snap) {
              if (!snap.hasData) return const Center(child: CircularProgressIndicator(color: CColors.teal));
              final items = snap.data!;
              if (items.isEmpty) return Center(child: Text(t(context, 'noArticlesFound')));

              return BlocBuilder<CartCubit, CartState>(
                builder: (_, cartState) => ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) {
                    final p = items[i];
                    final id = p['id'] as String;
                    final cartLine = cartState.lines.firstWhere(
                      (l) => l['product_id'] == id,
                      orElse: () => <String, dynamic>{},
                    );
                    final qty = (cartLine['quantity'] as num?)?.toInt() ?? 0;
                    final isExpanded = _expandedId == id;
                    final price = _asDouble(p['unit_price']).toStringAsFixed(2);
                    final category = (p['category'] as String? ?? '').toLowerCase();

                    return AnimatedContainer(
                      duration: const Duration(milliseconds: 200),
                      decoration: BoxDecoration(
                        color: qty > 0 ? CColors.tealLighter : Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(
                          color: qty > 0 ? CColors.teal : const Color(0xFFE1E7EE),
                          width: qty > 0 ? 1.5 : 1,
                        ),
                      ),
                      child: Column(children: [
                        // Tap row
                        InkWell(
                          borderRadius: BorderRadius.only(
                            topLeft: const Radius.circular(12),
                            topRight: const Radius.circular(12),
                            bottomLeft: Radius.circular(isExpanded ? 0 : 12),
                            bottomRight: Radius.circular(isExpanded ? 0 : 12),
                          ),
                          onTap: () => setState(() => _expandedId = isExpanded ? null : id),
                          child: Padding(
                            padding: const EdgeInsets.fromLTRB(14, 12, 12, 12),
                            child: Row(children: [
                              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                Text(p['name'] as String? ?? '—',
                                    style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 16)),
                                const SizedBox(height: 2),
                                Text('${p['sku'] ?? ''} · ${p['unit'] ?? ''}',
                                    style: const TextStyle(color: Colors.black45, fontSize: 12)),
                                const SizedBox(height: 5),
                                Text('EUR $price',
                                    style: const TextStyle(color: CColors.teal, fontWeight: FontWeight.w700, fontSize: 16)),
                              ])),
                              Row(mainAxisSize: MainAxisSize.min, children: [
                                if (qty > 0) ...[
                                  _CircleBtn(
                                    color: qty == 1 ? CColors.red : CColors.teal,
                                    icon: qty == 1 ? Icons.close : Icons.remove,
                                    size: 40,
                                    onTap: () => context.read<CartCubit>().setQuantity(id, qty - 1),
                                  ),
                                  const SizedBox(width: 6),
                                  Text('$qty', style: const TextStyle(
                                      fontWeight: FontWeight.w800, fontSize: 18, color: CColors.teal)),
                                  const SizedBox(width: 6),
                                ],
                                _CircleBtn(
                                  color: CColors.green,
                                  icon: Icons.add,
                                  size: 40,
                                  onTap: () => context.read<CartCubit>().setQuantity(id, qty + 1),
                                ),
                                const SizedBox(width: 6),
                                AnimatedRotation(
                                  turns: isExpanded ? 0.5 : 0,
                                  duration: const Duration(milliseconds: 200),
                                  child: const Icon(Icons.keyboard_arrow_down, color: Colors.black38),
                                ),
                              ]),
                            ]),
                          ),
                        ),

                        // Expanded panel
                        if (isExpanded) ...[
                          const Divider(height: 0),
                          Padding(
                            padding: const EdgeInsets.all(14),
                            child: Column(children: [
                              // Product image placeholder
                              _ProductPlaceholder(category: category),
                              const SizedBox(height: 14),
                              // Direct quantity input
                              Row(children: [
                                Text(t(context, 'qty'), style: const TextStyle(fontSize: 13, color: Colors.black45)),
                                const SizedBox(width: 8),
                                _CircleBtn(
                                  color: qty == 0 ? Colors.grey.shade300 : CColors.teal,
                                  icon: Icons.remove,
                                  size: 36,
                                  onTap: qty == 0 ? null : () => context.read<CartCubit>().setQuantity(id, qty - 1),
                                ),
                                const SizedBox(width: 8),
                                SizedBox(
                                  width: 64,
                                  child: TextField(
                                    controller: _qtyCtrl(id, qty),
                                    keyboardType: TextInputType.number,
                                    textAlign: TextAlign.center,
                                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: CColors.teal),
                                    decoration: InputDecoration(
                                      contentPadding: const EdgeInsets.symmetric(vertical: 8),
                                      border: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(8),
                                        borderSide: const BorderSide(color: CColors.teal, width: 2),
                                      ),
                                      focusedBorder: OutlineInputBorder(
                                        borderRadius: BorderRadius.circular(8),
                                        borderSide: const BorderSide(color: CColors.teal, width: 2),
                                      ),
                                    ),
                                    onSubmitted: (v) {
                                      final n = int.tryParse(v) ?? 0;
                                      context.read<CartCubit>().setQuantity(id, n);
                                      _qtyCtrlMap[id]?.text = n > 0 ? '$n' : '';
                                    },
                                  ),
                                ),
                                const SizedBox(width: 8),
                                _CircleBtn(
                                  color: CColors.green,
                                  icon: Icons.add,
                                  size: 36,
                                  onTap: () => context.read<CartCubit>().setQuantity(id, qty + 1),
                                ),
                                const SizedBox(width: 8),
                                Text(p['unit'] as String? ?? '', style: const TextStyle(color: Colors.black45, fontSize: 13)),
                                const Spacer(),
                                Text('EUR ${(_asDouble(p['unit_price']) * qty).toStringAsFixed(2)}',
                                    style: const TextStyle(fontWeight: FontWeight.w700, color: CColors.teal, fontSize: 14)),
                              ]),
                            ]),
                          ),
                        ],
                      ]),
                    );
                  },
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

String _tKeyFor(String catId) {
  switch (catId) {
    case 'fasteners':   return 'Fasteners';
    case 'consumables': return 'Consumables';
    case 'ppe':         return 'PPE';
    case 'tools':       return 'Tools';
    case 'tapes':       return 'Tapes';
    case 'supplies':    return 'Supplies';
    default:            return 'Supplies';
  }
}

class _CircleBtn extends StatelessWidget {
  const _CircleBtn({required this.color, required this.icon, required this.onTap, this.size = 32});
  final Color color;
  final IconData icon;
  final VoidCallback? onTap;
  final double size;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      width: size, height: size,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Icon(icon, color: Colors.white, size: size * 0.5),
    ),
  );
}
