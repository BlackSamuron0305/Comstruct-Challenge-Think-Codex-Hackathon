import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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

  Color _statusColor(String s) {
    switch (s) {
      case 'pending_approval':
        return ComstructColors.warn;
      case 'rejected':
        return ComstructColors.err;
      case 'delivered':
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
        title: const Text('Bestellungen'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/catalog'),
        ),
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (_, snap) {
          if (!snap.hasData) return const Center(child: CircularProgressIndicator());
          final list = snap.data!;
          if (list.isEmpty) {
            return const Center(child: Text('Keine Bestellungen.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.all(12),
            itemCount: list.length,
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemBuilder: (_, i) {
              final o = list[i];
              final status = o['status'] as String;
              return Card(
                child: ListTile(
                  title: Text('Bestellung ${(o['id'] as String).substring(0, 8)}'),
                  subtitle: Text('${o['total_amount']} ${o['currency']}'),
                  trailing: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: _statusColor(status).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text(status, style: TextStyle(color: _statusColor(status), fontWeight: FontWeight.w600)),
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
