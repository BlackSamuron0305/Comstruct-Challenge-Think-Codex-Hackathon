import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../order_events.dart';
import '../translations.dart';
import 'c_home_screen.dart' show CColors;
import 'order_detail_screen.dart';

class MyOrdersScreen extends StatefulWidget {
  const MyOrdersScreen({super.key});

  @override
  State<MyOrdersScreen> createState() => _MyOrdersScreenState();
}

class _MyOrdersScreenState extends State<MyOrdersScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  OrderEventStream? _events;
  String _filter = 'all';

  static const _filterKeys = [
    'all',
    'pending_approval',
    'approved',
    'ordered',
    'delivered',
    'rejected',
  ];

  @override
  void initState() {
    super.initState();
    _future = AppScope.api.orders();
    _setupWs();
  }

  void _load() {
    if (!mounted) {
      _future = AppScope.api.orders();
      return;
    }
    setState(() {
      _future = AppScope.api.orders();
    });
  }

  void _setupWs() {
    final token = AppScope.api.tokens.access;
    if (token == null) return;
    _events = OrderEventStream(wsBaseUrl: AppScope.api.baseUrl, token: token)..connect();
    _events!.stream.listen((_) => _load());
  }

  @override
  void dispose() {
    _events?.close();
    super.dispose();
  }

  String _statusLabel(BuildContext context, String value) {
    switch (value) {
      case 'draft':
        return t(context, 'statusDraft');
      case 'pending_approval':
        return t(context, 'statusPending');
      case 'approved':
        return t(context, 'statusApproved');
      case 'ordered':
        return t(context, 'statusOrdered');
      case 'in_transit':
        return t(context, 'statusInTransit');
      case 'delivered':
        return t(context, 'statusDelivered');
      case 'rejected':
        return t(context, 'statusRejected');
      default:
        return value;
    }
  }

  String _filterLabel(BuildContext context, String key) {
    switch (key) {
      case 'all':
        return t(context, 'filterAll');
      case 'pending_approval':
        return t(context, 'filterPending');
      case 'approved':
        return t(context, 'filterApproved');
      case 'ordered':
        return t(context, 'statusOrdered');
      case 'delivered':
        return t(context, 'filterDelivered');
      case 'rejected':
        return t(context, 'statusRejected');
      default:
        return key;
    }
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'approved':
        return const Color(0xFF0E8D57);
      case 'delivered':
        return const Color(0xFF2563EB);
      case 'rejected':
        return const Color(0xFFB42318);
      case 'pending_approval':
        return const Color(0xFFB7791F);
      case 'ordered':
      case 'in_transit':
        return CColors.teal;
      default:
        return const Color(0xFF475467);
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'approved':
        return Icons.verified_outlined;
      case 'delivered':
        return Icons.local_shipping_outlined;
      case 'rejected':
        return Icons.cancel_outlined;
      case 'pending_approval':
        return Icons.hourglass_top_rounded;
      case 'ordered':
      case 'in_transit':
        return Icons.sync_alt_rounded;
      default:
        return Icons.receipt_long_outlined;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 16, 0),
              child: Row(
                children: [
                  IconButton(
                    icon: const Icon(Icons.arrow_back, color: CColors.tealDark),
                    onPressed: () => context.canPop() ? context.pop() : context.go('/c-home'),
                  ),
                  const Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'Order status',
                          style: TextStyle(fontSize: 30, fontWeight: FontWeight.w800, color: CColors.tealDark),
                        ),
                        SizedBox(height: 4),
                        Text(
                          'Large status cards only — no clutter.',
                          style: TextStyle(fontSize: 14, color: Colors.black54),
                        ),
                      ],
                    ),
                  ),
                  Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(16),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(16),
                      onTap: () => context.push('/c-profile'),
                      child: const SizedBox(
                        width: 48,
                        height: 48,
                        child: Icon(Icons.person_outline, color: CColors.tealDark, size: 26),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 12),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Wrap(
                spacing: 8,
                runSpacing: 8,
                children: _filterKeys
                    .map(
                      (key) => ChoiceChip(
                        label: Padding(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 8),
                          child: Text(_filterLabel(context, key)),
                        ),
                        selected: _filter == key,
                        onSelected: (_) => setState(() => _filter = key),
                        selectedColor: CColors.teal,
                        backgroundColor: Colors.white,
                        labelStyle: TextStyle(
                          color: _filter == key ? Colors.white : Colors.black87,
                          fontWeight: FontWeight.w700,
                          fontSize: 14,
                        ),
                        side: BorderSide(color: _filter == key ? CColors.teal : Colors.grey.shade300),
                        showCheckmark: false,
                      ),
                    )
                    .toList(),
              ),
            ),
            const SizedBox(height: 10),
            Expanded(
              child: FutureBuilder<List<Map<String, dynamic>>>(
                future: _future,
                builder: (_, snap) {
                  if (!snap.hasData) {
                    return const Center(
                      child: Padding(
                        padding: EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            CircularProgressIndicator(color: CColors.teal),
                            SizedBox(height: 12),
                            Text(
                              'Refreshing your live order status…',
                              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: CColors.tealDark),
                            ),
                            SizedBox(height: 4),
                            Text(
                              'New approvals and delivery updates appear here automatically.',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 13, color: Colors.black54),
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  var orders = snap.data!;
                  if (_filter != 'all') {
                    orders = orders.where((order) => order['status'] == _filter).toList();
                  }

                  if (orders.isEmpty) {
                    return Center(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.receipt_long_outlined, size: 56, color: Colors.black26),
                            const SizedBox(height: 12),
                            Text(
                              t(context, 'noOrdersFound'),
                              style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 8),
                            const Text(
                              'Start with a photo, voice note, or catalog item and the status will appear here automatically.',
                              textAlign: TextAlign.center,
                              style: TextStyle(fontSize: 14, color: Colors.black54),
                            ),
                            const SizedBox(height: 14),
                            Wrap(
                              spacing: 10,
                              runSpacing: 10,
                              alignment: WrapAlignment.center,
                              children: [
                                ElevatedButton.icon(
                                  onPressed: () => context.go('/c-photo'),
                                  icon: const Icon(Icons.camera_alt_outlined),
                                  label: const Text('Start photo order'),
                                ),
                                OutlinedButton.icon(
                                  onPressed: () => context.go('/c-catalog'),
                                  icon: const Icon(Icons.inventory_2_outlined),
                                  label: const Text('Browse catalog'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                    );
                  }

                  return RefreshIndicator(
                    onRefresh: () async => _load(),
                    child: ListView.separated(
                      padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                      itemCount: orders.length,
                      separatorBuilder: (_, __) => const SizedBox(height: 12),
                      itemBuilder: (_, i) => _StatusCard(
                        order: orders[i],
                        statusLabel: _statusLabel(context, orders[i]['status'] as String? ?? ''),
                        statusColor: _statusColor(orders[i]['status'] as String? ?? ''),
                        statusIcon: _statusIcon(orders[i]['status'] as String? ?? ''),
                        onTap: () => Navigator.of(context).push(
                          MaterialPageRoute(builder: (_) => OrderDetailScreen(order: orders[i])),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusCard extends StatelessWidget {
  const _StatusCard({
    required this.order,
    required this.statusLabel,
    required this.statusColor,
    required this.statusIcon,
    required this.onTap,
  });

  final Map<String, dynamic> order;
  final String statusLabel;
  final Color statusColor;
  final IconData statusIcon;
  final VoidCallback onTap;

  String _shortId(String raw) {
    if (raw.length <= 8) return raw.toUpperCase();
    return raw.substring(0, 8).toUpperCase();
  }

  @override
  Widget build(BuildContext context) {
    final id = _shortId((order['id'] as String?) ?? 'ORDER');
    final created = (order['created_at'] as String?) ?? '';
    final items = List.from((order['items'] as List?) ?? []);

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: const Color(0xFFE1E7EE)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 12,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Order $id', style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
          if (created.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(created, style: const TextStyle(fontSize: 13, color: Colors.black54)),
          ],
          const SizedBox(height: 12),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
            decoration: BoxDecoration(
              color: statusColor.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              children: [
                Icon(statusIcon, color: statusColor, size: 26),
                const SizedBox(width: 10),
                Expanded(
                  child: Text(
                    statusLabel,
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: statusColor),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          Text(
            items.isEmpty ? 'Tap to view the timeline and delivery progress.' : '${items.length} item(s) in this order.',
            style: const TextStyle(fontSize: 14, color: Colors.black54),
          ),
          const SizedBox(height: 12),
          SizedBox(
            width: double.infinity,
            height: 56,
            child: OutlinedButton.icon(
              onPressed: onTap,
              style: OutlinedButton.styleFrom(
                side: const BorderSide(color: CColors.teal, width: 1.5),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
              ),
              icon: const Icon(Icons.visibility_outlined),
              label: const Text('View status'),
            ),
          ),
        ],
      ),
    );
  }
}
