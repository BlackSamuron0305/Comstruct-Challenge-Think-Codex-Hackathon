import 'package:comstruct_mobile/api_client.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('deferred catalog selection', () {
    final hammerOffers = <Map<String, dynamic>>[
      {
        'product_id': '1',
        'name': 'Claw hammer 16oz',
        'category': 'Tools',
      },
      {
        'product_id': '2',
        'name': 'Sledge hammer 4kg',
        'category': 'Tools',
      },
      {
        'product_id': '3',
        'name': 'Claw hammer premium',
        'category': 'Tools',
      },
    ];

    test('asks for detail when the request is generic', () {
      final state = buildDeferredSelectionState('I need a hammer', hammerOffers);

      expect(state['needsClarification'], isTrue);
      expect((state['clarificationOptions'] as List).length, 2);
      expect(state['clarificationQuestion'], contains('hammer'));
    });

    test('keeps one representative item once the type is specific', () {
      final state = buildDeferredSelectionState('I need a sledge hammer', hammerOffers);

      expect(state['needsClarification'], isFalse);
      expect((state['items'] as List).length, 1);
    });

    test('uses taxonomy type labels instead of exact model names', () {
      final state = buildDeferredSelectionState('I need a hammer', [
        {
          'product_id': '1',
          'name': 'Acme Pro X9 claw hammer 16oz',
          'taxonomy_label': 'Hand Tools > Hammers > Claw Hammer',
          'product_family': 'hammers',
        },
        {
          'product_id': '2',
          'name': 'MegaForce industrial sledge 4kg',
          'taxonomy_label': 'Hand Tools > Hammers > Sledge Hammer',
          'product_family': 'hammers',
        },
      ]);

      expect(state['needsClarification'], isTrue);
      expect(state['clarificationOptions'], containsAll(['Claw Hammer', 'Sledge Hammer']));
      expect((state['statusNote'] as String), contains('backend scoring model'));
    });

    test('still asks for type when backend taxonomy is only generic family data', () {
      final state = buildDeferredSelectionState('I need a hammer', [
        {
          'product_id': '1',
          'name': 'Acme Pro X9 claw hammer 16oz',
          'taxonomy_label': 'Hammers',
          'product_family': 'hammers',
          'category': 'Tools',
        },
        {
          'product_id': '2',
          'name': 'MegaForce industrial sledge hammer 4kg',
          'taxonomy_label': 'Hammers',
          'product_family': 'hammers',
          'category': 'Tools',
        },
      ]);

      expect(state['needsClarification'], isTrue);
      expect(state['clarificationOptions'], containsAll(['Claw Hammer', 'Sledge Hammer']));
    });

    test('applying a clarification immediately narrows the shown request type', () {
      final state = buildDeferredSelectionState('I need a hammer', hammerOffers);
      final resolved = applyClarificationSelection(
        option: 'Claw Hammer',
        items: List<Map<String, dynamic>>.from(state['items'] as List),
        currentNote: state['statusNote'] as String?,
      );

      expect((resolved['items'] as List).length, 1);
      expect(((resolved['items'] as List).first['display_name'] as String), 'Claw Hammer');
      expect((resolved['statusNote'] as String), contains('Using Claw Hammer'));
    });
  });
}
