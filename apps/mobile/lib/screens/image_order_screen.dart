/// Image-based ordering screen — capture a photo of a material list,
/// handwritten note, or construction site and use AI to extract items.
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../local_llm.dart';
import '../offline_queue.dart';
import '../theme.dart';

class ImageOrderScreen extends StatefulWidget {
  const ImageOrderScreen({super.key});
  @override
  State<ImageOrderScreen> createState() => _ImageOrderScreenState();
}

class _ImageOrderScreenState extends State<ImageOrderScreen> {
  final _picker = ImagePicker();
  File? _image;
  bool _busy = false;
  Map<String, dynamic>? _result;
  LlmSource? _source;
  String? _error;

  Future<void> _pickImage(ImageSource source) async {
    final picked = await _picker.pickImage(
      source: source,
      maxWidth: 1920,
      maxHeight: 1920,
      imageQuality: 85,
    );
    if (picked == null) return;
    setState(() {
      _image = File(picked.path);
      _result = null;
      _error = null;
      _source = null;
    });
  }

  Future<void> _analyze() async {
    if (_image == null) return;
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
    });

    try {
      final prefs = await SharedPreferences.getInstance();
      final projectId = prefs.getString('comstruct.selectedProject');

      // Try backend image analysis first
      final isOnline = await AppScope.llm.isOnline;
      if (isOnline) {
        try {
          final res = await AppScope.api.uploadImage(
            _image!.path,
            context: 'Extract material list from this image. Identify construction materials, quantities, and specifications.',
            projectId: projectId,
          );
          setState(() {
            _result = res;
            _source = LlmSource.openai;
          });
          return;
        } catch (_) {
          // Fall through to offline
        }
      }

      // Offline fallback — queue for later processing
      await OfflineQueue.enqueue(
        type: 'image_order',
        payload: {
          'image_path': _image!.path,
          'task': 'Extract material list from construction site photo',
          'project_name': prefs.getString('comstruct.selectedProjectName'),
        },
      );

      setState(() {
        _result = {
          'summary': 'Image saved for processing when back online. '
              'The AI will extract materials from this image once connected.',
          'items': <dynamic>[],
          'queued': true,
        };
        _source = LlmSource.local;
      });
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Image Order'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/catalog'),
        ),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          // Capture buttons
          Row(children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy ? null : () => _pickImage(ImageSource.camera),
                icon: const Icon(Icons.camera_alt),
                label: const Text('Camera'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                onPressed: _busy ? null : () => _pickImage(ImageSource.gallery),
                icon: const Icon(Icons.photo_library),
                label: const Text('Gallery'),
              ),
            ),
          ]),

          const SizedBox(height: 16),

          // Image preview
          if (_image != null) ...[
            ClipRRect(
              borderRadius: BorderRadius.circular(12),
              child: Image.file(_image!, height: 250, fit: BoxFit.cover),
            ),
            const SizedBox(height: 12),
            ElevatedButton.icon(
              onPressed: _busy ? null : _analyze,
              icon: const Icon(Icons.document_scanner),
              label: Text(_busy ? 'Analyzing…' : 'Extract Materials'),
            ),
          ] else ...[
            Container(
              height: 200,
              decoration: BoxDecoration(
                color: Colors.grey[100],
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: Colors.grey[300]!),
              ),
              child: const Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.add_a_photo, size: 48, color: Colors.black38),
                  SizedBox(height: 8),
                  Text('Take a photo of a material list,\nhandwritten note, or site photo',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: Colors.black45)),
                ]),
              ),
            ),
          ],

          const SizedBox(height: 16),

          // Source indicator
          if (_source != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                Icon(
                  _source == LlmSource.local ? Icons.phone_android : Icons.cloud,
                  size: 16, color: Colors.black45,
                ),
                const SizedBox(width: 4),
                Text(
                  _source == LlmSource.local ? 'Queued for offline processing' : 'Cloud AI analysis',
                  style: const TextStyle(fontSize: 12, color: Colors.black45),
                ),
              ]),
            ),

          // Error
          if (_error != null)
            Text(_error!, style: const TextStyle(color: ComstructColors.err)),

          // Results
          if (_result != null) ...[
            if (_result!['summary'] != null)
              Card(
                color: (_result!['queued'] == true) ? Colors.amber[50] : null,
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(children: [
                    Icon(
                      (_result!['queued'] == true) ? Icons.schedule : Icons.check_circle,
                      color: (_result!['queued'] == true) ? ComstructColors.warn : ComstructColors.ok,
                    ),
                    const SizedBox(width: 8),
                    Expanded(child: Text(_result!['summary'] as String,
                        style: const TextStyle(fontStyle: FontStyle.italic))),
                  ]),
                ),
              ),

            const SizedBox(height: 8),

            // Extracted materials
            if ((_result!['materials'] as List?)?.isNotEmpty == true ||
                (_result!['items'] as List?)?.isNotEmpty == true)
              ...(((_result!['materials'] as List?) ?? (_result!['items'] as List?) ?? []).map(
                (it) {
                  final name = (it['name'] as String?) ?? (it['material'] as String?) ?? '—';
                  final qty = it['quantity'] ?? it['suggested_qty'] ?? 1;
                  return Card(
                    child: ListTile(
                      title: Text(name, style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text((it['rationale'] as String?) ?? (it['spec'] as String?) ?? ''),
                      trailing: ElevatedButton(
                        onPressed: () async {
                          final productId = it['product_id'] as String?;
                          if (productId == null) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('No matching product in catalog')),
                            );
                            return;
                          }
                          final ok = await context.read<CartCubit>().add(productId, qty as num);
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(ok ? 'Added to cart' : 'Could not add')),
                          );
                        },
                        child: Text('$qty'),
                      ),
                    ),
                  );
                },
              )),

            const SizedBox(height: 8),
            if ((_result!['items'] as List?)?.isNotEmpty == true ||
                (_result!['materials'] as List?)?.isNotEmpty == true)
              OutlinedButton(
                onPressed: () => context.go('/cart'),
                child: const Text('Go to Cart'),
              ),
          ],
        ]),
      ),
    );
  }
}
