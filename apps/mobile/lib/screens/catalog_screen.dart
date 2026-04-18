import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Katalog'),
        actions: [
          IconButton(
            icon: const Icon(Icons.auto_awesome),
            tooltip: 'Smart Add',
            onPressed: () => context.go('/smart-add'),
          ),
          BlocBuilder<CartCubit, CartState>(
            builder: (_, s) => Stack(alignment: Alignment.center, children: [
              IconButton(
                icon: const Icon(Icons.shopping_cart_outlined),
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
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.all(12),
          child: TextField(
            controller: _searchCtrl,
            decoration: const InputDecoration(
              prefixIcon: Icon(Icons.search),
              hintText: 'Schrauben, Silikon, Handschuhe …',
            ),
            onChanged: _onSearch,
          ),
        ),
        Expanded(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: _future,
            builder: (_, snap) {
              if (snap.hasError) return Center(child: Text('${snap.error}'));
              if (!snap.hasData) return const Center(child: CircularProgressIndicator());
              final items = snap.data!;
              if (items.isEmpty) {
                return const Center(child: Text('Keine C-Materialien gefunden.'));
              }
              return ListView.separated(
                padding: const EdgeInsets.all(12),
                itemCount: items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) => _ProductTile(p: items[i]),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _ProductTile extends StatelessWidget {
  const _ProductTile({required this.p});
  final Map<String, dynamic> p;

  @override
  Widget build(BuildContext context) {
    final price = (p['unit_price'] as num?)?.toStringAsFixed(2) ?? '?';
    final currency = p['currency'] as String? ?? 'CHF';
    return Card(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        title: Text(p['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
        subtitle: Text('${p['category'] ?? '?'} • $price $currency / ${p['unit'] ?? 'pc'}'),
        trailing: ElevatedButton(
          style: ElevatedButton.styleFrom(minimumSize: const Size(64, 36)),
          onPressed: () async {
            final ok = await context.read<CartCubit>().add(p['id'] as String, 1);
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(ok ? 'Hinzugefügt' : 'Fehler')),
            );
          },
          child: const Icon(Icons.add),
        ),
      ),
    );
  }
}
