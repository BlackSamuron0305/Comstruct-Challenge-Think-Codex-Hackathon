import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../offline_capture_assistant.dart';
import '../offline_queue.dart';
import '../translations.dart';
import 'c_home_screen.dart' show CColors;

class VoiceOrderScreen extends StatefulWidget {
  const VoiceOrderScreen({super.key});
  @override
  State<VoiceOrderScreen> createState() => _VoiceOrderScreenState();
}

class _VoiceOrderScreenState extends State<VoiceOrderScreen>
    with TickerProviderStateMixin {
  final SpeechToText _speech = SpeechToText();

  _Phase _phase = _Phase.idle;
  String _transcript = '';
  final _transcriptCtrl = TextEditingController();
  bool _busy = false;
  bool _speechReady = false;
  String? _speechError;
  String? _statusNote;
  List<Map<String, dynamic>> _results = [];
  bool _approved = false;

  late final AnimationController _waveCtrl = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 800),
  )..repeat(reverse: true);

  @override
  void initState() {
    super.initState();
    _initSpeech();
  }

  @override
  void dispose() {
    _speech.stop();
    _waveCtrl.dispose();
    _transcriptCtrl.dispose();
    super.dispose();
  }

  Future<void> _initSpeech() async {
    final available = await _speech.initialize(
      onStatus: (status) {
        if (!mounted) return;
        if ((status == 'done' || status == 'notListening') &&
            _phase == _Phase.recording) {
          _stopRecording();
        }
      },
      onError: (error) {
        if (!mounted) return;
        setState(() => _speechError = error.errorMsg);
      },
    );

    if (!mounted) return;
    setState(() {
      _speechReady = available;
      if (!available) {
        _speechError =
            'On-device speech recognition is not available on this phone yet.';
      }
    });
  }

  // ── Phase transitions ──────────────────────────────────────────────

  Future<void> _startRecording() async {
    if (!_speechReady) {
      await _initSpeech();
    }
    if (!_speechReady) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
            content:
                Text(_speechError ?? 'Speech recognition is not available.')),
      );
      return;
    }

    setState(() {
      _phase = _Phase.recording;
      _transcript = '';
      _results = [];
      _approved = false;
      _speechError = null;
      _statusNote = 'Listening on this phone…';
    });

    await _speech.listen(
      onResult: (result) {
        if (!mounted) return;
        setState(() {
          _transcript = result.recognizedWords;
          _transcriptCtrl.text = _transcript;
        });
      },
      pauseFor: const Duration(seconds: 4),
      listenFor: const Duration(minutes: 2),
      listenOptions: SpeechListenOptions(
        partialResults: true,
        cancelOnError: true,
        listenMode: ListenMode.dictation,
        onDevice: true,
      ),
    );
  }

  Future<void> _stopRecording() async {
    await _speech.stop();
    if (!mounted) return;
    setState(() {
      _phase = _Phase.done;
      _transcriptCtrl.text = _transcript;
      _statusNote = _transcript.trim().isEmpty
          ? 'Nothing was heard clearly on the phone. Try again a bit slower.'
          : 'Voice captured locally on this phone.';
    });
  }

  void _tryAgain() {
    setState(() {
      _phase = _Phase.idle;
      _transcript = '';
      _results = [];
      _approved = false;
      _statusNote = null;
      _speechError = null;
    });
  }

  Future<void> _startProcessing() async {
    final query = _transcriptCtrl.text.trim();
    if (query.isEmpty) return;
    setState(() {
      _busy = true;
      _phase = _Phase.results;
      _statusNote = 'Processing on this phone…';
    });
    try {
      final local = await OfflineCaptureAssistant.analyzeVoiceText(query);
      var items =
          List<Map<String, dynamic>>.from((local['items'] as List?) ?? []);
      final summary = local['summary'] as String?;

      final hasCatalogMatch = items
          .any((item) => (item['product_id'] as String?)?.isNotEmpty == true);
      if (!hasCatalogMatch) {
        try {
          final res = await AppScope.api.recommend(query);
          final remoteItems =
              List<Map<String, dynamic>>.from((res['items'] as List?) ?? []);
          if (remoteItems.isNotEmpty) {
            items = remoteItems;
          }
        } catch (_) {}
      }

      if (!mounted) return;
      setState(() {
        _results = items;
        _statusNote = summary ?? _statusNote;
      });
    } catch (_) {
      try {
        final prods = await AppScope.api.products(q: query.split(' ').first);
        if (!mounted) return;
        setState(() => _results = prods
            .take(4)
            .map((p) => {
                  'product_id': p['id'],
                  'name': p['name'],
                  'unit_price': p['unit_price'],
                  'currency': p['currency'],
                  'unit': p['unit'],
                  'suggested_qty': 1,
                })
            .toList());
      } catch (e) {
        if (!mounted) return;
        setState(() =>
            _speechError = 'Could not process the voice request locally: $e');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approveAll() async {
    final cart = context.read<CartCubit>();
    int added = 0;
    try {
      await cart.clear();
      for (final m in _results) {
        final id = m['product_id'] as String?;
        if (id == null) continue;
        final qty = (m['suggested_qty'] ?? 1);
        final n = qty is num ? qty : (int.tryParse('$qty') ?? 1);
        final ok = await cart.add(id, n);
        if (ok) added++;
      }

      if (added == 0) {
        await OfflineQueue.enqueue(
          type: 'voice_order',
          payload: {
            'task': _transcriptCtrl.text.trim(),
          },
        );
        if (!mounted) return;
        setState(() => _approved = true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
                'No live catalog match yet. The voice order was saved on the phone and will sync later.'),
            backgroundColor: CColors.orange,
          ),
        );
        return;
      }

      if (!mounted) return;
      setState(() => _approved = true);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('$added items ready for review')),
      );
    } catch (_) {
      await OfflineQueue.enqueue(
        type: 'voice_order',
        payload: {
          'task': _transcriptCtrl.text.trim(),
        },
      );
      if (!mounted) return;
      setState(() => _approved = true);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'No connection. The voice order was saved on the phone and will sync later.'),
          backgroundColor: CColors.orange,
        ),
      );
    }
  }

  // ── Build ──────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        title: Text(t(context, 'voiceOrderTitle')),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () =>
              context.canPop() ? context.pop() : context.go('/c-home'),
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_phase == _Phase.results) {
      return _busy ? _buildLoading() : _buildResults();
    }
    if (_phase == _Phase.done) return _buildTranscriptReady();
    if (_phase == _Phase.recording) return _buildRecording();
    return _buildIdle();
  }

  // ── Page 1 : big mic button ────────────────────────────────────────

  Widget _buildIdle() {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(t(context, 'voiceIdle'),
              textAlign: TextAlign.center,
              style: const TextStyle(
                  color: Colors.black54, fontSize: 16, height: 1.5)),
          if (_statusNote != null) ...[
            const SizedBox(height: 12),
            Text(_statusNote!,
                textAlign: TextAlign.center,
                style: const TextStyle(
                    color: CColors.teal,
                    fontSize: 13,
                    fontWeight: FontWeight.w600)),
          ],
          if (_speechError != null) ...[
            const SizedBox(height: 8),
            Text(_speechError!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: CColors.red, fontSize: 12)),
          ],
          const SizedBox(height: 48),
          Material(
            color: CColors.teal,
            shape: const CircleBorder(),
            elevation: 8,
            shadowColor: CColors.teal.withValues(alpha: 0.4),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: _startRecording,
              child: const SizedBox(
                width: 140,
                height: 140,
                child: Icon(Icons.mic, color: Colors.white, size: 64),
              ),
            ),
          ),
          const SizedBox(height: 20),
          Text(t(context, 'voiceTapToStart'),
              style: const TextStyle(color: Colors.black38, fontSize: 14)),
        ],
      ),
    );
  }

  // ── Page 2 : recording — live transcript + stop button ─────────────

  Widget _buildRecording() {
    return Column(children: [
      const SizedBox(height: 20),
      Text(t(context, 'voiceListening'),
          style: const TextStyle(
              color: CColors.red, fontWeight: FontWeight.w600, fontSize: 16)),
      const SizedBox(height: 16),
      SizedBox(
        height: 48,
        child: AnimatedBuilder(
          animation: _waveCtrl,
          builder: (_, __) => Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(15, (i) {
              final h = 8.0 +
                  28.0 * (i % 3 == 0 ? _waveCtrl.value : (1 - _waveCtrl.value));
              return Container(
                margin: const EdgeInsets.symmetric(horizontal: 2),
                width: 4,
                height: h,
                decoration: BoxDecoration(
                    color: CColors.teal,
                    borderRadius: BorderRadius.circular(2)),
              );
            }),
          ),
        ),
      ),
      const SizedBox(height: 24),
      Material(
        color: CColors.red,
        shape: const CircleBorder(),
        elevation: 8,
        shadowColor: CColors.red.withValues(alpha: 0.4),
        child: InkWell(
          customBorder: const CircleBorder(),
          onTap: _stopRecording,
          child: const SizedBox(
            width: 120,
            height: 120,
            child: Icon(Icons.stop, color: Colors.white, size: 52),
          ),
        ),
      ),
      const SizedBox(height: 8),
      Text(t(context, 'voiceRecording'),
          style: const TextStyle(
              color: CColors.red, fontWeight: FontWeight.w600, fontSize: 13)),
      const SizedBox(height: 20),
      if (_statusNote != null)
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16),
          child: Text(_statusNote!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: CColors.teal, fontSize: 13)),
        ),
      if (_transcript.isNotEmpty)
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: CColors.tealLighter,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: CColors.tealLight),
              ),
              child: SingleChildScrollView(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(t(context, 'voiceTranscript').toUpperCase(),
                          style: const TextStyle(
                              color: Colors.black38,
                              fontSize: 11,
                              letterSpacing: 0.5)),
                      const SizedBox(height: 6),
                      Text(_transcript,
                          style: const TextStyle(
                              fontSize: 15,
                              color: Color(0xFF1A1A1A),
                              height: 1.5)),
                    ]),
              ),
            ),
          ),
        ),
    ]);
  }

  // ── Page 3 : transcript ready — "Start Processing" + "Try Again" ──

  Widget _buildTranscriptReady() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(children: [
        Text(t(context, 'voiceDone'),
            textAlign: TextAlign.center,
            style: const TextStyle(color: Colors.black54, fontSize: 14)),
        if (_statusNote != null) ...[
          const SizedBox(height: 8),
          Text(_statusNote!,
              textAlign: TextAlign.center,
              style: const TextStyle(color: CColors.teal, fontSize: 13)),
        ],
        const SizedBox(height: 16),
        Expanded(
          child: Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: CColors.tealLighter,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: CColors.tealLight),
            ),
            child:
                Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(t(context, 'voiceTranscript').toUpperCase(),
                  style: const TextStyle(
                      color: Colors.black38, fontSize: 11, letterSpacing: 0.5)),
              const SizedBox(height: 6),
              Expanded(
                child: TextField(
                  controller: _transcriptCtrl,
                  maxLines: null,
                  expands: true,
                  style: const TextStyle(
                      fontSize: 15, color: Color(0xFF1A1A1A), height: 1.5),
                  decoration: const InputDecoration(
                    border: InputBorder.none,
                    isDense: true,
                    contentPadding: EdgeInsets.zero,
                  ),
                ),
              ),
            ]),
          ),
        ),
        const SizedBox(height: 20),
        SizedBox(
          width: double.infinity,
          height: 64,
          child: ElevatedButton.icon(
            style: ElevatedButton.styleFrom(
              backgroundColor: CColors.green,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
              textStyle:
                  const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            onPressed: _startProcessing,
            icon: const Icon(Icons.play_arrow, size: 28),
            label: const Text('Start Processing'),
          ),
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          height: 56,
          child: OutlinedButton.icon(
            style: OutlinedButton.styleFrom(
              foregroundColor: CColors.teal,
              side: const BorderSide(color: CColors.teal, width: 2),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(16)),
              textStyle:
                  const TextStyle(fontSize: 17, fontWeight: FontWeight.w600),
            ),
            onPressed: _tryAgain,
            icon: const Icon(Icons.refresh, size: 24),
            label: const Text('Try Again'),
          ),
        ),
      ]),
    );
  }

  // ── Loading ────────────────────────────────────────────────────────

  Widget _buildLoading() {
    return const Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          CircularProgressIndicator(color: CColors.teal, strokeWidth: 3),
          SizedBox(height: 20),
          Text('Processing your order…',
              style: TextStyle(color: Colors.black54, fontSize: 16)),
        ],
      ),
    );
  }

  // ── Results — approve items ────────────────────────────────────────

  Widget _buildResults() {
    if (_results.isEmpty) {
      return Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(Icons.search_off, color: Colors.black26, size: 56),
          const SizedBox(height: 16),
          const Text('No products found.\nTry a different description.',
              textAlign: TextAlign.center,
              style: TextStyle(color: Colors.black45, fontSize: 15)),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: _tryAgain,
            icon: const Icon(Icons.refresh),
            label: const Text('Try Again'),
          ),
        ]),
      );
    }
    return Column(children: [
      if (_statusNote != null)
        Container(
          width: double.infinity,
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          child: Text(_statusNote!,
              style: const TextStyle(color: CColors.tealDark, fontSize: 13)),
        ),
      Expanded(
        child: ListView.separated(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 16),
          itemCount: _results.length,
          separatorBuilder: (_, __) => const SizedBox(height: 8),
          itemBuilder: (_, i) {
            final item = _results[i];
            final price =
                (item['unit_price'] as num?)?.toStringAsFixed(2) ?? '?';
            final currency = item['currency'] as String? ?? 'EUR';
            return Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: const Color(0xFFE1E7EE)),
              ),
              child: Row(children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: CColors.tealLighter,
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: const Icon(Icons.inventory_2_outlined,
                      color: CColors.teal, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                      Text(item['name'] as String? ?? '—',
                          style: const TextStyle(
                              fontWeight: FontWeight.w600, fontSize: 15)),
                      Text('$price $currency / ${item['unit'] ?? 'Stk'}',
                          style: const TextStyle(
                              color: CColors.teal,
                              fontWeight: FontWeight.w600,
                              fontSize: 13)),
                    ])),
                Text('×${item['suggested_qty'] ?? 1}',
                    style: const TextStyle(
                        fontWeight: FontWeight.w700,
                        fontSize: 18,
                        color: CColors.teal)),
              ]),
            );
          },
        ),
      ),
      Container(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
        decoration: BoxDecoration(
          color: Colors.white,
          border: Border(top: BorderSide(color: Colors.grey.shade200)),
        ),
        child: _approved
            ? SizedBox(
                height: 64,
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () => context.push('/cart'),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: CColors.green,
                    foregroundColor: Colors.white,
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(16)),
                    textStyle: const TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w700),
                  ),
                  icon: const Icon(Icons.assignment_turned_in_outlined, size: 24),
                  label: const Text('Review Order'),
                ),
              )
            : Column(children: [
                SizedBox(
                  height: 64,
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _approveAll,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: CColors.teal,
                      foregroundColor: Colors.white,
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(16)),
                      textStyle: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.w700),
                    ),
                    icon: const Icon(Icons.check_circle, size: 24),
                    label: Text('Approve ${_results.length} Items'),
                  ),
                ),
                const SizedBox(height: 8),
                SizedBox(
                  height: 48,
                  width: double.infinity,
                  child: OutlinedButton.icon(
                    style: OutlinedButton.styleFrom(
                      foregroundColor: CColors.teal,
                      side: const BorderSide(color: CColors.teal, width: 1.5),
                      shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(12)),
                    ),
                    onPressed: _tryAgain,
                    icon: const Icon(Icons.refresh, size: 20),
                    label: const Text('Try Again'),
                  ),
                ),
              ]),
      ),
    ]);
  }
}

enum _Phase { idle, recording, done, results }
