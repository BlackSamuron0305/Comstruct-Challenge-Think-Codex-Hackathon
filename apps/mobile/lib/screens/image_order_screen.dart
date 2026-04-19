/// Image-based ordering screen — capture or pick a photo, AI auto-analyzes,
/// user reviews quantities and places the order directly.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:uuid/uuid.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../offline_capture_assistant.dart';
import '../offline_queue.dart';
import 'c_home_screen.dart' show CColors;
import 'projects_screen.dart' show kSelectedProjectKey;

class ImageOrderScreen extends StatefulWidget {
  const ImageOrderScreen({super.key});
  @override
  State<ImageOrderScreen> createState() => _ImageOrderScreenState();
}

class _ImageOrderScreenState extends State<ImageOrderScreen> {
  final _picker = ImagePicker();
  File? _image;
  bool _busy = false;
  bool _ordering = false;
  List<Map<String, dynamic>> _materials = [];
  Map<int, int> _quantities = {};
  String? _observation;
  String? _error;

  int _qtyFor(int index) {
    if (_quantities.containsKey(index)) return _quantities[index]!;
    final m = _materials[index];
    final raw =
        m['quantity'] ?? m['quantity_estimate'] ?? m['suggested_qty'] ?? 1;
    return raw is num ? raw.toInt() : (int.tryParse('$raw') ?? 1);
  }

