// Hybrid LLM client for mobile AI.
// OpenAI is used when online.
// On Android, a native on-device Gemma bridge is used when a local task model
// is available on the device. Otherwise the app falls back to a local summary.
import 'dart:convert';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

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

/// Hybrid AI client: OpenAI when online, on-device Gemma when available offline.
class LocalLlmClient {
  LocalLlmClient();

  static const MethodChannel _nativeChannel = MethodChannel('comstruct/local_llm');

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
      systemPrompt: '${systemPrompt ?? ''}\n\nRespond with valid JSON only. No markdown.',
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

  Future<Map<String, dynamic>?> _getNativeStatus() async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android || !AppConfig.enableLocalLlm) {
      return null;
    }
    try {
      final status = await _nativeChannel.invokeMapMethod<String, dynamic>('status');
      return status == null ? null : Map<String, dynamic>.from(status);
    } catch (_) {
      return null;
    }
  }

  LlmResult _buildOfflineFallback({
    required String prompt,
    String? systemPrompt,
    bool modelMissing = false,
  }) {
    final cleaned = prompt.replaceAll(RegExp(r'\s+'), ' ').trim();
    final tokens = cleaned
        .toLowerCase()
        .split(RegExp(r'[^a-z0-9à-ÿ]+'))
        .where((token) => token.length > 3)
        .toList();

    final focus = <String>[];
    for (final token in tokens) {
      if (!focus.contains(token)) {
        focus.add(token);
      }
      if (focus.length >= 4) break;
    }

    final focusText = focus.isEmpty ? 'materials and supplier details' : focus.join(', ');
    final intro = systemPrompt?.isNotEmpty == true ? '${systemPrompt!.trim()} ' : '';
    final nextStep = modelMissing
        ? 'No local Gemma task file was found on the device, so add ${AppConfig.localModelName} to the phone or bundle it with the app.'
        : 'The request was captured locally, but the native model was not available for a grounded answer.';

    return LlmResult(
      text: '${intro}Offline assistant mode is active. I captured your request and identified likely focus areas: '
          '$focusText. $nextStep',
      source: LlmSource.local,
      confidence: focus.isEmpty ? 0.2 : 0.35,
    );
  }

  /// Call the on-device Gemma model via a native Android bridge.
  Future<LlmResult> _callLocalModel({
    required String prompt,
    String? systemPrompt,
  }) async {
    if (kIsWeb || defaultTargetPlatform != TargetPlatform.android || !AppConfig.enableLocalLlm) {
      return _buildOfflineFallback(prompt: prompt, systemPrompt: systemPrompt, modelMissing: true);
    }

    try {
      final response = await _nativeChannel.invokeMapMethod<String, dynamic>('generate', {
        'prompt': prompt,
        'systemPrompt': systemPrompt ?? '',
        'temperature': 0.2,
        'maxTokens': AppConfig.localMaxTokens,
      });

      final text = response?['text'] as String?;
      if (text != null && text.trim().isNotEmpty) {
        return LlmResult(
          text: text.trim(),
          source: LlmSource.local,
          confidence: 0.72,
        );
      }
    } on PlatformException {
      final status = await _getNativeStatus();
      return _buildOfflineFallback(
        prompt: prompt,
        systemPrompt: systemPrompt,
        modelMissing: status?['modelReady'] != true,
      );
    } catch (_) {
      // Fall back below.
    }

    return _buildOfflineFallback(prompt: prompt, systemPrompt: systemPrompt);
  }
}
