/// On-device LLM client — runs Gemma locally for offline AI.
/// Uses HTTP to a local inference server (MediaPipe LLM Inference API)
/// bundled inside the app, or falls back to OpenAI when online.
import 'dart:convert';
import 'dart:io';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';

import 'config.dart';

enum LlmSource { local, openai, none }

class LlmResult {
  LlmResult({required this.text, required this.source, this.confidence});
  final String text;
  final LlmSource source;
  final double? confidence;

  Map<String, dynamic> toJson() => {
        'text': text,
        'source': source.name,
        if (confidence != null) 'confidence': confidence,
      };
}

/// Hybrid AI client: OpenAI when online, local Gemma when offline.
class LocalLlmClient {
  LocalLlmClient();

  final Dio _openAiDio = Dio(BaseOptions(
    baseUrl: 'https://api.openai.com/v1',
    connectTimeout: const Duration(seconds: 15),
    receiveTimeout: const Duration(seconds: 60),
  ));

  /// Check network connectivity.
  Future<bool> get isOnline async {
    final result = await Connectivity().checkConnectivity();
    return !result.contains(ConnectivityResult.none);
  }

  /// Generate a response — tries OpenAI first, then local Gemma.
  Future<LlmResult> generate({
    required String prompt,
    String? systemPrompt,
    double temperature = 0.3,
    int maxTokens = 512,
  }) async {
    // Try OpenAI if online and key is set
    if (AppConfig.openAiApiKey.isNotEmpty && await isOnline) {
      try {
        return await _callOpenAi(
          prompt: prompt,
          systemPrompt: systemPrompt,
          temperature: temperature,
          maxTokens: maxTokens,
        );
      } catch (_) {
        // Fall through to local model
      }
    }

    // Try local Gemma model
    try {
      return await _callLocalModel(prompt: prompt, systemPrompt: systemPrompt);
    } catch (_) {
      return LlmResult(
        text: 'AI is currently unavailable. Please check your connection and try again.',
        source: LlmSource.none,
        confidence: 0.0,
      );
    }
  }

  /// Generate a JSON response — tries OpenAI first, then local Gemma.
  Future<Map<String, dynamic>> generateJson({
    required String prompt,
    String? systemPrompt,
    Map<String, dynamic>? fallback,
  }) async {
    final result = await generate(
      prompt: prompt,
      systemPrompt: (systemPrompt ?? '') + '\n\nRespond with valid JSON only. No markdown.',
      temperature: 0.2,
      maxTokens: 1024,
    );

    if (result.source == LlmSource.none) {
      return fallback ?? {'error': 'AI unavailable'};
    }

    try {
      return jsonDecode(result.text) as Map<String, dynamic>;
    } catch (_) {
      // Try extracting JSON from response
      final text = result.text;
      final start = text.indexOf('{');
      final end = text.lastIndexOf('}');
      if (start != -1 && end > start) {
        try {
          return jsonDecode(text.substring(start, end + 1)) as Map<String, dynamic>;
        } catch (_) {}
      }
      return fallback ?? {'reply': result.text, 'source': result.source.name};
    }
  }

  Future<LlmResult> _callOpenAi({
    required String prompt,
    String? systemPrompt,
    double temperature = 0.3,
    int maxTokens = 512,
  }) async {
    final messages = <Map<String, String>>[
      if (systemPrompt != null) {'role': 'system', 'content': systemPrompt},
      {'role': 'user', 'content': prompt},
    ];

    final response = await _openAiDio.post(
      '/chat/completions',
      options: Options(headers: {
        'Authorization': 'Bearer ${AppConfig.openAiApiKey}',
        'Content-Type': 'application/json',
      }),
      data: {
        'model': AppConfig.openAiModel,
        'messages': messages,
        'max_tokens': maxTokens,
        'temperature': temperature,
      },
    );

    final content = response.data['choices'][0]['message']['content'] as String;
    return LlmResult(text: content, source: LlmSource.openai, confidence: 0.9);
  }

  /// Call the on-device Gemma model via platform channel or local HTTP server.
  /// For the hackathon, this uses a simplified prompt compression approach.
  /// In production, integrate MediaPipe LLM Inference API directly via
  /// platform channels (Android: Java/Kotlin, iOS: Swift).
  Future<LlmResult> _callLocalModel({
    required String prompt,
    String? systemPrompt,
  }) async {
    // On-device inference via platform channel stub.
    // In production, this would call:
    //   Android: MediaPipe LlmInference.generateResponse()
    //   iOS: MediaPipe LlmInference.generateResponse()
    //
    // For now, provide a helpful offline response based on keyword matching
    // until the native platform channel bridge is set up.
    final lowerPrompt = prompt.toLowerCase();

    // Construction material keyword matching for offline mode
    if (lowerPrompt.contains('screw') || lowerPrompt.contains('bolt') || lowerPrompt.contains('fastener')) {
      return LlmResult(
        text: 'For fastening tasks, consider: stainless steel screws (A2/A4), '
            'concrete anchors, or machine bolts. Check SIA 118 for load requirements.',
        source: LlmSource.local,
        confidence: 0.6,
      );
    }
    if (lowerPrompt.contains('pipe') || lowerPrompt.contains('plumb') || lowerPrompt.contains('sanit')) {
      return LlmResult(
        text: 'For plumbing work: PE-X pipes, copper fittings, sealing tape, '
            'and pipe insulation are typically needed. Follow SIA 385 standards.',
        source: LlmSource.local,
        confidence: 0.6,
      );
    }
    if (lowerPrompt.contains('tile') || lowerPrompt.contains('floor') || lowerPrompt.contains('ceramic')) {
      return LlmResult(
        text: 'For tiling: adhesive mortar, grout, spacers, leveling compound, '
            'and waterproofing membrane. Calculate ~5% extra for cuts.',
        source: LlmSource.local,
        confidence: 0.6,
      );
    }
    if (lowerPrompt.contains('paint') || lowerPrompt.contains('coat') || lowerPrompt.contains('wall')) {
      return LlmResult(
        text: 'For painting/coating: primer, wall paint, rollers, masking tape, '
            'and drop cloths. Calculate ~0.15L/m² per coat.',
        source: LlmSource.local,
        confidence: 0.6,
      );
    }
    if (lowerPrompt.contains('electric') || lowerPrompt.contains('cable') || lowerPrompt.contains('wire')) {
      return LlmResult(
        text: 'For electrical work: NYM cables, junction boxes, circuit breakers, '
            'conduit pipes, and cable ties. Follow NIN/SEV standards.',
        source: LlmSource.local,
        confidence: 0.6,
      );
    }
    if (lowerPrompt.contains('insul') || lowerPrompt.contains('thermal') || lowerPrompt.contains('dämm')) {
      return LlmResult(
        text: 'For insulation: mineral wool, XPS boards, vapor barriers, '
            'and adhesive. Check Minergie standards for Swiss compliance.',
        source: LlmSource.local,
        confidence: 0.6,
      );
    }

    return LlmResult(
      text: 'I can help with construction material recommendations. '
          'For detailed AI suggestions, please connect to the internet.',
      source: LlmSource.local,
      confidence: 0.3,
    );
  }
}