  Future<void> _pickAndAnalyze(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 85,
    );
    if (picked == null) return;
    setState(() {
      _image = File(picked.path);
      _materials = [];
      _quantities = {};
      _observation = null;
      _error = null;
    });
    await _analyze();
  }

  Future<void> _analyze() async {
    if (_image == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _materials = [];
      _quantities = {};
      _observation = null;
    });

    try {
      final local = await OfflineCaptureAssistant.analyzeOcrImage(_image!.path);
      final localItems =
          List<Map<String, dynamic>>.from((local['items'] as List?) ?? []);
      final localSummary = local['summary'] as String?;

      if (mounted) {
        setState(() {
          _materials = localItems;
          _observation = localSummary;
        });
      }

      final prefs = await SharedPreferences.getInstance();
      final projectId = prefs.getString('comstruct.selectedProject');

      try {
        final res = await AppScope.api.uploadImage(
          _image!.path,
          context:
              'Extract material list from this image. Identify construction materials, quantities, and specifications.',
          projectId: projectId,
        );
        final analysis = (res['analysis'] as Map<String, dynamic>?) ?? res;
        final detected = (analysis['materials_detected'] as List?) ??
            (analysis['materials'] as List?) ??
            (res['materials'] as List?) ??
            (res['items'] as List?) ??
            [];
        final obs = (analysis['observations'] as String?) ??
            (analysis['summary'] as String?) ??
            (res['summary'] as String?);

        if (mounted && (detected.isNotEmpty || (obs?.isNotEmpty ?? false))) {
          setState(() {
            _materials = List<Map<String, dynamic>>.from(detected);
            _observation = obs ?? _observation;
          });
        }
      } catch (_) {
        if (mounted && _materials.isEmpty) {
          setState(() {
            _error = 'No backend connection. Showing on-device OCR only.';
          });
        }
      }
    } catch (e) {
      setState(() => _error = 'Phone OCR failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  /// Add all items to cart, then immediately checkout → direct order.
  Future<void> _orderNow() async {
    final prefs = await SharedPreferences.getInstance();
    final projectId = prefs.getString(kSelectedProjectKey);
    if (projectId == null) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
            content: Text('Select a project first'),
            backgroundColor: CColors.red),
      );
      context.go('/projects');
      return;
    }

    setState(() => _ordering = true);
    try {
      final cart = context.read<CartCubit>();
      int added = 0;
      for (int i = 0; i < _materials.length; i++) {
        final m = _materials[i];
        final id = (m['product_id'] as String?) ?? (m['sku'] as String?);
        if (id == null || id.isEmpty) continue;
        final n = _qtyFor(i);
        if (n <= 0) continue;
        await cart.add(id, n);
        added++;
      }
      if (added == 0) {
        final task = List.generate(_materials.length, (i) {
          final item = _materials[i];
          final name = (item['matched_name'] as String?) ??
              (item['name'] as String?) ??
              (item['material'] as String?) ??
              'material';
          return '${_qtyFor(i)} x $name';
        }).join(', ');
        await OfflineQueue.enqueue(
          type: 'image_order',
          payload: {
            'task': task,
            'project_name': projectId,
          },
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'No live catalog match yet. The request was saved on the phone and will sync later.'),
            backgroundColor: CColors.orange,
          ),
        );
        return;
      }
      // Checkout immediately
      final order = await AppScope.api.checkout(
        projectId: projectId,
        idempotencyKey: const Uuid().v4(),
        notes: 'Photo order – ${_materials.length} items detected by AI',
      );
      if (!mounted) return;
      context.go('/c-order-confirmed', extra: order);
    } catch (e) {
      try {
        final task = List.generate(_materials.length, (i) {
          final item = _materials[i];
          final name = (item['matched_name'] as String?) ??
              (item['name'] as String?) ??
              (item['material'] as String?) ??
              'material';
          return '${_qtyFor(i)} x $name';
        }).join(', ');
        await OfflineQueue.enqueue(
          type: 'image_order',
          payload: {
            'task': task,
            'project_name': projectId,
          },
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'No connection. The photo order was saved on the phone and will sync later.'),
            backgroundColor: CColors.orange,
          ),
        );
      } catch (_) {
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Order failed: $e'), backgroundColor: CColors.red),
        );
      }
    } finally {
      if (mounted) setState(() => _ordering = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_image != null &&
        (_materials.isNotEmpty ||
            _observation != null ||
            _busy ||
            _error != null)) {
      return _buildReviewScreen(context);
    }
    return _buildCaptureScreen(context);
  }

  Widget _buildCaptureScreen(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        title: const Text('Photo Order'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go('/c-home'),
        ),
      ),
      body: Column(children: [
        Expanded(
          child: InkWell(
            onTap: _busy ? null : () => _pickAndAnalyze(ImageSource.camera),
            child: Container(
              width: double.infinity,
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  colors: [CColors.teal, CColors.tealDark],
                  begin: Alignment.topCenter,
                  end: Alignment.bottomCenter,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.camera_alt,
                        size: 56, color: Colors.white),
                  ),
                  const SizedBox(height: 16),
                  const Text('Take Photo',
                      style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: Colors.white)),
                  const SizedBox(height: 6),
                  Text('Capture material list, note, or site',
                      style: TextStyle(
                          fontSize: 14,
                          color: Colors.white.withValues(alpha: 0.8))),
                ],
              ),
            ),
          ),
        ),
        Expanded(
          child: InkWell(
            onTap: _busy ? null : () => _pickAndAnalyze(ImageSource.gallery),
            child: Container(
              width: double.infinity,
              color: Colors.white,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.all(24),
                    decoration: BoxDecoration(
                      color: CColors.tealLighter,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.photo_library,
                        size: 56, color: CColors.teal),
                  ),
                  const SizedBox(height: 16),
                  const Text('Pick from Gallery',
                      style: TextStyle(
                          fontSize: 22,
                          fontWeight: FontWeight.w800,
                          color: CColors.tealDark)),
                  const SizedBox(height: 6),
                  const Text('Select an existing photo',
                      style: TextStyle(fontSize: 14, color: Colors.black45)),
                ],
              ),
            ),
          ),
        ),
      ]),
    );
  }

  Widget _buildReviewScreen(BuildContext context) {
    final orderableCount = _materials.where((m) {
      final id = (m['product_id'] as String?) ?? (m['sku'] as String?);
      return id != null && id.isNotEmpty;
    }).length;

    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        title: const Text('Review & Order'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => setState(() {
            _image = null;
            _materials = [];
            _quantities = {};
            _observation = null;
            _error = null;
          }),
        ),
      ),
      body: Column(children: [
        // Image preview
        if (_image != null)
          Container(
            height: 140,
            width: double.infinity,
            decoration: BoxDecoration(
              image:
                  DecorationImage(image: FileImage(_image!), fit: BoxFit.cover),
            ),
            child: _busy
                ? Container(
                    color: Colors.black45,
                    child: const Center(
                        child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 3),
                        SizedBox(height: 12),
                        Text('Analyzing…',
                            style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w600,
                                fontSize: 16)),
                      ],
                    )),
                  )
                : null,
          ),
        if (_observation != null && !_busy)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(12),
            color: CColors.tealLighter,
            child: Row(children: [
              const Icon(Icons.info_outline, color: CColors.teal, size: 20),
              const SizedBox(width: 8),
              Expanded(
                  child: Text(_observation!,
                      style: const TextStyle(
                          fontSize: 13, color: Colors.black87))),
            ]),
          ),
        if (_error != null)
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            color: const Color(0xFFFFEBEB),
            child: Row(children: [
              const Icon(Icons.error_outline, color: CColors.red, size: 20),
              const SizedBox(width: 8),
              Expanded(
                  child: Text(_error!,
                      style:
                          const TextStyle(color: CColors.red, fontSize: 13))),
              IconButton(
                icon: const Icon(Icons.refresh, color: CColors.teal),
                onPressed: _analyze,
              ),
            ]),
          ),
        // Materials list with glove-friendly quantity controls
        if (_materials.isNotEmpty && !_busy)
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
              itemCount: _materials.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _MaterialCard(
                material: _materials[i],
                qty: _qtyFor(i),
                onQtyChanged: (newQty) =>
                    setState(() => _quantities[i] = newQty),
              ),
            ),
          ),
        if (_materials.isEmpty && !_busy && _error == null)
          const Expanded(
              child: Center(
                  child: Text(
            'No materials detected.\nTry a clearer photo.',
            textAlign: TextAlign.center,
            style: TextStyle(color: Colors.black45, fontSize: 15),
          ))),
        // ORDER NOW button — big, glove-friendly
        if (_materials.isNotEmpty && !_busy)
          Container(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 34),
            decoration: BoxDecoration(
              color: Colors.white,
              border: Border(top: BorderSide(color: Colors.grey.shade200)),
            ),
            child: SizedBox(
              height: 72,
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _ordering ? null : _orderNow,
                style: ElevatedButton.styleFrom(
                  backgroundColor: CColors.green,
                  foregroundColor: Colors.white,
                  disabledBackgroundColor: Colors.grey.shade300,
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(18)),
                  textStyle: const TextStyle(
                      fontSize: 20, fontWeight: FontWeight.w800),
                ),
                icon: _ordering
                    ? const SizedBox(
                        width: 24,
                        height: 24,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 3))
                    : const Icon(Icons.send_rounded, size: 28),
                label: Text(
                    _ordering ? 'Ordering…' : 'Order $orderableCount Items'),
              ),
            ),
          ),
      ]),
    );
  }
}

