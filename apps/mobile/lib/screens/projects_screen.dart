import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../app_scope.dart';
import '../cubits/auth_cubit.dart';

const kSelectedProjectKey = 'comstruct.selectedProject';
const kSelectedProjectNameKey = 'comstruct.selectedProjectName';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});
  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    _future = AppScope.api.projects();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Projekte'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await context.read<AuthCubit>().logout();
            },
          ),
        ],
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (ctx, snap) {
          if (snap.hasError) {
            return Center(child: Text('Fehler: ${snap.error}'));
          }
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final list = snap.data!;
          if (list.isEmpty) {
            return const Center(child: Text('Keine Projekte zugewiesen.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemBuilder: (_, i) {
              final p = list[i];
              return Card(
                child: ListTile(
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  title: Text(p['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text((p['site_address'] as String?) ?? '—'),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    final prefs = await SharedPreferences.getInstance();
                    await prefs.setString(kSelectedProjectKey, p['id'] as String);
                    await prefs.setString(kSelectedProjectNameKey, p['name'] as String);
                    if (!ctx.mounted) return;
                    ctx.go('/catalog');
                  },
                ),
              );
            },
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemCount: list.length,
          );
        },
      ),
    );
  }
}
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../api_client.dart';
import '../cubits/auth_cubit.dart';

const _kSelectedProject = 'comstruct.selectedProject';

class ProjectsScreen extends StatefulWidget {
  const ProjectsScreen({super.key});
  @override
  State<ProjectsScreen> createState() => _ProjectsScreenState();
}

class _ProjectsScreenState extends State<ProjectsScreen> {
  late Future<List<Map<String, dynamic>>> _future;

  @override
  void initState() {
    super.initState();
    final api = _api(context);
    _future = api.projects();
  }

  ApiClient _api(BuildContext context) {
    // We get it via a hack: there's only one ApiClient and it's referenced
    // by AuthCubit indirectly. For simplicity, recreate via base URL singleton:
    return _SharedApi.instance;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Projekte'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            onPressed: () async {
              await context.read<AuthCubit>().logout();
            },
          ),
        ],
      ),
      body: FutureBuilder<List<Map<String, dynamic>>>(
        future: _future,
        builder: (ctx, snap) {
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final list = snap.data!;
          if (list.isEmpty) {
            return const Center(child: Text('Keine Projekte zugewiesen.'));
          }
          return ListView.separated(
            padding: const EdgeInsets.all(16),
            itemBuilder: (_, i) {
              final p = list[i];
              return Card(
                child: ListTile(
                  title: Text(p['name'] as String, style: const TextStyle(fontWeight: FontWeight.w600)),
                  subtitle: Text(p['site_address'] as String? ?? ''),
                  trailing: const Icon(Icons.chevron_right),
                  onTap: () async {
                    final prefs = await SharedPreferences.getInstance();
                    await prefs.setString(_kSelectedProject, p['id'] as String);
                    if (!ctx.mounted) return;
                    ctx.go('/catalog');
                  },
                ),
              );
            },
            separatorBuilder: (_, __) => const SizedBox(height: 8),
            itemCount: list.length,
          );
        },
      ),
    );
  }
}

/// Minimal singleton holder so screens can access ApiClient
/// without explicit DI plumbing.
class _SharedApi {
  static late final ApiClient instance;
  static void register(ApiClient api) {
    instance = api;
  }
}
