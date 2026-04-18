import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../local_llm.dart';
import '../theme.dart';

class SmartAddScreen extends StatefulWidget {
  const SmartAddScreen({super.key});
  @override
  State<SmartAddScreen> createState() => _SmartAddScreenState();
}

class _SmartAddScreenState extends State<SmartAddScreen> {
  final _ctrl = TextEditingController();
  bool _busy = false;
  Map<String, dynamic>? _result;
  LlmSource? _source;
  String? _error;

  Future<void> _run() async {
    final task = _ctrl.text.trim();
    if (task.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
      _source = null;
    });
    try {
      final prefs = await SharedPreferences.getInstance();
      final projectName = prefs.getString('comstruct.selectedProjectName');

      // Try the backend AI first (it uses OpenAI / Ollama on server side)
      try {
        final res = await AppScope.api.recommend(task, projectName: projectName);
        setState(() {
          _result = res;
          _source = LlmSource.openai;
        });
        return;
      } catch (_) {
        // Backend unavailable — fall back to on-device LLM
      }

      // On-device fallback
      final llmResult = await AppScope.llm.generateJson(
        prompt: 'You are a construction materials expert. Given the task: "$task", '
        'return JSON {"summary": "...", "items": [{"name": "...", "rationale": "...", "suggested_qty": 1}]}',
      );
      if (llmResult.containsKey('error')) {
        setState(() => _error = 'No AI service available. Check your connection.');
        return;
      }
      setState(() {
        _result = llmResult;
        _source = LlmSource.local;
      });
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Smart Add')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          TextField(
            controller: _ctrl,
            maxLines: 3,
            decoration: const InputDecoration(
              labelText: 'What do you need to do today?',
              hintText: 'e.g. "Plumbing install 2nd floor bathroom, seal connections"',
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: _busy ? null : _run,
            icon: const Icon(Icons.auto_awesome),
            label: Text(_busy ? 'Thinking…' : 'Get Suggestions'),
          ),
          const SizedBox(height: 16),
          if (_error != null) Text(_error!, style: const TextStyle(color: ComstructColors.err)),
          if (_source != null)
            Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Row(children: [
                Icon(
                  _source == LlmSource.local ? Icons.phone_android : Icons.cloud,
                  size: 16, color: Colors.black45,
                ),
                const SizedBox(width: 4),
                Text(
                  _source == LlmSource.local ? 'On-device AI (offline)' : 'Cloud AI',
                  style: const TextStyle(fontSize: 12, color: Colors.black45),
                ),
              ]),
            ),
          if (_result != null)
            Expanded(
              child: ListView(children: [
                if (_result!['summary'] != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: Text(_result!['summary'] as String,
                        style: const TextStyle(fontStyle: FontStyle.italic)),
                  ),
                ...((_result!['items'] as List?) ?? []).map(
                  (it) {
                    final confidence = (it['confidence'] as num?)?.toDouble();
                    return Card(
                      child: ListTile(
                        title: Row(children: [
                          Expanded(child: Text((it['name'] as String?) ?? '—',
                              style: const TextStyle(fontWeight: FontWeight.w600))),
                          if (confidence != null)
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              decoration: BoxDecoration(
                                color: confidence >= 0.8 ? ComstructColors.ok.withValues(alpha: 0.15) : ComstructColors.warn.withValues(alpha: 0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                '${(confidence * 100).toInt()}%',
                                style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                  color: confidence >= 0.8 ? ComstructColors.ok : ComstructColors.warn,
                                ),
                              ),
                            ),
                        ]),
                        subtitle: Text((it['rationale'] as String?) ?? ''),
                        trailing: ElevatedButton(
                          onPressed: () async {
                            final ok = await context.read<CartCubit>().add(
                              it['product_id'] as String,
                              (it['suggested_qty'] as num?) ?? 1,
                            );
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(ok ? 'Added to cart' : 'Could not add')),
                            );
                          },
                          child: Text(((it['suggested_qty'] as num?) ?? 1).toString()),
                        ),
                      ),
                    );
                  },
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => context.go('/cart'),
                  child: const Text('Go to Cart'),
                ),
              ]),
            ),
        ]),
      ),
    );
  }
}
