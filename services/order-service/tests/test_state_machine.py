import pytest

from src.services.state_machine import IllegalTransition, assert_transition


def test_draft_to_pending():
    assert_transition("draft", "pending_approval")


def test_draft_to_approved_direct():
    assert_transition("draft", "approved")


def test_pending_to_approved_or_rejected():
    assert_transition("pending_approval", "approved")
    assert_transition("pending_approval", "rejected")


def test_approved_to_ordered():
    assert_transition("approved", "ordered")


def test_ordered_to_in_transit_or_delivered():
    assert_transition("ordered", "in_transit")
    assert_transition("ordered", "delivered")


def test_terminal_states_block_further_changes():
    for terminal in ("delivered", "rejected"):
        with pytest.raises(IllegalTransition):
            assert_transition(terminal, "approved")


def test_illegal_skips_blocked():
    with pytest.raises(IllegalTransition):
        assert_transition("draft", "delivered")
    with pytest.raises(IllegalTransition):
        assert_transition("approved", "delivered")
