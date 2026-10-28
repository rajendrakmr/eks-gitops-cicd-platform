from decimal import Decimal

from app.pricing import compute_totals, money


def test_money_rounds_half_up():
    assert money("1.005") == Decimal("1.01")
    assert money(10) == Decimal("10.00")


def test_totals_with_shipping_and_tax():
    totals = compute_totals([{"price": 20.00, "quantity": 2}, {"price": 9.99, "quantity": 1}])
    assert totals["subtotal"] == Decimal("49.99")
    assert totals["tax"] == Decimal("4.00")
    assert totals["shipping"] == Decimal("7.99")
    assert totals["total"] == Decimal("61.98")


def test_free_shipping_at_threshold():
    totals = compute_totals([{"price": 50, "quantity": 2}])
    assert totals["shipping"] == Decimal("0.00")
    assert totals["total"] == Decimal("108.00")


def test_floating_point_noise_is_avoided():
    totals = compute_totals([{"price": 0.1, "quantity": 3}])
    assert totals["subtotal"] == Decimal("0.30")


def test_empty_order_has_no_shipping():
    assert compute_totals([])["total"] == Decimal("0.00")
