"""Products, variants, taxes, plans, discounts and quotation templates."""
from .. import repositories as R
from ..db import execute, paginate, q, q1
from ..errors import ApiError
from ..validators import Validator

PRODUCT_TYPES = ("software", "service", "addon", "physical")
PERIODS = ("daily", "weekly", "monthly", "yearly")


def _like(s):
    return f"%{s.strip()}%"


def _nf(row, what):
    if not row:
        raise ApiError(f"{what} not found", 404)
    return row


# ---------- taxes ----------
def list_taxes(search, page, per, active_only=False):
    w, a = "name LIKE ?", [_like(search or "")]
    if active_only:
        w += " AND active=1"
    return paginate(f"SELECT * FROM taxes WHERE {w} ORDER BY name", f"SELECT COUNT(*) n FROM taxes WHERE {w}", a, page, per)


def save_tax(data, id_=None):
    d = Validator(data).text("name", max_len=60).number("rate", min_v=0, max_v=100).flag("active", True).done()
    if id_:
        _nf(R.taxes.get(id_), "Tax")
        R.taxes.update(id_, d)
    else:
        id_ = R.taxes.insert(d)
    return R.taxes.get(id_)


# ---------- products ----------
def _variants_for(ids):
    if not ids:
        return {}
    rows = q(f"SELECT * FROM product_variants WHERE product_id IN ({','.join('?' * len(ids))}) ORDER BY id", ids)
    out = {}
    for r in rows:
        out.setdefault(r["product_id"], []).append(r)
    return out


def list_products(search, page, per, active_only=False):
    w, a = "p.name LIKE ?", [_like(search or "")]
    if active_only:
        w += " AND p.active=1"
    res = paginate(f"SELECT p.*, t.name tax_name, t.rate tax_rate FROM products p LEFT JOIN taxes t ON t.id=p.tax_id WHERE {w} ORDER BY p.name",
                   f"SELECT COUNT(*) n FROM products p WHERE {w}", a, page, per)
    vs = _variants_for([p["id"] for p in res["items"]])
    for p in res["items"]:
        p["variants"] = vs.get(p["id"], [])
    return res


def save_product(data, id_=None):
    v = (Validator(data).text("name", max_len=100).choice("type", PRODUCT_TYPES)
         .number("sales_price", min_v=0, max_v=10**8).number("cost_price", False, min_v=0, max_v=10**8, default=0)
         .text("notes", False, 2000).number("tax_id", False, integer=True).flag("active", True))
    d = v.done()
    if d["tax_id"] and not R.taxes.get(d["tax_id"]):
        raise ApiError("Please fix the highlighted fields", 422, {"tax_id": "Tax not found"})
    incoming = []
    for i, raw in enumerate((data or {}).get("variants") or []):
        vv = Validator(raw).text("attribute", max_len=40).text("value", max_len=60).number("extra_price", False, min_v=-10**8, max_v=10**8, default=0)
        try:
            row = vv.done()
        except ApiError as e:
            raise ApiError(e.message, 422, {f"variants.{i}.{k}": m for k, m in e.errors.items()})
        row["id"] = int(raw["id"]) if raw.get("id") else None
        incoming.append(row)
    if id_:
        _nf(R.products.get(id_), "Product")
        R.products.update(id_, d)
    else:
        id_ = R.products.insert(d)
    keep = [r["id"] for r in incoming if r["id"]]
    for old in R.variants.list("product_id=?", (id_,)):
        if old["id"] not in keep:
            R.variants.delete(old["id"])
    for r in incoming:
        payload = dict(product_id=id_, attribute=r["attribute"], value=r["value"], extra_price=r["extra_price"] or 0)
        R.variants.update(r["id"], payload) if r["id"] else R.variants.insert(payload)
    p = R.products.get(id_)
    p["variants"] = R.variants.list("product_id=?", (id_,), "id")
    return p


# ---------- plans ----------
def list_plans(search, page, per, active_only=False):
    w, a = "name LIKE ?", [_like(search or "")]
    if active_only:
        w += " AND active=1"
    return paginate(f"SELECT * FROM plans WHERE {w} ORDER BY name", f"SELECT COUNT(*) n FROM plans WHERE {w}", a, page, per)


def save_plan(data, id_=None):
    d = (Validator(data).text("name", max_len=100).number("price", min_v=0, max_v=10**8)
         .choice("billing_period", PERIODS).number("min_quantity", False, min_v=1, max_v=100000, integer=True, default=1)
         .date("start_date").date("end_date", False).number("tax_id", False, integer=True)
         .flag("auto_close").flag("allow_early_close").flag("allow_pause").flag("allow_renew").flag("active", True).done())
    if d["end_date"] and d["end_date"] < d["start_date"]:
        raise ApiError("Please fix the highlighted fields", 422, {"end_date": "End date must be after the start date"})
    d["min_quantity"] = d["min_quantity"] or 1
    if id_:
        _nf(R.plans.get(id_), "Plan")
        R.plans.update(id_, d)
    else:
        id_ = R.plans.insert(d)
    return R.plans.get(id_)


# ---------- discounts ----------
def list_discounts(search, page, per):
    w, a = "d.name LIKE ?", [_like(search or "")]
    return paginate(f"SELECT d.*, p.name product_name, s.number subscription_number FROM discounts d LEFT JOIN products p ON p.id=d.product_id "
                    f"LEFT JOIN subscriptions s ON s.id=d.subscription_id WHERE {w} ORDER BY d.id DESC",
                    f"SELECT COUNT(*) n FROM discounts d WHERE {w}", a, page, per)


