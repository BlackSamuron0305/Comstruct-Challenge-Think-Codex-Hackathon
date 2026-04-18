import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../translations.dart';
import 'c_home_screen.dart' show CColors;

class VoiceOrderScreen extends StatefulWidget {
  const VoiceOrderScreen({super.key});
  @override
  State<VoiceOrderScreen> createState() => _VoiceOrderScreenState();
}

class _VoiceOrderScreenState extends State<VoiceOrderScreen>
    with TickerProviderStateMixin {
  _Phase _phase = _Phase.idle;
  String _transcript = '';
  final _transcriptCtrl = TextEditingController();
  bool _busy = false;
  List<Map<String, dynamic>> _results = [];

  late final AnimationController _waveCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 800),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _waveCtrl.dispose();
    _transcriptCtrl.dispose();
    super.dispose();
  }

  void _toggleMic() {
    if (_phase == _Phase.idle) {
      setState(() { _phase = _Phase.recording; _transcript = ''; });
      _simulateTranscription();
    } else if (_phase == _Phase.recording) {
      setState(() {
        _phase = _Phase.done;
        _transcriptCtrl.text = _transcript;
      });
      _findProducts();
    }
  }

  void _simulateTranscription() async {
    final demo = tRead(context, 'voiceDemoText');
    for (var i = 0; i <= demo.length; i++) {
      await Future.delayed(const Duration(milliseconds: 45));
      if (!mounted || _phase != _Phase.recording) return;
      setState(() => _transcript = demo.substring(0, i));
    }
  }

  Future<void> _findProducts() async {
    final query = _transcriptCtrl.text.trim();
    if (query.isEmpty) return;
    setState(() => _busy = true);
    try {
      final res = await AppScope.api.recommend(query);
      final items = List<Map<String, dynamic>>.from((res['items'] as List?) ?? []);
      setState(() => _results = items);
    } catch (_) {
      final prods = await AppScope.api.products(q: query.split(' ').first);
      setState(() => _results = prods.take(4).map((p) => {
        'product_id': p['id'],
        'name': p['name'],
        'unit_price': p['unit_price'],
        'currency': p['currency'],
        'unit': p['unit'],
        'suggested_qty': 1,
      }).toList());
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        title: Text(t(context, 'voiceOrderTitle')),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/c-home'),
        ),
      ),
      body: Column(children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
          child: Text(
            _phase == _Phase.idle
                ? t(context, 'voiceIdle')
                : _phase == _Phase.recording
                    ? t(context, 'voiceListening')
                    : t(context, 'voiceDone'),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.black54, fontSize: 14, height: 1.5),
          ),
        ),

        const SizedBox(height: 32),

        // Waveform
        if (_phase == _Phase.recording)
          SizedBox(
            height: 48,
            child: AnimatedBuilder(
              animation: _waveCtrl,
              builder: (_, __) => Row(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: List.generate(15, (i) {
                  final h = 8.0 + 28.0 * (i % 3 == 0 ? _waveCtrl.value : (1 - _waveCtrl.value));
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    width: 4, height: h,
                    decoration: BoxDecoration(color: CColors.teal, borderRadius: BorderRadius.circular(2)),
                  );
                }),
              ),
            ),
          ),

        // Giant mic button — 120px
        GestureDetector(
          onTap: _phase == _Phase.done ? null : _toggleMic,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: 120, height: 120,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _phase == _Phase.recording ? CColors.red : CColors.teal,
              boxShadow: [BoxShadow(
                color: (_phase == _Phase.recording ? CColors.red : CColors.teal).withValues(alpha: 0.3),
                blurRadius: 28, spreadRadius: 6,
              )],
            ),
            child: Icon(
              _phase == _Phase.recording ? Icons.stop : Icons.mic,
              color: Colors.white, size: 52,
            ),
          ),
        ),

        if (_phase == _Phase.idle)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(t(context, 'voiceTapToStart'),
                style: const TextStyle(color: Colors.black38, fontSize: 13)),
          ),
        if (_phase == _Phase.recording)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Text(t(context, 'voiceRecording'),
                style: const TextStyle(color: CColors.red, fontWeight: FontWeight.w600, fontSize: 13)),
          ),

        const SizedBox(height: 20),

        // Editable transcript
        if (_phase == _Phase.done || _transcript.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: CColors.tealLighter,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: CColors.tealLight),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(t(context, 'voiceTranscript').toUpperCase(),
                    style: const TextStyle(color: Colors.black38, fontSize: 11, letterSpacing: 0.5)),
                const SizedBox(height: 6),
                _phase == _Phase.done
                    ? TextField(
                        controller: _transcriptCtrl,
                        maxLines: null,
                        style: const TextStyle(fontSize: 15, color: Color(0xFF1A1A1A), height: 1.5),
                        decoration: const InputDecoration(
                          border: InputBorder.none,
                          isDense: true,
                          contentPadding: EdgeInsets.zero,
                        ),
                      )
                    : Text(_transcript,
                        style: const TextStyle(fontSize: 15, color: Color(0xFF1A1A1A), height: 1.5)),
              ]),
            ),
          ),

        if (_phase == _Phase.done && !_busy) ...[
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Column(children: [
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: CColors.teal,
                    minimumSize: const Size(double.infinity, 52),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: _findProducts,
                  child: Text(t(context, 'voiceFindProducts'),
                      style: const TextStyle(fontSize: 17, fontWeight: FontWeight.w600)),
                ),
              ),
              TextButton(
                onPressed: () => setState(() { _phase = _Phase.idle; _transcript = ''; _results = []; }),
                child: Text(t(context, 'voiceTryAgain')),
              ),
            ]),
          ),
        ],

        if (_busy)
          const Padding(padding: EdgeInsets.all(24), child: CircularProgressIndicator(color: CColors.teal)),

        if (_results.isNotEmpty)
          Expanded(
            child: ListView.separated(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              itemCount: _results.length,
              separatorBuilder: (_, __) => const SizedBox(height: 8),
              itemBuilder: (_, i) => _ResultTile(item: _results[i]),
            ),
          ),
      ]),
    );
  }
}

class _ResultTile extends StatelessWidget {
  const _ResultTile({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final price    = (item['unit_price'] as num?)?.toStringAsFixed(2) ?? '?';
    final currency = item['currency'] as String? ?? 'EUR';
    final qty      = (item['suggested_qty'] as num?) ?? 1;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE1E7EE)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        title: Text(item['name'] as String? ?? '—',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text('$price $currency / ${item['unit'] ?? 'Stk'}',
            style: const TextStyle(color: CColors.teal, fontWeight: FontWeight.w600)),
        trailing: ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: CColors.green,
            foregroundColor: Colors.white,
            minimumSize: const Size(64, 44),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          onPressed: () async {
            final ok = await context.read<CartCubit>().add(item['product_id'] as String, qty);
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(ok ? t(context, 'added') : t(context, 'error'))),
            );
          },
          icon: const Icon(Icons.add, size: 16),
          label: Text('$qty'),
        ),
      ),
    );
  }
}

enum _Phase { idle, recording, done }
