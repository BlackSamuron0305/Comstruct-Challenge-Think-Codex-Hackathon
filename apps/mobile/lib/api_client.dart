// API client with secure token storage, auto-refresh, retry, and offline cache.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:dio_smart_retry/dio_smart_retry.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive/hive.dart';
import 'package:uuid/uuid.dart';


String describeApiError(Object error, {String? baseUrl}) {
  if (error is DioException) {
    final status = error.response?.statusCode;
    if (status != null) {
      if (status == 401) {
        return 'Your session is missing or expired. Please sign in again.';
      }
      if (status == 403) {
        return 'The backend denied access to this action.';
      }
      final detail = error.response?.data;
      final detailText = detail == null ? '' : ' ${detail.toString()}';
      return 'Backend request failed with HTTP $status.$detailText';
    }

    switch (error.type) {
      case DioExceptionType.connectionTimeout:
      case DioExceptionType.sendTimeout:
      case DioExceptionType.receiveTimeout:
        return 'Backend timed out while contacting ${baseUrl ?? 'the server'}.';
      case DioExceptionType.connectionError:
        return 'Could not connect to ${baseUrl ?? 'the server'}.';
      case DioExceptionType.badCertificate:
        return 'TLS certificate validation failed for ${baseUrl ?? 'the server'}.';
      case DioExceptionType.cancel:
        return 'The request was cancelled before the backend responded.';
      case DioExceptionType.unknown:
      case DioExceptionType.badResponse:
        break;
    }
  }

  final message = error.toString().trim();
  return message.isEmpty ? 'Unknown backend error.' : message;
}

// ─── Secure Token Storage ─────────────────────────────────────────────
class TokenStore {
  static const _kAccess = 'comstruct.access';
  static const _kRefresh = 'comstruct.refresh';
  final _storage = const FlutterSecureStorage();
  String? access;
  String? refresh;

  Future<void> load() async {
    access = await _storage.read(key: _kAccess);
    refresh = await _storage.read(key: _kRefresh);
  }

  Future<void> save({String? access, String? refresh}) async {
    if (access != null) {
      this.access = access;
      await _storage.write(key: _kAccess, value: access);
    }
    if (refresh != null) {
      this.refresh = refresh;
      await _storage.write(key: _kRefresh, value: refresh);
    }
  }

  Future<void> clear() async {
    access = null;
    refresh = null;
    await _storage.delete(key: _kAccess);
    await _storage.delete(key: _kRefresh);
  }
}

// ─── Offline Cache ────────────────────────────────────────────────────
class OfflineCache {
  static Box? _box;

  static Future<void> init() async {
    _box = await Hive.openBox('api_cache');
  }

  static Future<void> put(String key, dynamic data, {Duration ttl = const Duration(hours: 4)}) async {
    _box?.put(key, jsonEncode({'data': data, 'expires': DateTime.now().add(ttl).toIso8601String()}));
  }

  static dynamic get(String key) {
    final raw = _box?.get(key);
    if (raw == null) return null;
    try {
      final map = jsonDecode(raw as String) as Map<String, dynamic>;
      if (DateTime.parse(map['expires'] as String).isAfter(DateTime.now())) {
        return map['data'];
      }
      _box?.delete(key);
    } catch (_) {}
    return null;
  }

  static Future<void> clear() async => _box?.clear();
}

// ─── API Client ───────────────────────────────────────────────────────
class ApiClient {
  ApiClient({required this.baseUrl, required this.tokens})
      : dio = Dio(BaseOptions(
          baseUrl: baseUrl,
          connectTimeout: const Duration(seconds: 15),
          receiveTimeout: const Duration(seconds: 30),
          sendTimeout: const Duration(seconds: 15),
        )) {
    // JWT interceptor
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

    // Smart retry with exponential backoff
    dio.interceptors.add(RetryInterceptor(
      dio: dio,
      retries: 3,
      retryDelays: const [
        Duration(seconds: 1),
        Duration(seconds: 3),
        Duration(seconds: 5),
      ],
    ));
  }

  final String baseUrl;
  final TokenStore tokens;
  final Dio dio;
  final _uuid = const Uuid();

