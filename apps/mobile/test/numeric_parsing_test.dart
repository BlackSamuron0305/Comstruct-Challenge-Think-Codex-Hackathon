import 'package:flutter_test/flutter_test.dart';
import 'package:comstruct_mobile/api_client.dart';

void main() {
  group('numeric payload parsing', () {
    test('accepts string prices from AI responses', () {
      expect(parseFlexibleNumber('12.50'), 12.5);
      expect(parseFlexibleNumber('7'), 7);
    });

    test('accepts string quantities with fallback', () {
      expect(parseFlexibleInt('5'), 5);
      expect(parseFlexibleInt(null), 1);
      expect(parseFlexibleInt('invalid', fallback: 3), 3);
    });

    test('accepts cart payload values delivered as strings', () {
      expect(parseFlexibleInt('2', fallback: 0), 2);
      expect(parseFlexibleNumber('18.90'), 18.9);
    });
  });
}