def save_discount(data, id_=None):
    v = (Validator(data).text("name", max_len=80).choice("type", ("fixed", "percent")).number("value", min_v=0.01, max_v=10**8)
         .number("min_purchase", False, min_v=0, default=0).number("min_quantity", False, min_v=0, integer=True, default=0)
         .date("start_date", False).date("end_date", False).number("usage_limit", False, min_v=1, integer=True)
         .choice("applies_to", ("product", "subscription")).number("product_id", False, integer=True)
         .number("subscription_id", False, integer=True).flag("active", True))
    d = v.done()
    if d["type"] == "percent" and d["value"] > 100:
        raise ApiError("Please fix the highlighted fields", 422, {"value": "A percentage cannot exceed 100"})
    if d["start_date"] and d["end_date"] and d["end_date"] < d["start_date"]:
        raise ApiError("Please fix the highlighted fields", 422, {"end_date": "End date must be after the start date"})
    if d["applies_to"] == "product":
        if not d["product_id"] or not R.products.get(d["product_id"]):
            raise ApiError("Please fix the highlighted fields", 422, {"product_id": "Choose the product this discount applies to"})
        d["subscription_id"] = None
    else:
        d["product_id"] = None
        if d["subscription_id"] and not R.subscriptions.get(d["subscription_id"]):
            raise ApiError("Please fix the highlighted fields", 422, {"subscription_id": "Subscription not found"})
    d["min_purchase"], d["min_quantity"] = d["min_purchase"] or 0, d["min_quantity"] or 0
    if id_:
        _nf(R.discounts.get(id_), "Discount")
        R.discounts.update(id_, d)
    else:
        id_ = R.discounts.insert(d)
    return R.discounts.get(id_)


def eligible_discounts(subscription_id, on_date):
    """Active, in-window, not exhausted; global (subscription_id NULL) or targeted at this subscription."""
    return q("SELECT * FROM discounts WHERE active=1 AND (start_date IS NULL OR start_date<=?) AND (end_date IS NULL OR end_date>=?) "
             "AND (usage_limit IS NULL OR times_used<usage_limit) AND (subscription_id IS NULL OR subscription_id=?) ORDER BY id",
             (on_date, on_date, subscription_id))


# ---------- quotation templates ----------
def _tpl_lines(ids):
    if not ids:
        return {}
    rows = q(f"SELECT l.*, p.name product_name, v.attribute, v.value FROM quotation_template_lines l JOIN products p ON p.id=l.product_id "
             f"LEFT JOIN product_variants v ON v.id=l.variant_id WHERE l.template_id IN ({','.join('?' * len(ids))}) ORDER BY l.id", ids)
    out = {}
    for r in rows:
        out.setdefault(r["template_id"], []).append(r)
    return out


def list_templates(search, page, per, active_only=False):
    w, a = "t.name LIKE ?", [_like(search or "")]
    if active_only:
        w += " AND t.active=1"
    res = paginate(f"SELECT t.*, p.name plan_name FROM quotation_templates t JOIN plans p ON p.id=t.plan_id WHERE {w} ORDER BY t.name",
                   f"SELECT COUNT(*) n FROM quotation_templates t WHERE {w}", a, page, per)
    ls = _tpl_lines([t["id"] for t in res["items"]])
    for t in res["items"]:
        t["lines"] = ls.get(t["id"], [])
    return res


def get_template(id_):
    t = _nf(R.templates.get(id_), "Template")
    t["lines"] = _tpl_lines([id_]).get(id_, [])
    return t


def save_template(data, id_=None):
    d = (Validator(data).text("name", max_len=100).number("plan_id", integer=True, min_v=1)
         .number("validity_days", min_v=1, max_v=365, integer=True).text("notes", False, 1000).flag("active", True).done())
    if not R.plans.get(d["plan_id"]):
        raise ApiError("Please fix the highlighted fields", 422, {"plan_id": "Plan not found"})
    lines = []
    for i, raw in enumerate((data or {}).get("lines") or []):
        try:
            l = Validator(raw).number("product_id", integer=True, min_v=1).number("variant_id", False, integer=True).number("quantity", integer=True, min_v=1, max_v=100000).done()
        except ApiError as e:
            raise ApiError(e.message, 422, {f"lines.{i}.{k}": m for k, m in e.errors.items()})
        if not R.products.get(l["product_id"]):
            raise ApiError("Please fix the highlighted fields", 422, {f"lines.{i}.product_id": "Product not found"})
        lines.append(l)
    if not lines:
        raise ApiError("Please fix the highlighted fields", 422, {"lines": "Add at least one product line"})
    if id_:
        _nf(R.templates.get(id_), "Template")
        R.templates.update(id_, d)
        execute("DELETE FROM quotation_template_lines WHERE template_id=?", (id_,))
    else:
        id_ = R.templates.insert(d)
    for l in lines:
        R.template_lines.insert(dict(l, template_id=id_))
    return get_template(id_)


def archive(repo, id_, what):
    _nf(repo.get(id_), what)
    repo.update(id_, {"active": 0})
    return {"id": id_, "active": 0}