  Future<bool> _tryRefresh() async {
    try {
      final r = await Dio(BaseOptions(
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 10),
      )).post(
        '$baseUrl/auth/refresh',
        data: {'refresh_token': tokens.refresh},
      );
      await tokens.save(access: r.data['access_token'] as String);
      return true;
    } catch (_) {
      await tokens.clear();
      return false;
    }
  }

  // ── Auth ───────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> login(String email, String password) async {
    final r = await Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 15),
    )).post(
      '/auth/login',
      data: {'email': email, 'password': password},
    );
    final data = Map<String, dynamic>.from(r.data as Map);
    await tokens.save(
      access: data['access_token'] as String,
      refresh: data['refresh_token'] as String,
    );
    return Map<String, dynamic>.from(data['user'] as Map);
  }

  Future<Map<String, dynamic>> register({
    required String fullName,
    required String email,
    required String password,
    required String role,
    required String companyName,
    String? phone,
  }) async {
    final r = await Dio(BaseOptions(
      baseUrl: baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 20),
    )).post(
      '/auth/register',
      data: {
        'full_name': fullName,
        'email': email,
        'password': password,
        'role': role,
        'company_name': companyName,
        if (phone != null && phone.trim().isNotEmpty) 'phone': phone.trim(),
        'preferred_language': 'en',
      },
    );
    final data = Map<String, dynamic>.from(r.data as Map);
    await tokens.save(
      access: data['access_token'] as String,
      refresh: data['refresh_token'] as String,
    );
    return Map<String, dynamic>.from(data['user'] as Map);
  }

  Future<Map<String, dynamic>> me() async {
    final r = await dio.get('/auth/me');
    return Map<String, dynamic>.from(r.data as Map);
  }

  // ── Catalog (with offline cache + pagination) ──────────────────────
  Future<List<Map<String, dynamic>>> products({
    String? q,
    String? category,
    int page = 1,
    int pageSize = 50,
  }) async {
    final cacheKey = 'products:${q ?? ''}:${category ?? ''}:$page';
    try {
      final r = await dio.get('/api/products', queryParameters: {
        if (q != null && q.isNotEmpty) 'q': q,
        if (category != null) 'category': category,
        'page': page,
        'page_size': pageSize,
      });
      final result = List<Map<String, dynamic>>.from(r.data as List);
      await OfflineCache.put(cacheKey, r.data);
      return result;
    } catch (_) {
      final cached = OfflineCache.get(cacheKey);
      if (cached != null) return List<Map<String, dynamic>>.from(cached as List);
      rethrow;
    }
  }

  // ── Cart ───────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> getCart() async {
    try {
      final r = await dio.get('/api/cart');
      final result = Map<String, dynamic>.from(r.data as Map);
      await OfflineCache.put('cart', r.data, ttl: const Duration(minutes: 30));
      return result;
    } catch (_) {
      final cached = OfflineCache.get('cart');
      if (cached != null) return Map<String, dynamic>.from(cached as Map);
      rethrow;
    }
  }

  Future<Map<String, dynamic>> addToCart(String productId, num quantity) async {
    final r = await dio.post('/api/cart/add', data: {
      'product_id': productId,
      'quantity': quantity,
    });
    final result = Map<String, dynamic>.from(r.data as Map);
    await OfflineCache.put('cart', r.data, ttl: const Duration(minutes: 30));
    return result;
  }

  Future<void> removeFromCart(String productId) async {
    await dio.delete('/api/cart/$productId');
  }

  Future<void> clearCart() async {
    await dio.delete('/api/cart');
    await OfflineCache.put('cart', {
      'items': <Map<String, dynamic>>[],
      'total_amount': '0.00',
      'currency': 'CHF',
    }, ttl: const Duration(minutes: 30));
  }

  // ── Orders (with idempotency) ──────────────────────────────────────
  Future<List<Map<String, dynamic>>> orders({int page = 1, int pageSize = 50}) async {
    final cacheKey = 'orders:$page';
    try {
      final r = await dio.get('/api/orders', queryParameters: {
        'page': page,
        'page_size': pageSize,
      });
      final result = List<Map<String, dynamic>>.from(r.data as List);
      await OfflineCache.put(cacheKey, r.data, ttl: const Duration(minutes: 5));
      return result;
    } catch (_) {
      final cached = OfflineCache.get(cacheKey);
      if (cached != null) return List<Map<String, dynamic>>.from(cached as List);
      rethrow;
    }
  }

  Future<Map<String, dynamic>> checkout({
    required String projectId,
    String? notes,
    String? idempotencyKey,
  }) async {
    final key = idempotencyKey ?? _uuid.v4();
    final r = await dio.post('/api/orders/checkout',
      data: {
        'project_id': projectId,
        if (notes != null) 'notes': notes,
      },
      options: Options(headers: {'Idempotency-Key': key}),
    );
    return Map<String, dynamic>.from(r.data as Map);
  }

  // ── Projects (cached) ──────────────────────────────────────────────
  Future<List<Map<String, dynamic>>> projects() async {
    try {
      final r = await dio.get('/api/projects');
      final result = List<Map<String, dynamic>>.from(r.data as List);
      await OfflineCache.put('projects', r.data, ttl: const Duration(hours: 12));
      return result;
    } catch (_) {
      final cached = OfflineCache.get('projects');
      if (cached != null) return List<Map<String, dynamic>>.from(cached as List);
      rethrow;
    }
  }

  // ── AI ─────────────────────────────────────────────────────────────
  Future<Map<String, dynamic>> recommend(String task, {String? projectName, String? trade}) async {
    final r = await dio.post('/api/ai/recommend', data: {
      'task': task,
      if (projectName != null) 'project': projectName,
      if (trade != null) 'trade': trade,
      'language': 'en',
    });
    return Map<String, dynamic>.from(r.data as Map);
  }

  Future<Map<String, dynamic>> chat(String message, {Map<String, dynamic>? context, String language = 'en'}) async {
    final r = await dio.post('/api/ai/chat', data: {
      'message': message,
      if (context != null) 'context': context,
      'language': language,
    });
    return Map<String, dynamic>.from(r.data as Map);
  }

  Future<Map<String, dynamic>> uploadImage(
    String filePath, {
    String? context,
    String? projectId,
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
      if (context != null) 'context': context,
      if (projectId != null) 'project_id': projectId,
    });
    final r = await dio.post('/api/ai/upload-image', data: formData);
    return Map<String, dynamic>.from(r.data as Map);
  }

  Future<Map<String, dynamic>> extractImageText(
    String filePath, {
    String documentType = 'order',
    String defaultCurrency = 'CHF',
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
      'document_type': documentType,
      'default_currency': defaultCurrency,
    });
    final r = await dio.post('/api/ai/extract-image', data: formData);
    return Map<String, dynamic>.from(r.data as Map);
  }

  Future<Map<String, dynamic>> transcribeAudio(
    String filePath, {
    String language = 'en',
    String? context,
    bool respond = true,
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(filePath),
      'language': language,
      if (context != null) 'context': context,
      'respond': respond.toString(),
    });
    final r = await dio.post('/api/ai/transcribe-audio', data: formData);
    return Map<String, dynamic>.from(r.data as Map);
  }

  Future<Map<String, dynamic>> analyzePhoto(String description, {String? projectId}) async {
    final r = await dio.post('/api/ai/analyze-photo', data: {
      'description': description,
      if (projectId != null) 'project_id': projectId,
    });
    return Map<String, dynamic>.from(r.data as Map);
  }

  // ── Supplier Proposals ────────────────────────────────────────────
  Future<Map<String, dynamic>> createSupplierProposal(String companyId, String productQuery, {String? category}) async {
    final r = await dio.post('/api/supplier-scoring/proposals', data: {
      'company_id': companyId,
      'product_query': productQuery,
      if (category != null) 'category': category,
    });
    return Map<String, dynamic>.from(r.data as Map);
  }

  Future<List<Map<String, dynamic>>> listProposals(String companyId, {String? status}) async {
    final r = await dio.get('/api/supplier-scoring/proposals/by-company/$companyId', queryParameters: {
      if (status != null) 'status': status,
    });
    return List<Map<String, dynamic>>.from(r.data as List);
  }

  Future<Map<String, dynamic>> approveProposal(String proposalId, int supplierIndex, String approvedBy, {String? notes}) async {
    final r = await dio.post('/api/supplier-scoring/proposals/$proposalId/approve', data: {
      'supplier_index': supplierIndex,
      'approved_by': approvedBy,
      if (notes != null) 'notes': notes,
    });
    return Map<String, dynamic>.from(r.data as Map);
  }

  Future<List<Map<String, dynamic>>> preferredSuppliers(String companyId) async {
    final r = await dio.get('/api/supplier-scoring/preferred/$companyId');
    return List<Map<String, dynamic>>.from(r.data as List);
  }
}
