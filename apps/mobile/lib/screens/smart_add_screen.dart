import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';

class SmartAddScreen extends StatefulWidget {
  const SmartAddScreen({super.key});
  @override
  State<SmartAddScreen> createState() => _SmartAddScreenState();
}

class _SmartAddScreenState extends State<SmartAddScreen> {
  final _ctrl = TextEditingController();
  bool _busy = false;
  Map<String, dynamic>? _result;
  String? _error;

  Future<void> _run() async {
    final task = _ctrl.text.trim();
    if (task.isEmpty) return;
    setState(() {
      _busy = true;
      _error = null;
      _result = null;
    });
    try {
      final prefs = await SharedPreferences.getInstance();
      final projectName = prefs.getString('comstruct.selectedProjectName');
      final res = await AppScope.api.recommend(task, projectName: projectName);
      setState(() => _result = res);
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
              labelText: 'Was musst du heute machen?',
              hintText: 'z.B. "Sanitärinstallation Bad 2.OG, Anschlüsse abdichten"',
            ),
          ),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            onPressed: _busy ? null : _run,
            icon: const Icon(Icons.auto_awesome),
            label: Text(_busy ? 'Denke nach…' : 'Vorschläge holen'),
          ),
          const SizedBox(height: 16),
          if (_error != null) Text(_error!, style: const TextStyle(color: Colors.red)),
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
                  (it) => Card(
                    child: ListTile(
                      title: Text((it['name'] as String?) ?? '—',
                          style: const TextStyle(fontWeight: FontWeight.w600)),
                      subtitle: Text((it['rationale'] as String?) ?? ''),
                      trailing: ElevatedButton(
                        onPressed: () async {
                          final ok = await context.read<CartCubit>().add(
                            it['product_id'] as String,
                            (it['suggested_qty'] as num?) ?? 1,
                          );
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                            SnackBar(content: Text(ok ? 'Hinzugefügt' : 'Fehler')),
                          );
                        },
                        child: Text(((it['suggested_qty'] as num?) ?? 1).toString()),
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 8),
                OutlinedButton(
                  onPressed: () => context.go('/cart'),
                  child: const Text('Zum Warenkorb'),
                ),
              ]),
            ),
        ]),
      ),
    );
  }
}
