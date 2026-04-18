"""Order state machine. Enforces legal transitions per spec §4."""
from ..models import OrderStatus

VALID_TRANSITIONS: dict[str, set[str]] = {
    OrderStatus.DRAFT.value: {OrderStatus.PENDING_APPROVAL.value, OrderStatus.APPROVED.value},
    OrderStatus.PENDING_APPROVAL.value: {OrderStatus.APPROVED.value, OrderStatus.REJECTED.value},
    OrderStatus.APPROVED.value: {OrderStatus.ORDERED.value},
    OrderStatus.ORDERED.value: {OrderStatus.IN_TRANSIT.value, OrderStatus.DELIVERED.value},
    OrderStatus.IN_TRANSIT.value: {OrderStatus.DELIVERED.value},
    OrderStatus.DELIVERED.value: set(),
    OrderStatus.REJECTED.value: set(),
}


class IllegalTransition(Exception):
    pass


def assert_transition(current: str, target: str) -> None:
    allowed = VALID_TRANSITIONS.get(current, set())
    if target not in allowed:
        raise IllegalTransition(
            f"Illegal transition {current!r} -> {target!r}. Allowed: {sorted(allowed) or 'none'}"
        )
