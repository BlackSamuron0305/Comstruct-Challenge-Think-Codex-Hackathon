import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_scope.dart';
import '../order_events.dart';
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
  String _search = '';
  final _searchCtrl = TextEditingController();

  static const _filters = <String, String>{
    'all':             'Alle',
    'pending_approval':'Ausstehend',
    'approved':        'Genehmigt',
    'ordered':         'Bestellt',
    'delivered':       'Geliefert',
    'rejected':        'Abgelehnt',
  };

  @override
  void initState() {
    super.initState();
    _load();
    _setupWs();
  }

  void _load() => setState(() => _future = AppScope.api.orders());

  void _setupWs() {
    final token = AppScope.api.tokens.access;
    if (token == null) return;
    _events = OrderEventStream(wsBaseUrl: AppScope.api.baseUrl, token: token)..connect();
    _events!.stream.listen((_) => _load());
  }

  @override
  void dispose() {
    _events?.close();
    _searchCtrl.dispose();
    super.dispose();
  }

  Color _statusColor(String s) {
    switch (s) {
      case 'approved':          return const Color(0xFF1F8A4C);
      case 'delivered':         return const Color(0xFF1D6FA4);
      case 'rejected':          return const Color(0xFFB0210C);
      case 'pending_approval':  return const Color(0xFFD97706);
      case 'ordered':
      case 'in_transit':        return CColors.teal;
      default:                  return Colors.black45;
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'draft':             return 'Entwurf';
      case 'pending_approval':  return 'Ausstehend';
      case 'approved':          return 'Genehmigt';
      case 'ordered':           return 'Bestellt';
      case 'in_transit':        return 'Unterwegs';
      case 'delivered':         return 'Geliefert';
      case 'rejected':          return 'Abgelehnt';
      default:                  return s;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        title: const Text('Meine Bestellungen'),
      ),
      body: Column(children: [
        // Filter chips
        SizedBox(
          height: 48,
          child: ListView(
            scrollDirection: Axis.horizontal,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            children: _filters.entries.map((e) => Padding(
              padding: const EdgeInsets.only(right: 6),
              child: FilterChip(
                label: Text(e.value),
                selected: _filter == e.key,
                onSelected: (_) => setState(() => _filter = e.key),
                selectedColor: CColors.teal,
                labelStyle: TextStyle(
                  color: _filter == e.key ? Colors.white : Colors.black54,
                  fontWeight: _filter == e.key ? FontWeight.w600 : FontWeight.normal,
                  fontSize: 13,
                ),
                showCheckmark: false,
                backgroundColor: Colors.white,
                side: BorderSide(color: _filter == e.key ? CColors.teal : Colors.grey.shade300),
              ),
            )).toList(),
          ),
        ),

        // Search
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 4, 16, 8),
          child: TextField(
            controller: _searchCtrl,
            onChanged: (v) => setState(() => _search = v.toLowerCase()),
            decoration: InputDecoration(
              prefixIcon: const Icon(Icons.search, color: Colors.black38),
              hintText: 'Bestellungen suchen…',
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide(color: Colors.grey.shade300),
              ),
              contentPadding: const EdgeInsets.symmetric(vertical: 0),
            ),
          ),
        ),

        // Orders list
        Expanded(
          child: FutureBuilder<List<Map<String, dynamic>>>(
            future: _future,
            builder: (_, snap) {
              if (!snap.hasData) return const Center(child: CircularProgressIndicator(color: CColors.teal));
              var orders = snap.data!;

              // Filter by status
              if (_filter != 'all') orders = orders.where((o) => o['status'] == _filter).toList();

              // Filter by search
              if (_search.isNotEmpty) {
                orders = orders.where((o) {
                  final id = (o['id'] as String? ?? '').toLowerCase();
                  return id.contains(_search);
                }).toList();
              }

              if (orders.isEmpty) {
                return const Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.receipt_long_outlined, size: 48, color: Colors.black26),
                    SizedBox(height: 12),
                    Text('Keine Bestellungen gefunden', style: TextStyle(color: Colors.black45)),
                  ]),
                );
              }

              return RefreshIndicator(
                onRefresh: () async => _load(),
                child: ListView.separated(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 24),
                  itemCount: orders.length,
                  separatorBuilder: (_, __) => const SizedBox(height: 10),
                  itemBuilder: (_, i) => _OrderCard(
                    order: orders[i],
                    statusColor: _statusColor(orders[i]['status'] as String? ?? ''),
                    statusLabel: _statusLabel(orders[i]['status'] as String? ?? ''),
                    onTap: () => Navigator.of(context).push(MaterialPageRoute(
                      builder: (_) => OrderDetailScreen(order: orders[i]),
                    )),
                  ),
                ),
              );
            },
          ),
        ),
      ]),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({required this.order, required this.statusColor, required this.statusLabel, required this.onTap});
  final Map<String, dynamic> order;
  final Color statusColor;
  final String statusLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final id = (order['id'] as String? ?? '').substring(0, 8).toUpperCase();
    final total = order['total_amount'] as String? ?? '0.00';
    final currency = order['currency'] as String? ?? 'CHF';
    final items = List.from((order['items'] as List?) ?? []);

    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: const Color(0xFFE1E7EE)),
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                decoration: BoxDecoration(
                  color: statusColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: statusColor.withValues(alpha: 0.3)),
                ),
                child: Text(statusLabel,
                    style: TextStyle(color: statusColor, fontWeight: FontWeight.w600, fontSize: 12)),
              ),
              const Spacer(),
              Text('$total $currency',
                  style: const TextStyle(fontWeight: FontWeight.w700, color: CColors.teal, fontSize: 15)),
            ]),
            const SizedBox(height: 10),
            Row(children: [
              const Icon(Icons.receipt_outlined, size: 14, color: Colors.black38),
              const SizedBox(width: 6),
              Text(id, style: const TextStyle(color: Colors.black54, fontSize: 13)),
              const SizedBox(width: 12),
              const Icon(Icons.shopping_bag_outlined, size: 14, color: Colors.black38),
              const SizedBox(width: 6),
              Text('${items.length} Artikel', style: const TextStyle(color: Colors.black54, fontSize: 13)),
            ]),
            const SizedBox(height: 6),
            Row(children: [
              const Icon(Icons.chevron_right, size: 16, color: CColors.teal),
              const SizedBox(width: 2),
              const Text('Details anzeigen',
                  style: TextStyle(color: CColors.teal, fontSize: 13, fontWeight: FontWeight.w500)),
            ]),
          ]),
        ),
      ),
    );
  }
}
