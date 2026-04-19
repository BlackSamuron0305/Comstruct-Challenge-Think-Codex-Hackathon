import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../cubits/auth_cubit.dart';
import '../theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, this.startInRegisterMode = false});

  final bool startInRegisterMode;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  static const _positionKey = 'comstruct.userPosition';
  static const _demoEmail = 'foreman@brueckesg.ch';
  static const _demoPassword = 'comstruct-demo';

  final _email = TextEditingController();
  final _password = TextEditingController();
  final _fullName = TextEditingController();
  final _position = TextEditingController(text: 'Foreman');
  final _phone = TextEditingController();
  final _authScrollController = ScrollController();
  final _pageController = PageController(viewportFraction: 0.94);

  bool _hidePassword = true;
  late bool _registerMode;
  int _introPage = 0;

  static const _introCards = [
    (
      'C-Materials in 10 seconds',
      'These are the everyday site items like screws, tape, foam, PPE and small supplies.',
      Icons.info_outline,
    ),
    (
      'Made for gloves',
      'Big buttons and fast photo or voice ordering keep the app practical on site.',
      Icons.pan_tool_alt_outlined,
    ),
    (
      'Track only the status',
      'Order state stays simple so the foreman sees exactly what is happening.',
      Icons.track_changes_outlined,
    ),
  ];

  @override
  void initState() {
    super.initState();
    _registerMode = widget.startInRegisterMode;
    if (!_registerMode) {
      _applyDemoDefaults();
    }
  }

  void _applyDemoDefaults() {
    if (_email.text.trim().isEmpty) {
      _email.text = _demoEmail;
    }
    if (_password.text.isEmpty) {
      _password.text = _demoPassword;
    }
  }

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _fullName.dispose();
    _position.dispose();
    _phone.dispose();
    _authScrollController.dispose();
    _pageController.dispose();
    super.dispose();
  }

  void _switchMode(bool register) {
    if (_registerMode == register) return;
    context.read<AuthCubit>().clearError();
    setState(() {
      _registerMode = register;
      if (!register) {
        _applyDemoDefaults();
      }
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_authScrollController.hasClients) {
        _authScrollController.jumpTo(0);
      }
    });
    context.go(register ? '/register' : '/login');
  }

  String _deriveCompanyName(String email) {
    final parts = email.split('@');
    if (parts.length < 2) return 'Assigned by email';
    final root = parts.last.split('.').first.trim();
    if (root.isEmpty) return 'Assigned by email';
    return '${root[0].toUpperCase()}${root.substring(1)}';
  }

  Future<void> _submit(AuthCubit auth) async {
    FocusScope.of(context).unfocus();
    if (_registerMode) {
      final prefs = await SharedPreferences.getInstance();
      final enteredPosition = _position.text.trim();
      if (enteredPosition.isNotEmpty) {
        await prefs.setString(_positionKey, enteredPosition);
      }

      await auth.register(
        fullName: _fullName.text.trim(),
        email: _email.text.trim(),
        password: _password.text,
        companyName: _deriveCompanyName(_email.text.trim()),
        role: 'foreman',
        phone: _phone.text.trim(),
      );
      return;
    }

    await auth.login(_email.text.trim(), _password.text);
  }

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthCubit>();

    return Scaffold(
      resizeToAvoidBottomInset: true,
      backgroundColor: const Color(0xFFF2F5F5),
      body: Container(
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFFF3F6F6), Color(0xFFE2F0F2)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 470),
                child: _registerMode ? _buildRegisterFlow(auth) : _buildSignIn(auth),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildSignIn(AuthCubit auth) {
    return SingleChildScrollView(
      controller: _authScrollController,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              const SizedBox(width: 8),
              const Expanded(child: _AuthBrandRow()),
              TextButton(onPressed: () => _switchMode(true), child: const Text('Sign up')),
            ],
          ),
          const SizedBox(height: 26),
          const Text.rich(
            TextSpan(
              children: [
                TextSpan(
                  text: 'Welcome ',
                  style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: ComstructColors.ink),
                ),
                TextSpan(
                  text: 'back',
                  style: TextStyle(fontSize: 34, fontWeight: FontWeight.w800, color: Color(0xFF2D7080)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 10),
          const Text(
            'Sign in with your assigned work email.',
            style: TextStyle(fontSize: 16, height: 1.45, color: Colors.black54),
          ),
          const SizedBox(height: 18),
          _buildAuthCard(auth, registerMode: false),
          const SizedBox(height: 22),
          Center(
            child: Wrap(
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                const Text('New here? ', style: TextStyle(fontSize: 14, color: Colors.black54)),
                GestureDetector(
                  onTap: () => _switchMode(true),
                  child: const Text(
                    'Create an account',
                    style: TextStyle(fontSize: 14, fontWeight: FontWeight.w800, color: ComstructColors.brand),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRegisterFlow(AuthCubit auth) {
    return SingleChildScrollView(
      controller: _authScrollController,
      keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () => _switchMode(false),
              ),
              const Expanded(child: _AuthBrandRow()),
              TextButton(onPressed: () => _switchMode(false), child: const Text('Sign in')),
            ],
          ),
          const SizedBox(height: 12),
          const Text(
            'Create your account',
            style: TextStyle(fontSize: 32, fontWeight: FontWeight.w800, color: ComstructColors.ink),
          ),
          const SizedBox(height: 8),
          const Text(
            'Your project assignment will come from your email. Add your position so recommendations fit your work.',
            style: TextStyle(fontSize: 15, height: 1.45, color: Colors.black54),
          ),
          const SizedBox(height: 14),
          SizedBox(
            height: 168,
            child: PageView.builder(
              controller: _pageController,
              itemCount: _introCards.length,
              onPageChanged: (value) => setState(() => _introPage = value),
              itemBuilder: (context, index) {
                final item = _introCards[index];
                return _CompactIntroCard(title: item.$1, body: item.$2, icon: item.$3);
              },
            ),
          ),
          const SizedBox(height: 10),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(
              _introCards.length,
              (index) => AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                width: _introPage == index ? 18 : 8,
                height: 8,
                margin: const EdgeInsets.symmetric(horizontal: 3),
                decoration: BoxDecoration(
                  color: _introPage == index ? ComstructColors.brand : Colors.black26,
                  borderRadius: BorderRadius.circular(99),
                ),
              ),
            ),
          ),
          const SizedBox(height: 16),
          _buildAuthCard(auth, registerMode: true),
        ],
      ),
    );
  }

  Widget _buildAuthCard(AuthCubit auth, {required bool registerMode}) {
    return Container(
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 20),
      decoration: BoxDecoration(
        color: const Color(0xFFDDE8EA),
        borderRadius: BorderRadius.circular(26),
        border: Border.all(color: const Color(0xFFC9D9DC)),
        boxShadow: [
          BoxShadow(
            color: const Color(0xFF8EC6D0).withValues(alpha: 0.22),
            blurRadius: 28,
            offset: const Offset(0, 18),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (registerMode) ...[
            const Text('FULL NAME', style: TextStyle(fontSize: 12, letterSpacing: 0.6, color: Colors.black54)),
            const SizedBox(height: 8),
            _SoftField(
              child: TextField(
                controller: _fullName,
                decoration: const InputDecoration(prefixIcon: Icon(Icons.badge_outlined), hintText: 'Your full name'),
              ),
            ),
            const SizedBox(height: 14),
          ],
          const Text('EMAIL', style: TextStyle(fontSize: 12, letterSpacing: 0.6, color: Colors.black54)),
          const SizedBox(height: 8),
          _SoftField(
            child: TextField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autocorrect: false,
              decoration: const InputDecoration(prefixIcon: Icon(Icons.mail_outline), hintText: 'you@company.com'),
            ),
          ),
          const SizedBox(height: 14),
          const Text('PASSWORD', style: TextStyle(fontSize: 12, letterSpacing: 0.6, color: Colors.black54)),
          const SizedBox(height: 8),
          _SoftField(
            child: TextField(
              controller: _password,
              obscureText: _hidePassword,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.lock_outline),
                hintText: '••••••••',
                suffixIcon: IconButton(
                  onPressed: () => setState(() => _hidePassword = !_hidePassword),
                  icon: Icon(_hidePassword ? Icons.visibility_outlined : Icons.visibility_off_outlined),
                ),
              ),
            ),
          ),
          if (registerMode) ...[
            const SizedBox(height: 14),
            const Text('POSITION', style: TextStyle(fontSize: 12, letterSpacing: 0.6, color: Colors.black54)),
            const SizedBox(height: 8),
            _SoftField(
              child: TextField(
                controller: _position,
                decoration: const InputDecoration(prefixIcon: Icon(Icons.engineering_outlined), hintText: 'Foreman / Electrician / Installer'),
              ),
            ),
            const SizedBox(height: 14),
            const Text('PHONE', style: TextStyle(fontSize: 12, letterSpacing: 0.6, color: Colors.black54)),
            const SizedBox(height: 8),
            _SoftField(
              child: TextField(
                controller: _phone,
                keyboardType: TextInputType.phone,
                decoration: const InputDecoration(prefixIcon: Icon(Icons.phone_outlined), hintText: '+41 ...'),
              ),
            ),
          ],
          if (auth.state.error != null) ...[
            const SizedBox(height: 14),
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: const Color(0xFFFFF0F0),
                borderRadius: BorderRadius.circular(14),
              ),
              child: Text(auth.state.error!, style: const TextStyle(color: ComstructColors.err, fontWeight: FontWeight.w600)),
            ),
          ],
          const SizedBox(height: 18),
          SizedBox(
            height: 66,
            child: ElevatedButton.icon(
              onPressed: auth.state.busy ? null : () => _submit(auth),
              style: ElevatedButton.styleFrom(
                backgroundColor: const Color(0xFF2F8192),
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
              ),
              icon: Icon(registerMode ? Icons.app_registration : Icons.arrow_forward_rounded, size: 24),
              label: Text(auth.state.busy
                  ? (registerMode ? 'Creating account…' : 'Signing in…')
                  : (registerMode ? 'Create account' : 'Sign in')),
            ),
          ),
        ],
      ),
    );
  }
}

