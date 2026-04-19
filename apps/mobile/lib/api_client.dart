// API client with secure token storage, auto-refresh, retry, and offline cache.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:dio_smart_retry/dio_smart_retry.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive/hive.dart';
import 'package:uuid/uuid.dart';

import 'config.dart';


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

String normalizeCurrencyCode(String? currency) {
  final code = (currency ?? 'EUR').toUpperCase();
  return code == 'CHF' ? 'EUR' : code;
}

num? parseFlexibleNumber(Object? value) {
  if (value == null) return null;
  if (value is num) return value;

  final raw = value.toString().trim();
  if (raw.isEmpty) return null;

  final cleaned = raw.replaceAll(RegExp(r'[^0-9,\.\-]'), '');
  if (cleaned.isEmpty || cleaned == '-' || cleaned == '.' || cleaned == ',') {
    return null;
  }

  final normalized = cleaned.contains(',') && cleaned.contains('.')
      ? cleaned.replaceAll(',', '')
      : cleaned.replaceAll(',', '.');

  return num.tryParse(normalized);
}

int parseFlexibleInt(Object? value, {int fallback = 1}) {
  final parsed = parseFlexibleNumber(value);
  if (parsed == null) return fallback;
  final asInt = parsed.toInt();
  return asInt > 0 ? asInt : fallback;
}

const Set<String> _catalogIntentStopwords = {
  'a', 'an', 'and', 'the', 'i', 'need', 'want', 'some', 'please', 'for', 'to',
  'of', 'my', 'our', 'me', 'we', 'order', 'get', 'find', 'show', 'with', 'from',
};

const Set<String> _catalogAnchorWords = {
  'hammer', 'drill', 'screw', 'anchor', 'anchors', 'bolt', 'bolts', 'glove',
  'gloves', 'mask', 'masks', 'tape', 'pipe', 'pipes', 'cable', 'cables',
  'sealant', 'silicone', 'foam', 'light', 'lights', 'battery', 'batteries',
  'helmet', 'tool', 'tools', 'ladder', 'lamp', 'lamps', 'tie', 'ties',
};

List<String> _catalogIntentTokens(String value) {
  return value
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9\s-]'), ' ')
      .split(RegExp(r'\s+'))
      .map((token) => token.trim())
      .where((token) =>
          token.length > 1 &&
          !_catalogIntentStopwords.contains(token) &&
          !RegExp(r'^\d+$').hasMatch(token) &&
          !RegExp(r'^(mm|cm|m|kg|g|gr|oz|ml|l|x)$').hasMatch(token))
      .toList();
}

String _catalogDisplayLabel(Map<String, dynamic> item) {
  final raw = (item['display_name'] ??
          item['requested_label'] ??
          item['matched_name'] ??
          item['name'] ??
          item['material'] ??
          item['category'] ??
          '')
      .toString()
      .trim();

  if (raw.isEmpty) return 'Material';

  final tokens = _catalogIntentTokens(raw);
  if (tokens.isEmpty) return raw;

  final noun = tokens.reversed.firstWhere(
    (token) => _catalogAnchorWords.contains(token),
    orElse: () => tokens.length > 1 ? tokens[1] : tokens.last,
  );
  final descriptor = tokens.first == noun ? noun : '${tokens.first} $noun';
  return descriptor
      .split(' ')
      .where((part) => part.isNotEmpty)
      .take(3)
      .map((part) => part[0].toUpperCase() + part.substring(1))
      .join(' ');
}

bool itemMatchesClarificationOption(Map<String, dynamic> item, String option) {
  final labelTokens = _catalogIntentTokens(_catalogDisplayLabel(item));
  final optionTokens = _catalogIntentTokens(option);
  if (optionTokens.isEmpty) return false;
  return optionTokens.every(labelTokens.contains);
}

