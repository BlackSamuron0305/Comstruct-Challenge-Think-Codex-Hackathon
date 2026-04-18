import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';

import '../cubits/language_cubit.dart';
import '../translations.dart';
import 'c_home_screen.dart' show CColors;

class LanguageScreen extends StatelessWidget {
  const LanguageScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final currentLang = context.watch<LanguageCubit>().state;

    return Scaffold(
      backgroundColor: CColors.bg,
      appBar: AppBar(
        backgroundColor: CColors.bg,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back, color: CColors.teal),
          onPressed: () => context.pop(),
        ),
        title: Text(t(context, 'languageTitle'),
            style: const TextStyle(color: Color(0xFF1A1A1A), fontWeight: FontWeight.w700)),
        centerTitle: true,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 40),
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 16),
            child: Text(t(context, 'chooseLanguage'),
                style: const TextStyle(color: Colors.black54, fontSize: 14)),
          ),
          ...kLangs.map((lang) {
            final selected = lang.code == currentLang;
            return Padding(
              padding: const EdgeInsets.only(bottom: 10),
              child: Material(
                color: selected ? CColors.tealLight : Colors.white,
                borderRadius: BorderRadius.circular(14),
                child: InkWell(
                  borderRadius: BorderRadius.circular(14),
                  onTap: () {
                    context.read<LanguageCubit>().setLanguage(lang.code);
                    context.pop();
                  },
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 16),
                    decoration: BoxDecoration(
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: selected ? CColors.teal : Colors.transparent,
                        width: 2,
                      ),
                      boxShadow: selected
                          ? null
                          : [BoxShadow(color: Colors.black.withValues(alpha: 0.06), blurRadius: 4)],
                    ),
                    child: Row(children: [
                      Text(lang.flag, style: const TextStyle(fontSize: 32)),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Text(lang.label,
                            style: TextStyle(
                              fontSize: 17,
                              fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                              color: const Color(0xFF1A1A1A),
                            )),
                      ),
                      if (selected)
                        Container(
                          width: 22, height: 22,
                          decoration: const BoxDecoration(color: CColors.teal, shape: BoxShape.circle),
                          child: const Icon(Icons.check, color: Colors.white, size: 14),
                        ),
                    ]),
                  ),
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
