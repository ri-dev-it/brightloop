# STAR write-up (use this in the video / presentation)

**Situation (Brightloop today):** subscriptions in a spreadsheet, renewals remembered by whoever notices, invoices typed by hand, payments matched by scrolling bank statements, quarterly manual reports — missed renewals, wrong invoices, no one knows recurring revenue.
**Task:** one system that runs plan setup → subscription → invoice → payment → reporting for three audiences: admin, staff, customers.
**Action / Result by scenario**

| Scene | Action | Result |
|---|---|---|
| New customer signs up | Strict validation (unique email, >8 chars + upper/lower/special) with live checklist; signed 1-hour reset link; role-based access | Self-service onboarding; customers only ever see their own data |
| Launching a plan | Products with variants (Brand: Odoo +₹560); plans with period, min qty, availability window and per-plan close/pause/renew rules | Admin controls policy per plan; rules enforced by the server, not by trust |
| Quote → subscription | Quotation templates with validity days; guarded lifecycle Draft→Quotation→Confirmed→Active→Closed with a visible stepper | Reps start from a template; everyone sees status at a glance; expired quotes cannot be confirmed |
| Billing day | One-click (or cron) billing generates invoices with lines, tax and totals; DB uniqueness prevents duplicates; catch-up covers missed cycles | Hundreds of invoices in one request; nothing billed twice or skipped |
| Better price | Admin-only discount rules (fixed/percent, min spend/qty, dates, usage limit, product or subscription) applied automatically on the next invoice | Discounts appear on their own and stop when expired/exhausted |
| Money comes in | Payments recorded with method/amount/date/note; over-payment blocked; invoice flips to Paid at zero balance; overdue flagged | Team always knows paid vs outstanding vs overdue |
| Finance lead | Dashboard: active subs, MRR, revenue, owed, overdue, charts, date filters; indexed + paginated | Answers in one screen; 5k subscriptions respond in <35 ms |
