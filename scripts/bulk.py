"""Loads N active subscriptions with invoices + payments directly via SQL, to verify <2s page responses."""
import random
from datetime import date, timedelta
from app.db import get_db


def bulk(app, n):
    with app.app_context():
        db = get_db()
        plan = db.execute("SELECT id FROM plans WHERE billing_period='monthly' LIMIT 1").fetchone()["id"]
        today = date.today()
        for i in range(n):
            cur = db.execute("INSERT INTO customers(name,email,company) VALUES(?,?,?)", (f"Bulk Customer {i}", f"bulk{i}@example.com", f"Bulk Co {i}"))
            cid = cur.lastrowid
            st = today - timedelta(days=random.randint(30, 300))
            sid = db.execute("INSERT INTO subscriptions(customer_id,plan_id,start_date,expiry_date,status,next_invoice_date,cycles_billed) VALUES(?,?,?,?, 'active',?,0)",
                             (cid, plan, st.isoformat(), (st + timedelta(days=365)).isoformat(), st.isoformat())).lastrowid
            db.execute("UPDATE subscriptions SET number=? WHERE id=?", (f"SUB-{sid:06d}", sid))
            db.execute("INSERT INTO subscription_lines(subscription_id,description,quantity,unit_price,amount) VALUES(?,?,?,?,?)", (sid, "Bulk seat", 2, 500, 1000))
            for k in range(3):
                ps = st + timedelta(days=30 * k)
                paid = random.random() < 0.7
                iid = db.execute("INSERT INTO invoices(subscription_id,customer_id,period_start,period_end,issue_date,due_date,status,subtotal,total,amount_paid) VALUES(?,?,?,?,?,?,?,?,?,?)",
                                 (sid, cid, ps.isoformat(), (ps + timedelta(days=29)).isoformat(), ps.isoformat(), (ps + timedelta(days=30)).isoformat(),
                                  "paid" if paid else "confirmed", 1000, 1000, 1000 if paid else 0)).lastrowid
                db.execute("UPDATE invoices SET number=? WHERE id=?", (f"INV-B-{iid:07d}", iid))
                if paid:
                    db.execute("INSERT INTO payments(invoice_id,method,amount,payment_date) VALUES(?,?,?,?)", (iid, "upi", 1000, ps.isoformat()))
        db.commit()
        print(f"Loaded {n} subscriptions with invoices and payments")
