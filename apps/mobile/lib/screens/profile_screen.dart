import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_scope.dart';
import '../cubits/auth_cubit.dart';
import '../cubits/language_cubit.dart';
import '../translations.dart';
import 'c_home_screen.dart' show CColors;

class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  late Future<Map<String, String>> _future;

  @override
  void initState() {
    super.initState();
    _future = _loadProfile();
  }

  Future<Map<String, String>> _loadProfile() async {
    final user = await AppScope.api.me();
    final prefs = await SharedPreferences.getInstance();
    return {
      'name': (user['name'] ?? 'User').toString(),
      'email': (user['email'] ?? '').toString(),
      'role': (prefs.getString('comstruct.userPosition') ?? user['role'] ?? 'foreman').toString(),
      'project': (prefs.getString('comstruct.selectedProjectName') ?? 'No project selected').toString(),
    };
  }

  @override
  Widget build(BuildContext context) {
    final currentLang = context.watch<LanguageCubit>().state;
    final currentLangObj = kLangs.firstWhere((l) => l.code == currentLang, orElse: () => kLangs[0]);

    return Scaffold(
      backgroundColor: CColors.bg,
      body: SafeArea(
        child: FutureBuilder<Map<String, String>>(
          future: _future,
          builder: (context, snap) {
            if (!snap.hasData) {
              return const Center(child: CircularProgressIndicator(color: CColors.teal));
            }

            final data = snap.data!;
            final name = data['name'] ?? 'User';
            final role = data['role'] ?? 'foreman';
            final email = data['email'] ?? '';
            final project = data['project'] ?? 'No project selected';
            final avatar = name.isNotEmpty ? name.characters.first.toUpperCase() : 'U';

            return ListView(
              padding: const EdgeInsets.only(bottom: 40),
              children: [
                Padding(
                  padding: const EdgeInsets.fromLTRB(12, 12, 16, 0),
                  child: Row(
                    children: [
                      IconButton(
                        icon: const Icon(Icons.arrow_back, color: CColors.tealDark),
                        onPressed: () => context.canPop() ? context.pop() : context.go('/c-home'),
                      ),
                      Expanded(
                        child: Text(
                          t(context, 'profile'),
                          style: const TextStyle(fontSize: 28, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A), letterSpacing: -0.5),
                        ),
                      ),
                    ],
                  ),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(vertical: 24),
                  child: Column(
                    children: [
                      Container(
                        width: 80,
                        height: 80,
                        decoration: BoxDecoration(
                          color: CColors.teal,
                          shape: BoxShape.circle,
                          boxShadow: [BoxShadow(color: CColors.teal.withValues(alpha: 0.3), blurRadius: 16, spreadRadius: 2)],
                        ),
                        child: Center(
                          child: Text(avatar, style: const TextStyle(fontSize: 32, color: Colors.white, fontWeight: FontWeight.w700)),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Text(name, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Color(0xFF1A1A1A))),
                      const SizedBox(height: 4),
                      Text('$role · $project', style: const TextStyle(fontSize: 13, color: Colors.black45)),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                  child: Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)],
                    ),
                    child: Column(
                      children: [
                        _InfoRow(icon: '📧', label: t(context, 'email'), value: email),
                        Divider(height: 0, indent: 56, color: Colors.black.withValues(alpha: 0.1)),
                        _InfoRow(icon: '👷', label: 'Position', value: role),
                        Divider(height: 0, indent: 56, color: Colors.black.withValues(alpha: 0.1)),
                        _InfoRow(icon: '📍', label: 'Assigned project', value: project),
                      ],
                    ),
                  ),
                ),
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
                          Expanded(
                            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                              Text(t(context, 'languageSetting'), style: const TextStyle(fontSize: 11, color: Colors.black38)),
                              const SizedBox(height: 2),
                              Text(currentLangObj.label, style: const TextStyle(fontSize: 14, color: Color(0xFF1A1A1A))),
                            ]),
                          ),
                          const Icon(Icons.chevron_right, color: Colors.black38),
                        ]),
                      ),
                    ),
                  ),
                ),
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
            );
          },
        ),
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({required this.icon, required this.label, required this.value});

  final String icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        child: Row(
          children: [
            Text(icon, style: const TextStyle(fontSize: 20)),
            const SizedBox(width: 12),
            Expanded(
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(label, style: const TextStyle(fontSize: 11, color: Colors.black38)),
                const SizedBox(height: 2),
                Text(value, style: const TextStyle(fontSize: 14, color: Color(0xFF1A1A1A))),
              ]),
            ),
          ],
        ),
      );
}
