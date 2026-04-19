import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import '../cubits/auth_cubit.dart';
import '../cubits/language_cubit.dart';
import '../translations.dart';
import 'c_home_screen.dart' show CColors;

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final currentLang = context.watch<LanguageCubit>().state;
    final currentLangObj = kLangs.firstWhere((l) => l.code == currentLang, orElse: () => kLangs[0]);

    return Scaffold(
      backgroundColor: CColors.bg,
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.only(bottom: 40),
          children: [
            // ── Header ──
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
              child: Text(t(context, 'profile'),
                  style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700,
                      color: Color(0xFF1A1A1A), letterSpacing: -0.5)),
            ),

            // ── Avatar + name ──
            Container(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: Column(children: [
                Container(
                  width: 80, height: 80,
                  decoration: BoxDecoration(
                    color: CColors.teal,
                    shape: BoxShape.circle,
                    boxShadow: [BoxShadow(color: CColors.teal.withValues(alpha: 0.3), blurRadius: 16, spreadRadius: 2)],
                  ),
                  child: const Center(
                    child: Text('M', style: TextStyle(fontSize: 32, color: Colors.white, fontWeight: FontWeight.w700)),
                  ),
                ),
                const SizedBox(height: 14),
                const Text('Max Mustermann',
                    style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A))),
                const SizedBox(height: 4),
                const Text('Vorarbeiter · 904231 – Brücke St. Gallen',
                    style: TextStyle(fontSize: 13, color: Colors.black45)),
              ]),
            ),

            // ── Info card ──
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Container(
                decoration: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(12),
                  boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)],
                ),
                child: Column(children: [
                  _InfoRow(icon: '📧', label: t(context, 'email'), value: 'm.mustermann@example.com'),
                  Divider(height: 0, indent: 56, color: Colors.black.withValues(alpha: 0.1)),
                  _InfoRow(icon: '📱', label: t(context, 'phone'), value: '+41 79 123 45 67'),
                  Divider(height: 0, indent: 56, color: Colors.black.withValues(alpha: 0.1)),
                  _InfoRow(icon: '🏢', label: t(context, 'company'), value: 'Bauunternehmen AG'),
                ]),
              ),
            ),

            // ── Language picker ──
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Material(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () => context.push('/c-language'),
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)],
                    ),
                    child: Row(children: [
                      Text(currentLangObj.flag, style: const TextStyle(fontSize: 22)),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(t(context, 'languageSetting'),
                            style: const TextStyle(fontSize: 11, color: Colors.black38)),
                        const SizedBox(height: 2),
                        Text(currentLangObj.label,
                            style: const TextStyle(fontSize: 14, color: Color(0xFF1A1A1A))),
                      ])),
                      const Icon(Icons.chevron_right, color: Colors.black38),
                    ]),
                  ),
                ),
              ),
            ),

            // ── FAQ button ──
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
              child: Material(
                color: CColors.tealLighter,
                borderRadius: BorderRadius.circular(12),
                child: InkWell(
                  borderRadius: BorderRadius.circular(12),
                  onTap: () {},
                  child: Container(
                    padding: const EdgeInsets.all(16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: CColors.tealLight),
                    ),
                    child: Row(children: [
                      Container(
                        width: 40, height: 40,
                        decoration: const BoxDecoration(color: CColors.teal, shape: BoxShape.circle),
                        child: const Icon(Icons.help_outline, color: Colors.white, size: 20),
                      ),
                      const SizedBox(width: 12),
                      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Text(t(context, 'faqHelp'),
                            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: CColors.teal)),
                        const SizedBox(height: 2),
                        Text(t(context, 'faqHelpSub'),
                            style: const TextStyle(fontSize: 12, color: Colors.black45)),
                      ])),
                      const Icon(Icons.chevron_right, color: CColors.teal),
                    ]),
                  ),
                ),
              ),
            ),

            // ── Logout ──
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 2, 16, 0),
              child: OutlinedButton.icon(
                onPressed: () async {
                  await context.read<AuthCubit>().logout();
                  if (context.mounted) context.go('/login');
                },
                icon: const Icon(Icons.logout, color: Colors.red),
                label: Text(t(context, 'logout'), style: const TextStyle(color: Colors.red)),
                style: OutlinedButton.styleFrom(
                  side: const BorderSide(color: Colors.red),
                  minimumSize: const Size(double.infinity, 48),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});
  final String icon, label, value;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
    child: Row(children: [
      Text(icon, style: const TextStyle(fontSize: 20)),
      const SizedBox(width: 12),
      Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: const TextStyle(fontSize: 11, color: Colors.black38)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 14, color: Color(0xFF1A1A1A))),
      ])),
    ]),
  );
}
