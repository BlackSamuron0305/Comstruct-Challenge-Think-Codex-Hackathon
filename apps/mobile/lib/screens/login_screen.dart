import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../cubits/auth_cubit.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.startInRegisterMode = false});

  final bool startInRegisterMode;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email = TextEditingController(text: 'foreman@brueckesg.ch');
  final _password = TextEditingController(text: 'comstruct-demo');
  final _fullName = TextEditingController(text: 'Max Builder');
  final _company = TextEditingController(text: 'Comstruct Demo Site');
  final _phone = TextEditingController();
  bool _hidePassword = true;
  late bool _registerMode;

  @override
  void initState() {
    super.initState();
    _registerMode = widget.startInRegisterMode;
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _fullName.dispose();
    _company.dispose();
    _phone.dispose();
    super.dispose();
  }

  void _switchMode(bool register) {
    if (_registerMode == register) return;
    setState(() => _registerMode = register);
    context.go(register ? '/register' : '/login');
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit>();
    final bottomInset = MediaQuery.of(context).viewInsets.bottom;

    return Scaffold(
      backgroundColor: ComstructColors.surface,
      body: SafeArea(
        child: LayoutBuilder(
          builder: (context, constraints) {
            return SingleChildScrollView(
              padding: EdgeInsets.fromLTRB(20, 12, 20, 20 + bottomInset),
              child: Center(
                child: ConstrainedBox(
                  constraints: const BoxConstraints(maxWidth: 460),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const _BrandHero(),
                      const SizedBox(height: 18),
                      _ModeSwitcher(
                        registerMode: _registerMode,
                        onChanged: _switchMode,
                      ),
                      const SizedBox(height: 14),
                      Container(
                        padding: const EdgeInsets.all(18),
                        decoration: BoxDecoration(
                          color: Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          boxShadow: [
                            BoxShadow(
                              color: Colors.black.withValues(alpha: 0.06),
                              blurRadius: 20,
                              offset: const Offset(0, 8),
                            ),
                          ],
                          border: Border.all(color: ComstructColors.line),
                        ),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            Text(
                              _registerMode ? 'Create your account' : 'Welcome back',
                              style: const TextStyle(
                                fontSize: 22,
                                fontWeight: FontWeight.w800,
                                color: ComstructColors.ink,
                              ),
                            ),
                            const SizedBox(height: 6),
                            Text(
                              _registerMode
                                  ? 'Set up a foreman account for quick, glove-friendly ordering on site.'
                                  : 'Sign in to continue to the updated site-ordering screens.',
                              style: const TextStyle(fontSize: 13, color: Colors.black54),
                            ),
                            const SizedBox(height: 16),
                            if (_registerMode) ...[
                              TextField(
                                controller: _fullName,
                                textInputAction: TextInputAction.next,
                                decoration: const InputDecoration(
                                  labelText: 'Full name',
                                  prefixIcon: Icon(Icons.badge_outlined),
                                ),
                              ),
                              const SizedBox(height: 12),
                            ],
                            TextField(
                              controller: _email,
                              keyboardType: TextInputType.emailAddress,
                              textInputAction: TextInputAction.next,
                              autocorrect: false,
                              decoration: const InputDecoration(
                                labelText: 'Email',
                                prefixIcon: Icon(Icons.alternate_email),
                              ),
                            ),
                            const SizedBox(height: 12),
                            TextField(
                              controller: _password,
                              obscureText: _hidePassword,
                              decoration: InputDecoration(
                                labelText: 'Password',
                                prefixIcon: const Icon(Icons.lock_outline),
                                suffixIcon: IconButton(
                                  onPressed: () => setState(() => _hidePassword = !_hidePassword),
                                  icon: Icon(_hidePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                                ),
                              ),
                            ),
                            if (_registerMode) ...[
                              const SizedBox(height: 12),
                              TextField(
                                controller: _company,
                                textInputAction: TextInputAction.next,
                                decoration: const InputDecoration(
                                  labelText: 'Company or site',
                                  prefixIcon: Icon(Icons.domain_outlined),
                                ),
                              ),
                              const SizedBox(height: 12),
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFF5F7FA),
                                  borderRadius: BorderRadius.circular(14),
                                  border: Border.all(color: ComstructColors.line),
                                ),
                                child: const Row(
                                  children: [
                                    Icon(Icons.engineering_outlined, color: ComstructColors.brand),
                                    SizedBox(width: 10),
                                    Expanded(
                                      child: Text(
                                        'Role: Foreman',
                                        style: TextStyle(fontWeight: FontWeight.w700),
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 12),
                              TextField(
                                controller: _phone,
                                keyboardType: TextInputType.phone,
                                textInputAction: TextInputAction.done,
                                decoration: const InputDecoration(
                                  labelText: 'Phone (optional)',
                                  prefixIcon: Icon(Icons.phone_outlined),
                                ),
                              ),
                            ],
                            const SizedBox(height: 14),
                            if (auth.state.error != null) ...[
                              Container(
                                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                                decoration: BoxDecoration(
                                  color: const Color(0xFFFEECEC),
                                  borderRadius: BorderRadius.circular(12),
                                  border: Border.all(color: const Color(0xFFF2B5B5)),
                                ),
                                child: Text(
                                  auth.state.error!,
                                  style: const TextStyle(color: ComstructColors.err, fontWeight: FontWeight.w600),
                                ),
                              ),
                              const SizedBox(height: 14),
                            ],
                            ElevatedButton.icon(
                              onPressed: auth.state.busy
                                  ? null
                                  : () {
                                      FocusScope.of(context).unfocus();
                                      if (_registerMode) {
                                        auth.register(
                                          fullName: _fullName.text.trim(),
                                          email: _email.text.trim(),
                                          password: _password.text,
                                          companyName: _company.text.trim(),
                                          role: 'foreman',
                                          phone: _phone.text.trim(),
                                        );
                                      } else {
                                        auth.login(_email.text.trim(), _password.text);
                                      }
                                    },
                              icon: Icon(_registerMode ? Icons.person_add_alt_1 : Icons.login),
                              label: Text(
                                auth.state.busy
                                    ? (_registerMode ? 'Creating account…' : 'Signing in…')
                                    : (_registerMode ? 'Create account' : 'Sign in'),
                              ),
                            ),
                            const SizedBox(height: 10),
                            OutlinedButton(
                              onPressed: auth.state.busy
                                  ? null
                                  : () => _switchMode(!_registerMode),
                              child: Text(
                                _registerMode ? 'Already have an account? Sign in' : 'Need an account? Register here',
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      const _DemoAccountsCard(),
                    ],
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}

class _BrandHero extends StatelessWidget {
  const _BrandHero();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 16),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(24),
        gradient: const LinearGradient(
          colors: [Color(0xFF0F2A44), Color(0xFF1D4C73)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 60,
                height: 60,
                decoration: BoxDecoration(
                  color: ComstructColors.accent,
                  borderRadius: BorderRadius.circular(18),
                ),
                child: const Icon(Icons.construction_rounded, color: Colors.white, size: 32),
              ),
              const SizedBox(width: 14),
              const Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Comstruct',
                      style: TextStyle(fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white),
                    ),
                    SizedBox(height: 4),
                    Text(
                      'C-Materials Mobile',
                      style: TextStyle(fontSize: 14, color: Color(0xFFD7E6F5)),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          const Text(
            'Faster ordering for the job site',
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: Colors.white),
          ),
          const SizedBox(height: 8),
          const Text(
            'Bigger action buttons, cleaner navigation, and a safer sign-in flow are now back in place.',
            style: TextStyle(fontSize: 13, height: 1.45, color: Color(0xFFD7E6F5)),
          ),
        ],
      ),
    );
  }
}

class _ModeSwitcher extends StatelessWidget {
  const _ModeSwitcher({required this.registerMode, required this.onChanged});

  final bool registerMode;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(4),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ComstructColors.line),
      ),
      child: Row(
        children: [
          Expanded(
            child: _ModeButton(
              label: 'Sign In',
              selected: !registerMode,
              onTap: () => onChanged(false),
            ),
          ),
          Expanded(
            child: _ModeButton(
              label: 'Register',
              selected: registerMode,
              onTap: () => onChanged(true),
            ),
          ),
        ],
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  const _ModeButton({required this.label, required this.selected, required this.onTap});

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 12),
        decoration: BoxDecoration(
          color: selected ? ComstructColors.brand : Colors.transparent,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          label,
          textAlign: TextAlign.center,
          style: TextStyle(
            fontWeight: FontWeight.w700,
            color: selected ? Colors.white : ComstructColors.ink,
          ),
        ),
      ),
    );
  }
}

class _DemoAccountsCard extends StatelessWidget {
  const _DemoAccountsCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFFFF8EE),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFFF2D3AA)),
      ),
      child: const Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Foreman demo access',
            style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: ComstructColors.brand),
          ),
          SizedBox(height: 6),
          Text(
            'Password: comstruct-demo',
            style: TextStyle(fontSize: 13, color: Colors.black87),
          ),
          SizedBox(height: 6),
          Text(
            '• foreman@brueckesg.ch',
            style: TextStyle(fontSize: 13, color: Colors.black54, height: 1.5),
          ),
        ],
      ),
    );
  }
}
