"""Invoice generation, invoice lifecycle and payments."""
from datetime import date, timedelta
from flask import render_template_string
from .. import repositories as R
from ..db import execute, paginate, q, q1
from ..domain.pricing import TERMS, advance, compute, parse, r2
from ..errors import ApiError
from ..validators import Validator
from . import catalog, mailer, subscriptions

MAX_CATCHUP = 36  # safety cap on back-billed periods per subscription per run


# ---------- generation ----------
def _generate(sub, plan, issue_date, auto_confirm):
    """Creates the invoice for the sub's next period and advances the cycle. Idempotent per (sub, period)."""
    start = parse(sub["next_invoice_date"])
    nxt = advance(sub["start_date"], plan["billing_period"], sub["cycles_billed"] + 1)
    period_end = nxt - timedelta(days=1)
    if q1("SELECT id FROM invoices WHERE subscription_id=? AND period_start=?", (sub["id"], start.isoformat())):
        R.subscriptions.update(sub["id"], {"cycles_billed": sub["cycles_billed"] + 1, "next_invoice_date": nxt.isoformat()})
        return None  # already billed; just heal the counters
    lines = subscriptions._lines(sub["id"])
    result = compute([dict(l, tax_rate=l["tax_rate"] or 0) for l in lines], catalog.eligible_discounts(sub["id"], issue_date.isoformat()))
    due = issue_date + timedelta(days=TERMS.get(sub["payment_terms"], 30))
    iid = R.invoices.insert(dict(subscription_id=sub["id"], customer_id=sub["customer_id"], period_start=start.isoformat(),
                                 period_end=period_end.isoformat(), issue_date=issue_date.isoformat(), due_date=due.isoformat(),
                                 status="confirmed" if auto_confirm else "draft", subtotal=result["subtotal"],
                                 discount_total=result["discount_total"], tax_total=result["tax_total"], total=result["total"]))
    R.invoices.update(iid, {"number": f"INV-{issue_date.year}-{iid:06d}"})
    for l in result["lines"]:
        R.invoice_lines.insert(dict(invoice_id=iid, kind="line", description=l["description"], quantity=l["quantity"], unit_price=l["unit_price"],
                                    tax_rate=l["tax_rate"], amount=l["amount"], tax_amount=l["tax_amount"]))
    for a in result["applied"]:
        R.invoice_lines.insert(dict(invoice_id=iid, kind="discount", description=f"Discount – {a['name']}", quantity=1, unit_price=0,
                                    tax_rate=0, amount=-a["amount"], tax_amount=0, discount_id=a["discount_id"]))
        execute("UPDATE discounts SET times_used=times_used+1 WHERE id=?", (a["discount_id"],))
    R.subscriptions.update(sub["id"], {"cycles_billed": sub["cycles_billed"] + 1, "next_invoice_date": nxt.isoformat()})
    return iid


def run_billing(as_of=None, auto_confirm=False):
    as_of = parse(as_of) if as_of else date.today()
    due = q("SELECT s.id FROM subscriptions s WHERE s.status='active' AND s.paused=0 AND s.next_invoice_date<=? "
            "AND s.next_invoice_date<=s.expiry_date ORDER BY s.id", (as_of.isoformat(),))
    created, touched = [], 0
    for row in due:
        touched += 1
        for _ in range(MAX_CATCHUP):
            sub = R.subscriptions.get(row["id"])
            if not sub["next_invoice_date"] or sub["next_invoice_date"] > as_of.isoformat() or sub["next_invoice_date"] > sub["expiry_date"]:
                break
            iid = _generate(sub, R.plans.get(sub["plan_id"]), as_of, auto_confirm)
            if iid:
                created.append(iid)
    closed = subscriptions.auto_close_expired(as_of)
    return {"as_of": as_of.isoformat(), "subscriptions_due": touched, "invoices_created": len(created), "auto_closed": closed, "invoice_ids": created[:50]}


# ---------- queries ----------
def _overdue_sql(today):
    return "(i.status='confirmed' AND i.due_date<'%s')" % today


