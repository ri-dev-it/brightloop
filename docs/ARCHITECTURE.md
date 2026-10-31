# Architecture – SOLID mapping

```
Browser SPA ──HTTP/JSON──> routes (auth + validation entry) ──> services (use-cases) ──> repositories ──> SQLite
                                                   └────────────> domain/pricing (pure rules)
```
| Principle | Where it shows |
|---|---|
| **S**ingle responsibility | Routes only translate HTTP; services hold one use-case area each; `domain/pricing.py` only does maths; `validators.py` only validates; `mailer.py` only sends mail. |
| **O**pen/closed | New subscription action = add one function to `subscriptions.ACTIONS`. New mail transport = new class in `mailer.py`. New CRUD screen = one config object passed to `crud()` in the frontend. |
| **L**iskov | `ConsoleMailer` and `SmtpMailer` are interchangeable behind `.send()`. Every `Repo` subclass honours the same get/list/insert/update/delete contract. |
| **I**nterface segregation | Small, focused service modules and blueprints instead of one god-service; customers can only reach the three self-service actions (`pause`, `resume`, `close`). |
| **D**ependency inversion | Services depend on repository/mailer abstractions, not SQL strings or SMTP; pricing is pure so it is unit-tested without a database. |

## Key design decisions
* **No double billing:** DB constraint `UNIQUE(subscription_id, period_start)` + cycle counter; running billing twice is a no-op (tested).
* **No skipped periods:** billing loops through every missed cycle (cap 36/run); periods spent *paused* are intentionally skipped on resume.
* **No date drift:** cycle n is computed from the original start date (31 Jan → 28 Feb → 31 Mar).
* **Discount-before-tax:** tax is computed on the discounted line amount; discount usage is counted per invoice and restored if a draft is cancelled.
* **Security:** salted password hashes, signed expiring tokens, role check on every endpoint, customer data scoped server-side, parameterised SQL, output escaped in the UI, reset flow never reveals whether an email exists.
* **Performance:** indexes on status/due date/customer/billing date, server-side pagination, aggregate SQL for the dashboard.
* **Atomic money movement:** payments are one conditional `UPDATE ... WHERE balance >= amount`, so concurrent requests cannot over-pay (verified with 8 parallel requests → exactly one succeeds).
* **Jobs outside HTTP** (`run.py billing`) commit explicitly via `db.commit()`; the request path commits in `after_request` only for status < 400.
