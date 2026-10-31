"""Demo data, created through the same services the API uses (so it is always consistent)."""
from datetime import date, timedelta
from . import repositories as R
from .db import get_db, q1
from .domain.pricing import advance
from .security import hash_password
from .services import billing, catalog, subscriptions as subs

ADMIN = ("Asha Verma", "admin@brightloop.com", "Admin@12345")
STAFF = ("Rohan Gupta", "staff@brightloop.com", "Staff@12345")
CUSTOMER = ("customer@example.com", "Customer@123")


def seed_if_empty():
    if q1("SELECT COUNT(*) n FROM users")["n"]:
        return
    today = date.today()
    admin = R.users.insert(dict(name=ADMIN[0], email=ADMIN[1], password_hash=hash_password(ADMIN[2]), role="admin", active=1))
    R.users.insert(dict(name=STAFF[0], email=STAFF[1], password_hash=hash_password(STAFF[2]), role="staff", active=1))
    gst18 = catalog.save_tax({"name": "GST 18%", "rate": 18})["id"]
    gst5 = catalog.save_tax({"name": "GST 5%", "rate": 5})["id"]
    catalog.save_tax({"name": "Exempt", "rate": 0})
    erp = catalog.save_product({"name": "Brightloop ERP Suite", "type": "software", "sales_price": 1200, "cost_price": 400, "tax_id": gst18,
                                "notes": "Core business suite, per seat.",
                                "variants": [{"attribute": "Brand", "value": "Odoo", "extra_price": 560}, {"attribute": "Brand", "value": "Standard", "extra_price": 0},
                                             {"attribute": "Brand", "value": "Enterprise", "extra_price": 1500}]})
    crm = catalog.save_product({"name": "CRM Add-on", "type": "addon", "sales_price": 350, "cost_price": 90, "tax_id": gst18})
    sup = catalog.save_product({"name": "Priority Support", "type": "service", "sales_price": 500, "cost_price": 200, "tax_id": gst5})
    start = (today - timedelta(days=400)).isoformat()
    monthly = catalog.save_plan({"name": "Monthly Business", "price": 300, "billing_period": "monthly", "min_quantity": 1, "start_date": start,
                                 "allow_pause": True, "allow_early_close": True, "allow_renew": True, "tax_id": gst18})
    yearly = catalog.save_plan({"name": "Yearly Enterprise", "price": 2500, "billing_period": "yearly", "min_quantity": 5, "start_date": start,
                                "auto_close": True, "allow_renew": True, "tax_id": gst18})
    weekly = catalog.save_plan({"name": "Weekly Trial", "price": 0, "billing_period": "weekly", "min_quantity": 1, "start_date": start, "auto_close": True})
    catalog.save_template({"name": "SMB starter bundle", "plan_id": monthly["id"], "validity_days": 14,
                           "lines": [{"product_id": erp["id"], "variant_id": erp["variants"][1]["id"], "quantity": 3}, {"product_id": crm["id"], "quantity": 3}]})
    catalog.save_template({"name": "Enterprise annual deal", "plan_id": yearly["id"], "validity_days": 30,
                           "lines": [{"product_id": erp["id"], "variant_id": erp["variants"][0]["id"], "quantity": 10}, {"product_id": sup["id"], "quantity": 5}]})
    catalog.save_discount({"name": "Volume 10% (10+ seats)", "type": "percent", "value": 10, "min_quantity": 10, "applies_to": "product", "product_id": erp["id"]})
    catalog.save_discount({"name": "Loyalty ₹100 off", "type": "fixed", "value": 100, "min_purchase": 2000, "applies_to": "subscription",
                           "start_date": (today - timedelta(days=60)).isoformat(), "end_date": (today + timedelta(days=120)).isoformat(), "usage_limit": 20})
    names = [("Nova Retail", "Meera Joshi"), ("Kiran Traders", "Kiran Patel"), ("Lucknow Logistics", "Imran Khan"), ("GreenLeaf Cafe", "Sara Ali"),
             ("Ganga Textiles", "Vikas Singh"), ("PixelForge Studio", "Neha Rao"), ("Awadh Foods", "Ritu Sharma"), ("Zenith Clinics", "Dr. Anil Das"),
             ("Bluebird Books", "Tanvi Roy"), ("Orbit Fitness", "Manish Jain")]
    cust_ids = []
    for i, (company, person) in enumerate(names):
        email = CUSTOMER[0] if i == 0 else f"{person.split()[-1].lower()}{i}@example.com"
        uid = R.users.insert(dict(name=person, email=email, password_hash=hash_password(CUSTOMER[1]), role="customer", active=1)) if i < 3 else None
        cust_ids.append(R.customers.insert(dict(user_id=uid, name=person, email=email, company=company, phone=f"+91 98{i:02d}000{i:03d}", address="Lucknow, UP")))
    plan_cycle = [monthly, monthly, yearly, monthly, weekly, monthly, yearly, monthly, monthly, monthly]
    for i, cid in enumerate(cust_ids):
        plan = plan_cycle[i]
        seats = 10 if plan is yearly else 1 + i % 4
        lines = [{"product_id": erp["id"], "variant_id": erp["variants"][i % 2]["id"], "quantity": max(seats, plan["min_quantity"])}]
        if i % 3 == 0:
            lines.append({"product_id": crm["id"], "quantity": max(seats, plan["min_quantity"])})
        st = today - timedelta(days={"monthly": 30 * (2 + i % 4), "yearly": 100, "weekly": 21}[plan["billing_period"]])
        s = subs.create({"customer_id": cid, "plan_id": plan["id"], "start_date": st.isoformat(), "expiry_date": (st + timedelta(days=365)).isoformat(),
                         "payment_terms": ["Net 15", "Net 30", "Immediate"][i % 3], "lines": lines}, admin)
        if i < 8:
            for a in ("send", "confirm", "activate"):
                subs.act(s["id"], a)
        elif i == 8:
            subs.act(s["id"], "send")
    billing.run_billing(today, auto_confirm=False)
    # confirm and pay a realistic mix
    invs = billing.list_invoices({}, 1, 100)["items"][::-1]
    for n, inv in enumerate(invs):
        if inv["status"] != "draft":
            continue
        billing.confirm(inv["id"])
        if n % 4 != 3:   # ~75% settled, the rest outstanding / overdue
            full = n % 3 != 0
            amt = inv["total"] if full else round(inv["total"] / 2, 2)
            pay_date = min(today, date.fromisoformat(inv["issue_date"]) + timedelta(days=n % 9))
            billing.record_payment(inv["id"], {"method": ["bank_transfer", "upi", "card", "cheque", "cash"][n % 5], "amount": amt,
                                               "payment_date": pay_date.isoformat(), "note": "Seed payment"}, admin)
    get_db().commit()
