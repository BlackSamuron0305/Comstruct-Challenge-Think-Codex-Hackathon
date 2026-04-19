import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../api_client.dart';
import '../app_scope.dart';
import '../config.dart';
import '../cubits/cart_cubit.dart';
import '../offline_queue.dart';
import 'projects_screen.dart' show kSelectedProjectKey, kSelectedProjectNameKey;

class CartScreen extends StatefulWidget {
  const CartScreen({super.key});
  @override
  State<CartScreen> createState() => _CartScreenState();
}

class _CartScreenState extends State<CartScreen> {
  bool _checkingOut = false;
  String? _idempotencyKey;
  String? _projectId;
  String _projectName = 'Select a project';
  String? _checkoutError;

  bool get _hasSelectedProject => _projectId != null && _projectId!.isNotEmpty;

  @override
  void initState() {
    super.initState();
    _loadSelectedProject();
    context.read<CartCubit>().refresh();
  }

  Future<void> _loadSelectedProject() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _projectId = prefs.getString(kSelectedProjectKey);
      _projectName = prefs.getString(kSelectedProjectNameKey) ?? 'Select a project';
    });
  }

  void _selectProject() {
    context.go('/projects');
  }

  Future<void> _checkout() async {
    final messenger = ScaffoldMessenger.of(context);
    final router = GoRouter.of(context);
    final cartCubit = context.read<CartCubit>();
    final prefs = await SharedPreferences.getInstance();
    final projectId = prefs.getString(kSelectedProjectKey);
    final projectName = prefs.getString(kSelectedProjectNameKey) ?? 'Select a project';

    setState(() {
      _projectId = projectId;
      _projectName = projectName;
    });

    if (projectId == null || projectId.isEmpty) {
      if (!mounted) return;
      setState(() {
        _checkoutError = 'Select a project first before placing the order.';
      });
      messenger.showSnackBar(
        const SnackBar(content: Text('Please select a project first')),
      );
      router.go('/projects');
      return;
    }

    _idempotencyKey ??= const Uuid().v4();

    setState(() {
      _checkingOut = true;
      _checkoutError = null;
    });
    try {
      await AppScope.api.ensureReachableBaseUrl();
      final order = await AppScope.api.checkout(
        projectId: projectId,
        idempotencyKey: _idempotencyKey,
      );
      _idempotencyKey = null; // Reset after successful checkout
      if (!mounted) return;
      messenger.showSnackBar(
        SnackBar(content: Text('Order ${order['status']} (${(order['id'] as String).substring(0, 8)})')),
      );
      await cartCubit.refresh();
      if (mounted) router.go('/c-orders');
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
        messenger.showSnackBar(
          const SnackBar(content: Text('Offline: order saved and will sync when connected')),
        );
        _idempotencyKey = null;
        return;
      }
      if (!mounted) return;
      final friendly = '${describeApiError(e, baseUrl: AppScope.api.baseUrl)} ${AppConfig.backendConnectionHelp}';
      setState(() => _checkoutError = friendly);
      messenger.showSnackBar(
        SnackBar(content: Text(friendly)),
      );
    } finally {
      if (mounted) setState(() => _checkingOut = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final cart = context.watch<CartCubit>().state;
    final cartCubit = context.read<CartCubit>();
    final controlsEnabled = _hasSelectedProject && !_checkingOut;

    return Scaffold(
      appBar: AppBar(title: const Text('Order Review')),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
            child: Material(
              color: _hasSelectedProject ? const Color(0xFFEAF7F1) : const Color(0xFFFFF4E5),
              borderRadius: BorderRadius.circular(16),
              child: ListTile(
                leading: Icon(
                  _hasSelectedProject ? Icons.business_center_outlined : Icons.folder_open,
                  color: _hasSelectedProject ? Colors.green.shade700 : Colors.orange.shade800,
                ),
                title: Text(_hasSelectedProject ? _projectName : 'Select a project first'),
                subtitle: Text(
                  _hasSelectedProject
                      ? 'This order will be placed for the selected project.'
                      : 'Choose a project before adjusting quantities or placing the order.',
                ),
                trailing: !_hasSelectedProject
                    ? FilledButton(
                        onPressed: _selectProject,
                        child: const Text('Select'),
                      )
                    : null,
              ),
            ),
          ),
          Expanded(
            child: cart.busy
                ? const Center(child: CircularProgressIndicator())
                : cart.lines.isEmpty
                    ? const Center(child: Text('No items selected yet'))
                    : RefreshIndicator(
                        onRefresh: () async {
                          await _loadSelectedProject();
                          await cartCubit.refresh();
                        },
                        child: ListView.separated(
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.all(12),
                          itemCount: cart.lines.length,
                          separatorBuilder: (_, __) => const SizedBox(height: 8),
                          itemBuilder: (_, i) {
                            final l = cart.lines[i];
                            final productId = (l['product_id'] ?? '').toString();
                            final quantity = parseFlexibleInt(l['quantity'], fallback: 1);
                            final unitPrice = parseFlexibleNumber(l['unit_price']) ?? 0;
                            final name = (l['name'] ?? 'Material').toString();
                            return Dismissible(
                              key: ValueKey(productId),
                              direction: controlsEnabled ? DismissDirection.endToStart : DismissDirection.none,
                              background: Container(
                                alignment: Alignment.centerRight,
                                padding: const EdgeInsets.only(right: 16),
                                color: Colors.red,
                                child: const Icon(Icons.delete, color: Colors.white),
                              ),
                              onDismissed: (_) => context.read<CartCubit>().remove(productId),
                              child: Card(
                                child: Padding(
                                  padding: const EdgeInsets.all(14),
                                  child: Column(
                                    crossAxisAlignment: CrossAxisAlignment.start,
                                    children: [
                                      Row(
                                        crossAxisAlignment: CrossAxisAlignment.start,
                                        children: [
                                          Expanded(
                                            child: Column(
                                              crossAxisAlignment: CrossAxisAlignment.start,
                                              children: [
                                                Text(name,
                                                    style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                                                const SizedBox(height: 4),
                                                Text(
                                                  '${unitPrice.toStringAsFixed(2)} ${normalizeCurrencyCode(l['currency'] as String?)} each',
                                                  style: const TextStyle(color: Colors.black54),
                                                ),
                                              ],
                                            ),
                                          ),
                                          IconButton(
                                            icon: const Icon(Icons.delete_outline),
                                            onPressed: controlsEnabled
                                                ? () => context.read<CartCubit>().remove(productId)
                                                : null,
                                          ),
                                        ],
                                      ),
                                      const SizedBox(height: 12),
                                      Row(children: [
                                        SizedBox(
                                          width: 64,
                                          height: 56,
                                          child: ElevatedButton(
                                            onPressed: controlsEnabled
                                                ? () => context.read<CartCubit>().setQuantity(productId, quantity - 1)
                                                : null,
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: Colors.grey.shade100,
                                              foregroundColor: Colors.black87,
                                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                              padding: EdgeInsets.zero,
                                              elevation: 0,
                                            ),
                                            child: Icon(quantity <= 1 ? Icons.delete_outline : Icons.remove, size: 28),
                                          ),
                                        ),
                                        Expanded(
                                          child: Center(
                                            child: Text(
                                              '$quantity',
                                              style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w800),
                                            ),
                                          ),
                                        ),
                                        SizedBox(
                                          width: 64,
                                          height: 56,
                                          child: ElevatedButton(
                                            onPressed: controlsEnabled
                                                ? () => context.read<CartCubit>().setQuantity(productId, quantity + 1)
                                                : null,
                                            style: ElevatedButton.styleFrom(
                                              backgroundColor: const Color(0xFFE6F4EF),
                                              foregroundColor: Colors.teal,
                                              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                                              padding: EdgeInsets.zero,
                                              elevation: 0,
                                            ),
                                            child: const Icon(Icons.add, size: 28),
                                          ),
                                        ),
                                      ]),
                                    ],
                                  ),
                                ),
                              ),
                            );
                          },
                        ),
                      ),
          ),
        ],
      ),
      bottomNavigationBar: cart.lines.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                padding: const EdgeInsets.all(16),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  if (_checkoutError != null) ...[
                    Container(
                      width: double.infinity,
                      margin: const EdgeInsets.only(bottom: 12),
                      padding: const EdgeInsets.all(14),
                      decoration: BoxDecoration(
                        color: const Color(0xFFFFF4E5),
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFFFD59E)),
                      ),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('Order could not be sent yet', style: TextStyle(fontWeight: FontWeight.w700)),
                          const SizedBox(height: 6),
                          Text(_checkoutError!, style: const TextStyle(height: 1.35)),
                          const SizedBox(height: 12),
                          SizedBox(
                            width: double.infinity,
                            height: 54,
                            child: ElevatedButton.icon(
                              onPressed: _checkingOut ? null : _checkout,
                              icon: const Icon(Icons.refresh),
                              label: const Text('Retry order'),
                            ),
                          ),
                        ],
                      ),
                    ),
                  ],
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
                    height: 58,
                    child: ElevatedButton.icon(
                      onPressed: _checkingOut ? null : (_hasSelectedProject ? _checkout : _selectProject),
                      icon: Icon(_hasSelectedProject ? Icons.check_circle_outline : Icons.folder_open),
                      label: Text(
                        _checkingOut
                            ? 'Submitting…'
                            : (_hasSelectedProject ? 'Place order now' : 'Select project first'),
                      ),
                    ),
                  ),
                ]),
              ),
            ),
    );
  }
}
