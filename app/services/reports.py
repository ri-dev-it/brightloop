from datetime import date
from ..db import q, q1
from ..domain.pricing import MONTHLY_FACTOR, r2


def _months_back(n, today):
    y, m, out = today.year, today.month, []
    for _ in range(n):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m == 0:
            y, m = y - 1, 12
    return out[::-1]


def dashboard(date_from=None, date_to=None):
    today = date.today()
    date_from = date_from or today.replace(day=1).isoformat()
    date_to = date_to or today.isoformat()
    t = today.isoformat()
    by_status = {r["status"]: r["n"] for r in q("SELECT status, COUNT(*) n FROM subscriptions GROUP BY status")}
    mrr = sum(r["amt"] * MONTHLY_FACTOR[r["bp"]] for r in q(
        "SELECT p.billing_period bp, SUM(l.amount) amt FROM subscriptions s JOIN plans p ON p.id=s.plan_id "
        "JOIN subscription_lines l ON l.subscription_id=s.id WHERE s.status='active' AND s.paused=0 GROUP BY p.billing_period"))
    revenue = q1("SELECT COALESCE(SUM(amount),0) v, COUNT(*) n FROM payments WHERE payment_date BETWEEN ? AND ?", (date_from, date_to))
    invoiced = q1("SELECT COALESCE(SUM(total),0) v, COUNT(*) n FROM invoices WHERE status IN('confirmed','paid') AND issue_date BETWEEN ? AND ?", (date_from, date_to))
    outstanding = q1("SELECT COALESCE(SUM(total-amount_paid),0) v, COUNT(*) n FROM invoices WHERE status='confirmed'")
    overdue = q1("SELECT COALESCE(SUM(total-amount_paid),0) v, COUNT(*) n FROM invoices WHERE status='confirmed' AND due_date<?", (t,))
    months = _months_back(6, today)
    pay = {r["m"]: r["v"] for r in q("SELECT substr(payment_date,1,7) m, SUM(amount) v FROM payments WHERE payment_date>=? GROUP BY m", (months[0] + "-01",))}
    inv = {r["m"]: r["v"] for r in q("SELECT substr(issue_date,1,7) m, SUM(total) v FROM invoices WHERE status IN('confirmed','paid') AND issue_date>=? GROUP BY m", (months[0] + "-01",))}
    return {
        "range": {"from": date_from, "to": date_to},
        "active_subscriptions": by_status.get("active", 0),
        "subscriptions_by_status": by_status,
        "mrr": r2(mrr),
        "revenue": r2(revenue["v"]), "payments_count": revenue["n"],
        "invoiced": r2(invoiced["v"]), "invoiced_count": invoiced["n"],
        "outstanding": r2(outstanding["v"]), "outstanding_count": outstanding["n"],
        "overdue": r2(overdue["v"]), "overdue_count": overdue["n"],
        "monthly": [{"month": m, "revenue": r2(pay.get(m, 0)), "invoiced": r2(inv.get(m, 0))} for m in months],
        "by_method": q("SELECT method, SUM(amount) amount, COUNT(*) n FROM payments WHERE payment_date BETWEEN ? AND ? GROUP BY method ORDER BY amount DESC", (date_from, date_to)),
        "overdue_invoices": q("SELECT i.id,i.number,i.due_date,ROUND(i.total-i.amount_paid,2) balance,c.name customer_name,CAST(julianday(?)-julianday(i.due_date) AS INTEGER) days_overdue "
                              "FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.status='confirmed' AND i.due_date<? ORDER BY i.due_date LIMIT 8", (t, t)),
    }
