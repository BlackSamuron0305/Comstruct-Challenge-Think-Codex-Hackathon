import 'package:flutter_bloc/flutter_bloc.dart';

import '../api_client.dart';

class CartState {
  CartState({this.lines = const [], this.total = 0, this.currency = 'CHF', this.busy = false, this.error});
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

  Future<void> refresh() async {
    emit(state.copyWith(busy: true, error: null));
    try {
      final c = await _api.getCart();
      emit(CartState(
        lines: List<Map<String, dynamic>>.from(c['lines'] as List),
        total: (c['total'] as num?) ?? 0,
        currency: (c['currency'] as String?) ?? 'CHF',
      ));
    } catch (e) {
      emit(state.copyWith(busy: false, error: 'Could not load cart'));
    }
  }

  Future<bool> add(String productId, num qty) async {
    try {
      await _api.addToCart(productId, qty);
      await refresh();
      return true;
    } catch (e) {
      emit(state.copyWith(error: 'Could not add to cart'));
      return false;
    }
  }

  Future<void> remove(String productId) async {
    await _api.removeFromCart(productId);
    await refresh();
  }
}
