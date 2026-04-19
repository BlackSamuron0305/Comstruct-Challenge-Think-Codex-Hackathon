import 'package:flutter_bloc/flutter_bloc.dart';

import '../api_client.dart';

class AuthState {
  AuthState({this.user, this.error, this.busy = false});
  final Map<String, dynamic>? user;
  final String? error;
  final bool busy;

  AuthState copyWith({Map<String, dynamic>? user, String? error, bool? busy}) =>
      AuthState(user: user ?? this.user, error: error, busy: busy ?? this.busy);
}

class AuthCubit extends Cubit<AuthState> {
  AuthCubit(this._api) : super(AuthState());
  final ApiClient _api;

  Future<void> bootstrap() async {
    if (_api.tokens.access == null) return;
    emit(state.copyWith(busy: true, error: null));
    try {
      final user = await _api.me();
      emit(AuthState(user: user));
    } catch (_) {
      await _api.tokens.clear();
      emit(AuthState(error: 'Session expired'));
    }
  }

  Future<void> login(String email, String password) async {
    emit(state.copyWith(busy: true, error: null));
    try {
      final user = await _api.login(email, password);
      emit(AuthState(user: user));
    } catch (e) {
      emit(state.copyWith(busy: false, error: 'Login failed'));
    }
  }

  Future<void> logout() async {
    await _api.tokens.clear();
    emit(AuthState());
  }
}
