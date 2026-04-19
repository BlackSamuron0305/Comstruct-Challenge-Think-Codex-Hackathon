import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api_client.dart';
import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../offline_capture_assistant.dart';
import '../translations.dart';
import 'c_home_screen.dart' show CColors;

class ChatScreen extends StatefulWidget {
  const ChatScreen({super.key});
  @override
  State<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends State<ChatScreen> {
  final _ctrl   = TextEditingController();
  final _scroll = ScrollController();
  final _messages = <_Msg>[];
  bool _busy = false;
  bool _initDone = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_initDone) {
      _messages.add(_Msg(role: 'assistant', text: t(context, 'chatWelcome')));
      _initDone = true;
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(
          _scroll.position.maxScrollExtent,
          duration: const Duration(milliseconds: 300),
          curve: Curves.easeOut,
        );
      }
    });
  }

  Future<void> _send() async {
    final text = _ctrl.text.trim();
    if (text.isEmpty || _busy) return;
    final foundProductsLabel = tRead(context, 'foundProducts');
    final nothingFoundLabel = tRead(context, 'nothingFound');
    final connectionErrorLabel = tRead(context, 'connectionError');

    _ctrl.clear();
    setState(() {
      _messages.add(_Msg(role: 'user', text: text));
      _busy = true;
    });
    _scrollToBottom();

    try {
      final prefs = await SharedPreferences.getInstance();
      final projectName = prefs.getString('comstruct.selectedProjectName');
      final trade = prefs.getString('comstruct.userPosition') ?? 'foreman';

      final res = await AppScope.api.recommend(
        text,
        projectName: projectName,
        trade: trade,
      );
      final remoteItems = List<Map<String, dynamic>>.from((res['items'] as List?) ?? []);
      final remoteSummary = (res['summary'] as String?)?.trim();

      final localRes = await OfflineCaptureAssistant.analyzeVoiceText(text);
      final localItems = List<Map<String, dynamic>>.from((localRes['items'] as List?) ?? []);
      final localSummary = (localRes['summary'] as String?)?.trim();

      if (!mounted) return;

      final items = remoteItems.isNotEmpty ? remoteItems : localItems;
      final summary = items.isNotEmpty
          ? (remoteItems.isNotEmpty
              ? (remoteSummary?.isNotEmpty == true
                  ? remoteSummary!
                  : foundProductsLabel.replaceAll('{n}', '${items.length}'))
              : (localSummary?.isNotEmpty == true
                  ? localSummary!
                  : foundProductsLabel.replaceAll('{n}', '${items.length}')))
          : nothingFoundLabel;

      setState(() {
        _messages.add(_Msg(role: 'assistant', text: summary, items: items));
      });
    } catch (_) {
      try {
        final localRes = await OfflineCaptureAssistant.analyzeVoiceText(text);
        final localItems = List<Map<String, dynamic>>.from((localRes['items'] as List?) ?? []);
        final localSummary = (localRes['summary'] as String?)?.trim();

        if (!mounted) return;

        setState(() {
          _messages.add(_Msg(
            role: 'assistant',
            text: localItems.isNotEmpty
                ? (localSummary?.isNotEmpty == true
                    ? localSummary!
                    : foundProductsLabel.replaceAll('{n}', '${localItems.length}'))
                : connectionErrorLabel,
            items: localItems,
          ));
        });
      } catch (_) {
        setState(() {
          _messages.add(_Msg(role: 'assistant', text: connectionErrorLabel));
        });
      }
    } finally {
      if (mounted) setState(() => _busy = false);
      _scrollToBottom();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        title: Text(t(context, 'chatTitle')),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.canPop() ? context.pop() : context.go('/c-home'),
        ),
      ),
      body: Column(children: [
        Expanded(
          child: ListView.builder(
            controller: _scroll,
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
            itemCount: _messages.length + (_busy ? 1 : 0),
            itemBuilder: (_, i) {
              if (i == _messages.length) return _TypingBubble(label: t(context, 'chatThinking'));
              return _MessageBubble(msg: _messages[i]);
            },
          ),
        ),
        // Input bar
        Container(
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 20),
          decoration: BoxDecoration(
            color: Colors.white,
            border: Border(top: BorderSide(color: Colors.grey.shade200)),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Expanded(
              child: TextField(
                controller: _ctrl,
                maxLines: 4,
                minLines: 1,
                textInputAction: TextInputAction.newline,
                style: const TextStyle(fontSize: 16),
                decoration: InputDecoration(
                  hintText: t(context, 'chatPlaceholder'),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: BorderSide(color: Colors.grey.shade300),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(24),
                    borderSide: const BorderSide(color: CColors.teal, width: 1.5),
                  ),
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                  filled: true,
                  fillColor: const Color(0xFFF5F7FA),
                ),
              ),
            ),
            const SizedBox(width: 8),
            GestureDetector(
              onTap: _send,
              child: AnimatedContainer(
                duration: const Duration(milliseconds: 150),
                width: 48, height: 48,
                decoration: BoxDecoration(
                  color: _busy ? Colors.grey.shade300 : CColors.teal,
                  shape: BoxShape.circle,
                ),
                child: const Icon(Icons.send, color: Colors.white, size: 20),
              ),
            ),
          ]),
        ),
      ]),
    );
  }
}

