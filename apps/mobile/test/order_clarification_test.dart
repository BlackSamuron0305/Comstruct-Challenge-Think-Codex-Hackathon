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
  });
}
