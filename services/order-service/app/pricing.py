from decimal import ROUND_HALF_UP, Decimal
from typing import Iterable, Mapping

CENT = Decimal("0.01")


def money(value) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def compute_totals(
    items: Iterable[Mapping],
    tax_rate: str = "0.08",
    free_shipping_threshold: str = "100",
    shipping_fee: str = "7.99",
) -> dict:
    """Compute order totals with Decimal arithmetic (never floats for money)."""
    subtotal = sum((money(i["price"]) * int(i["quantity"]) for i in items), Decimal("0"))
    subtotal = money(subtotal)
    tax = money(subtotal * Decimal(tax_rate))
    shipping = Decimal("0.00") if subtotal == 0 or subtotal >= Decimal(free_shipping_threshold) else money(shipping_fee)
    return {"subtotal": subtotal, "tax": tax, "shipping": shipping, "total": money(subtotal + tax + shipping)}
