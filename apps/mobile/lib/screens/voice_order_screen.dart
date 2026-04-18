import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
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
  bool _busy = false;
  List<Map<String, dynamic>> _results = [];

  late final AnimationController _waveCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 800),
  )..repeat(reverse: true);

  @override
  void dispose() {
    _waveCtrl.dispose();
    super.dispose();
  }

  // Simulates recording — in production wire to speech_to_text package
  void _toggleMic() {
    if (_phase == _Phase.idle) {
      setState(() { _phase = _Phase.recording; _transcript = ''; });
      _simulateTranscription();
    } else if (_phase == _Phase.recording) {
      setState(() => _phase = _Phase.done);
      if (_transcript.isNotEmpty) _findProducts();
    }
  }

  void _simulateTranscription() async {
    const demo = 'Ich brauche Trockenbauschraube und etwas PU-Schaum für die Trennwände im 2. OG';
    for (var i = 0; i <= demo.length; i++) {
      await Future.delayed(const Duration(milliseconds: 45));
      if (!mounted || _phase != _Phase.recording) return;
      setState(() => _transcript = demo.substring(0, i));
    }
  }

  Future<void> _findProducts() async {
    setState(() => _busy = true);
    try {
      final res = await AppScope.api.recommend(_transcript);
      final items = List<Map<String, dynamic>>.from(
          (res['items'] as List?) ?? []);
      setState(() => _results = items);
    } catch (_) {
      // fall back to catalog search
      final prods = await AppScope.api.products(q: _transcript.split(' ').first);
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
        title: const Text('Sprach-Bestellung'),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/c-home'),
        ),
      ),
      body: Column(children: [
        // Instruction
        Padding(
          padding: const EdgeInsets.fromLTRB(24, 20, 24, 0),
          child: Text(
            _phase == _Phase.idle
                ? 'Tippen Sie auf das Mikrofon und beschreiben Sie, was Sie brauchen.'
                : _phase == _Phase.recording
                    ? 'Höre zu … Tippen Sie erneut, wenn fertig.'
                    : 'Verstanden! Passende Produkte werden gesucht.',
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.black54, fontSize: 14, height: 1.5),
          ),
        ),

        const SizedBox(height: 32),

        // Waveform (while recording)
        if (_phase == _Phase.recording)
          SizedBox(
            height: 48,
            child: AnimatedBuilder(
              animation: _waveCtrl,
              builder: (_, __) => Row(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.center,
                children: List.generate(15, (i) {
                  final h = 8.0 + 28.0 * ((i % 3 == 0 ? _waveCtrl.value : (1 - _waveCtrl.value)));
                  return Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    width: 4, height: h,
                    decoration: BoxDecoration(color: CColors.teal, borderRadius: BorderRadius.circular(2)),
                  );
                }),
              ),
            ),
          ),

        // Mic button
        GestureDetector(
          onTap: _phase == _Phase.done ? null : _toggleMic,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            width: 88, height: 88,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: _phase == _Phase.recording ? CColors.red : CColors.teal,
              boxShadow: [BoxShadow(
                color: (_phase == _Phase.recording ? CColors.red : CColors.teal).withValues(alpha: 0.3),
                blurRadius: 20, spreadRadius: 4,
              )],
            ),
            child: Icon(
              _phase == _Phase.recording ? Icons.stop : Icons.mic,
              color: Colors.white, size: 36,
            ),
          ),
        ),

        if (_phase == _Phase.idle)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text('Tippen zum Starten', style: TextStyle(color: Colors.black38, fontSize: 13)),
          ),
        if (_phase == _Phase.recording)
          const Padding(
            padding: EdgeInsets.only(top: 12),
            child: Text('Aufnahme …', style: TextStyle(color: CColors.red, fontWeight: FontWeight.w600, fontSize: 13)),
          ),

        const SizedBox(height: 24),

        // Transcript card
        if (_transcript.isNotEmpty)
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
                const Text('TRANSKRIPT', style: TextStyle(color: Colors.black38, fontSize: 11, letterSpacing: 0.5)),
                const SizedBox(height: 6),
                Text(_transcript, style: const TextStyle(fontSize: 15, color: Color(0xFF1A1A1A), height: 1.5)),
              ]),
            ),
          ),

        // Retry / re-record
        if (_phase == _Phase.done && !_busy)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: TextButton(
              onPressed: () => setState(() { _phase = _Phase.idle; _transcript = ''; _results = []; }),
              child: const Text('Erneut versuchen'),
            ),
          ),

        const SizedBox(height: 8),

        // Results
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
    final price = (item['unit_price'] as num?)?.toStringAsFixed(2) ?? '?';
    final currency = (item['currency'] as String?) ?? 'CHF';
    final unit = (item['unit'] as String?) ?? 'Stk';
    final qty = (item['suggested_qty'] as num?) ?? 1;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: const Color(0xFFE1E7EE)),
      ),
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        title: Text((item['name'] as String?) ?? '—',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14)),
        subtitle: Text('$price $currency / $unit',
            style: const TextStyle(color: CColors.teal, fontWeight: FontWeight.w600)),
        trailing: ElevatedButton.icon(
          style: ElevatedButton.styleFrom(
            backgroundColor: CColors.green,
            foregroundColor: Colors.white,
            minimumSize: const Size(64, 40),
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
          ),
          onPressed: () async {
            final ok = await context.read<CartCubit>().add(
              item['product_id'] as String,
              qty,
            );
            if (!context.mounted) return;
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(ok ? 'Hinzugefügt' : 'Fehler')),
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
