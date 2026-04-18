import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'c_home_screen.dart' show CColors;

class OrderDetailScreen extends StatelessWidget {
  const OrderDetailScreen({super.key, required this.order});
  final Map<String, dynamic> order;

  static const _steps = [
    'draft', 'pending_approval', 'approved', 'ordered', 'in_transit', 'delivered',
  ];
  static const _stepLabels = [
    'Entwurf', 'Genehmigung ausstehend', 'Genehmigt', 'Bestellt', 'Unterwegs', 'Geliefert',
  ];

  Color _statusColor(String s) {
    switch (s) {
      case 'approved':  return const Color(0xFF1F8A4C);
      case 'delivered': return const Color(0xFF1D6FA4);
      case 'rejected':  return const Color(0xFFB0210C);
      case 'pending_approval': return const Color(0xFFD97706);
      default: return Colors.black45;
    }
  }

  String _statusLabel(String s) {
    switch (s) {
      case 'draft':            return 'Entwurf';
      case 'pending_approval': return 'Genehmigung ausstehend';
      case 'approved':         return 'Genehmigt';
      case 'ordered':          return 'Bestellt';
      case 'in_transit':       return 'Unterwegs';
      case 'delivered':        return 'Geliefert';
      case 'rejected':         return 'Abgelehnt';
      default:                 return s;
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = order['status'] as String? ?? 'draft';
    final total  = order['total_amount'] as String? ?? '0.00';
    final currency = order['currency'] as String? ?? 'CHF';
    final id = (order['id'] as String? ?? '').substring(0, 8).toUpperCase();
    final items = List<Map<String, dynamic>>.from((order['items'] as List?) ?? []);
    final activeStep = _steps.indexOf(status).clamp(0, _steps.length - 1);
    final rejected = status == 'rejected';
    final rejectionReason = order['rejection_reason'] as String?;

    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        title: Text('Bestellung $id'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/c-orders'),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.only(bottom: 32),
        children: [
          // Hero card
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
            child: Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: const Color(0xFFE1E7EE)),
              ),
              padding: const EdgeInsets.all(16),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
                    decoration: BoxDecoration(
                      color: rejected ? const Color(0xFFFFEBEB) : _statusColor(status).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: _statusColor(status).withValues(alpha: 0.3)),
                    ),
                    child: Text(_statusLabel(status),
                        style: TextStyle(color: _statusColor(status), fontWeight: FontWeight.w600, fontSize: 13)),
                  ),
                  const Spacer(),
                  Text('$total $currency',
                      style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: CColors.teal)),
                ]),

                if (rejectionReason != null) ...[
                  const SizedBox(height: 10),
                  Container(
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: const Color(0xFFFFEBEB),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Row(children: [
                      const Icon(Icons.info_outline, color: Color(0xFFB0210C), size: 16),
                      const SizedBox(width: 8),
                      Expanded(child: Text(rejectionReason,
                          style: const TextStyle(color: Color(0xFFB0210C), fontSize: 13))),
                    ]),
                  ),
                ],

                const SizedBox(height: 12),
                if (order['notes'] != null)
                  _InfoRow(icon: Icons.notes_outlined, text: order['notes'] as String),
                if (order['requested_delivery'] != null)
                  _InfoRow(icon: Icons.calendar_today_outlined, text: 'Lieferung: ${order['requested_delivery']}'),
              ]),
            ),
          ),

          // Items
          if (items.isNotEmpty) ...[
            _SectionLabel(label: 'Bestellpositionen (${items.length})'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFE1E7EE)),
                ),
                child: Column(
                  children: items.asMap().entries.map((entry) {
                    final i = entry.key;
                    final item = entry.value;
                    final snapshot = Map<String, dynamic>.from(
                        (item['product_snapshot'] as Map?) ?? {});
                    final name = snapshot['name'] as String? ?? '—';
                    final qty  = item['quantity'];
                    final unit = item['unit'] as String? ?? 'Stk';
                    final price = item['line_total'] as String? ?? '0.00';

                    return Column(children: [
                      Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                        child: Row(children: [
                          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Text(name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
                            const SizedBox(height: 2),
                            Text('$qty × $unit', style: const TextStyle(color: Colors.black45, fontSize: 12)),
                          ])),
                          Text('CHF $price',
                              style: const TextStyle(fontWeight: FontWeight.w600, color: CColors.teal, fontSize: 14)),
                        ]),
                      ),
                      if (i < items.length - 1)
                        const Divider(height: 0, indent: 16, endIndent: 16),
                    ]);
                  }).toList(),
                ),
              ),
            ),
          ],

          // Status tracker
          if (!rejected) ...[
            _SectionLabel(label: 'Status'),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Column(
                children: List.generate(_steps.length, (i) {
                  final done   = i < activeStep;
                  final active = i == activeStep;
                  final future = i > activeStep;
                  return Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Column(children: [
                      AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        width: 24, height: 24,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: done || active ? CColors.teal : const Color(0xFFDCDCDC),
                          border: active ? Border.all(color: CColors.teal, width: 3) : null,
                          boxShadow: active ? [const BoxShadow(color: CColors.tealLight, blurRadius: 8, spreadRadius: 2)] : [],
                        ),
                        child: done
                            ? const Icon(Icons.check, color: Colors.white, size: 14)
                            : active
                                ? Center(child: Container(width: 8, height: 8, decoration: const BoxDecoration(color: Colors.white, shape: BoxShape.circle)))
                                : null,
                      ),
                      if (i < _steps.length - 1)
                        Container(width: 2, height: 28, color: done ? CColors.teal : const Color(0xFFDCDCDC)),
                    ]),
                    const SizedBox(width: 14),
                    Padding(
                      padding: EdgeInsets.only(top: 2, bottom: i < _steps.length - 1 ? 12 : 0),
                      child: Text(
                        _stepLabels[i],
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: active ? FontWeight.w700 : done ? FontWeight.w500 : FontWeight.w400,
                          color: future ? Colors.black38 : const Color(0xFF1A1A1A),
                        ),
                      ),
                    ),
                  ]);
                }),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.text});
  final IconData icon;
  final String text;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 6),
    child: Row(children: [
      Icon(icon, size: 15, color: Colors.black38),
      const SizedBox(width: 8),
      Expanded(child: Text(text, style: const TextStyle(color: Colors.black54, fontSize: 13))),
    ]),
  );
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 10),
    child: Row(children: [
      const Expanded(child: Divider()),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Text(label, style: const TextStyle(color: Colors.black38, fontSize: 12)),
      ),
      const Expanded(child: Divider()),
    ]),
  );
}
