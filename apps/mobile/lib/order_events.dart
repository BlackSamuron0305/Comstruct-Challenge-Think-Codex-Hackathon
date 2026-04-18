import 'dart:async';
import 'dart:convert';

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

  Stream<OrderEvent> get stream => _controller.stream;

  void connect() {
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
    _channel = WebSocketChannel.connect(uri);
    _channel!.stream.listen((raw) {
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
      } catch (_) {/* ignore */}
    }, onDone: () => _controller.close(), onError: _controller.addError);
  }

  Future<void> close() async {
    await _channel?.sink.close();
    await _controller.close();
  }
}