class _Msg {
  const _Msg({required this.role, required this.text, this.items = const []});
  final String role, text;
  final List<Map<String, dynamic>> items;
}

class _MessageBubble extends StatelessWidget {
  const _MessageBubble({required this.msg});
  final _Msg msg;

  @override
  Widget build(BuildContext context) {
    final isUser = msg.role == 'user';
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Column(
        crossAxisAlignment: isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          Container(
            constraints: BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.78),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isUser ? CColors.teal : Colors.white,
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(isUser ? 16 : 4),
                bottomRight: Radius.circular(isUser ? 4 : 16),
              ),
              boxShadow: isUser ? [] : [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)],
            ),
            child: Text(
              msg.text,
              style: TextStyle(
                color: isUser ? Colors.white : const Color(0xFF1A1A1A),
                fontSize: 15, height: 1.45,
              ),
            ),
          ),
          if (msg.items.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(top: 6),
              child: Column(
                children: msg.items.map((item) => Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: _ProductChip(item: item),
                )).toList(),
              ),
            ),
        ],
      ),
    );
  }
}

class _ProductChip extends StatelessWidget {
  const _ProductChip({required this.item});
  final Map<String, dynamic> item;

  @override
  Widget build(BuildContext context) {
    final price = (item['unit_price'] as num?)?.toStringAsFixed(2) ?? '?';
    final currency = normalizeCurrencyCode(item['currency'] as String?);
    final qty = (item['suggested_qty'] as num?) ?? 1;

    return Container(
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: const Color(0xFFE1E7EE)),
      ),
      child: ListTile(
        dense: true,
        title: Text((item['name'] as String?) ?? '—',
            style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
        subtitle: Text('$price $currency / ${item['unit'] ?? 'Stk'}',
            style: const TextStyle(color: CColors.teal, fontSize: 12, fontWeight: FontWeight.w500)),
        trailing: SizedBox(
          width: 56,
          child: ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: CColors.green,
              foregroundColor: Colors.white,
              padding: EdgeInsets.zero,
              minimumSize: const Size(56, 36),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
            ),
            onPressed: () async {
              await context.read<CartCubit>().add(item['product_id'] as String, qty);
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text(t(context, 'added'))),
              );
            },
            child: const Icon(Icons.add, size: 18),
          ),
        ),
      ),
    );
  }
}

class _TypingBubble extends StatelessWidget {
  const _TypingBubble({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.only(bottom: 10),
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: const BorderRadius.only(
          topLeft: Radius.circular(16), topRight: Radius.circular(16),
          bottomRight: Radius.circular(16), bottomLeft: Radius.circular(4),
        ),
        boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)],
      ),
      child: Text(label, style: const TextStyle(color: Colors.black45, fontStyle: FontStyle.italic, fontSize: 14)),
    ),
  );
}
