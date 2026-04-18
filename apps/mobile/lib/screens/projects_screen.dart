import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:shimmer/shimmer.dart';

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

  Future<void> _refresh() async {
    setState(() {
      _future = AppScope.api.projects();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Projects'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Sign out',
            onPressed: () async {
              await context.read<AuthCubit>().logout();
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<Map<String, dynamic>>>(
          future: _future,
          builder: (ctx, snap) {
            if (snap.hasError) {
              return Center(child: Text('Error: ${snap.error}'));
            }
            if (!snap.hasData) {
              return _buildShimmerList();
            }
            final list = snap.data!;
            if (list.isEmpty) {
              return const Center(child: Text('No projects assigned.'));
            }
            return ListView.separated(
              physics: const AlwaysScrollableScrollPhysics(),
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
      ),
    );
  }

  Widget _buildShimmerList() {
    return Shimmer.fromColors(
      baseColor: Colors.grey[300]!,
      highlightColor: Colors.grey[100]!,
      child: ListView.builder(
        padding: const EdgeInsets.all(16),
        itemCount: 5,
        itemBuilder: (_, __) => Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Container(height: 72, decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(12))),
        ),
      ),
    );
  }
}