/// Single material card with large glove-friendly +/- buttons.
class _MaterialCard extends StatelessWidget {
  const _MaterialCard({
    required this.material,
    required this.qty,
    required this.onQtyChanged,
  });

  final Map<String, dynamic> material;
  final int qty;
  final ValueChanged<int> onQtyChanged;

  @override
  Widget build(BuildContext context) {
    final name = (material['name'] as String?) ??
        (material['material'] as String?) ??
        '—';
    final matchedName = material['matched_name'] as String?;
    final cat = (material['category'] as String?) ?? '';
    final urgency = (material['urgency'] as String?) ?? '';
    final hasProduct = (material['product_id'] as String?)?.isNotEmpty == true;
    final price = material['unit_price'];

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
            color:
                hasProduct ? const Color(0xFFE1E7EE) : const Color(0xFFFFD6A5)),
      ),
      child: Column(children: [
        // Top row: icon + name + urgency
        Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: hasProduct ? CColors.tealLighter : const Color(0xFFFFF3E0),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(
              hasProduct ? Icons.inventory_2_outlined : Icons.help_outline,
              color: hasProduct ? CColors.teal : CColors.orange,
              size: 22,
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                Text(matchedName ?? name,
                    style: const TextStyle(
                        fontWeight: FontWeight.w700, fontSize: 16)),
                if (matchedName != null && matchedName != name)
                  Text('AI: $name',
                      style:
                          const TextStyle(color: Colors.black45, fontSize: 11)),
                if (cat.isNotEmpty)
                  Text(cat,
                      style:
                          const TextStyle(color: Colors.black45, fontSize: 12)),
                if (price != null)
                  Text(
                      '${(price is num ? price.toStringAsFixed(2) : price)} / Stk',
                      style: const TextStyle(
                          color: CColors.teal,
                          fontSize: 13,
                          fontWeight: FontWeight.w600)),
              ])),
          if (urgency.isNotEmpty)
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              decoration: BoxDecoration(
                color: urgency == 'high'
                    ? const Color(0xFFFFEBEB)
                    : CColors.tealLighter,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text(urgency.toUpperCase(),
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: FontWeight.w700,
                    color: urgency == 'high' ? CColors.red : CColors.teal,
                  )),
            ),
        ]),
        const SizedBox(height: 10),
        // Quantity row — BIG glove-friendly buttons
        Row(children: [
          // Minus button — 56×56 minimum
          SizedBox(
            width: 64,
            height: 56,
            child: ElevatedButton(
              onPressed: qty > 1 ? () => onQtyChanged(qty - 1) : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.grey.shade100,
                foregroundColor: CColors.tealDark,
                disabledBackgroundColor: Colors.grey.shade50,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                padding: EdgeInsets.zero,
                elevation: 0,
              ),
              child: const Icon(Icons.remove, size: 28),
            ),
          ),
          // Quantity display
          Expanded(
            child: Center(
              child: Text(
                '$qty',
                style: const TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w800,
                  color: CColors.tealDark,
                ),
              ),
            ),
          ),
          // Plus button — 56×56 minimum
          SizedBox(
            width: 64,
            height: 56,
            child: ElevatedButton(
              onPressed: qty < 999 ? () => onQtyChanged(qty + 1) : null,
              style: ElevatedButton.styleFrom(
                backgroundColor: CColors.tealLighter,
                foregroundColor: CColors.teal,
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(14)),
                padding: EdgeInsets.zero,
                elevation: 0,
              ),
              child: const Icon(Icons.add, size: 28),
            ),
          ),
        ]),
      ]),
    );
  }
}
