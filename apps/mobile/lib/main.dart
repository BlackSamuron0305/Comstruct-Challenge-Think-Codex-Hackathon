/// Drop-in replacement for main.dart — adds C-materials routes.
/// Copy this file content into apps/mobile/lib/main.dart
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import 'api_client.dart';
import 'app_scope.dart';
import 'cubits/auth_cubit.dart';
import 'cubits/cart_cubit.dart';
import 'screens/cart_screen.dart';
import 'screens/catalog_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/c_home_screen.dart';
import 'screens/login_screen.dart';
import 'screens/my_orders_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/order_detail_screen.dart';
import 'screens/projects_screen.dart';
import 'screens/smart_add_screen.dart';
import 'screens/voice_order_screen.dart';
import 'theme.dart';
import 'widgets/bottom_nav_shell.dart';

const _kBaseUrl = String.fromEnvironment('API_BASE_URL', defaultValue: 'http://10.0.2.2:8001');

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final tokens = TokenStore();
  await tokens.load();
  final api = ApiClient(baseUrl: _kBaseUrl, tokens: tokens);
  AppScope.api = api;

  runApp(MultiBlocProvider(
    providers: [
      BlocProvider(create: (_) => AuthCubit(api)..bootstrap()),
      BlocProvider(create: (_) => CartCubit(api)),
    ],
    child: ComstructApp(api: api),
  ));
}

class ComstructApp extends StatelessWidget {
  const ComstructApp({super.key, required this.api});
  final ApiClient api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'comstruct',
      debugShowCheckedModeBanner: false,
      theme: buildComstructTheme(),
      routerConfig: _buildRouter(context),
    );
  }
}

GoRouter _buildRouter(BuildContext context) {
  final auth = context.read<AuthCubit>();
  return GoRouter(
    initialLocation: '/login',
    refreshListenable: GoRouterRefreshStream(auth.stream),
    redirect: (ctx, state) {
      final loggedIn = auth.state.user != null;
      final atLogin  = state.matchedLocation == '/login';
      if (!loggedIn) return atLogin ? null : '/login';
      if (atLogin)   return '/c-home';
      return null;
    },
    routes: [
      // ── Auth ─────────────────────────────────────────────────────
      GoRoute(path: '/login',    builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/projects', builder: (_, __) => const ProjectsScreen()),

      // ── C-materials shell (with bottom nav) ───────────────────────
      ShellRoute(
        builder: (_, __, child) => BottomNavShell(child: child),
        routes: [
          GoRoute(
            path: '/c-home',
            builder: (_, __) => const CHomeScreen(),
          ),
          GoRoute(
            path: '/c-orders',
            builder: (_, __) => const MyOrdersScreen(),
          ),
        ],
      ),

      // ── C-materials sub-screens (no bottom nav) ───────────────────
      GoRoute(path: '/c-voice',  builder: (_, __) => const VoiceOrderScreen()),
      GoRoute(path: '/c-chat',   builder: (_, __) => const ChatScreen()),
      GoRoute(
        path: '/c-order/:id',
        builder: (_, state) {
          // Order detail: pass the order map via `extra`
          final order = state.extra as Map<String, dynamic>? ?? {'id': state.pathParameters['id'] ?? ''};
          return OrderDetailScreen(order: order);
        },
      ),

      // ── Legacy screens (kept for compatibility) ───────────────────
      GoRoute(path: '/catalog',   builder: (_, __) => const CatalogScreen()),
      GoRoute(path: '/cart',      builder: (_, __) => const CartScreen()),
      GoRoute(path: '/orders',    builder: (_, __) => const OrdersScreen()),
      GoRoute(path: '/smart-add', builder: (_, __) => const SmartAddScreen()),
    ],
  );
}

class GoRouterRefreshStream extends ChangeNotifier {
  GoRouterRefreshStream(Stream<dynamic> stream) {
    _sub = stream.listen((_) => notifyListeners());
  }
  late final dynamic _sub;
  @override
  void dispose() {
    (_sub as dynamic)?.cancel();
    super.dispose();
  }
}
