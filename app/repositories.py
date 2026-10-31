"""Repository layer: the only place that knows table names (Dependency Inversion for services)."""
from .db import q, q1, run


class Repo:
    table, cols = "", ()

    def get(self, id_):
        return q1(f"SELECT * FROM {self.table} WHERE id=?", (id_,))

    def list(self, where="1=1", args=(), order="id DESC"):
        return q(f"SELECT * FROM {self.table} WHERE {where} ORDER BY {order}", args)

    def insert(self, data):
        d = {k: v for k, v in data.items() if k in self.cols}
        return run(f"INSERT INTO {self.table}({','.join(d)}) VALUES({','.join('?' * len(d))})", tuple(d.values()))

    def update(self, id_, data):
        d = {k: v for k, v in data.items() if k in self.cols}
        if d:
            run(f"UPDATE {self.table} SET {','.join(k + '=?' for k in d)} WHERE id=?", (*d.values(), id_))

    def delete(self, id_):
        run(f"DELETE FROM {self.table} WHERE id=?", (id_,))


def _repo(table, cols):
    return type(table.title(), (Repo,), {"table": table, "cols": tuple(cols.split())})()


users = _repo("users", "name email password_hash role active")
customers = _repo("customers", "user_id name email phone company address")
taxes = _repo("taxes", "name rate active")
products = _repo("products", "name type sales_price cost_price notes tax_id active")
variants = _repo("product_variants", "product_id attribute value extra_price")
plans = _repo("plans", "name price billing_period min_quantity start_date end_date auto_close allow_early_close allow_pause allow_renew tax_id active")
templates = _repo("quotation_templates", "name plan_id validity_days notes active")
template_lines = _repo("quotation_template_lines", "template_id product_id variant_id quantity")
subscriptions = _repo("subscriptions", "number customer_id plan_id template_id start_date expiry_date payment_terms status paused quote_valid_until cycles_billed next_invoice_date notes created_by closed_at")
sub_lines = _repo("subscription_lines", "subscription_id product_id variant_id description quantity unit_price tax_id amount is_plan_fee")
discounts = _repo("discounts", "name type value min_purchase min_quantity start_date end_date usage_limit applies_to product_id subscription_id active")
invoices = _repo("invoices", "number subscription_id customer_id period_start period_end issue_date due_date status subtotal discount_total tax_total total amount_paid sent_at")
invoice_lines = _repo("invoice_lines", "invoice_id kind description quantity unit_price tax_rate amount tax_amount discount_id")
payments = _repo("payments", "invoice_id method amount payment_date note recorded_by")
