# Brightloop – Subscription Management System

One platform for plans, subscriptions, invoicing, payments and revenue reporting
(Odoo × FLUX Lucknow Hackathon '26 – *Subscription Management System*).

**Stack:** Python 3 + Flask · SQLite (local, offline-friendly) · vanilla ES-module SPA (no build step, no CDN).
Only one dependency: `Flask`.

## Run it

### Option 1 – VS Code / local Python (2 minutes)
Requires Python 3.10+.
```bash
# macOS / Linux
python3 -m venv .venv && source .venv/bin/activate
# Windows (PowerShell):   python -m venv .venv ; .venv\Scripts\Activate.ps1
pip install -r requirements.txt
python run.py                      # http://localhost:5000
```
In VS Code: **File → Open Folder → brightloop**, accept the recommended extensions, pick the `.venv` interpreter
(*Python: Select Interpreter*), then press **F5** (*Brightloop: run server*). **Terminal → Run Task…** has
*Setup*, *Run server*, *Run tests*, *Run billing job* and *Docker: up*. The Testing sidebar discovers the unit tests automatically.
`make setup | run | test | billing | bulk` are shortcuts for the same commands (macOS/Linux/WSL).

### Option 2 – Docker
```bash
docker compose up --build -d       # http://localhost:8000   (PORT=9000 docker compose up ... to change it)
docker compose logs -f web
docker compose --profile jobs run --rm billing   # the daily billing job (schedule with cron)
docker compose down                # add -v to also delete the database volume
```
The image runs gunicorn as a non-root user, keeps the database in the `brightloop-data` volume, exposes `/healthz`
for health checks, and generates a persistent `SECRET_KEY` on first start unless you pass your own
(`SECRET_KEY=... docker compose up -d`). Set `SEED_DEMO=0` for a clean production database.

First start creates the database and loads demo data.

| Role | Email | Password |
|---|---|---|
| Admin | admin@brightloop.com | Admin@12345 |
| Staff | staff@brightloop.com | Staff@12345 |
| Customer (portal) | customer@example.com | Customer@123 |

```bash
python -m unittest discover -s tests -v   # 11 tests: rules, permissions, billing idempotency, payments, CLI persistence, lifecycle
python run.py billing                     # the daily billing job (put in cron / Task Scheduler)
python run.py bulk 5000                   # load-test data: 5,000 subscriptions + 15,000 invoices
```
Forgot-password: with `MAIL_MODE=console` (default) the email is written to `data/outbox.log` and the reset link is
also shown on screen for demos. Set `MAIL_MODE=smtp` + `SMTP_*` (see `.env.example`) for real email.

## Problem statement → where it lives
| Requirement | Implementation |
|---|---|
| Sign-up: unique email, password >8 chars with upper/lower/special | `services/auth.py`, `security.password_error`, UNIQUE+NOCASE on `users.email`; live checklist in `pages/auth.js` |
| Reset link to registered email | signed, 1-hour, single-use token (`forgot_password` / `reset_password`) |
| Roles: admin / staff / customer portal; only admin adds staff | `security.auth_required(*roles)` on every route; `POST /api/users` admin-only; portal queries scoped to own `customer_id` |
| Product: name, type, sales/cost price, notes, variants (Odoo brand +560) | `products` + `product_variants` (seeded: *Brand: Odoo +560*) |
| Plan: price, daily/weekly/monthly/yearly, min qty, availability dates; auto-close / early close / pause / renew per plan | `plans` flags: `auto_close, allow_early_close, allow_pause, allow_renew`, enforced in `services/subscriptions.py` |
| Quotation templates with validity days | `quotation_templates` (+lines); validity stamped as `quote_valid_until`, enforced on Confirm |
| Subscription: number, customer, plan, start/expiry, payment terms, lines; Draft→Quotation→Confirmed→Active→Closed | `subscriptions`, action endpoints, stepper on the detail page |
| Invoices auto-created from subscriptions, taxes automatic, confirm/cancel/send/print, Draft→Confirmed→Paid | `services/billing.py`; `UNIQUE(subscription_id, period_start)` = never billed twice; catch-up loop = never skipped |
| Discounts: admin-only, fixed/percent, min purchase/qty, dates, usage limit, per product or whole subscription, auto on next invoice | `catalog.eligible_discounts` + `domain/pricing.compute`; usage counted, restored if a draft invoice is cancelled |
| Payments: method, amount, date, note, against invoice; paid vs outstanding | `record_payment` (no over-payment, confirmed invoices only, auto-marks Paid) |
| Finance view: active subs, revenue, owed, overdue, filters, <2 s | `/api/reports/dashboard`, filterable invoice/payment lists, DB indexes, pagination (measured ≤ 35 ms at 5k subscriptions) |

## Project layout
```
app/
  domain/pricing.py     pure rules: discounts, tax, cycle dates (no DB, no Flask)
  services/             use-cases: auth, catalog, subscriptions, billing, reports, mailer
  repositories.py       table access (only place that knows table names)
  routes/               thin HTTP layer + role checks
  schema.sql  seed.py  validators.py  security.py  errors.py
frontend/               index.html, css/app.css, js/{api,ui,crud,main}.js, js/pages/*
tests/                  unit + API tests; tests/e2e/e2e.js = Playwright browser test
docs/  scripts/  docker/  .vscode/
Dockerfile  docker-compose.yml  gunicorn.conf.py  Makefile  requirements*.txt
```
Docs: `docs/ARCHITECTURE.md` (SOLID), `docs/STAR.md` (Situation-Task-Action-Result per scenario), `docs/NEXT_STEPS.md`.

## Complexity (n = rows in a table, S = due subscriptions, L = lines, D = eligible discounts)
| Operation | Time | Space | Why |
|---|---|---|---|
| Any list screen (filter + page) | O(log n + offset + page) | O(page) | indexed filters, server-side `LIMIT/OFFSET`; only one page is ever loaded |
| Free-text search (`LIKE '%x%'`) | O(n) scan | O(page) | the one non-indexed path; SQLite FTS5 is the upgrade if tables reach millions |
| Billing run | O(S·log n + I·L) for I invoices created | O(I) ids | range scan on `idx_sub_billing(status, paused, next_invoice_date)`; each cycle computed in O(1) from the start date |
| Double-billing guard | O(log n) | O(1) | `UNIQUE(subscription_id, period_start)` index |
| Price/tax/discount calc | O(L·D) | O(L) | pure function, no I/O |
| Record payment | O(log n) | O(1) | one atomic conditional `UPDATE` (also race-safe) |
| Dashboard | O(P + I in range) | O(1) | SQL aggregates + 6-month window, no row loops in Python |

Measured with `python run.py bulk 5000` (5,000 subscriptions, 15,000 invoices): dashboard ≈ 23 ms, lists 2–8 ms.

## Honest notes / known limits
* Verified by 11 unit/API tests **and a real Chromium (Playwright) click-through**: every admin route, template → subscription → send → confirm → activate → billing run → confirm invoice → record payment → dashboard, the customer portal, signup validation and a mobile viewport — no console or page errors.
* Payments are recorded by staff (no online gateway). Money is stored as REAL rounded to 2 dp; move to integer paise if you go to production.
* Cancelled invoices keep their period "used" (it will not be re-billed) — create a manual correction if needed.
* Docker: the image files were written and reviewed, and the exact entrypoint + gunicorn command was run natively and passed (health check, secret generation, full browser test, concurrent-payment test), but `docker build` itself could not be run in the authoring sandbox (no Docker daemon) — run `docker compose up --build` once to confirm on your machine.
* No login rate-limiting yet (see `docs/NEXT_STEPS.md`).
* Change `SECRET_KEY` and set `SEED_DEMO=0` before any real deployment.
