import 'dart:math';

import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

import 'app_scope.dart';

class OfflineCaptureAssistant {
  static const Set<String> _stopWords = {
    'and', 'the', 'for', 'with', 'from', 'into', 'need', 'needs', 'please',
    'some', 'this', 'that', 'these', 'those', 'site', 'order', 'materials',
    'material', 'photo', 'image', 'list', 'tomorrow', 'today', 'later',
    'und', 'der', 'die', 'das', 'ein', 'eine', 'mit', 'für', 'bitte',
  };

  static const Map<String, List<String>> _aliases = {
    'screws': ['screw', 'screws', 'schraube', 'schrauben', 'torx', 'drywall', 'gips', 'gipsschraube', 'trockenbau'],
    'anchors': ['anchor', 'anchors', 'dubel', 'dübel', 'nylon', 'fixing'],
    'gloves': ['glove', 'gloves', 'handschuh', 'handschuhe', 'nitril', 'nitrile', 'workglove'],
    'masks': ['mask', 'masks', 'ffp2', 'atemschutz', 'respirator'],
    'goggles': ['goggle', 'goggles', 'schutzbrille', 'glasses'],
    'helmet': ['helmet', 'hardhat', 'helm'],
    'tape': ['tape', 'tapes', 'band', 'gewebeband', 'duct'],
    'foam': ['foam', 'pu', 'schaum', 'sealant', 'silikon', 'silicone', 'filler'],
    'drill': ['drill', 'bohrer', 'sds', 'bit'],
    'battery': ['battery', 'batterie', 'aa', 'aaa'],
    'bags': ['bag', 'bags', 'trash', 'rubble', 'sack'],
    'marker': ['marker', 'marking', 'spray', 'chalk'],
    'ties': ['tie', 'ties', 'binder', 'cabletie', 'ziptie'],
  };

  static Future<Map<String, dynamic>> analyzeVoiceText(String text) async {
    final items = await _matchCatalog(text);
    return {
      'items': items,
      'summary': items.isEmpty
          ? 'Captured locally, but no exact catalog match was found yet.'
          : 'Captured locally and matched ${items.length} likely catalog item(s).',
    };
  }

  static Future<Map<String, dynamic>> analyzeOcrImage(String imagePath) async {
    final recognizer = TextRecognizer(script: TextRecognitionScript.latin);
    try {
      final input = InputImage.fromFilePath(imagePath);
      final recognized = await recognizer.processImage(input);
      final text = recognized.text.replaceAll(RegExp(r'\s+'), ' ').trim();

      if (text.isEmpty) {
        return {
          'items': <Map<String, dynamic>>[],
          'summary': 'No readable text was detected on the phone.',
        };
      }

      final items = await _matchCatalog(text);
      return {
        'items': items,
        'summary': items.isEmpty
            ? 'On-device OCR read the image, but no exact catalog match was found yet.'
            : 'On-device OCR matched ${items.length} likely catalog item(s).',
        'raw_text': text,
      };
    } finally {
      await recognizer.close();
    }
  }

  static Future<List<Map<String, dynamic>>> matchCatalogItems(
    List<Map<String, dynamic>> rawItems,
  ) async {
    final catalog = await _loadCatalog();
    if (catalog.isEmpty) {
      return rawItems
          .map((item) => {
                ...item,
                'suggested_qty': _extractQty(
                  item['quantity'] ?? item['quantity_estimate'] ?? item['suggested_qty'],
                ),
              })
          .toList();
    }

    return rawItems.map((item) {
      final query = (item['name'] ?? item['material'] ?? item['sku'] ?? '')
          .toString()
          .trim();
      final match = _bestCatalogMatch(query, catalog);
      final qty = _extractQty(
        item['quantity'] ?? item['quantity_estimate'] ?? item['suggested_qty'],
      );

      if (match == null) {
        return {
          ...item,
          'suggested_qty': qty,
        };
      }

      return {
        ...item,
        'product_id': match['id'],
        'matched_name': match['name'],
        'name': item['name'] ?? match['name'],
        'category': item['category'] ?? match['category'],
        'unit_price': item['unit_price'] ?? match['unit_price'],
        'currency': item['currency'] ?? match['currency'] ?? 'CHF',
        'unit': item['unit'] ?? match['unit'] ?? 'pc',
        'suggested_qty': qty,
      };
    }).toList();
  }

  static Future<List<Map<String, dynamic>>> _matchCatalog(String text) async {
    final catalog = await _loadCatalog();
    final qty = _extractQty(text);

    if (catalog.isEmpty) {
      final fallbackName = text.split(RegExp(r'[,.]')).first.trim();
      return fallbackName.isEmpty
          ? <Map<String, dynamic>>[]
          : [
              {
                'name': fallbackName,
                'suggested_qty': qty,
                'category': 'Uncategorised',
              }
            ];
    }

    final tokens = _extractTokens(text);
    final scored = catalog
        .map((product) => MapEntry(product, _scoreProduct(product, tokens, text)))
        .where((entry) => entry.value > 0)
        .toList()
      ..sort((left, right) => right.value.compareTo(left.value));

    return scored.take(6).map((entry) {
      final product = entry.key;
      return {
        'product_id': product['id'],
        'matched_name': product['name'],
        'name': product['name'],
        'category': product['category'] ?? 'Uncategorised',
        'unit_price': product['unit_price'],
        'currency': product['currency'] ?? 'CHF',
        'unit': product['unit'] ?? 'pc',
        'suggested_qty': qty,
      };
    }).toList();
  }

  static Future<List<Map<String, dynamic>>> _loadCatalog() async {
    try {
      return await AppScope.api.products(pageSize: 200);
    } catch (_) {
      return <Map<String, dynamic>>[];
    }
  }

  static Map<String, dynamic>? _bestCatalogMatch(
    String query,
    List<Map<String, dynamic>> catalog,
  ) {
    final tokens = _extractTokens(query);
    Map<String, dynamic>? best;
    var bestScore = 0;

    for (final product in catalog) {
      final score = _scoreProduct(product, tokens, query);
      if (score > bestScore) {
        bestScore = score;
        best = product;
      }
    }

    return bestScore > 0 ? best : null;
  }

  static int _scoreProduct(
    Map<String, dynamic> product,
    List<String> tokens,
    String rawText,
  ) {
    final haystack = '${product['name'] ?? ''} ${product['category'] ?? ''} ${product['description'] ?? ''} ${product['sku'] ?? ''}'
        .toLowerCase();

    var score = 0;
    for (final token in tokens) {
      if (haystack.contains(token)) score += 3;

      for (final aliasGroup in _aliases.values) {
        if (aliasGroup.contains(token) &&
            aliasGroup.any((alias) => haystack.contains(alias))) {
          score += 2;
        }
      }
    }

    final cleanedQuery = rawText.toLowerCase().trim();
    if (cleanedQuery.isNotEmpty && haystack.contains(cleanedQuery)) {
      score += 4;
    }

    return score;
  }

  static List<String> _extractTokens(String text) {
    final parts = text
        .toLowerCase()
        .split(RegExp(r'[^a-z0-9à-ÿ]+'))
        .where((part) => part.length >= 3 && !_stopWords.contains(part))
        .toList();

    return parts.take(12).toList();
  }

  static int _extractQty(Object? raw) {
    if (raw is num) return max(1, raw.toInt());
    final text = (raw ?? '').toString();
    final match = RegExp(r'(\d{1,4})').firstMatch(text);
    if (match == null) return 1;
    return max(1, int.tryParse(match.group(1) ?? '1') ?? 1);
  }
}