def list_invoices(args, page, per, customer_id=None):
    today = date.today().isoformat()
    w, a = ["1=1"], []
    if customer_id:
        w.append("i.customer_id=? AND i.status!='draft'")
        a.append(customer_id)
    for key, col in (("status", "i.status"), ("customer_id", "i.customer_id"), ("subscription_id", "i.subscription_id")):
        if args.get(key):
            w.append(f"{col}=?")
            a.append(args[key])
    if args.get("overdue") in ("1", "true"):
        w.append(_overdue_sql(today))
    if args.get("outstanding") in ("1", "true"):
        w.append("i.status='confirmed'")
    if args.get("date_from"):
        w.append("i.issue_date>=?")
        a.append(args["date_from"])
    if args.get("date_to"):
        w.append("i.issue_date<=?")
        a.append(args["date_to"])
    if args.get("q"):
        w.append("(i.number LIKE ? OR c.name LIKE ?)")
        a += [f"%{args['q'].strip()}%"] * 2
    where = " AND ".join(w)
    return paginate(f"SELECT i.id,i.number,i.status,i.period_start,i.period_end,i.issue_date,i.due_date,i.total,i.amount_paid,i.sent_at,"
                    f"ROUND(i.total-i.amount_paid,2) balance,{_overdue_sql(today)} overdue,c.name customer_name,s.number subscription_number "
                    f"FROM invoices i JOIN customers c ON c.id=i.customer_id JOIN subscriptions s ON s.id=i.subscription_id WHERE {where} ORDER BY i.id DESC",
                    f"SELECT COUNT(*) n FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE {where}", a, page, per)


def get_invoice(id_, customer_id=None):
    today = date.today().isoformat()
    inv = q1(f"SELECT i.*, ROUND(i.total-i.amount_paid,2) balance, {_overdue_sql(today)} overdue, c.name customer_name, c.email customer_email, c.company customer_company, "
             "c.address customer_address, s.number subscription_number, s.payment_terms FROM invoices i JOIN customers c ON c.id=i.customer_id "
             "JOIN subscriptions s ON s.id=i.subscription_id WHERE i.id=?", (id_,))
    if not inv or (customer_id and (inv["customer_id"] != customer_id or inv["status"] == "draft")):
        raise ApiError("Invoice not found", 404)
    inv["lines"] = q("SELECT * FROM invoice_lines WHERE invoice_id=? ORDER BY kind, id", (id_,))
    inv["payments"] = q("SELECT * FROM payments WHERE invoice_id=? ORDER BY payment_date, id", (id_,))
    return inv


# ---------- lifecycle ----------
def _inv(id_):
    i = R.invoices.get(id_)
    if not i:
        raise ApiError("Invoice not found", 404)
    return i


def confirm(id_):
    i = _inv(id_)
    if i["status"] != "draft":
        raise ApiError("Only a draft invoice can be confirmed", 409)
    R.invoices.update(id_, {"status": "confirmed"})
    return get_invoice(id_)


def cancel(id_):
    i = _inv(id_)
    if i["status"] not in ("draft", "confirmed"):
        raise ApiError("Only draft or confirmed invoices can be cancelled", 409)
    if i["amount_paid"] > 0:
        raise ApiError("This invoice already has payments and cannot be cancelled", 409)
    for l in R.invoice_lines.list("invoice_id=? AND discount_id IS NOT NULL", (id_,)):
        execute("UPDATE discounts SET times_used=MAX(0,times_used-1) WHERE id=?", (l["discount_id"],))
    R.invoices.update(id_, {"status": "cancelled"})
    return get_invoice(id_)


def send(id_):
    inv = get_invoice(id_)
    if inv["status"] not in ("confirmed", "paid"):
        raise ApiError("Confirm the invoice before sending it", 409)
    mailer.get_mailer().send(inv["customer_email"], f"Invoice {inv['number']} from Brightloop",
                             f"Hi {inv['customer_name']},\n\nInvoice {inv['number']} for ₹{inv['total']:.2f} is due on {inv['due_date']}.\n"
                             f"Sign in to your portal to view it.\n")
    execute("UPDATE invoices SET sent_at=datetime('now') WHERE id=?", (id_,))
    return get_invoice(id_)


