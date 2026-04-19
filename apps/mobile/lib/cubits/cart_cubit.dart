import 'package:flutter_bloc/flutter_bloc.dart';

import '../api_client.dart';

class CartState {
  CartState({
    this.lines = const [],
    this.total = 0,
    this.currency = 'EUR',
    this.busy = false,
    this.error,
  });

  final List<Map<String, dynamic>> lines;
  final num total;
  final String currency;
  final bool busy;
  final String? error;

  CartState copyWith({
    List<Map<String, dynamic>>? lines,
    num? total,
    String? currency,
    bool? busy,
    String? error,
  }) => CartState(
        lines: lines ?? this.lines,
        total: total ?? this.total,
        currency: currency ?? this.currency,
        busy: busy ?? this.busy,
        error: error,
      );
}

class CartCubit extends Cubit<CartState> {
  CartCubit(this._api) : super(CartState());
  final ApiClient _api;

  int quantityFor(String productId) {
    final match = state.lines.where((line) => line['product_id'] == productId);
    if (match.isEmpty) return 0;
    return parseFlexibleInt(match.first['quantity'], fallback: 0);
  }

  Future<void> refresh() async {
    emit(state.copyWith(busy: true, error: null));
    try {
      final c = await _api.getCart();
      final rawLines = (c['items'] as List?) ?? (c['lines'] as List?) ?? const [];
      final totalRaw = c['total_amount'] ?? c['total'] ?? 0;
      final parsedTotal = totalRaw is num ? totalRaw : num.tryParse('$totalRaw') ?? 0;

      emit(CartState(
        lines: List<Map<String, dynamic>>.from(rawLines),
        total: parsedTotal,
        currency: normalizeCurrencyCode(c['currency'] as String?),
      ));
    } catch (e) {
      emit(state.copyWith(busy: false, error: 'Could not load order review'));
    }
  }

  Future<bool> add(String productId, num qty) async {
    if (qty <= 0) return remove(productId);
    try {
      await _api.addToCart(productId, qty);
      await refresh();
      return true;
    } catch (e) {
      emit(state.copyWith(error: 'Could not add item'));
      return false;
    }
  }

  Future<bool> setQuantity(String productId, int desiredQty) async {
    final currentQty = quantityFor(productId);

    try {
      if (desiredQty <= 0) {
        if (currentQty > 0) {
          await _api.removeFromCart(productId);
        }
        await refresh();
        return true;
      }

      if (currentQty == desiredQty) return true;

      if (currentQty == 0 || desiredQty > currentQty) {
        await _api.addToCart(productId, desiredQty - currentQty);
      } else {
        await _api.removeFromCart(productId);
        await _api.addToCart(productId, desiredQty);
      }

      await refresh();
      return true;
    } catch (e) {
      emit(state.copyWith(error: 'Could not update quantity'));
      return false;
    }
  }

  Future<bool> remove(String productId) async {
    try {
      await _api.removeFromCart(productId);
      await refresh();
      return true;
    } catch (e) {
      emit(state.copyWith(error: 'Could not remove item'));
      return false;
    }
  }

  Future<void> clear() async {
    await _api.clearCart();
    emit(CartState(lines: const [], total: 0, currency: state.currency));
  }
}
