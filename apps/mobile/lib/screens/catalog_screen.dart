import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../offline_queue.dart';
import '../theme.dart';

class CatalogScreen extends StatefulWidget {
  const CatalogScreen({super.key});
  @override
  State<CatalogScreen> createState() => _CatalogScreenState();
}

class _CatalogScreenState extends State<CatalogScreen> {
  final _searchCtrl = TextEditingController();
  Timer? _debounce;
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = AppScope.api.products();
    context.read<CartCubit>().refresh();
  }

  void _onSearch(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 350), () {
      setState(() {
        _future = AppScope.api.products(q: value);
      });
    });
  }

  Future<void> _refresh() async {
    setState(() {
      _future = AppScope.api.products(q: _searchCtrl.text);
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Catalog'),
        actions: [
          IconButton(
            icon: const Icon(Icons.camera_alt_outlined),
            tooltip: 'Image Order',
            onPressed: () => context.go('/image-order'),
          ),
          IconButton(
            icon: const Icon(Icons.mic_none),
            tooltip: 'Voice Order',
            onPressed: () => context.go('/voice-order'),
          ),
          IconButton(
            icon: const Icon(Icons.chat_outlined),
            tooltip: 'AI Chat',
            onPressed: () => context.go('/chat'),
          ),
          IconButton(
            icon: const Icon(Icons.auto_awesome),
            tooltip: 'Smart Add',
            onPressed: () => context.go('/smart-add'),
          ),
          BlocBuilder<CartCubit, CartState>(
            builder: (_, s) => Stack(alignment: Alignment.center, children: [
              IconButton(
                icon: const Icon(Icons.shopping_cart_outlined),
                tooltip: 'Cart',
                onPressed: () => context.go('/cart'),
              ),
              if (s.lines.isNotEmpty)
                Positioned(
                  right: 6, top: 6,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(
                      color: ComstructColors.accent, shape: BoxShape.circle,
                    ),
                    child: Text('${s.lines.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ),
            ]),
          ),
        ],
      ),
      floatingActionButton: Builder(builder: (_) {
        final pending = OfflineQueue.pending();
        if (pending.isEmpty) return const SizedBox.shrink();
        return FloatingActionButton.small(
          backgroundColor: ComstructColors.warn,
          onPressed: () => context.go('/offline-queue'),
          child: Badge(
            label: Text('${pending.length}'),
            child: const Icon(Icons.cloud_off, color: Colors.white),
          ),
        );
      }),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchCtrl,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Screws, silicone, gloves…',
            ),
            onChanged: _onSearch,
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: _refresh,
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: _future,
              builder: (_, snap) {
                if (snap.hasError) return Center(child: Text('${snap.error}'));
                if (!snap.hasData) return _buildShimmerList();
                final items = snap.data!;
                if (items.isEmpty) {
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: const [SizedBox(height: 120), Center(child: Text('No C-materials found.'))],
                  );
                }
                return ListView.separated(
                  physics: const AlwaysScrollableScrollPhysics(),
                  padding: const EdgeInsets.all(12),
                  itemCount: items.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 8),
                  itemBuilder: (_, i) => _ProductTile(p: items[i]),
                );
              },
            ),
          ),
        ),
      ]),
    );
  }

  Widget _buildShimmerList() {
    return Shimmer.fromColors(
      baseColor: Colors.grey[300]!,
      highlightColor: Colors.grey[100]!,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: 8,
        itemBuilder: (_, __) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Container(height: 64, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12))),
        ),
      ),
    );
  }
}

class _ProductTile extends StatefulWidget {
  const _ProductTile({required this.p});
  final Map<String, dynamic> p;

  @override
  State<_ProductTile> createState() => _ProductTileState();
}

class _ProductTileState extends State<_ProductTile> {
  bool _adding = false;

  @override
  Widget build(BuildContext context) {
    final p = widget.p;
    final price = (p['unit_price'] as num?)?.toStringAsFixed(2) ?? '?';
    final currency = p['currency'] as String? ?? 'CHF';
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        title: Text(p['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('${p['category'] ?? '?'} • $price $currency / ${p['unit'] ?? 'pc'}'),
        trailing: ElevatedButton(
          style: ElevatedButton.styleFrom(minimumSize: const Size(64, 36)),
          onPressed: _adding ? null : () async {
            setState(() => _adding = true);
            final ok = await context.read<CartCubit>().add(p['id'] as String, 1);
            if (!context.mounted) return;
            setState(() => _adding = false);
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(
                content: Text(ok ? 'Added to cart' : 'Could not add'),
                duration: const Duration(seconds: 1),
              ),
            );
          },
          child: _adding
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
              : const Icon(Icons.add),
        ),
      ),
    );
  }
}
