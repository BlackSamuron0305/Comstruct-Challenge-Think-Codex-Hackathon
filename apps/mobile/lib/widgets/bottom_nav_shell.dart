import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../screens/c_home_screen.dart' show CColors;
import '../translations.dart';

class BottomNavShell extends StatelessWidget {
  const BottomNavShell({super.key, required this.child});
  final Widget child;

  static int _indexOf(BuildContext context) {
    final loc = GoRouterState.of(context).matchedLocation;
    if (loc.startsWith('/c-orders'))  return 0;
    if (loc.startsWith('/c-profile')) return 2;
    return 1; // /c-home and sub-screens
  }

  @override
  Widget build(BuildContext context) {
    final idx = _indexOf(context);
    return Scaffold(
      body: child,
      bottomNavigationBar: BottomNavigationBar(
        currentIndex: idx,
        selectedItemColor: CColors.teal,
        unselectedItemColor: Colors.black38,
        onTap: (i) {
          if (i == 0) context.go('/c-orders');
          else if (i == 1) context.go('/c-home');
          else context.go('/c-profile');
        },
        items: [
          BottomNavigationBarItem(
            icon: const Icon(Icons.receipt_long_outlined),
            activeIcon: const Icon(Icons.receipt_long),
            label: t(context, 'navOrders'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.add_circle_outline),
            activeIcon: const Icon(Icons.add_circle),
            label: t(context, 'navNewOrder'),
          ),
          BottomNavigationBarItem(
            icon: const Icon(Icons.person_outline),
            activeIcon: const Icon(Icons.person),
            label: t(context, 'navProfile'),
          ),
        ],
      ),
    );
  }
}
