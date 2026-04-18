import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../app_scope.dart';
import '../cubits/language_cubit.dart';
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
  String _search = '';
  final _searchCtrl = TextEditingController();

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
      case 'approved':         return const Color(0xFF065F46);
      case 'delivered':        return const Color(0xFF1E40AF);
      case 'rejected':         return const Color(0xFFB0210C);
      case 'pending_approval': return const Color(0xFF92400E);
      case 'ordered':
      case 'in_transit':       return CColors.teal;
      default:                 return const Color(0xFF0369A1);
    }
  }

  Color _statusBg(String s) {
    switch (s) {
      case 'approved':         return const Color(0xFFD1FAE5);
      case 'delivered':        return const Color(0xFFDBEAFE);
      case 'rejected':         return const Color(0xFFFEE2E2);
      case 'pending_approval': return const Color(0xFFFEF3C7);
      case 'ordered':
      case 'in_transit':       return CColors.tealLighter;
      default:                 return const Color(0xFFE0F2FE);
    }
  }

  Color _statusBorder(String s) {
    switch (s) {
      case 'approved':         return const Color(0xFF6EE7B7);
      case 'delivered':        return const Color(0xFF93C5FD);
      case 'rejected':         return const Color(0xFFFCA5A5);
      case 'pending_approval': return const Color(0xFFFCD34D);
      case 'ordered':
      case 'in_transit':       return CColors.tealLight;
      default:                 return const Color(0xFF7DD3FC);
    }
  }

  String _statusLabel(BuildContext context, String s) {
    switch (s) {
      case 'draft':            return t(context, 'statusDraft');
      case 'pending_approval': return t(context, 'statusPending');
      case 'approved':         return t(context, 'statusApproved');
      case 'ordered':          return t(context, 'statusOrdered');
      case 'in_transit':       return t(context, 'statusInTransit');
      case 'delivered':        return t(context, 'statusDelivered');
      case 'rejected':         return t(context, 'statusRejected');
      default:                 return s;
    }
  }

  String _filterLabel(BuildContext context, String key) {
    switch (key) {
      case 'all':              return t(context, 'filterAll');
      case 'pending_approval': return t(context, 'filterPending');
      case 'approved':         return t(context, 'filterApproved');
      case 'ordered':          return t(context, 'statusOrdered');
      case 'delivered':        return t(context, 'filterDelivered');
      case 'rejected':         return t(context, 'statusRejected');
      default:                 return key;
    }
  }

  @override
  Widget build(BuildContext context) {
    final currentLang = context.watch<LanguageCubit>().state;
    final currentFlag = kLangs.firstWhere((l) => l.code == currentLang, orElse: () => kLangs[0]).flag;

    return Scaffold(
      backgroundColor: CColors.bg,
      body: SafeArea(
        child: Column(children: [
          // ── Header (large title + language globe) ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 10),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(t(context, 'myOrders'),
                    style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700,
                        color: Color(0xFF1A1A1A), letterSpacing: -0.5)),
                Material(
                  color: CColors.tealLighter,
                  borderRadius: BorderRadius.circular(20),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(20),
                    onTap: () => context.push('/c-language'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(20),
                        border: Border.all(color: CColors.tealLight),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        const Icon(Icons.language, size: 16, color: CColors.teal),
                        const SizedBox(width: 6),
                        Text(currentFlag, style: const TextStyle(fontSize: 14)),
                      ]),
                    ),
                  ),
                ),
              ],
            ),
          ),

          // ── Project selector ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t(context, 'projectLabel'),
                  style: const TextStyle(fontSize: 12, color: Colors.black45, fontWeight: FontWeight.w500)),
              const SizedBox(height: 5),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: const Color(0xFFE0E0E0)),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 3)],
                ),
                child: Row(children: [
                  const Expanded(child: Text('904231 – Brücke St. Gallen',
                      style: TextStyle(fontSize: 15, color: Color(0xFF1A1A1A)))),
                  const Icon(Icons.keyboard_arrow_down, color: Colors.black38),
                ]),
              ),
            ]),
          ),

          // ── Filter chips ──
          SizedBox(
            height: 42,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16),
              children: _filterKeys.map((key) => Padding(
                padding: const EdgeInsets.only(right: 6),
                child: FilterChip(
                  label: Text(_filterLabel(context, key)),
                  selected: _filter == key,
                  onSelected: (_) => setState(() => _filter = key),
                  selectedColor: CColors.teal,
                  labelStyle: TextStyle(
                    color: _filter == key ? Colors.white : Colors.black54,
                    fontWeight: _filter == key ? FontWeight.w600 : FontWeight.normal,
                    fontSize: 13,
                  ),
                  showCheckmark: false,
                  backgroundColor: Colors.white,
                  side: BorderSide(color: _filter == key ? CColors.teal : Colors.grey.shade300),
                ),
              )).toList(),
            ),
          ),

          const SizedBox(height: 8),

          // ── Section title ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 4, 16, 10),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(t(context, 'myOrders'),
                  style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: CColors.teal)),
            ),
          ),

          // ── Search ──
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t(context, 'searchLabel'),
                  style: const TextStyle(fontSize: 12, color: Colors.black45, fontWeight: FontWeight.w500)),
              const SizedBox(height: 5),
              TextField(
                controller: _searchCtrl,
                onChanged: (v) => setState(() => _search = v.toLowerCase()),
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search, color: Colors.black38),
                  hintText: t(context, 'searchOrders'),
                  border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  contentPadding: EdgeInsets.zero,
                  filled: true, fillColor: Colors.white,
                ),
              ),
            ]),
          ),

          // ── Order list ──
          Expanded(
            child: FutureBuilder<List<Map<String, dynamic>>>(
              future: _future,
              builder: (_, snap) {
                if (!snap.hasData) return const Center(child: CircularProgressIndicator(color: CColors.teal));
                var orders = snap.data!;
                if (_filter != 'all') orders = orders.where((o) => o['status'] == _filter).toList();
                if (_search.isNotEmpty) {
                  orders = orders.where((o) {
                    final id = (o['id'] as String? ?? '').toLowerCase();
                    final title = (o['title'] as String? ?? '').toLowerCase();
                    return id.contains(_search) || title.contains(_search);
                  }).toList();
                }
                if (orders.isEmpty) {
                  return Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                    const Icon(Icons.receipt_long_outlined, size: 48, color: Colors.black26),
                    const SizedBox(height: 12),
                    Text(t(context, 'noOrdersFound'), style: const TextStyle(color: Colors.black45)),
                  ]));
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
                      statusBg: _statusBg(orders[i]['status'] as String? ?? ''),
                      statusBorder: _statusBorder(orders[i]['status'] as String? ?? ''),
                      statusLabel: _statusLabel(context, orders[i]['status'] as String? ?? ''),
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
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({
    required this.order,
    required this.statusColor,
    required this.statusBg,
    required this.statusBorder,
    required this.statusLabel,
    required this.onTap,
  });
  final Map<String, dynamic> order;
  final Color statusColor, statusBg, statusBorder;
  final String statusLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final id = (order['id'] as String? ?? '').substring(0, 8).toUpperCase();
    final total = order['total_amount'] as String? ?? '0.00';
    final currency = order['currency'] as String? ?? 'EUR';
    final items = List.from((order['items'] as List?) ?? []);
    final title = order['title'] as String? ?? '${items.length} ${t(context, 'items')}';
    final supplier = order['supplier'] as String? ?? '';
    final project = order['project'] as String? ?? '';
    final delivery = order['delivery_date'] as String? ?? '';
    final created = order['created_at'] as String? ?? '';

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
            boxShadow: [
              BoxShadow(color: Colors.black.withValues(alpha: 0.07), blurRadius: 6),
              BoxShadow(color: Colors.black.withValues(alpha: 0.04), blurRadius: 0, spreadRadius: 1),
            ],
          ),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            // ── Top row: status + date ──
            Row(children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                decoration: BoxDecoration(
                  color: statusBg,
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: statusBorder),
                ),
                child: Text(statusLabel,
                    style: TextStyle(color: statusColor, fontWeight: FontWeight.w600, fontSize: 12)),
              ),
              const Spacer(),
              if (created.isNotEmpty)
                Text('${t(context, 'createdAt')} $created',
                    style: const TextStyle(fontSize: 11, color: Colors.black38)),
            ]),
            const SizedBox(height: 8),

            // ── Title ──
            Text(title,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: CColors.teal)),
            const SizedBox(height: 8),

            // ── Meta grid ──
            Wrap(spacing: 16, runSpacing: 4, children: [
              _MetaChip(icon: Icons.receipt_outlined, text: id),
              if (project.isNotEmpty)
                _MetaChip(icon: Icons.location_on_outlined, text: project.split('–').last.trim()),
              if (supplier.isNotEmpty)
                _MetaChip(icon: Icons.business_outlined, text: supplier),
              if (delivery.isNotEmpty)
                _MetaChip(icon: Icons.local_shipping_outlined, text: delivery),
            ]),

            // ── Total ──
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.only(top: 8),
              decoration: const BoxDecoration(
                border: Border(top: BorderSide(color: Color(0x1A000000))),
              ),
              child: Align(
                alignment: Alignment.centerRight,
                child: Text('$currency $total',
                    style: const TextStyle(fontWeight: FontWeight.w600, color: CColors.teal, fontSize: 13)),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.text});
  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Row(
    mainAxisSize: MainAxisSize.min,
    children: [
      Icon(icon, size: 13, color: Colors.black38),
      const SizedBox(width: 5),
      Text(text, style: const TextStyle(fontSize: 12, color: Colors.black54)),
    ],
  );
}
