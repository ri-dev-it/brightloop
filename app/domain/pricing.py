"""Pure business rules (no database, no Flask) so they are trivially unit-testable."""
import calendar
from datetime import date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal

TERMS = {"Immediate": 0, "Net 15": 15, "Net 30": 30, "Net 45": 45, "Net 60": 60}
# multiplier that converts one billing-period amount into a monthly figure
MONTHLY_FACTOR = {"daily": 30, "weekly": 52 / 12, "monthly": 1, "yearly": 1 / 12}


def r2(x):
    return float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def parse(d):
    return d if isinstance(d, date) else datetime.strptime(d, "%Y-%m-%d").date()


def advance(start, period, n):
    """Start date of cycle n (0-based) — anchored on the original start day, so no drift."""
    start = parse(start)
    if period == "daily":
        return start + timedelta(days=n)
    if period == "weekly":
        return start + timedelta(weeks=n)
    months = n if period == "monthly" else 12 * n
    y, m = divmod(start.month - 1 + months, 12)
    y, m = start.year + y, m + 1
    return date(y, m, min(start.day, calendar.monthrange(y, m)[1]))


def compute(lines, discounts):
    """lines: [{description, quantity, unit_price, tax_rate, product_id}]
       discounts: already filtered for date/usage; [{id,name,type,value,min_purchase,min_quantity,applies_to,product_id}]
       Discounts reduce the taxable base; tax is calculated on the discounted amount."""
    rows = [dict(l, amount=r2(l["quantity"] * l["unit_price"]), discount=0.0) for l in lines]
    applied = []
    for d in sorted(discounts, key=lambda x: x["id"]):
        if d["applies_to"] == "product":
            targets = [r for r in rows if d.get("product_id") and r.get("product_id") == d["product_id"]]
        else:
            targets = list(rows)
        base = r2(sum(t["amount"] - t["discount"] for t in targets))
        qty = sum(t["quantity"] for t in targets)
        if not targets or base <= 0 or base < (d["min_purchase"] or 0) or qty < (d["min_quantity"] or 0):
            continue
        raw = base * d["value"] / 100 if d["type"] == "percent" else d["value"]
        amt = r2(min(raw, base))
        if amt <= 0:
            continue
        remaining = amt
        for i, t in enumerate(targets):
            room = r2(t["amount"] - t["discount"])
            share = remaining if i == len(targets) - 1 else r2(amt * room / base)
            share = min(share, room, remaining)
            t["discount"] = r2(t["discount"] + share)
            remaining = r2(remaining - share)
        applied.append({"discount_id": d["id"], "name": d["name"], "amount": r2(amt - remaining)})
    for r in rows:
        r["tax_amount"] = r2((r["amount"] - r["discount"]) * (r.get("tax_rate") or 0) / 100)
    subtotal = r2(sum(r["amount"] for r in rows))
    discount_total = r2(sum(a["amount"] for a in applied))
    tax_total = r2(sum(r["tax_amount"] for r in rows))
    return {"lines": rows, "applied": applied, "subtotal": subtotal, "discount_total": discount_total,
            "tax_total": tax_total, "total": r2(subtotal - discount_total + tax_total)}
