import 'package:flutter/material.dart';

import '../screens/c_home_screen.dart' show CColors;
import '../translations.dart';

/// Canonical badge color for an order [status].
Color orderStatusColor(String status) {
  switch (status) {
    case 'approved':
      return const Color(0xFF0E8D57);
    case 'delivered':
      return const Color(0xFF2563EB);
    case 'rejected':
      return const Color(0xFFB42318);
    case 'pending_approval':
      return const Color(0xFFB7791F);
    case 'ordered':
    case 'in_transit':
      return CColors.teal;
    default:
      return const Color(0xFF475467);
  }
}

/// Localised label for an order [status].
String orderStatusLabel(BuildContext context, String status) {
  switch (status) {
    case 'draft':
      return t(context, 'statusDraft');
    case 'pending_approval':
      return t(context, 'statusPending');
    case 'approved':
      return t(context, 'statusApproved');
    case 'ordered':
      return t(context, 'statusOrdered');
    case 'in_transit':
      return t(context, 'statusInTransit');
    case 'delivered':
      return t(context, 'statusDelivered');
    case 'rejected':
      return t(context, 'statusRejected');
    default:
      return status;
  }
}

/// Representative icon for an order [status].
IconData orderStatusIcon(String status) {
  switch (status) {
    case 'approved':
      return Icons.verified_outlined;
    case 'delivered':
      return Icons.local_shipping_outlined;
    case 'rejected':
      return Icons.cancel_outlined;
    case 'pending_approval':
      return Icons.hourglass_top_rounded;
    case 'ordered':
    case 'in_transit':
      return Icons.sync_alt_rounded;
    default:
      return Icons.receipt_long_outlined;
  }
}
