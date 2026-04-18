import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../translations.dart';
import 'c_home_screen.dart' show CColors;

class OrderDetailScreen extends StatefulWidget {
  const OrderDetailScreen({super.key, required this.order});
  final Map<String, dynamic> order;

  @override
  State<OrderDetailScreen> createState() => _OrderDetailScreenState();
}

class _OrderDetailScreenState extends State<OrderDetailScreen> {
  File? _deliveryPhoto;
  final _picker = ImagePicker();

  static const _steps = [
    'draft', 'pending_approval', 'approved', 'ordered', 'in_transit', 'delivered',
  ];
  static const _stepKeys = [
    'stepDraft', 'stepPending', 'statusApproved', 'stepOrdered', 'statusInTransit', 'stepDelivered',
  ];

  Color _statusColor(String s) {
    switch (s) {
      case 'approved':         return const Color(0xFF1F8A4C);
      case 'delivered':        return const Color(0xFF1D6FA4);
      case 'rejected':         return const Color(0xFFB0210C);
      case 'pending_approval': return const Color(0xFFD97706);
      default:                 return Colors.black45;
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

  Future<void> _pickPhoto(ImageSource source) async {
    final img = await _picker.pickImage(source: source, imageQuality: 80);
    if (img != null) setState(() => _deliveryPhoto = File(img.path));
  }

  void _showPhotoOptions() {
    showModalBottomSheet(context: context, builder: (sheetCtx) => SafeArea(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        ListTile(
          leading: const Icon(Icons.camera_alt_outlined),
          title: Text(t(context, 'photoOrder')),
          onTap: () { Navigator.pop(sheetCtx); _pickPhoto(ImageSource.camera); },
        ),
        ListTile(
          leading: const Icon(Icons.photo_library_outlined),
          title: Text(t(context, 'photoUpload')),
          onTap: () { Navigator.pop(sheetCtx); _pickPhoto(ImageSource.gallery); },
        ),
      ]),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final order = widget.order;
    final status   = order['status'] as String? ?? 'draft';
    final total    = order['total_amount'] as String? ?? '0.00';
    final currency = order['currency'] as String? ?? 'EUR';
    final id       = (order['id'] as String? ?? '').substring(0, 8).toUpperCase();
    final items    = List<Map<String, dynamic>>.from((order['items'] as List?) ?? []);
    final activeStep   = _steps.indexOf(status).clamp(0, _steps.length - 1);
    final isDelivered  = status == 'delivered';
    final isRejected   = status == 'rejected';
    final rejectionReason = order['rejection_reason'] as String?;

    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        title: Text('${t(context, 'navOrders')} $id'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
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
                      color: _statusColor(status).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(20),
                      border: Border.all(color: _statusColor(status).withValues(alpha: 0.3)),
                    ),
                    child: Text(_statusLabel(context, status),
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
                if (order['notes'] != null) ...[
                  const SizedBox(height: 10),
                  Row(children: [
                    const Icon(Icons.notes_outlined, size: 15, color: Colors.black38),
                    const SizedBox(width: 8),
                    Expanded(child: Text(order['notes'] as String,
                        style: const TextStyle(color: Colors.black54, fontSize: 13))),
                  ]),
                ],
              ]),
            ),
          ),

          // Items
          if (items.isNotEmpty) ...[
            _sectionLabel('${t(context, 'orderItems')} (${items.length})'),
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
                    final snapshot = Map<String, dynamic>.from((item['product_snapshot'] as Map?) ?? {});
                    final name  = snapshot['name'] as String? ?? '—';
                    final qty   = item['quantity'];
                    final unit  = item['unit'] as String? ?? 'Stk';
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
                          Text('EUR $price',
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
          if (!isRejected) ...[
            _sectionLabel(t(context, 'status')),
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
                      child: Text(t(context, _stepKeys[i]),
                          style: TextStyle(
                            fontSize: 14,
                            fontWeight: active ? FontWeight.w700 : done ? FontWeight.w500 : FontWeight.w400,
                            color: future ? Colors.black38 : const Color(0xFF1A1A1A),
                          )),
                    ),
                  ]);
                }),
              ),
            ),
          ],

          // ── Delivery note photo (only for delivered orders) ────────
          if (isDelivered) ...[
            _sectionLabel(t(context, 'deliveryNotePhoto')),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _deliveryPhoto != null
                  ? Stack(children: [
                      ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.file(_deliveryPhoto!,
                            width: double.infinity, height: 220, fit: BoxFit.cover),
                      ),
                      Positioned(
                        top: 8, right: 8,
                        child: GestureDetector(
                          onTap: () => setState(() => _deliveryPhoto = null),
                          child: Container(
                            width: 28, height: 28,
                            decoration: BoxDecoration(color: Colors.black54, shape: BoxShape.circle),
                            child: const Icon(Icons.close, color: Colors.white, size: 16),
                          ),
                        ),
                      ),
                      Positioned(
                        bottom: 8, right: 8,
                        child: GestureDetector(
                          onTap: _showPhotoOptions,
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                            decoration: BoxDecoration(
                              color: CColors.teal,
                              borderRadius: BorderRadius.circular(20),
                            ),
                            child: Row(children: [
                              const Icon(Icons.camera_alt_outlined, color: Colors.white, size: 14),
                              const SizedBox(width: 4),
                              Text(t(context, 'photoRetake'), style: const TextStyle(color: Colors.white, fontSize: 12)),
                            ]),
                          ),
                        ),
                      ),
                    ])
                  : GestureDetector(
                      onTap: _showPhotoOptions,
                      child: Container(
                        width: double.infinity,
                        padding: const EdgeInsets.symmetric(vertical: 24),
                        decoration: BoxDecoration(
                          color: CColors.tealLighter,
                          borderRadius: BorderRadius.circular(12),
                          border: Border.all(color: CColors.tealLight, width: 2, style: BorderStyle.solid),
                        ),
                        child: Column(children: [
                          const Icon(Icons.camera_alt_outlined, color: CColors.teal, size: 36),
                          const SizedBox(height: 8),
                          Text(t(context, 'takeDeliveryPhoto'),
                              style: const TextStyle(color: CColors.teal, fontWeight: FontWeight.w600, fontSize: 14)),
                          const SizedBox(height: 4),
                          Text(t(context, 'takeDeliveryPhotoSub'),
                              style: const TextStyle(color: Colors.black45, fontSize: 12)),
                        ]),
                      ),
                    ),
            ),
          ],
        ],
      ),
    );
  }

  Widget _sectionLabel(String label) => Padding(
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