PRINT_TPL = """<!doctype html><html><head><meta charset="utf-8"><title>{{ i.number }}</title><style>
body{font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#17212b;max-width:760px;margin:32px auto;padding:0 24px}
h1{margin:0;font-size:28px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:8px 6px;border-bottom:1px solid #dde3ea;text-align:left}
th.r,td.r{text-align:right}.muted{color:#5d6b7a}.tot td{border:0}.tot .g{font-size:18px;font-weight:700}.top{display:flex;justify-content:space-between;gap:24px}
.stamp{display:inline-block;border:2px solid #0f7b6c;color:#0f7b6c;padding:2px 10px;border-radius:4px;font-weight:700;text-transform:uppercase}
</style></head><body>
<div class="top"><div><h1>Brightloop Software</h1><div class="muted">Subscription invoice</div></div>
<div style="text-align:right"><h1>{{ i.number }}</h1><span class="stamp">{{ i.status }}</span></div></div>
<div class="top" style="margin-top:24px"><div><b>Billed to</b><br>{{ i.customer_name }}<br>{{ i.customer_company }}<br>{{ i.customer_email }}<br>{{ i.customer_address }}</div>
<div style="text-align:right">Subscription {{ i.subscription_number }}<br>Period {{ i.period_start }} – {{ i.period_end }}<br>Issued {{ i.issue_date }}<br>Due {{ i.due_date }} ({{ i.payment_terms }})</div></div>
<table><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Unit price</th><th class="r">Tax</th><th class="r">Amount</th></tr></thead><tbody>
{% for l in i.lines %}<tr><td>{{ l.description }}</td><td class="r">{{ l.quantity if l.kind=='line' else '' }}</td><td class="r">{{ '%.2f'|format(l.unit_price) if l.kind=='line' else '' }}</td>
<td class="r">{{ l.tax_rate|round(2) ~ '%' if l.kind=='line' else '' }}</td><td class="r">{{ '%.2f'|format(l.amount) }}</td></tr>{% endfor %}</tbody></table>
<table class="tot" style="width:320px;margin-left:auto"><tr><td>Subtotal</td><td class="r">₹{{ '%.2f'|format(i.subtotal) }}</td></tr>
<tr><td>Discounts</td><td class="r">−₹{{ '%.2f'|format(i.discount_total) }}</td></tr><tr><td>Tax</td><td class="r">₹{{ '%.2f'|format(i.tax_total) }}</td></tr>
<tr><td class="g">Total</td><td class="r g">₹{{ '%.2f'|format(i.total) }}</td></tr><tr><td>Paid</td><td class="r">₹{{ '%.2f'|format(i.amount_paid) }}</td></tr>
<tr><td><b>Balance due</b></td><td class="r"><b>₹{{ '%.2f'|format(i.balance) }}</b></td></tr></table></body></html>"""


def render_print(id_, customer_id=None):
    return render_template_string(PRINT_TPL, i=get_invoice(id_, customer_id))


# ---------- payments ----------
def record_payment(invoice_id, data, user_id):
    inv = _inv(invoice_id)
    if inv["status"] != "confirmed":
        raise ApiError("Payments can only be recorded against confirmed invoices", 409)
    d = (Validator(data).choice("method", ("cash", "card", "bank_transfer", "upi", "cheque")).number("amount", min_v=0.01, max_v=10**9)
         .date("payment_date").text("note", False, 500).done())
    amount = r2(d["amount"])
    if d["payment_date"] > date.today().isoformat():
        raise ApiError("Please fix the highlighted fields", 422, {"payment_date": "Payment date cannot be in the future"})
    # Single atomic UPDATE: the balance check and the increment cannot interleave with another request,
    # so concurrent payments can never over-pay an invoice.
    changed = execute(
        "UPDATE invoices SET amount_paid=ROUND(amount_paid+?,2), "
        "status=CASE WHEN ROUND(total-amount_paid-?,2)<=0.004 THEN 'paid' ELSE status END "
        "WHERE id=? AND status='confirmed' AND ROUND(total-amount_paid,2)+0.001>=?", (amount, amount, invoice_id, amount))
    if not changed:
        balance = r2(inv["total"] - inv["amount_paid"])
        raise ApiError("Please fix the highlighted fields", 422, {"amount": f"Amount exceeds the balance of ₹{balance:.2f}"})
    pid = R.payments.insert(dict(d, invoice_id=invoice_id, amount=amount, recorded_by=user_id))
    return {"payment": R.payments.get(pid), "invoice": get_invoice(invoice_id)}


def list_payments(args, page, per):
    w, a = ["1=1"], []
    if args.get("method"):
        w.append("p.method=?"); a.append(args["method"])
    if args.get("date_from"):
        w.append("p.payment_date>=?"); a.append(args["date_from"])
    if args.get("date_to"):
        w.append("p.payment_date<=?"); a.append(args["date_to"])
    if args.get("q"):
        w.append("(i.number LIKE ? OR c.name LIKE ?)"); a += [f"%{args['q'].strip()}%"] * 2
    where = " AND ".join(w)
    frm = "FROM payments p JOIN invoices i ON i.id=p.invoice_id JOIN customers c ON c.id=i.customer_id"
    res = paginate(f"SELECT p.*, i.number invoice_number, c.name customer_name {frm} WHERE {where} ORDER BY p.payment_date DESC, p.id DESC",
                   f"SELECT COUNT(*) n {frm} WHERE {where}", a, page, per)
    res["sum"] = q1(f"SELECT COALESCE(SUM(p.amount),0) s {frm} WHERE {where}", a)["s"]
    return res