Map<String, dynamic> buildDeferredSelectionState(
  String query,
  List<Map<String, dynamic>> items,
) {
  if (items.isEmpty) {
    return {
      'items': <Map<String, dynamic>>[],
      'needsClarification': false,
      'clarificationQuestion': null,
      'clarificationOptions': <String>[],
      'statusNote': null,
    };
  }

  final grouped = <String, List<Map<String, dynamic>>>{};
  for (final item in items) {
    final copy = Map<String, dynamic>.from(item);
    final label = _catalogDisplayLabel(copy);
    grouped.putIfAbsent(label, () => <Map<String, dynamic>>[]).add(copy);
  }

  final representatives = grouped.entries.map((entry) {
    final representative = Map<String, dynamic>.from(entry.value.first);
    representative['display_name'] = entry.key;
    representative['catalog_offer_count'] = entry.value.length;
    representative['selection_deferred'] = true;
    representative['candidate_names'] = entry.value
        .map((candidate) => (candidate['name'] ?? '').toString().trim())
        .where((name) => name.isNotEmpty)
        .toSet()
        .take(4)
        .toList();
    return representative;
  }).toList();

  final queryTokens = _catalogIntentTokens(query);
  final specificMatches = queryTokens.length > 1
      ? representatives.where((item) {
          final labelTokens = _catalogIntentTokens(
            (item['display_name'] ?? '').toString(),
          );
          return queryTokens.every(labelTokens.contains);
        }).toList()
      : <Map<String, dynamic>>[];

  final labels = representatives
      .map((item) => (item['display_name'] ?? '').toString().trim())
      .where((label) => label.isNotEmpty)
      .toList();

  final needsClarification = labels.length > 1 && specificMatches.length != 1;

  String? clarificationQuestion;
  if (needsClarification) {
    var focus = 'item';
    for (final token in queryTokens.reversed) {
      final matching = labels
          .where((label) => _catalogIntentTokens(label).contains(token))
          .length;
      if (matching >= 2) {
        focus = token;
        break;
      }
    }
    clarificationQuestion =
        'I found several similar $focus options in the catalogue. Which type do you need?';
  }

  final selectedItems = specificMatches.length == 1 ? specificMatches : representatives;
  final offerCount = items.length;
  final groupedCount = selectedItems.length;
  final statusNote = needsClarification
      ? 'Tell me the type first. The final supplier and exact model will be selected later during backend scoring.'
      : offerCount > groupedCount
          ? 'I found $offerCount matching offers. The final supplier and exact model will be selected automatically later during scoring.'
          : null;

  return {
    'items': selectedItems,
    'needsClarification': needsClarification,
    'clarificationQuestion': clarificationQuestion,
    'clarificationOptions': needsClarification ? labels.take(4).toList() : <String>[],
    'statusNote': statusNote,
  };
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
  ApiClient({required String baseUrl, required this.tokens})
      : _initialBaseUrl = baseUrl,
        dio = Dio(BaseOptions(
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
        final recovered = await _retryOnAlternateBaseUrl(e);
        if (recovered != null) {
          return h.resolve(recovered);
        }

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

  final String _initialBaseUrl;
  final TokenStore tokens;
  final Dio dio;
  final _uuid = const Uuid();

  String get baseUrl => dio.options.baseUrl;

  bool _isConnectivityError(DioException error) {
    return error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout;
  }

  Future<Response<dynamic>?> _retryOnAlternateBaseUrl(DioException error) async {
    if (!_isConnectivityError(error)) return null;
    if (error.requestOptions.extra['baseUrlRetried'] == true) return null;

    final current = dio.options.baseUrl;
    final candidates = AppConfig.candidateApiBaseUrls.where((url) => url != current).toList();
    if (candidates.isEmpty) return null;

    for (final candidate in candidates) {
      try {
        final probe = await Dio(BaseOptions(
          baseUrl: candidate,
          connectTimeout: const Duration(seconds: 4),
          receiveTimeout: const Duration(seconds: 4),
          sendTimeout: const Duration(seconds: 4),
        )).get('/health');

        if (probe.statusCode == 200) {
          dio.options.baseUrl = candidate;
          final retryRequest = error.requestOptions.copyWith(
            baseUrl: candidate,
            headers: {
              ...error.requestOptions.headers,
              if (tokens.access != null) 'Authorization': 'Bearer ${tokens.access}',
            },
            extra: {
              ...error.requestOptions.extra,
              'baseUrlRetried': true,
              'previousBaseUrl': current.isEmpty ? _initialBaseUrl : current,
            },
          );
          return await dio.fetch(retryRequest);
        }
      } catch (_) {
        continue;
      }
    }

    return null;
  }

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
      'currency': 'EUR',
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
    String defaultCurrency = 'EUR',
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
