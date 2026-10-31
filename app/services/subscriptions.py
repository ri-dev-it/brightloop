"""Subscription lifecycle: Draft → Quotation → Confirmed → Active → Closed."""
from datetime import date, timedelta
from .. import repositories as R
from ..db import execute, paginate, q, q1
from ..domain.pricing import TERMS, advance, compute, parse, r2
from ..errors import ApiError
from ..validators import Validator

CUSTOMER_ACTIONS = {"pause", "resume", "close"}


def _fail(field, msg):
    raise ApiError("Please fix the highlighted fields", 422, {field: msg})


def _lines(sub_id):
    return q("SELECT l.*, t.rate tax_rate, t.name tax_name FROM subscription_lines l LEFT JOIN taxes t ON t.id=l.tax_id "
             "WHERE l.subscription_id=? ORDER BY l.is_plan_fee DESC, l.id", (sub_id,))


def _build_lines(plan, items):
    out = []
    for i, raw in enumerate(items or []):
        try:
            d = (Validator(raw).number("product_id", integer=True, min_v=1).number("variant_id", False, integer=True)
                 .number("quantity", integer=True, min_v=plan["min_quantity"], max_v=100000).done())
        except ApiError as e:
            raise ApiError(e.message, 422, {f"lines.{i}.{k}": (f"Minimum quantity for this plan is {plan['min_quantity']}" if k == "quantity" and "least" in m else m) for k, m in e.errors.items()})
        prod = R.products.get(d["product_id"])
        if not prod or not prod["active"]:
            _fail(f"lines.{i}.product_id", "Product is not available")
        price, desc, vid = prod["sales_price"], prod["name"], d["variant_id"] or None
        if vid:
            var = R.variants.get(vid)
            if not var or var["product_id"] != prod["id"]:
                _fail(f"lines.{i}.variant_id", "Variant does not belong to this product")
            price += var["extra_price"]
            desc += f" ({var['attribute']}: {var['value']})"
        out.append(dict(product_id=prod["id"], variant_id=vid, description=desc, quantity=d["quantity"], unit_price=r2(price),
                        tax_id=prod["tax_id"], amount=r2(price * d["quantity"]), is_plan_fee=0))
    if plan["price"] > 0:
        out.insert(0, dict(product_id=None, variant_id=None, description=f"Plan fee – {plan['name']}", quantity=1, unit_price=plan["price"],
                           tax_id=plan["tax_id"], amount=plan["price"], is_plan_fee=1))
    if not out:
        _fail("lines", "Add at least one product line")
    return out


def _check_plan(plan, start):
    if not plan or not plan["active"]:
        _fail("plan_id", "Choose an available plan")
    if start < plan["start_date"] or (plan["end_date"] and start > plan["end_date"]):
        _fail("plan_id", "This plan is not available on the chosen start date")


def _write_lines(sub_id, lines):
    execute("DELETE FROM subscription_lines WHERE subscription_id=?", (sub_id,))
    for l in lines:
        R.sub_lines.insert(dict(l, subscription_id=sub_id))


def _header(data):
    return (Validator(data).number("customer_id", integer=True, min_v=1).date("start_date").date("expiry_date")
            .choice("payment_terms", list(TERMS), False, "Net 30").text("notes", False, 1000).done())


def create(data, user_id):
    tpl = None
    if (data or {}).get("template_id"):
        tpl = R.templates.get(int(data["template_id"]))
        if not tpl:
            _fail("template_id", "Template not found")
    d = _header(data)
    if not R.customers.get(d["customer_id"]):
        _fail("customer_id", "Customer not found")
    if d["expiry_date"] < d["start_date"]:
        _fail("expiry_date", "Expiry must be on or after the start date")
    plan_id = (data or {}).get("plan_id") or (tpl and tpl["plan_id"])
    plan = R.plans.get(int(plan_id)) if plan_id else None
    if not plan:
        _fail("plan_id", "Choose a plan")
    _check_plan(plan, d["start_date"])
    items = (data or {}).get("lines")
    if not items and tpl:
        items = [dict(product_id=l["product_id"], variant_id=l["variant_id"], quantity=l["quantity"]) for l in R.template_lines.list("template_id=?", (tpl["id"],), "id")]
    lines = _build_lines(plan, items)
    sid = R.subscriptions.insert(dict(d, plan_id=plan["id"], template_id=tpl["id"] if tpl else None, status="draft", created_by=user_id))
    R.subscriptions.update(sid, {"number": f"SUB-{sid:06d}"})
    _write_lines(sid, lines)
    return get(sid)


def update(id_, data):
    s = _nf(id_)
    if s["status"] not in ("draft", "quotation"):
        raise ApiError("Only draft or quotation subscriptions can be edited", 409)
    d = _header(data)
    if d["expiry_date"] < d["start_date"]:
        _fail("expiry_date", "Expiry must be on or after the start date")
    plan = R.plans.get(int((data or {}).get("plan_id") or s["plan_id"]))
    _check_plan(plan, d["start_date"])
    lines = _build_lines(plan, (data or {}).get("lines"))
    R.subscriptions.update(id_, dict(d, plan_id=plan["id"]))
    _write_lines(id_, lines)
    return get(id_)


def _nf(id_, customer_id=None):
    s = R.subscriptions.get(id_)
    if not s or (customer_id and (s["customer_id"] != customer_id or s["status"] == "draft")):
        raise ApiError("Subscription not found", 404)
    return s


