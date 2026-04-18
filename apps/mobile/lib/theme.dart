/// Comstruct design tokens (spec §6.1 Flutter theme)
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class ComstructColors {
  static const brand = Color(0xFF0F2A44);     // construction navy
  static const ink = Color(0xFF0B1B2E);
  static const accent = Color(0xFFF2A341);    // safety orange
  static const surface = Color(0xFFF5F7FA);
  static const line = Color(0xFFE1E7EE);
  static const ok = Color(0xFF1F8A4C);
  static const warn = Color(0xFFD97706);
  static const err = Color(0xFFB0210C);
}

ThemeData buildComstructTheme() {
  final base = ThemeData.light(useMaterial3: true);
  return base.copyWith(
    colorScheme: const ColorScheme.light(
      primary: ComstructColors.brand,
      onPrimary: Colors.white,
      secondary: ComstructColors.accent,
      onSecondary: Colors.white,
      surface: Colors.white,
      onSurface: ComstructColors.ink,
      error: ComstructColors.err,
    ),
    scaffoldBackgroundColor: ComstructColors.surface,
    textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: ComstructColors.ink,
      displayColor: ComstructColors.ink,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: ComstructColors.brand,
      foregroundColor: Colors.white,
      centerTitle: false,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: ComstructColors.accent,
        foregroundColor: Colors.white,
        minimumSize: const Size(0, 48),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: Colors.white,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(8),
        borderSide: const BorderSide(color: ComstructColors.line),
      ),
    ),
    cardTheme: CardTheme(
      color: Colors.white,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: const BorderSide(color: ComstructColors.line),
      ),
    ),
  );
}
