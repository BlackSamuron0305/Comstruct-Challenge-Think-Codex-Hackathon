import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:hive_flutter/hive_flutter.dart';

import 'api_client.dart';
import 'app_scope.dart';
import 'config.dart';
import 'cubits/auth_cubit.dart';
import 'cubits/cart_cubit.dart';
import 'cubits/language_cubit.dart';
import 'local_llm.dart';
import 'offline_queue.dart';
import 'screens/c_catalog_screen.dart';
import 'screens/c_home_screen.dart';
import 'screens/cart_screen.dart';
import 'screens/catalog_screen.dart';
import 'screens/chat_screen.dart';
import 'screens/image_order_screen.dart';
import 'screens/language_screen.dart';
import 'screens/login_screen.dart';
import 'screens/my_orders_screen.dart';
import 'screens/offline_queue_screen.dart';
import 'screens/order_detail_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/profile_screen.dart';
import 'screens/projects_screen.dart';
import 'screens/smart_add_screen.dart';
import 'screens/voice_order_screen.dart';
import 'theme.dart';
import 'widgets/bottom_nav_shell.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Hive for offline cache
  await Hive.initFlutter();
  await OfflineCache.init();
  await OfflineQueue.init();

  // Secure token storage
  final tokens = TokenStore();
  await tokens.load();

  // API client
  final api = ApiClient(baseUrl: AppConfig.apiBaseUrl, tokens: tokens);
  AppScope.api = api;

  // On-device LLM client
  AppScope.llm = LocalLlmClient();

  // Start offline queue auto-sync on connectivity changes
  OfflineQueue.startAutoSync();

  runApp(MultiBlocProvider(
    providers: [
      BlocProvider(create: (_) => AuthCubit(api)..bootstrap()),
      BlocProvider(create: (_) => CartCubit(api)),
      BlocProvider(create: (_) => LanguageCubit()),
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
      GoRoute(path: '/login',    builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/projects', builder: (_, __) => const ProjectsScreen()),

      // ── Shell with bottom nav ─────────────────────────────────────
      ShellRoute(
        builder: (_, __, child) => BottomNavShell(child: child),
        routes: [
          GoRoute(path: '/c-home',    builder: (_, __) => const CHomeScreen()),
          GoRoute(path: '/c-orders',  builder: (_, __) => const MyOrdersScreen()),
          GoRoute(path: '/c-profile', builder: (_, __) => const ProfileScreen()),
        ],
      ),

      // ── C-materials sub-screens (no bottom nav) ───────────────────
      GoRoute(path: '/c-language', builder: (_, __) => const LanguageScreen()),
      GoRoute(path: '/c-voice',   builder: (_, __) => const VoiceOrderScreen()),
      GoRoute(path: '/c-chat',    builder: (_, __) => const ChatScreen()),
      GoRoute(path: '/c-photo',   builder: (_, __) => const ImageOrderScreen()),
      GoRoute(
        path: '/c-catalog',
        builder: (_, state) => CCatalogScreen(
          category: state.uri.queryParameters['category'],
        ),
      ),
      GoRoute(
        path: '/c-order/:id',
        builder: (_, state) {
          final order = state.extra as Map<String, dynamic>?
              ?? {'id': state.pathParameters['id'] ?? ''};
          return OrderDetailScreen(order: order);
        },
      ),

      // ── Legacy routes ─────────────────────────────────────────────
      GoRoute(path: '/catalog',       builder: (_, __) => const CatalogScreen()),
      GoRoute(path: '/cart',          builder: (_, __) => const CartScreen()),
      GoRoute(path: '/orders',        builder: (_, __) => const OrdersScreen()),
      GoRoute(path: '/smart-add',     builder: (_, __) => const SmartAddScreen()),
      GoRoute(path: '/image-order',   builder: (_, __) => const ImageOrderScreen()),
      GoRoute(path: '/voice-order',   builder: (_, __) => const VoiceOrderScreen()),
      GoRoute(path: '/chat',          builder: (_, __) => const ChatScreen()),
      GoRoute(path: '/offline-queue', builder: (_, __) => const OfflineQueueScreen()),
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
