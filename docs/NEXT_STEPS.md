# Next steps (do these in order)

## A. Right now (before anything else)
0. Optional full check: `node tests/e2e/e2e.js` (needs `npm i playwright` once; set `BASE_URL`).
1. Unzip, run the app (README → "Run it") and click through: log in as admin → Dashboard → New subscription (pick a template) → Send quotation → Confirm → Activate → Invoices → Run billing → Confirm an invoice → Record payment. Log in as customer@example.com and check the portal.
2. Fix anything that looks off visually — you have design ownership of the final polish.

## B. Git (hackathon rule: *every member must commit*)
```bash
git init && git add . && git commit -m "feat: initial subscription management system"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```
* Give **every teammate** a collaborator invite and have each one make at least one real commit (e.g. README tweaks, UI polish, extra test, seed data). One person committing everything will be marked down.
* Use small meaningful commit messages (`feat:`, `fix:`, `docs:`).

## C. Hackathon portal checklist (times from your event page)
| When | Do |
|---|---|
| 31 Oct 08:30 | Coding starts — add the GitHub repo URL in **Submit solution** |
| 31 Oct 09:00 | Add evaluator **eapa-odoo** (and **hackathon-odoo**) as collaborators on the repo |
| 31 Oct 10:00 | Coding ends — final push before this |
| 31 Oct 17:00 | Submit your video link |
Double-check these against the portal; your page showed them under "Odoo x FLUX Lucknow Hackathon '26". Also select your problem statement (*Subscription_Management_System*) if not done.

## D. Video (3–5 min) outline
Problem (STAR table in `docs/STAR.md`) → live demo of the 7 scenes in order → architecture slide (`docs/ARCHITECTURE.md`) → performance (`python run.py bulk 5000`) → what you'd add next.

## E. Easy wins if you have time
* Customer "Pay now" with a payment gateway (Razorpay/Stripe test mode) and webhook → `record_payment`.
* Email overdue reminders from `python run.py billing` (mailer already exists).
* CSV export on invoice/payment lists; PDF invoices (WeasyPrint) from the print template.
* Deploy the Docker image (Render/Railway/Fly); switch SQLite → PostgreSQL by replacing `db.py`.
* Login / forgot-password rate limiting (e.g. Flask-Limiter) and integer-paise money columns.
