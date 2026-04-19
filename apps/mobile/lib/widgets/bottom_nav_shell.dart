import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../screens/c_home_screen.dart' show CColors;
import '../translations.dart';

class BottomNavShell extends StatelessWidget {
  const BottomNavShell({super.key, required this.child});
  final Widget child;

  static int _indexOf(BuildContext context) {
    final loc = GoRouterState.of(context).matchedLocation;
    if (loc.startsWith('/c-orders')) {
      return 0;
    }
    if (loc.startsWith('/c-favorites')) {
      return 2;
    }
    return 1;
  }

  @override
  Widget build(BuildContext context) {
    final idx = _indexOf(context);
    return Scaffold(
      body: child,
      bottomNavigationBar: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(26),
            child: NavigationBar(
              height: 92,
              backgroundColor: Colors.white,
              indicatorColor: CColors.tealLighter,
              labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
              selectedIndex: idx,
              onDestinationSelected: (i) {
                switch (i) {
                  case 0:
                    context.go('/c-orders');
                    break;
                  case 1:
                    context.go('/c-home');
                    break;
                  case 2:
                    context.go('/c-favorites');
                    break;
                }
              },
              destinations: [
                NavigationDestination(
                  icon: const Icon(Icons.receipt_long_outlined, size: 30),
                  selectedIcon: const Icon(Icons.receipt_long, size: 32),
                  label: t(context, 'navOrders'),
                ),
                NavigationDestination(
                  icon: const Icon(Icons.add_circle_outline, size: 30),
                  selectedIcon: const Icon(Icons.add_circle, size: 32),
                  label: t(context, 'navNewOrder'),
                ),
                NavigationDestination(
                  icon: const Icon(Icons.favorite_border, size: 30),
                  selectedIcon: const Icon(Icons.favorite, size: 32, color: Colors.redAccent),
                  label: t(context, 'navFavorites'),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
