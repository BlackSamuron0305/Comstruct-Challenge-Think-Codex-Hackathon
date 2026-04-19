/// Offline queue screen — view pending, syncing, and synced queued actions.
import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../offline_queue.dart';
import '../theme.dart';

class OfflineQueueScreen extends StatefulWidget {
  const OfflineQueueScreen({super.key});
  @override
  State<OfflineQueueScreen> createState() => _OfflineQueueScreenState();
}

class _OfflineQueueScreenState extends State<OfflineQueueScreen> {
  List<QueueItem> _items = [];

  @override
  void initState() {
    super.initState();
    _refresh();
  }

  void _refresh() {
    setState(() => _items = OfflineQueue.all());
  }

  IconData _iconForType(String type) {
    switch (type) {
      case 'checkout': return Icons.shopping_bag;
      case 'add_to_cart': return Icons.add_shopping_cart;
      case 'voice_order': return Icons.mic;
      case 'image_order': return Icons.camera_alt;
      default: return Icons.pending_actions;
    }
  }

  Color _colorForStatus(QueueItemStatus status) {
    switch (status) {
      case QueueItemStatus.pending: return ComstructColors.warn;
      case QueueItemStatus.syncing: return ComstructColors.brand;
      case QueueItemStatus.synced: return ComstructColors.ok;
      case QueueItemStatus.failed: return ComstructColors.err;
    }
  }

  String _labelForStatus(QueueItemStatus status) {
    switch (status) {
      case QueueItemStatus.pending: return 'Pending';
      case QueueItemStatus.syncing: return 'Syncing…';
      case QueueItemStatus.synced: return 'Synced';
      case QueueItemStatus.failed: return 'Failed';
    }
  }

  String _labelForType(String type) {
    switch (type) {
      case 'checkout': return 'Checkout';
      case 'add_to_cart': return 'Add to Cart';
      case 'voice_order': return 'Voice Order';
      case 'image_order': return 'Image Order';
      default: return type;
    }
  }

  @override
  Widget build(BuildContext context) {
    final fmt = DateFormat('MMM d, HH:mm');
    return Scaffold(
      appBar: AppBar(
        title: const Text('Offline Queue'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/c-home'),
        ),
        actions: [
          if (_items.any((i) => i.status == QueueItemStatus.synced))
            IconButton(
              icon: const Icon(Icons.delete_sweep),
              tooltip: 'Clear synced',
              onPressed: () async {
                await OfflineQueue.clearSynced();
                _refresh();
              },
            ),
        ],
      ),
      body: _items.isEmpty
          ? const Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.cloud_done, size: 48, color: Colors.black26),
                SizedBox(height: 8),
                Text('No queued actions', style: TextStyle(color: Colors.black54)),
                SizedBox(height: 4),
                Text('Orders made while offline will appear here',
                    style: TextStyle(color: Colors.black38, fontSize: 12)),
              ]),
            )
          : RefreshIndicator(
              onRefresh: () async => _refresh(),
              child: ListView.separated(
                physics: const AlwaysScrollableScrollPhysics(),
                padding: const EdgeInsets.all(12),
                itemCount: _items.length,
                separatorBuilder: (_, __) => const SizedBox(height: 8),
                itemBuilder: (_, i) {
                  final item = _items[i];
                  return Dismissible(
                    key: ValueKey(item.id),
                    direction: item.status == QueueItemStatus.synced || item.status == QueueItemStatus.failed
                        ? DismissDirection.endToStart
                        : DismissDirection.none,
                    background: Container(
                      alignment: Alignment.centerRight,
                      padding: const EdgeInsets.only(right: 16),
                      color: Colors.red,
                      child: const Icon(Icons.delete, color: Colors.white),
                    ),
                    onDismissed: (_) async {
                      await OfflineQueue.remove(item.id);
                      _refresh();
                    },
                    child: Card(
                      child: ListTile(
                        leading: Icon(_iconForType(item.type), color: _colorForStatus(item.status)),
                        title: Text(_labelForType(item.type), style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(
                            item.payload['task'] as String? ??
                            item.payload['product_id'] as String? ??
                            item.payload['project_id'] as String? ??
                            '—',
                            maxLines: 1, overflow: TextOverflow.ellipsis,
                          ),
                          const SizedBox(height: 2),
                          Text(fmt.format(item.createdAt), style: const TextStyle(fontSize: 11, color: Colors.black45)),
                          if (item.errorMessage != null)
                            Text('Error: ${item.errorMessage}', style: const TextStyle(fontSize: 11, color: ComstructColors.err)),
                        ]),
                        trailing: Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          decoration: BoxDecoration(
                            color: _colorForStatus(item.status).withValues(alpha: 0.15),
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            _labelForStatus(item.status),
                            style: TextStyle(
                              color: _colorForStatus(item.status),
                              fontWeight: FontWeight.w600,
                              fontSize: 12,
                            ),
                          ),
                        ),
                      ),
                    ),
                  );
                },
              ),
            ),
    );
  }
}
