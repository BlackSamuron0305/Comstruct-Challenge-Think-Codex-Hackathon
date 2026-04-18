import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_scope.dart';
import '../cubits/cart_cubit.dart';
import '../theme.dart';

// ── C-materials color tokens ──────────────────────────────────────────
class CColors {
  static const teal      = Color(0xFF2D7080);
  static const tealDark  = Color(0xFF245F6D);
  static const tealLight = Color(0xFFC8DDE0);
  static const tealLighter = Color(0xFFDFF0F2);
  static const green     = Color(0xFF34C759);
  static const red       = Color(0xFFFF3B30);
  static const yellow    = Color(0xFFF5C300);
  static const bg        = Color(0xFFF0F2F2);
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

  static const _categories = [
    _Cat('fasteners',   'Befestigungen',  'Schrauben, Nägel, Dübel',  Icons.construction),
    _Cat('consumables', 'Verbrauch',      'Schaum, Kleber, Spray',     Icons.science_outlined),
    _Cat('ppe',         'PSA',            'Handschuhe, Masken',        Icons.health_and_safety_outlined),
    _Cat('tools',       'Kleinwerkzeug', 'Bohrer, Scheiben',          Icons.hardware_outlined),
    _Cat('electrical',  'Elektro',       'Kabel, Kabelbinder',        Icons.electrical_services),
    _Cat('supplies',    'Baustelle',     'Batterien, Beutel',         Icons.store_outlined),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _projectName = prefs.getString('comstruct.selectedProjectName') ?? 'Kein Projekt gewählt';
      _cmatDismissed = prefs.getBool(_kCMatDismissedKey) ?? false;
    });
  }

  Future<void> _dismissCMat() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_kCMatDismissedKey, true);
    setState(() => _cmatDismissed = true);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.teal,
        title: const Text('C-Materialien'),
        actions: [
          BlocBuilder<CartCubit, CartState>(
            builder: (_, s) => Stack(alignment: Alignment.center, children: [
              IconButton(
                icon: const Icon(Icons.shopping_cart_outlined),
                onPressed: () => context.go('/cart'),
              ),
              if (s.lines.isNotEmpty)
                Positioned(
                  right: 6, top: 6,
                  child: Container(
                    padding: const EdgeInsets.all(4),
                    decoration: const BoxDecoration(color: CColors.yellow, shape: BoxShape.circle),
                    child: Text('${s.lines.length}',
                        style: const TextStyle(color: Colors.white, fontSize: 10, fontWeight: FontWeight.bold)),
                  ),
                ),
            ]),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.only(bottom: 32),
          children: [
            // Project banner
            Container(
              color: CColors.tealLight,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
              child: Row(
                children: [
                  const Icon(Icons.location_on_outlined, size: 16, color: CColors.teal),
                  const SizedBox(width: 6),
                  Expanded(child: Text(_projectName,
                      style: const TextStyle(color: CColors.teal, fontWeight: FontWeight.w500, fontSize: 13))),
                  _StatusBadge(label: 'Aktiv', color: CColors.yellow),
                ],
              ),
            ),

            // C-materials explainer
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
                        const Text('Was sind C-Materialien?',
                            style: TextStyle(color: CColors.teal, fontWeight: FontWeight.w700, fontSize: 14)),
                        const SizedBox(height: 5),
                        const Text(
                          'Alltägliche Verbrauchsmaterialien — Schrauben, Bänder, PSA, Batterien. '
                          'Für Beton, Stahl oder Hauptmaterialien bitte A-Materialien nutzen.',
                          style: TextStyle(color: Colors.black54, fontSize: 13, height: 1.5),
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

            // Quick-order row: Photo + Voice (large, glove-friendly)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Row(children: [
                Expanded(child: _QuickButton(
                  label: 'Foto-Bestellung',
                  sub: 'Fotografieren & erkennen',
                  color: CColors.teal,
                  icon: Icons.camera_alt_outlined,
                  onTap: () => context.go('/c-photo'),
                )),
                const SizedBox(width: 10),
                Expanded(child: _QuickButton(
                  label: 'Sprach-Bestellung',
                  sub: 'Einfach beschreiben',
                  color: CColors.tealDark,
                  icon: Icons.mic_outlined,
                  onTap: () => context.go('/c-voice'),
                )),
              ]),
            ),

            // Chat button — full width
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
              child: _ChatButton(onTap: () => context.go('/c-chat')),
            ),

            _SectionDivider(label: 'Nach Kategorie bestellen'),

            // Category grid
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: GridView.count(
                crossAxisCount: 2,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.55,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: _categories.map((cat) => _CategoryCard(
                  cat: cat,
                  onTap: () => context.go('/catalog?category=${cat.id}'),
                )).toList(),
              ),
            ),

            const SizedBox(height: 8),
          ],
        ),
      ),
    );
  }
}

// ── Sub-widgets ──────────────────────────────────────────────────────

class _Cat {
  const _Cat(this.id, this.label, this.sub, this.icon);
  final String id, label, sub;
  final IconData icon;
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge({required this.label, required this.color});
  final String label;
  final Color color;
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
    decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(20)),
    child: Text(label, style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: Colors.white)),
  );
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
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 20),
        constraints: const BoxConstraints(minHeight: 110),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Icon(icon, color: Colors.white, size: 32),
          const SizedBox(height: 10),
          Text(label, style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: 15)),
          const SizedBox(height: 3),
          Text(sub, style: TextStyle(color: Colors.white.withValues(alpha: 0.75), fontSize: 12)),
        ]),
      ),
    ),
  );
}

class _ChatButton extends StatelessWidget {
  const _ChatButton({required this.onTap});
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(16),
    child: InkWell(
      borderRadius: BorderRadius.circular(16),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        decoration: BoxDecoration(
          border: Border.all(color: CColors.teal, width: 1.5),
          borderRadius: BorderRadius.circular(16),
        ),
        child: Row(children: [
          Container(
            width: 44, height: 44, decoration: const BoxDecoration(color: CColors.tealLighter, shape: BoxShape.circle),
            child: const Icon(Icons.chat_bubble_outline, color: CColors.teal, size: 22),
          ),
          const SizedBox(width: 14),
          const Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('Chat-Assistent', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 15, color: Color(0xFF1A1A1A))),
            SizedBox(height: 2),
            Text('Eingeben, was Sie brauchen', style: TextStyle(color: Colors.black54, fontSize: 13)),
          ])),
          const Icon(Icons.chevron_right, color: Colors.black38),
        ]),
      ),
    ),
  );
}

class _CategoryCard extends StatelessWidget {
  const _CategoryCard({required this.cat, required this.onTap});
  final _Cat cat;
  final VoidCallback onTap;
  @override
  Widget build(BuildContext context) => Material(
    color: Colors.white,
    borderRadius: BorderRadius.circular(14),
    child: InkWell(
      borderRadius: BorderRadius.circular(14),
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(14),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(cat.icon, color: CColors.teal, size: 26),
          const SizedBox(height: 8),
          Text(cat.label, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: Color(0xFF1A1A1A))),
          const SizedBox(height: 2),
          Text(cat.sub, style: const TextStyle(color: Colors.black45, fontSize: 11), maxLines: 1, overflow: TextOverflow.ellipsis),
        ]),
      ),
    ),
  );
}

class _SectionDivider extends StatelessWidget {
  const _SectionDivider({required this.label});
  final String label;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 16),
    child: Row(children: [
      const Expanded(child: Divider()),
      Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12),
        child: Text(label, style: const TextStyle(color: Colors.black45, fontSize: 12)),
      ),
      const Expanded(child: Divider()),
    ]),
  );
}
