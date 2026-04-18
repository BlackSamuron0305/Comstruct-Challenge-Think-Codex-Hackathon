import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';

import '../cubits/auth_cubit.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'foreman@brueckesg.ch');
  final _password = TextEditingController(text: 'comstruct-demo');

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit>();
    return Scaffold(
      backgroundColor: ComstructColors.surface,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const SizedBox(height: 40),
              const Text('Comstruct',
                  style: TextStyle(fontSize: 36, fontWeight: FontWeight.w700, color: ComstructColors.brand)),
              const SizedBox(height: 8),
              const Text('Order fast. Deliver safe.',
                  style: TextStyle(fontSize: 16, color: Colors.black54)),
              const SizedBox(height: 36),
              TextField(
                controller: _email,
                decoration: const InputDecoration(labelText: 'Email'),
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _password,
                obscureText: true,
                decoration: const InputDecoration(labelText: 'Password'),
              ),
              const SizedBox(height: 20),
              if (auth.state.error != null)
                Text(auth.state.error!, style: const TextStyle(color: ComstructColors.err)),
              const SizedBox(height: 8),
              ElevatedButton(
                onPressed: auth.state.busy
                    ? null
                    : () => auth.login(_email.text.trim(), _password.text),
                child: Text(auth.state.busy ? 'Signing in…' : 'Sign In'),
              ),
              const SizedBox(height: 24),
              const Text(
                'Demo accounts (password: comstruct-demo)\n'
                '• foreman@brueckesg.ch\n'
                '• pm@brueckesg.ch\n'
                '• procurement@comstruct.com',
                style: TextStyle(fontSize: 12, color: Colors.black54),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
