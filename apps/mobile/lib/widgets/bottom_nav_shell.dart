import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:comstruct/screens/c_home_screen.dart' show CColors;

class BottomNavShell extends StatelessWidget {
  const BottomNavShell({super.key, required this.child});
  final Widget child;

  static int _indexOf(BuildContext context) {
    final loc = GoRouterState.of(context).matchedLocation;
    if (loc.startsWith('/c-orders')) return 0;
    return 1; // /c-home and everything under it
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
          else        context.go('/c-home');
        },
        items: const [
          BottomNavigationBarItem(
            icon: Icon(Icons.receipt_long_outlined),
            activeIcon: Icon(Icons.receipt_long),
            label: 'Meine Bestellungen',
          ),
          BottomNavigationBarItem(
            icon: Icon(Icons.add_circle_outline),
            activeIcon: Icon(Icons.add_circle),
            label: 'Neue Bestellung',
          ),
        ],
      ),
    );
  }
}
