/// Offline order queue — saves orders locally when offline and syncs when back online.
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive/hive.dart';
import 'package:uuid/uuid.dart';

import 'api_client.dart';
import 'app_scope.dart';

const _boxName = 'offline_queue';
const _uuid = Uuid();

enum QueueItemStatus { pending, syncing, synced, failed }

class QueueItem {
  QueueItem({
    required this.id,
    required this.type,
    required this.payload,
    required this.createdAt,
    this.status = QueueItemStatus.pending,
    this.errorMessage,
    this.retries = 0,
  });

  final String id;
  final String type; // 'checkout', 'add_to_cart', 'voice_order', 'image_order'
  final Map<String, dynamic> payload;
  final DateTime createdAt;
  QueueItemStatus status;
  String? errorMessage;
  int retries;

  Map<String, dynamic> toJson() => {
        'id': id,
        'type': type,
        'payload': payload,
        'createdAt': createdAt.toIso8601String(),
        'status': status.name,
        'errorMessage': errorMessage,
        'retries': retries,
      };

  factory QueueItem.fromJson(Map<String, dynamic> json) => QueueItem(
        id: json['id'] as String,
        type: json['type'] as String,
        payload: Map<String, dynamic>.from(json['payload'] as Map),
        createdAt: DateTime.parse(json['createdAt'] as String),
        status: QueueItemStatus.values.firstWhere(
          (s) => s.name == json['status'],
          orElse: () => QueueItemStatus.pending,
        ),
        errorMessage: json['errorMessage'] as String?,
        retries: (json['retries'] as int?) ?? 0,
      );
}

class OfflineQueue {
  static Box? _box;
  static bool _syncing = false;

  static Future<void> init() async {
    _box = await Hive.openBox(_boxName);
  }

  /// Enqueue an action to be processed when online.
  static Future<QueueItem> enqueue({
    required String type,
    required Map<String, dynamic> payload,
  }) async {
    final item = QueueItem(
      id: _uuid.v4(),
      type: type,
      payload: payload,
      createdAt: DateTime.now(),
    );
    await _box?.put(item.id, jsonEncode(item.toJson()));
    // Try immediate sync
    _trySyncAll();
    return item;
  }

  /// Get all pending items.
  static List<QueueItem> pending() {
    final items = <QueueItem>[];
    for (final key in _box?.keys ?? []) {
      try {
        final raw = _box?.get(key) as String?;
        if (raw == null) continue;
        final item = QueueItem.fromJson(jsonDecode(raw) as Map<String, dynamic>);
        if (item.status == QueueItemStatus.pending || item.status == QueueItemStatus.failed) {
          items.add(item);
        }
      } catch (_) {}
    }
    items.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return items;
  }

  /// Get all items for display.
  static List<QueueItem> all() {
    final items = <QueueItem>[];
    for (final key in _box?.keys ?? []) {
      try {
        final raw = _box?.get(key) as String?;
        if (raw == null) continue;
        items.add(QueueItem.fromJson(jsonDecode(raw) as Map<String, dynamic>));
      } catch (_) {}
    }
    items.sort((a, b) => b.createdAt.compareTo(a.createdAt));
    return items;
  }

  /// Remove a synced or failed item.
  static Future<void> remove(String id) async {
    await _box?.delete(id);
  }

  /// Clear all synced items.
  static Future<void> clearSynced() async {
    final keys = <String>[];
    for (final key in _box?.keys ?? []) {
      try {
        final raw = _box?.get(key) as String?;
        if (raw == null) continue;
        final item = QueueItem.fromJson(jsonDecode(raw) as Map<String, dynamic>);
        if (item.status == QueueItemStatus.synced) keys.add(key as String);
      } catch (_) {}
    }
    for (final k in keys) {
      await _box?.delete(k);
    }
  }

  /// Attempt to sync all pending items. Call this when connectivity changes.
  static Future<void> _trySyncAll() async {
    if (_syncing) return;
    _syncing = true;
    try {
      final connectivity = await Connectivity().checkConnectivity();
      if (connectivity.contains(ConnectivityResult.none)) return;

      final items = pending();
      for (final item in items) {
        await _processItem(item);
      }
    } finally {
      _syncing = false;
    }
  }

  /// Process a single queued item.
  static Future<void> _processItem(QueueItem item) async {
    item.status = QueueItemStatus.syncing;
    await _box?.put(item.id, jsonEncode(item.toJson()));

    try {
      final api = AppScope.api;
      switch (item.type) {
        case 'checkout':
          await api.checkout(
            projectId: item.payload['project_id'] as String,
            notes: item.payload['notes'] as String?,
            idempotencyKey: item.id, // Use queue item ID as idempotency key
          );
          break;
        case 'add_to_cart':
          await api.addToCart(
            item.payload['product_id'] as String,
            item.payload['quantity'] as num,
          );
          break;
        case 'voice_order':
        case 'image_order':
          // These create a chat/recommend request + add items to cart
          final task = item.payload['task'] as String;
          final projectName = item.payload['project_name'] as String?;
          final result = await api.recommend(task, projectName: projectName);
          final items = (result['items'] as List?) ?? [];
          for (final it in items) {
            final productId = it['product_id'] as String?;
            if (productId != null) {
              await api.addToCart(productId, (it['suggested_qty'] as num?) ?? 1);
            }
          }
          break;
        default:
          break;
      }

      item.status = QueueItemStatus.synced;
      await _box?.put(item.id, jsonEncode(item.toJson()));
    } catch (e) {
      item.retries++;
      item.status = item.retries >= 5 ? QueueItemStatus.failed : QueueItemStatus.pending;
      item.errorMessage = '$e';
      await _box?.put(item.id, jsonEncode(item.toJson()));
    }
  }

  /// Start listening for connectivity changes and auto-sync.
  static void startAutoSync() {
    Connectivity().onConnectivityChanged.listen((results) {
      if (!results.contains(ConnectivityResult.none)) {
        _trySyncAll();
      }
    });
  }
}
