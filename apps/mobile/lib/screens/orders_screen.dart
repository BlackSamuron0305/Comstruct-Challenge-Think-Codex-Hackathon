import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shimmer/shimmer.dart';

import '../app_scope.dart';
import '../order_events.dart';
import '../theme.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});
  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  late Future<List<Map<String, dynamic>>> _future;
  OrderEventStream? _events;

  @override
  void initState() {
    super.initState();
    _future = AppScope.api.orders();
    final token = AppScope.api.tokens.access;
    if (token != null) {
      _events = OrderEventStream(
        wsBaseUrl: AppScope.api.baseUrl,
        token: token,
      )..connect();
      _events!.stream.listen((_) => setState(() {
            _future = AppScope.api.orders();
          }));
    }
  }

  @override
  void dispose() {
    _events?.close();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() {
      _future = AppScope.api.orders();
    });
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'pending_approval': return 'Pending Approval';
      case 'approved': return 'Approved';
      case 'rejected': return 'Rejected';
      case 'ordered': return 'Ordered';
      case 'in_transit': return 'In Transit';
      case 'delivered': return 'Delivered';
      case 'draft': return 'Draft';
      default: return s;
    }
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'pending_approval':
        return ComstructColors.warn;
      case 'rejected':
        return ComstructColors.err;
      case 'delivered':
        return ComstructColors.ok;
      case 'approved':
        return ComstructColors.ok;
      case 'in_transit':
      case 'ordered':
        return ComstructColors.brand;
      default:
        return Colors.black54;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Orders'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/catalog'),
        ),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: _future,
          builder: (_, snap) {
            if (snap.hasError) return Center(child: Text('Error: ${snap.error}'));
            if (!snap.hasData) return _buildShimmerList();
            final list = snap.data!;
            if (list.isEmpty) {
              return ListView(
                physics: const AlwaysScrollableScrollPhysics(),
                children: const [SizedBox(height: 120), Center(child: Text('No orders yet.'))],
              );
            }
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.all(12),
              itemCount: list.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) {
                final o = list[i];
                final status = o['status'] as String;
                return Card(
                  child: ListTile(
                    title: Text('Order ${(o['id'] as String).substring(0, 8)}'),
                    subtitle: Text('${o['total_amount']} ${o['currency']}'),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: _statusColor(status).withValues(alpha: 0.15),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        _statusLabel(status),
                        style: TextStyle(color: _statusColor(status), fontWeight: FontWeight.w600, fontSize: 12),
                      ),
                    ),
                  ),
                );
              },
            );
          },
        ),
      ),
    );
  }

  Widget _buildShimmerList() {
    return Shimmer.fromColors(
      baseColor: Colors.grey[300]!,
      highlightColor: Colors.grey[100]!,
      child: ListView.builder(
        padding: const EdgeInsets.all(12),
        itemCount: 6,
        itemBuilder: (_, __) => Padding(
          padding: const EdgeInsets.only(bottom: 10),
          child: Container(height: 64, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12))),
        ),
      ),
    );
  }
}