def get(id_, customer_id=None):
    s = _nf(id_, customer_id)
    row = q1("SELECT s.*, c.name customer_name, c.email customer_email, p.name plan_name, p.billing_period, p.price plan_price, p.min_quantity, "
             "p.allow_pause, p.allow_renew, p.allow_early_close, p.auto_close FROM subscriptions s JOIN customers c ON c.id=s.customer_id "
             "JOIN plans p ON p.id=s.plan_id WHERE s.id=?", (id_,))
    lines = _lines(id_)
    row["lines"] = lines
    row["totals"] = {k: v for k, v in compute([dict(l, tax_rate=l["tax_rate"] or 0) for l in lines], []).items() if k in ("subtotal", "tax_total", "total")}
    row["expired"] = bool(row["status"] == "active" and row["expiry_date"] < date.today().isoformat())
    return row


def list_subs(args, page, per, customer_id=None):
    w, a = ["1=1"], []
    if customer_id:
        w.append("s.customer_id=? AND s.status!='draft'")
        a.append(customer_id)
    for key, col in (("status", "s.status"), ("customer_id", "s.customer_id"), ("plan_id", "s.plan_id")):
        if args.get(key):
            w.append(f"{col}=?")
            a.append(args[key])
    if args.get("q"):
        w.append("(s.number LIKE ? OR c.name LIKE ? OR c.company LIKE ?)")
        a += [f"%{args['q'].strip()}%"] * 3
    where = " AND ".join(w)
    return paginate("SELECT s.id,s.number,s.status,s.paused,s.start_date,s.expiry_date,s.next_invoice_date,s.payment_terms,c.name customer_name,"
                    "p.name plan_name,p.billing_period,(SELECT COALESCE(SUM(amount),0) FROM subscription_lines WHERE subscription_id=s.id) subtotal "
                    f"FROM subscriptions s JOIN customers c ON c.id=s.customer_id JOIN plans p ON p.id=s.plan_id WHERE {where} ORDER BY s.id DESC",
                    f"SELECT COUNT(*) n FROM subscriptions s JOIN customers c ON c.id=s.customer_id WHERE {where}", a, page, per)


# ---------- lifecycle actions (one small handler per action: Open/Closed) ----------
def _send(s, p):
    if s["status"] != "draft":
        raise ApiError("Only a draft can be sent as a quotation", 409)
    days = (R.templates.get(s["template_id"]) or {}).get("validity_days", 30) if s["template_id"] else 30
    return {"status": "quotation", "quote_valid_until": (date.today() + timedelta(days=days)).isoformat()}


def _confirm(s, p):
    if s["status"] != "quotation":
        raise ApiError("Only a quotation can be confirmed", 409)
    if s["quote_valid_until"] and s["quote_valid_until"] < date.today().isoformat():
        raise ApiError("This quotation has expired. Edit it and send a new quotation.", 409)
    return {"status": "confirmed"}


def _activate(s, p):
    if s["status"] != "confirmed":
        raise ApiError("Only a confirmed subscription can be activated", 409)
    return {"status": "active", "next_invoice_date": s["start_date"], "cycles_billed": 0}


def _pause(s, p):
    if s["status"] != "active" or s["paused"]:
        raise ApiError("Only an active, running subscription can be paused", 409)
    if not p["allow_pause"]:
        raise ApiError("This plan does not allow pausing", 409)
    return {"paused": 1}


def _resume(s, p):
    if not s["paused"]:
        raise ApiError("This subscription is not paused", 409)
    n, today = s["cycles_billed"], date.today()
    while advance(s["start_date"], p["billing_period"], n) < today and advance(s["start_date"], p["billing_period"], n) <= parse(s["expiry_date"]):
        n += 1  # periods spent paused are not billed
    return {"paused": 0, "cycles_billed": n, "next_invoice_date": advance(s["start_date"], p["billing_period"], n).isoformat()}


def _renew(s, p):
    if s["status"] != "active":
        raise ApiError("Only an active subscription can be renewed", 409)
    if not p["allow_renew"]:
        raise ApiError("This plan does not allow renewal", 409)
    term = max(1, (parse(s["expiry_date"]) - parse(s["start_date"])).days)
    return {"expiry_date": (parse(s["expiry_date"]) + timedelta(days=term)).isoformat()}


def _close(s, p):
    if s["status"] == "closed":
        raise ApiError("Already closed", 409)
    if s["status"] == "active" and not p["allow_early_close"] and s["expiry_date"] >= date.today().isoformat():
        raise ApiError("This plan cannot be closed before it ends", 409)
    return {"status": "closed", "paused": 0, "closed_at": date.today().isoformat()}


ACTIONS = {"send": _send, "confirm": _confirm, "activate": _activate, "pause": _pause, "resume": _resume, "renew": _renew, "close": _close}


def act(id_, action, customer_id=None):
    if action not in ACTIONS:
        raise ApiError("Unknown action", 404)
    if customer_id and action not in CUSTOMER_ACTIONS:
        raise ApiError("You do not have permission to do that", 403)
    s = _nf(id_, customer_id)
    changes = ACTIONS[action](s, R.plans.get(s["plan_id"]))
    R.subscriptions.update(id_, changes)
    return get(id_)


def auto_close_expired(today):
    """Plans flagged auto_close close themselves once expired and fully billed."""
    return execute("UPDATE subscriptions SET status='closed', closed_at=? WHERE status='active' AND expiry_date<? "
                   "AND (next_invoice_date IS NULL OR next_invoice_date>expiry_date) "
                   "AND plan_id IN (SELECT id FROM plans WHERE auto_close=1)", (today.isoformat(), today.isoformat()))
