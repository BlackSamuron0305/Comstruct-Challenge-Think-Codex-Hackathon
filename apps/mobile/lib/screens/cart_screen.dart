import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import 'projects_screen.dart' show kSelectedProjectKey;

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});
  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  bool _checkingOut = false;

  @override
  void initState() {
    super.initState();
    context.read<CartCubit>().refresh();
  }

  Future<void> _checkout() async {
    final prefs = await SharedPreferences.getInstance();
    final projectId = prefs.getString(kSelectedProjectKey);
    if (projectId == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Bitte zuerst ein Projekt wählen')),
      );
      context.go('/projects');
      return;
    }
    setState(() => _checkingOut = true);
    try {
      final order = await AppScope.api.checkout(projectId: projectId);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Bestellung ${order['status']} (${(order['id'] as String).substring(0, 8)})')),
      );
      await context.read<CartCubit>().refresh();
      if (mounted) context.go('/orders');
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Fehler: $e')),
      );
    } finally {
      if (mounted) setState(() => _checkingOut = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartCubit>().state;
    return Scaffold(
      appBar: AppBar(title: const Text('Warenkorb')),
      body: cart.lines.isEmpty
          ? const Center(child: Text('Warenkorb ist leer'))
          : ListView.separated(
              padding: const EdgeInsets.all(12),
              itemCount: cart.lines.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final l = cart.lines[i];
                return Card(
                  child: ListTile(
                    title: Text(l['name'] as String),
                    subtitle: Text('${l['quantity']} × ${(l['unit_price'] as num).toStringAsFixed(2)} ${l['currency']}'),
                    trailing: IconButton(
                      icon: const Icon(Icons.delete_outline),
                      onPressed: () => context.read<CartCubit>().remove(l['product_id'] as String),
                    ),
                  ),
                );
              },
            ),
      bottomNavigationBar: cart.lines.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      const Text('Total', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                      Text('${cart.total.toStringAsFixed(2)} ${cart.currency}',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _checkingOut ? null : _checkout,
                      child: Text(_checkingOut ? 'Senden…' : 'Bestellung absenden'),
                    ),
                  ),
                ]),
              ),
            ),
    );
  }
}
