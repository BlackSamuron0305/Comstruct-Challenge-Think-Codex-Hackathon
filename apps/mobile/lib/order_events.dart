import 'dart:async';
import 'dart:convert';
import 'dart:math';

import 'package:web_socket_channel/web_socket_channel.dart';

class OrderEvent {
  OrderEvent(this.orderId, this.status, this.timestamp);
  final String orderId;
  final String status;
  final String timestamp;
}

class OrderEventStream {
  OrderEventStream({required this.wsBaseUrl, required this.token, this.orderId});

  final String wsBaseUrl;
  final String token;
  final String? orderId;

  WebSocketChannel? _channel;
  final _controller = StreamController<OrderEvent>.broadcast();
  Timer? _reconnectTimer;
  int _reconnectAttempts = 0;
  static const int _maxReconnectAttempts = 10;
  bool _disposed = false;

  Stream<OrderEvent> get stream => _controller.stream;
  bool get isConnected => _channel != null;

  void connect() {
    if (_disposed) return;
    _reconnectAttempts = 0;
    _doConnect();
  }

  void _doConnect() {
    if (_disposed) return;

    final base = Uri.parse(wsBaseUrl);
    final wsScheme = base.scheme == 'https' ? 'wss' : 'ws';
    final uri = base.replace(
      scheme: wsScheme,
      path: '/ws',
      queryParameters: {
        'token': token,
        if (orderId != null) 'order_id': orderId!,
      },
    );

    try {
      _channel = WebSocketChannel.connect(uri);
      _reconnectAttempts = 0;

      _channel!.stream.listen(
        (raw) {
          try {
            final parsed = jsonDecode(raw as String) as Map<String, dynamic>;
            if (parsed['type'] == 'order.status' && parsed['data'] is Map) {
              final d = Map<String, dynamic>.from(parsed['data'] as Map);
              _controller.add(OrderEvent(
                d['order_id'] as String,
                d['status'] as String,
                (d['ts'] as String?) ?? '',
              ));
            }
          } catch (_) {}
        },
        onDone: () => _scheduleReconnect(),
        onError: (_) => _scheduleReconnect(),
      );
    } catch (_) {
      _scheduleReconnect();
    }
  }

  void _scheduleReconnect() {
    if (_disposed || _reconnectAttempts >= _maxReconnectAttempts) return;
    _reconnectAttempts++;

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 32s (max)
    final delay = Duration(seconds: min(pow(2, _reconnectAttempts).toInt(), 32));
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(delay, _doConnect);
  }

  Future<void> close() async {
    _disposed = true;
    _reconnectTimer?.cancel();
    await _channel?.sink.close();
    await _controller.close();
  }
}
