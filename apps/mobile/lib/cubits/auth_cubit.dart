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
      emit(AuthState(error: 'Session expired. Please sign in again.'));
    }
  }

  Future<void> login(String email, String password) async {
    emit(state.copyWith(busy: true, error: null));
    try {
      final user = await _api.login(email, password);
      emit(AuthState(user: user));
    } catch (e) {
      emit(AuthState(error: describeApiError(e, baseUrl: _api.baseUrl)));
    }
  }

  Future<void> register({
    required String fullName,
    required String email,
    required String password,
    required String companyName,
    required String role,
    String? phone,
  }) async {
    emit(state.copyWith(busy: true, error: null));
    try {
      final user = await _api.register(
        fullName: fullName,
        email: email,
        password: password,
        companyName: companyName,
        role: role,
        phone: phone,
      );
      emit(AuthState(user: user));
    } catch (e) {
      emit(AuthState(error: describeApiError(e, baseUrl: _api.baseUrl)));
    }
  }

  Future<void> logout() async {
    await _api.tokens.clear();
    emit(AuthState());
  }
}
