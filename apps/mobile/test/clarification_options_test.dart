import 'package:comstruct_mobile/widgets/clarification_options.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  testWidgets('clarification options are visible and tappable', (tester) async {
    String? selected;

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: ClarificationOptionsCard(
            question: 'Which hammer do you want?',
            options: const ['Claw hammer', 'Sledge hammer'],
            onSelected: (value) => selected = value,
          ),
        ),
      ),
    );

    expect(find.text('Which hammer do you want?'), findsOneWidget);
    expect(find.text('Claw hammer'), findsOneWidget);
    expect(find.text('Sledge hammer'), findsOneWidget);

    await tester.tap(find.text('Sledge hammer'));
    await tester.pumpAndSettle();

    expect(selected, 'Sledge hammer');
  });
}
