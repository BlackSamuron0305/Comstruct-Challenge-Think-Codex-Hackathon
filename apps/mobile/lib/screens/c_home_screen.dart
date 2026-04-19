import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../cubits/language_cubit.dart';
import '../translations.dart';

// ── C-materials color tokens ──────────────────────────────────────────
class CColors {
  static const teal        = Color(0xFF2D7080);
  static const tealDark    = Color(0xFF245F6D);
  static const tealLight   = Color(0xFFC8DDE0);
  static const tealLighter = Color(0xFFDFF0F2);
  static const green       = Color(0xFF34C759);
  static const red         = Color(0xFFFF3B30);
  static const yellow      = Color(0xFFF5C300);
  static const orange      = Color(0xFFF28C28);
  static const bg          = Color(0xFFF0F2F2);
}

const _kCMatDismissedKey = 'comstruct.cmat_dismissed';

class CHomeScreen extends StatefulWidget {
  const CHomeScreen({super.key});
  @override
  State<CHomeScreen> createState() => _CHomeScreenState();
}

class _CHomeScreenState extends State<CHomeScreen> {
  String _projectName = 'Kein Projekt gewählt';
  bool _cmatDismissed = false;

  // ── categories now use tKey for translation lookup ──
  static const _categories = [
    _Cat('fasteners',   'Fasteners',    Icons.construction),
    _Cat('consumables', 'Consumables',  Icons.science_outlined),
    _Cat('ppe',         'PPE',          Icons.safety_check_outlined),
    _Cat('tools',       'Tools',        Icons.home_repair_service_outlined),
    _Cat('tapes',       'Tapes',        Icons.circle_outlined),        // tape-roll icon
    _Cat('supplies',    'Supplies',     Icons.inventory_2_outlined),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _projectName    = prefs.getString('comstruct.selectedProjectName') ?? 'Kein Projekt gewählt';
      _cmatDismissed  = prefs.getBool(_kCMatDismissedKey) ?? false;
    });
  }

  Future<void> _dismissCMat() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kCMatDismissedKey, true);
    setState(() => _cmatDismissed = true);
  }

  @override
  Widget build(BuildContext context) {
    final currentLang = context.watch<LanguageCubit>().state;
    final currentFlag = kLangs.firstWhere((l) => l.code == currentLang, orElse: () => kLangs[0]).flag;

    return Scaffold(
      backgroundColor: CColors.bg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.only(bottom: 32),
            children: [
              // ── Header (large title + language globe) ──
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
                child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(t(context, 'appTitle'),
                        style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700,
                            color: Color(0xFF1A1A1A), letterSpacing: -0.5)),
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Material(
                        color: CColors.tealLighter,
                        borderRadius: BorderRadius.circular(20),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(20),
                          onTap: () => context.push('/c-language'),
                          child: Container(
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                            decoration: BoxDecoration(
                              borderRadius: BorderRadius.circular(20),
                              border: Border.all(color: CColors.tealLight),
                            ),
                            child: Row(mainAxisSize: MainAxisSize.min, children: [
                              const Icon(Icons.language, size: 16, color: CColors.teal),
                              const SizedBox(width: 6),
                              Text(currentFlag, style: const TextStyle(fontSize: 14)),
                            ]),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      _TopIconButton(
                        icon: Icons.person_outline,
                        onTap: () => context.go('/c-profile'),
                      ),
                      const SizedBox(width: 8),
                      _TopIconButton(
                        icon: Icons.favorite_border,
                        onTap: () => context.go('/c-favorites'),
                      ),
                    ]),
                  ],
                ),
              ),

              // ── Project banner ──
              Container(
                color: CColors.tealLight,
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
                child: Row(children: [
                  const Icon(Icons.location_on_outlined, size: 16, color: CColors.teal),
                  const SizedBox(width: 6),
                  Expanded(child: Text(_projectName,
                      style: const TextStyle(color: CColors.teal, fontWeight: FontWeight.w500, fontSize: 13))),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
                    decoration: BoxDecoration(color: CColors.yellow, borderRadius: BorderRadius.circular(20)),
                    child: Text(t(context, 'active'),
                        style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
                  ),
                ]),
              ),

              // ── C-materials explainer ──
              if (!_cmatDismissed)
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
                  child: Container(
                    decoration: BoxDecoration(
                      color: CColors.tealLighter,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: CColors.tealLight),
                    ),
                    padding: const EdgeInsets.fromLTRB(14, 12, 8, 12),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Expanded(
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(t(context, 'whatAreCMat'),
                              style: const TextStyle(color: CColors.teal, fontWeight: FontWeight.w700, fontSize: 14)),
                          const SizedBox(height: 5),
                          Text.rich(
                            TextSpan(children: [
                              TextSpan(text: t(context, 'cMatDesc'),
                                  style: const TextStyle(color: Colors.black54, fontSize: 13, height: 1.5)),
                              const TextSpan(text: ' '),
                              TextSpan(text: t(context, 'cMatDescLink'),
                                  style: const TextStyle(color: CColors.teal, fontWeight: FontWeight.w600, fontSize: 13)),
                              const TextSpan(text: ' '),
                              TextSpan(text: t(context, 'cMatDescEnd'),
                                  style: const TextStyle(color: Colors.black54, fontSize: 13)),
                            ]),
                          ),
                        ]),
                      ),
                      IconButton(
                        icon: const Icon(Icons.close, size: 18, color: CColors.teal),
                        onPressed: _dismissCMat,
                      ),
                    ]),
                  ),
                ),

              const SizedBox(height: 14),

              // ── Photo + Voice — large glove-friendly buttons ──
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: Row(children: [
                  Expanded(child: _QuickButton(
                    label: t(context, 'photoOrder'),
                    sub: t(context, 'photoSub'),
                    color: CColors.teal,
                    icon: Icons.camera_alt_outlined,
                    onTap: () => context.go('/c-photo'),
                  )),
                  const SizedBox(width: 10),
                  Expanded(child: _QuickButton(
                    label: t(context, 'voiceOrder'),
                    sub: t(context, 'voiceSub'),
                    color: CColors.tealDark,
                    icon: Icons.mic,
                    onTap: () => context.go('/c-voice'),
                  )),
                ]),
              ),

              // ── Chat — full width ──
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => context.go('/c-chat'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                      decoration: BoxDecoration(
                        border: Border.all(color: CColors.teal, width: 1.5),
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Row(children: [
                        Container(
                          width: 44, height: 44,
                          decoration: const BoxDecoration(color: CColors.tealLighter, shape: BoxShape.circle),
                          child: const Icon(Icons.chat_bubble_outline, color: CColors.teal, size: 22),
                        ),
                        const SizedBox(width: 14),
                        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                          Text(t(context, 'chatOrder'),
                              style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: Color(0xFF1A1A1A))),
                          const SizedBox(height: 2),
                          Text(t(context, 'chatSub'),
                              style: const TextStyle(color: Colors.black54, fontSize: 13)),
                        ])),
                        const Icon(Icons.chevron_right, color: Colors.black38),
                      ]),
                    ),
                  ),
                ),
              ),

              Padding(
                padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
                child: Material(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(16),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(16),
                    onTap: () => context.go('/c-favorites'),
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                      decoration: BoxDecoration(
                        borderRadius: BorderRadius.circular(16),
                        border: Border.all(color: const Color(0xFFFFD4D8), width: 1.3),
                      ),
                      child: Row(children: [
                        Container(
                          width: 46,
                          height: 46,
                          decoration: const BoxDecoration(color: Color(0xFFFFF0F1), shape: BoxShape.circle),
                          child: const Icon(Icons.favorite, color: Colors.redAccent, size: 24),
                        ),
                        const SizedBox(width: 14),
                        const Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Saved items',
                                style: TextStyle(fontWeight: FontWeight.w800, fontSize: 16),
                              ),
                              SizedBox(height: 2),
                              Text(
                                'Keep your personally starred materials one tap away.',
                                style: TextStyle(color: Colors.black54, fontSize: 13),
                              ),
                            ],
                          ),
                        ),
                        const Icon(Icons.chevron_right, color: Colors.black38),
                      ]),
                    ),
                  ),
                ),
              ),

              // ── Section divider ──
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
                child: Row(children: [
                  const Expanded(child: Divider()),
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 12),
                    child: Text(t(context, 'orderByCategory'),
                        style: TextStyle(color: Colors.grey.shade500, fontSize: 12)),
                  ),
                  const Expanded(child: Divider()),
                ]),
              ),

              // ── Category grid ──
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: GridView.count(
                  crossAxisCount: 2,
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: 1.55,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  children: _categories.map((cat) => Material(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(14),
                    child: InkWell(
                      borderRadius: BorderRadius.circular(14),
                      onTap: () => context.go('/c-catalog?category=${cat.id}'),
                      child: Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisAlignment: MainAxisAlignment.center, children: [
                          Icon(cat.icon, color: CColors.teal, size: 26),
                          const SizedBox(height: 8),
                          Text(t(context, 'cat${cat.tKey}'),
                              style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: Color(0xFF1A1A1A))),
                          const SizedBox(height: 2),
                          Text(t(context, 'cat${cat.tKey}S'),
                              style: const TextStyle(color: Colors.black45, fontSize: 11),
                              maxLines: 1, overflow: TextOverflow.ellipsis),
                        ]),
                      ),
                    ),
                  )).toList(),
                ),
              ),

              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}

class _Cat {
  const _Cat(this.id, this.tKey, this.icon);
  final String id, tKey;
  final IconData icon;
}

class _TopIconButton extends StatelessWidget {
  const _TopIconButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: onTap,
        child: SizedBox(
          width: 44,
          height: 44,
          child: Icon(icon, color: CColors.teal, size: 24),
        ),
      ),
    );
  }
}

class _QuickButton extends StatelessWidget {
  const _QuickButton({required this.label, required this.sub, required this.color, required this.icon, required this.onTap});
  final String label, sub;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Material(
    color: color,
    borderRadius: BorderRadius.circular(16),
    child: InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.fromLTRB(16, 22, 16, 22),
        constraints: const BoxConstraints(minHeight: 120),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: Colors.white, size: 36),
          const SizedBox(height: 10),
          Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 3),
          Text(sub, style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 12)),
        ]),
      ),
    ),
  );
}
