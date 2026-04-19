import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:comstruct_mobile/api_client.dart';
import 'package:comstruct_mobile/cubits/auth_cubit.dart';
import 'package:comstruct_mobile/screens/login_screen.dart';

void main() {
  testWidgets('register screen stays usable on a small phone viewport', (tester) async {
    tester.view.physicalSize = const Size(390, 780);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(() {
      tester.view.resetPhysicalSize();
      tester.view.resetDevicePixelRatio();
    });

    final authCubit = AuthCubit(
      ApiClient(baseUrl: 'http://127.0.0.1:8001', tokens: TokenStore()),
    );

    await tester.pumpWidget(
      MultiBlocProvider(
        providers: [
          BlocProvider<AuthCubit>.value(value: authCubit),
        ],
        child: const MaterialApp(
          home: LoginScreen(startInRegisterMode: true),
        ),
      ),
    );

    await tester.pumpAndSettle();

    expect(find.text('Create your account'), findsOneWidget);
    expect(find.text('FULL NAME'), findsOneWidget);
    expect(find.text('EMAIL'), findsOneWidget);
    expect(find.text('PASSWORD'), findsOneWidget);
    expect(find.text('POSITION'), findsOneWidget);
    expect(find.text('PHONE'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
