import 'package:flutter/material.dart';

import '../screens/c_home_screen.dart' show CColors;

class ClarificationOptionsCard extends StatelessWidget {
  const ClarificationOptionsCard({
    super.key,
    required this.question,
    required this.options,
    required this.onSelected,
    this.enabled = true,
    this.helperText,
  });

  final String question;
  final List<String> options;
  final ValueChanged<String> onSelected;
  final bool enabled;
  final String? helperText;

  @override
  Widget build(BuildContext context) {
    if (options.isEmpty) return const SizedBox.shrink();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE1E7EE)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            question,
            style: const TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: CColors.tealDark,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            helperText ?? 'Tap one option to continue.',
            style: const TextStyle(fontSize: 13, color: Colors.black54),
          ),
          const SizedBox(height: 12),
          ...options.map(
            (option) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SizedBox(
                width: double.infinity,
                height: 52,
                child: OutlinedButton(
                  onPressed: enabled ? () => onSelected(option) : null,
                  style: OutlinedButton.styleFrom(
                    foregroundColor: CColors.tealDark,
                    backgroundColor: CColors.tealLighter,
                    side: const BorderSide(color: CColors.tealLight),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14),
                    ),
                    textStyle: const TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.touch_app, size: 20),
                      const SizedBox(width: 10),
                      Expanded(child: Text(option)),
                      const Icon(Icons.chevron_right),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
