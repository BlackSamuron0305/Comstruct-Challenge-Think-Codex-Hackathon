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
    if (loc.startsWith('/c-profile')) {
      return 2;
    }
    if (loc.startsWith('/c-favorites')) {
      return 3;
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
          padding: const EdgeInsets.fromLTRB(10, 0, 10, 10),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(24),
            child: NavigationBar(
              height: 88,
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
                    context.go('/c-profile');
                    break;
                  case 3:
                    context.go('/c-favorites');
                    break;
                }
              },
              destinations: [
                NavigationDestination(
                  icon: const Icon(Icons.receipt_long_outlined, size: 28),
                  selectedIcon: const Icon(Icons.receipt_long, size: 30),
                  label: t(context, 'navOrders'),
                ),
                NavigationDestination(
                  icon: const Icon(Icons.add_circle_outline, size: 28),
                  selectedIcon: const Icon(Icons.add_circle, size: 30),
                  label: t(context, 'navNewOrder'),
                ),
                NavigationDestination(
                  icon: const Icon(Icons.person_outline, size: 28),
                  selectedIcon: const Icon(Icons.person, size: 30),
                  label: t(context, 'navProfile'),
                ),
                NavigationDestination(
                  icon: const Icon(Icons.favorite_border, size: 28),
                  selectedIcon: const Icon(Icons.favorite, size: 30, color: Colors.redAccent),
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
