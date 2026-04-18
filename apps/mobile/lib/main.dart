import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import 'api_client.dart';
import 'app_scope.dart';
import 'cubits/auth_cubit.dart';
import 'cubits/cart_cubit.dart';
import 'screens/cart_screen.dart';
import 'screens/catalog_screen.dart';
import 'screens/login_screen.dart';
import 'screens/orders_screen.dart';
import 'screens/projects_screen.dart';
import 'screens/smart_add_screen.dart';
import 'theme.dart';

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
    final router = _buildRouter(context);
    return MaterialApp.router(
      title: 'comstruct',
      debugShowCheckedModeBanner: false,
      theme: buildComstructTheme(),
      routerConfig: router,
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
      final atLogin = state.matchedLocation == '/login';
      if (!loggedIn) return atLogin ? null : '/login';
      if (atLogin) return '/projects';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, __) => const LoginScreen()),
      GoRoute(path: '/projects', builder: (_, __) => const ProjectsScreen()),
      GoRoute(path: '/catalog', builder: (_, __) => const CatalogScreen()),
      GoRoute(path: '/cart', builder: (_, __) => const CartScreen()),
      GoRoute(path: '/orders', builder: (_, __) => const OrdersScreen()),
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
