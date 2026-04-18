/// Lightweight API client (avoid build_runner dependency at hackathon time).
import 'package:dio/dio.dart';
import 'package:shared_preferences/shared_preferences.dart';

class TokenStore {
  static const _kAccess = 'comstruct.access';
  static const _kRefresh = 'comstruct.refresh';
  String? access;
  String? refresh;

  Future<void> load() async {
    final p = await SharedPreferences.getInstance();
    access = p.getString(_kAccess);
    refresh = p.getString(_kRefresh);
  }

  Future<void> save({String? access, String? refresh}) async {
    final p = await SharedPreferences.getInstance();
    if (access != null) {
      this.access = access;
      await p.setString(_kAccess, access);
    }
    if (refresh != null) {
      this.refresh = refresh;
      await p.setString(_kRefresh, refresh);
    }
  }

  Future<void> clear() async {
    final p = await SharedPreferences.getInstance();
    access = null;
    refresh = null;
    await p.remove(_kAccess);
    await p.remove(_kRefresh);
  }
}

class ApiClient {
  ApiClient({required this.baseUrl, required this.tokens})
      : dio = Dio(BaseOptions(baseUrl: baseUrl, connectTimeout: const Duration(seconds: 10), receiveTimeout: const Duration(seconds: 30))) {
    dio.interceptors.add(InterceptorsWrapper(
      onRequest: (opts, h) {
        if (tokens.access != null) {
          opts.headers['Authorization'] = 'Bearer ${tokens.access}';
        }
        h.next(opts);
      },
      onError: (e, h) async {
        if (e.response?.statusCode == 401 && tokens.refresh != null) {
          final ok = await _tryRefresh();
          if (ok) {
            final req = e.requestOptions;
            req.headers['Authorization'] = 'Bearer ${tokens.access}';
            try {
              final retry = await dio.fetch(req);
              return h.resolve(retry);
            } catch (err) {
              return h.next(e);
            }
          }
        }
        h.next(e);
      },
    ));
  }

  final String baseUrl;
  final TokenStore tokens;
  final Dio dio;

  Future<bool> _tryRefresh() async {
    try {
      final r = await Dio().post(
        '$baseUrl/auth/refresh',
        data: {'refresh_token': tokens.refresh},
      );
      await tokens.save(access: r.data['access_token'] as String);
      return true;
    } catch (_) {
      return false;
    }
  }

  // ── Auth ───────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String email, String password) async {
    final r = await Dio().post(
      '$baseUrl/auth/login',
      data: {'email': email, 'password': password},
    );
    final data = Map<String, dynamic>.from(r.data as Map);
    await tokens.save(
      access: data['access_token'] as String,
      refresh: data['refresh_token'] as String,
    );
    return data['user'] as Map<String, dynamic>;
  }

  // ── Catalog ────────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> products({String? q, String? category}) async {
    final r = await dio.get('/api/products', queryParameters: {
      if (q != null && q.isNotEmpty) 'q': q,
      if (category != null) 'category': category,
    });
    return List<Map<String, dynamic>>.from(r.data as List);
  }

  // ── Cart ───────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getCart() async => Map<String, dynamic>.from((await dio.get('/api/cart')).data as Map);

  Future<Map<String, dynamic>> addToCart(String productId, num quantity) async {
    final r = await dio.post('/api/cart/add', data: {
      'product_id': productId,
      'quantity': quantity,
    });
    return Map<String, dynamic>.from(r.data as Map);
  }

  Future<void> removeFromCart(String productId) async {
    await dio.delete('/api/cart/$productId');
  }

  // ── Orders ─────────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> orders() async =>
      List<Map<String, dynamic>>.from((await dio.get('/api/orders')).data as List);

  Future<Map<String, dynamic>> checkout({required String projectId, String? notes}) async {
    final r = await dio.post('/api/orders/checkout', data: {
      'project_id': projectId,
      if (notes != null) 'notes': notes,
    });
    return Map<String, dynamic>.from(r.data as Map);
  }

  // ── Projects ───────────────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> projects() async =>
      List<Map<String, dynamic>>.from((await dio.get('/api/projects')).data as List);

  // ── AI ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> recommend(String task, {String? projectName, String? trade}) async {
    final r = await dio.post('/api/ai/recommend', data: {
      'task': task,
      if (projectName != null) 'project': projectName,
      if (trade != null) 'trade': trade,
    });
    return Map<String, dynamic>.from(r.data as Map);
  }
}