class _AuthBrandRow extends StatelessWidget {
  const _AuthBrandRow();

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Container(
          width: 46,
          height: 46,
          decoration: BoxDecoration(
            color: const Color(0xFF2F8192),
            borderRadius: BorderRadius.circular(14),
          ),
          child: const Center(
            child: Icon(Icons.change_history_rounded, color: ComstructColors.accent, size: 24),
          ),
        ),
        const SizedBox(width: 12),
        const Flexible(
          child: Text(
            'comstruct',
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, color: ComstructColors.ink),
          ),
        ),
      ],
    );
  }
}

class _CompactIntroCard extends StatelessWidget {
  const _CompactIntroCard({required this.title, required this.body, required this.icon});

  final String title;
  final String body;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 4),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: const Color(0xFFDDE8EA),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: const Color(0xFFC6D7DB)),
      ),
      child: Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(14),
            ),
            child: Icon(icon, color: ComstructColors.brand, size: 24),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: ComstructColors.ink),
                ),
                const SizedBox(height: 6),
                Text(
                  body,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: const TextStyle(fontSize: 12.5, height: 1.35, color: Colors.black54),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SoftField extends StatelessWidget {
  const _SoftField({required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: const Color(0xFFF4F7F7),
        borderRadius: BorderRadius.circular(18),
      ),
      child: child,
    );
  }
}
