import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../translations.dart';

class CColors {
  static const teal = Color(0xFF2D7080);
  static const tealDark = Color(0xFF245F6D);
  static const tealLight = Color(0xFFC8DDE0);
  static const tealLighter = Color(0xFFDFF0F2);
  static const green = Color(0xFF34C759);
  static const red = Color(0xFFFF3B30);
  static const yellow = Color(0xFFF5C300);
  static const orange = Color(0xFFF28C28);
  static const bg = Color(0xFFF0F2F2);
}

class CHomeScreen extends StatefulWidget {
  const CHomeScreen({super.key});

  @override
  State<CHomeScreen> createState() => _CHomeScreenState();
}

class _CHomeScreenState extends State<CHomeScreen> {
  String _projectName = 'Select a project';

  static const _categories = [
    _Cat('fasteners', 'Fasteners', Icons.construction),
    _Cat('consumables', 'Consumables', Icons.science_outlined),
    _Cat('ppe', 'PPE', Icons.safety_check_outlined),
    _Cat('tools', 'Tools', Icons.home_repair_service_outlined),
    _Cat('tapes', 'Tapes', Icons.circle_outlined),
    _Cat('supplies', 'Supplies', Icons.inventory_2_outlined),
  ];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    if (!mounted) return;
    setState(() {
      _projectName = prefs.getString('comstruct.selectedProjectName') ?? 'Select a project';
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: CColors.bg,
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _load,
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 28),
            children: [
              Row(
                children: [
                  const Expanded(child: _BrandWordmark()),
                  _HeaderIconButton(
                    icon: Icons.person_outline,
                    onTap: () => context.push('/c-profile'),
                  ),
                ],
              ),
              const SizedBox(height: 14),
              GestureDetector(
                onTap: () => context.push('/projects'),
                child: Container(
                  padding: const EdgeInsets.all(18),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: CColors.tealLight),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.black.withValues(alpha: 0.05),
                        blurRadius: 12,
                        offset: const Offset(0, 4),
                      ),
                    ],
                  ),
                  child: Row(
                    children: [
                      Container(
                        width: 54,
                        height: 54,
                        decoration: BoxDecoration(
                          color: CColors.tealLighter,
                          borderRadius: BorderRadius.circular(16),
                        ),
                        child: const Icon(Icons.apartment_rounded, color: CColors.teal, size: 28),
                      ),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'Current project',
                              style: TextStyle(fontSize: 12, color: Colors.black54, fontWeight: FontWeight.w600),
                            ),
                            const SizedBox(height: 4),
                            Text(
                              _projectName,
                              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800),
                            ),
                          ],
                        ),
                      ),
                      const Icon(Icons.chevron_right, color: Colors.black38, size: 28),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              _ActionCard(
                label: t(context, 'photoOrder'),
                sub: 'Take a photo and let AI find the material fast.',
                color: CColors.teal,
                icon: Icons.camera_alt_outlined,
                onTap: () => context.push('/c-photo'),
              ),
              const SizedBox(height: 12),
              _ActionCard(
                label: t(context, 'voiceOrder'),
                sub: 'Speak naturally and create the order with big controls.',
                color: CColors.tealDark,
                icon: Icons.mic,
                onTap: () => context.push('/c-voice'),
              ),
              const SizedBox(height: 12),
              _ActionCard(
                label: t(context, 'chatOrder'),
                sub: 'Type what you need and review the result quickly.',
                color: Colors.white,
                textColor: CColors.tealDark,
                borderColor: CColors.tealLight,
                icon: Icons.chat_bubble_outline,
                onTap: () => context.push('/c-chat'),
              ),
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(18),
                  border: Border.all(color: CColors.tealLight),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Row(
                      children: [
                        Icon(Icons.verified_user_outlined, color: CColors.teal, size: 20),
                        SizedBox(width: 8),
                        Text(
                          'Fast and safe ordering',
                          style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: CColors.tealDark),
                        ),
                      ],
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'AI suggests items, but you always confirm the quantity before the order is sent. If the signal drops, the request is saved and syncs later.',
                      style: TextStyle(fontSize: 13, height: 1.4, color: Colors.black54),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      child: OutlinedButton.icon(
                        onPressed: () => context.push('/c-orders'),
                        icon: const Icon(Icons.local_shipping_outlined),
                        label: const Text('Track my order status'),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Text(
                  t(context, 'orderByCategory'),
                  style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: CColors.tealDark),
                ),
              ),
              GridView.count(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 1.18,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                children: _categories
                    .map(
                      (cat) => Material(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(18),
                        child: InkWell(
                          borderRadius: BorderRadius.circular(18),
                          onTap: () => context.push('/c-catalog?category=${cat.id}'),
                          child: Padding(
                            padding: const EdgeInsets.all(16),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(cat.icon, color: CColors.teal, size: 30),
                                const SizedBox(height: 10),
                                Text(
                                  t(context, 'cat${cat.tKey}'),
                                  style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 15),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  t(context, 'cat${cat.tKey}S'),
                                  style: const TextStyle(color: Colors.black54, fontSize: 12, height: 1.35),
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ),
                      ),
                    )
                    .toList(),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _BrandWordmark extends StatelessWidget {
  const _BrandWordmark();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 54,
          height: 54,
          decoration: BoxDecoration(
            color: CColors.teal,
            borderRadius: BorderRadius.circular(18),
          ),
          child: const Center(
            child: Icon(Icons.change_history_rounded, color: CColors.yellow, size: 28),
          ),
        ),
        const SizedBox(width: 12),
        const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'comstruct',
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: CColors.tealDark),
            ),
            Text(
              'Foreman ordering',
              style: TextStyle(fontSize: 13, color: Colors.black54),
            ),
          ],
        ),
      ],
    );
  }
}

class _HeaderIconButton extends StatelessWidget {
  const _HeaderIconButton({required this.icon, required this.onTap});

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
          width: 48,
          height: 48,
          child: Icon(icon, color: CColors.tealDark, size: 26),
        ),
      ),
    );
  }
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({
    required this.label,
    required this.sub,
    required this.color,
    required this.icon,
    required this.onTap,
    this.textColor = Colors.white,
    this.borderColor,
  });

  final String label;
  final String sub;
  final Color color;
  final IconData icon;
  final VoidCallback onTap;
  final Color textColor;
  final Color? borderColor;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: color,
      borderRadius: BorderRadius.circular(20),
      child: InkWell(
        borderRadius: BorderRadius.circular(20),
        onTap: onTap,
        child: Container(
          constraints: const BoxConstraints(minHeight: 106),
          padding: const EdgeInsets.all(18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(20),
            border: borderColor == null ? null : Border.all(color: borderColor!, width: 1.4),
          ),
          child: Row(
            children: [
              Container(
                width: 56,
                height: 56,
                decoration: BoxDecoration(
                  color: textColor == Colors.white ? Colors.white.withValues(alpha: 0.18) : CColors.tealLighter,
                  borderRadius: BorderRadius.circular(16),
                ),
                child: Icon(icon, size: 28, color: textColor == Colors.white ? Colors.white : CColors.tealDark),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Text(
                      label,
                      style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: textColor),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      sub,
                      style: TextStyle(fontSize: 14, height: 1.35, color: textColor.withValues(alpha: 0.82)),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right, color: textColor.withValues(alpha: 0.9), size: 28),
            ],
          ),
        ),
      ),
    );
  }
}

class _Cat {
  const _Cat(this.id, this.tKey, this.icon);
  final String id;
  final String tKey;
  final IconData icon;
}
