// API client with secure token storage, auto-refresh, retry, and offline cache.
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:dio_smart_retry/dio_smart_retry.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:hive/hive.dart';
import 'package:shared_preferences/shared_preferences.dart';
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
  final lower = message.toLowerCase();
  if (lower.contains('connection closed before full header was received') ||
      lower.contains('socketexception') ||
      lower.contains('connection refused') ||
      lower.contains('failed host lookup')) {
    return 'Could not reach ${baseUrl ?? 'the server'} from this device. Please retry.';
  }
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

const Set<String> _catalogGenericDescriptors = {
  'pro', 'premium', 'industrial', 'classic', 'basic', 'standard', 'general',
  'heavy', 'duty', 'site', 'work', 'material', 'materials', 'supplies',
  'equipment', 'set', 'kit', 'plus', 'max', 'mini', 'super',
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

String _humanizeCatalogLabel(String value) {
  final cleaned = value
      .replaceAll(RegExp(r'[_\-]+'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  if (cleaned.isEmpty) return '';
  return cleaned
      .split(' ')
      .where((part) => part.isNotEmpty)
      .map((part) => part[0].toUpperCase() + part.substring(1).toLowerCase())
      .join(' ');
}

String _singularizeCatalogWord(String value) {
  final normalized = value.trim().toLowerCase();
  if (normalized.endsWith('ies') && normalized.length > 3) {
    return '${normalized.substring(0, normalized.length - 3)}y';
  }
  if (normalized.endsWith('s') && !normalized.endsWith('ss') && normalized.length > 3) {
    return normalized.substring(0, normalized.length - 1);
  }
  return normalized;
}

bool _isGenericCatalogTypeLabel(String value, Map<String, dynamic> item) {
  final cleaned = value.trim();
  if (cleaned.isEmpty) return true;

  final lower = _singularizeCatalogWord(cleaned);
  final category = _singularizeCatalogWord((item['category'] ?? '').toString());
  final family = _singularizeCatalogWord(
    _humanizeCatalogLabel((item['product_family'] ?? '').toString()),
  );

  if (lower == 'general' || lower == 'material') return true;
  if (lower == category || lower == family) return true;
  if (_catalogAnchorWords.contains(lower) && cleaned.split(' ').length == 1) {
    return true;
  }

  return false;
}

String? _deriveSubtypeLabelFromName(Map<String, dynamic> item) {
  final raw = (item['requested_label'] ??
          item['matched_name'] ??
          item['display_name'] ??
          item['name'] ??
          item['material'] ??
          '')
      .toString()
      .replaceAll(RegExp(r'\b\d+([\.,x×/-]\d+)*\b'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  if (raw.isEmpty) return null;

  final tokens = _catalogIntentTokens(raw);
  if (tokens.isEmpty) return raw;

  final anchorIndex = tokens.lastIndexWhere(_catalogAnchorWords.contains);
  if (anchorIndex != -1) {
    final noun = tokens[anchorIndex];
    for (var i = anchorIndex - 1; i >= 0; i--) {
      final candidate = tokens[i];
      if (_catalogGenericDescriptors.contains(candidate) || _catalogAnchorWords.contains(candidate)) {
        continue;
      }
      return _humanizeCatalogLabel('$candidate $noun');
    }
    return _humanizeCatalogLabel(noun);
  }

  final noun = tokens.reversed.firstWhere(
    (token) => !_catalogGenericDescriptors.contains(token),
    orElse: () => tokens.last,
  );
  final descriptor = tokens.first == noun ? noun : '${tokens.first} $noun';
  return _humanizeCatalogLabel(descriptor);
}

String _catalogDisplayLabel(Map<String, dynamic> item) {
  final taxonomyLabel = (item['taxonomy_label'] ?? '').toString().trim();
  if (taxonomyLabel.isNotEmpty) {
    final segments = taxonomyLabel
        .split('>')
        .map((segment) => segment.trim())
        .where((segment) => segment.isNotEmpty && segment.toLowerCase() != 'general')
        .toList();
    if (segments.isNotEmpty && !_isGenericCatalogTypeLabel(segments.last, item)) {
      return segments.last;
    }
  }

  final nameLabel = _deriveSubtypeLabelFromName(item);
  if (nameLabel != null && !_isGenericCatalogTypeLabel(nameLabel, item)) {
    return nameLabel;
  }

  final familyLabel = _humanizeCatalogLabel(
    (item['product_family'] ?? item['subcategory'] ?? item['subtype'] ?? '')
        .toString(),
  );
  if (familyLabel.isNotEmpty) return familyLabel;

  return 'Material';
}

bool itemMatchesClarificationOption(Map<String, dynamic> item, String option) {
  final optionTokens = _catalogIntentTokens(option);
  if (optionTokens.isEmpty) return false;

  final labelTokens = {
    ..._catalogIntentTokens(_catalogDisplayLabel(item)),
    ..._catalogIntentTokens((item['taxonomy_label'] ?? '').toString()),
    ..._catalogIntentTokens((item['product_family'] ?? '').toString()),
    ..._catalogIntentTokens((item['name'] ?? '').toString()),
  };

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
      ? 'Tell me the type first. The backend scoring model will choose the best supplier and exact item automatically after that.'
      : offerCount > groupedCount
          ? 'I found $offerCount matching offers. The backend scoring model will choose the best supplier and exact item automatically later.'
          : null;

  return {
    'items': selectedItems,
    'needsClarification': needsClarification,
    'clarificationQuestion': clarificationQuestion,
    'clarificationOptions': needsClarification ? labels.take(4).toList() : <String>[],
    'statusNote': statusNote,
  };
}

Map<String, dynamic> applyClarificationSelection({
  required String option,
  required List<Map<String, dynamic>> items,
  String? currentNote,
}) {
  final filtered = items
      .where((item) => itemMatchesClarificationOption(item, option))
      .map((item) => Map<String, dynamic>.from(item))
      .toList();

  final selectedItems = filtered.isNotEmpty
      ? filtered
      : items.map((item) => Map<String, dynamic>.from(item)).toList();

  final note = [
    currentNote,
    'Using $option. The backend scoring model will choose the exact supplier and item automatically.',
  ].where((value) => value != null && value.trim().isNotEmpty).join('\n\n');

  return {
    'items': selectedItems,
    'clarificationQuestion': null,
    'clarificationOptions': <String>[],
    'statusNote': note,
  };
}

// ─── Secure Token Storage ─────────────────────────────────────────────
class TokenStore {
  static const _kAccess = 'comstruct.access';
  static const _kRefresh = 'comstruct.refresh';

  final _storage = const FlutterSecureStorage();
  SharedPreferences? _prefs;
  bool _secureStorageAvailable = true;

  String? access;
  String? refresh;

  Future<SharedPreferences> get _sharedPrefs async =>
      _prefs ??= await SharedPreferences.getInstance();

  Future<String?> _readValue(String key) async {
    if (_secureStorageAvailable) {
      try {
        return await _storage.read(key: key);
      } catch (_) {
        _secureStorageAvailable = false;
      }
    }
    final prefs = await _sharedPrefs;
    return prefs.getString(key);
  }

  Future<void> _writeValue(String key, String value) async {
    if (_secureStorageAvailable) {
      try {
        await _storage.write(key: key, value: value);
        return;
      } catch (_) {
        _secureStorageAvailable = false;
      }
    }
    final prefs = await _sharedPrefs;
    await prefs.setString(key, value);
  }

  Future<void> _deleteValue(String key) async {
    if (_secureStorageAvailable) {
      try {
        await _storage.delete(key: key);
        return;
      } catch (_) {
        _secureStorageAvailable = false;
      }
    }
    final prefs = await _sharedPrefs;
    await prefs.remove(key);
  }

  Future<void> load() async {
    access = await _readValue(_kAccess);
    refresh = await _readValue(_kRefresh);
  }

  Future<void> save({String? access, String? refresh}) async {
    if (access != null) {
      this.access = access;
      await _writeValue(_kAccess, access);
    }
    if (refresh != null) {
      this.refresh = refresh;
      await _writeValue(_kRefresh, refresh);
    }
  }

  Future<void> clear() async {
    access = null;
    refresh = null;
    await _deleteValue(_kAccess);
    await _deleteValue(_kRefresh);
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
    final message = error.message?.toLowerCase() ?? '';
    return error.type == DioExceptionType.connectionError ||
        error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.receiveTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        (error.type == DioExceptionType.unknown &&
            (message.contains('connection closed') ||
                message.contains('socketexception') ||
                message.contains('failed host lookup') ||
                message.contains('connection refused')));
  }

  Future<void> ensureReachableBaseUrl() async {
    final resolved = await AppConfig.resolveReachableApiBaseUrl();
    dio.options.baseUrl = resolved;
    await AppConfig.rememberReachableApiBaseUrl(resolved);
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
          await AppConfig.rememberReachableApiBaseUrl(candidate);
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
  Future<List<Map<String, dynamic>>> _catalogFallbackRecommendations(String task) async {
    try {
      final r = await dio.get('/api/products/recommendations', queryParameters: {
        'query': task,
        'requested_quantity': 1,
        'strategy': 'balanced',
      });
      final data = Map<String, dynamic>.from(r.data as Map);
      final topChoices = List<Map<String, dynamic>>.from((data['top_choices'] as List?) ?? const []);
      final others = List<Map<String, dynamic>>.from((data['others'] as List?) ?? const []);
      return [...topChoices, ...others]
          .map((item) => {
                'product_id': item['id']?.toString(),
                'id': item['id']?.toString(),
                'name': item['name'],
                'display_name': item['name'],
                'unit_price': item['unit_price'],
                'currency': item['currency'],
                'unit': item['unit'],
                'category': item['category'] ?? item['taxonomy_label'],
                'taxonomy_code': item['taxonomy_code'],
                'taxonomy_label': item['taxonomy_label'],
                'product_family': item['product_family'],
                'supplier_name': item['supplier_name'],
                'score': item['score'],
                'suggested_qty': 1,
              })
          .toList();
    } catch (_) {
      return const [];
    }
  }

  Future<Map<String, dynamic>> recommend(String task, {String? projectName, String? trade}) async {
    final r = await dio.post('/api/ai/recommend', data: {
      'task': task,
      if (projectName != null) 'project': projectName,
      if (trade != null) 'trade': trade,
      'language': 'en',
    });
    final result = Map<String, dynamic>.from(r.data as Map);
    final items = List<Map<String, dynamic>>.from((result['items'] as List?) ?? const []);
    if (items.isNotEmpty) {
      return result;
    }

    final fallbackItems = await _catalogFallbackRecommendations(task);
    if (fallbackItems.isEmpty) {
      return result;
    }

    return {
      ...result,
      'summary': (result['summary'] as String?)?.trim().isNotEmpty == true
          ? result['summary']
          : 'I found ${fallbackItems.length} matching catalog offers. You can refine the type now, and the exact supplier choice will be scored later.',
      'items': fallbackItems,
    };
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
