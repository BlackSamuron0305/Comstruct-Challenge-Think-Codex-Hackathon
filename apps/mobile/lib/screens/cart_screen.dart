import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../api_client.dart';
import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../offline_queue.dart';
import 'projects_screen.dart' show kSelectedProjectKey;

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});
  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  bool _checkingOut = false;
  String? _idempotencyKey;

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
        const SnackBar(content: Text('Please select a project first')),
      );
      context.go('/projects');
      return;
    }

    // Generate idempotency key once per checkout attempt
    _idempotencyKey ??= const Uuid().v4();

    setState(() => _checkingOut = true);
    try {
      final order = await AppScope.api.checkout(
        projectId: projectId,
        idempotencyKey: _idempotencyKey,
      );
      _idempotencyKey = null; // Reset after successful checkout
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Order ${order['status']} (${(order['id'] as String).substring(0, 8)})')),
      );
      await context.read<CartCubit>().refresh();
      if (mounted) context.go('/c-orders');
    } catch (e) {
      // Offline fallback — queue checkout for later
      final isOnline = await AppScope.llm.isOnline;
      if (!isOnline) {
        await OfflineQueue.enqueue(
          type: 'checkout',
          payload: {
            'project_id': projectId,
            'notes': 'Queued while offline',
          },
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Offline: order saved and will sync when connected')),
        );
        _idempotencyKey = null;
        return;
      }
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
    } finally {
      if (mounted) setState(() => _checkingOut = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartCubit>().state;
    return Scaffold(
      appBar: AppBar(title: const Text('Order Review')),
      body: cart.busy
          ? const Center(child: CircularProgressIndicator())
          : cart.lines.isEmpty
              ? const Center(child: Text('No items selected yet'))
              : RefreshIndicator(
                  onRefresh: () => context.read<CartCubit>().refresh(),
                  child: ListView.separated(
                    physics: const AlwaysScrollableScrollPhysics(),
                    padding: const EdgeInsets.all(12),
                    itemCount: cart.lines.length,
                    separatorBuilder: (_, __) => const SizedBox(height: 8),
                    itemBuilder: (_, i) {
                      final l = cart.lines[i];
                      return Dismissible(
                        key: ValueKey(l['product_id']),
                        direction: DismissDirection.endToStart,
                        background: Container(
                          alignment: Alignment.centerRight,
                          padding: const EdgeInsets.only(right: 16),
                          color: Colors.red,
                          child: const Icon(Icons.delete, color: Colors.white),
                        ),
                        onDismissed: (_) => context.read<CartCubit>().remove(l['product_id'] as String),
                        child: Card(
                          child: ListTile(
                            title: Text(l['name'] as String),
                            subtitle: Text('${l['quantity']} × ${(l['unit_price'] as num).toStringAsFixed(2)} ${normalizeCurrencyCode(l['currency'] as String?)}'),
                            trailing: IconButton(
                              icon: const Icon(Icons.delete_outline),
                              onPressed: () => context.read<CartCubit>().remove(l['product_id'] as String),
                            ),
                          ),
                        ),
                      );
                    },
                  ),
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
                      Text('${cart.total.toStringAsFixed(2)} ${normalizeCurrencyCode(cart.currency)}',
                          style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
                    ],
                  ),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: ElevatedButton(
                      onPressed: _checkingOut ? null : _checkout,
                      child: Text(_checkingOut ? 'Submitting…' : 'Place order now'),
                    ),
                  ),
                ]),
              ),
            ),
    );
  }
}
