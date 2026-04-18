/// Hand-rolled domain models. Replace with generated code from OpenAPI gen.

enum OrderStatus {
  draft,
  pendingApproval,
  approved,
  ordered,
  inTransit,
  delivered,
  rejected;

  String get wire => switch (this) {
        OrderStatus.draft => 'draft',
        OrderStatus.pendingApproval => 'pending_approval',
        OrderStatus.approved => 'approved',
        OrderStatus.ordered => 'ordered',
        OrderStatus.inTransit => 'in_transit',
        OrderStatus.delivered => 'delivered',
        OrderStatus.rejected => 'rejected',
      };

  static OrderStatus fromWire(String s) => OrderStatus.values
      .firstWhere((v) => v.wire == s, orElse: () => OrderStatus.draft);
}

class Product {
  final String id;
  final String supplierId;
  final String sku;
  final String name;
  final String? description;
  final String? category;
  final String unit;
  final num packagingQty;
  final String unitPrice;
  final String currency;

  const Product({
    required this.id,
    required this.supplierId,
    required this.sku,
    required this.name,
    required this.description,
    required this.category,
    required this.unit,
    required this.packagingQty,
    required this.unitPrice,
    required this.currency,
  });

  factory Product.fromJson(Map<String, dynamic> j) => Product(
        id: j['id'] as String,
        supplierId: j['supplier_id'] as String,
        sku: j['sku'] as String,
        name: j['name'] as String,
        description: j['description'] as String?,
        category: j['category'] as String?,
        unit: j['unit'] as String,
        packagingQty: (j['packaging_qty'] as num?) ?? 1,
        unitPrice: j['unit_price'].toString(),
        currency: j['currency'] as String,
      );
}

class OrderItem {
  final String id;
  final String productId;
  final String name;
  final num quantity;
  final String unit;
  final String unitPrice;
  final String lineTotal;

  const OrderItem({
    required this.id,
    required this.productId,
    required this.name,
    required this.quantity,
    required this.unit,
    required this.unitPrice,
    required this.lineTotal,
  });

  factory OrderItem.fromJson(Map<String, dynamic> j) {
    final snap = (j['product_snapshot'] as Map<String, dynamic>?) ?? const {};
    return OrderItem(
      id: j['id'] as String,
      productId: j['product_id'] as String,
      name: (snap['name'] as String?) ?? 'Item',
      quantity: j['quantity'] as num,
      unit: j['unit'] as String,
      unitPrice: j['unit_price'].toString(),
      lineTotal: j['line_total'].toString(),
    );
  }
}

class Order {
  final String id;
  final String projectId;
  final OrderStatus status;
  final String totalAmount;
  final String currency;
  final bool requiresApproval;
  final List<OrderItem> items;
  final DateTime createdAt;

  const Order({
    required this.id,
    required this.projectId,
    required this.status,
    required this.totalAmount,
    required this.currency,
    required this.requiresApproval,
    required this.items,
    required this.createdAt,
  });

  factory Order.fromJson(Map<String, dynamic> j) => Order(
        id: j['id'] as String,
        projectId: j['project_id'] as String,
        status: OrderStatus.fromWire(j['status'] as String),
        totalAmount: j['total_amount'].toString(),
        currency: j['currency'] as String,
        requiresApproval: j['requires_approval'] as bool? ?? false,
        items: ((j['items'] as List?) ?? const [])
            .map((e) => OrderItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        createdAt: DateTime.parse(j['created_at'] as String),
      );
}
