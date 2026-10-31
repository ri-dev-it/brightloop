CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN('admin','staff','customer')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS customers(
  id INTEGER PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(name);
CREATE TABLE IF NOT EXISTS taxes(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  rate REAL NOT NULL CHECK(rate>=0 AND rate<=100),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN('software','service','addon','physical')),
  sales_price REAL NOT NULL CHECK(sales_price>=0),
  cost_price REAL NOT NULL DEFAULT 0 CHECK(cost_price>=0),
  notes TEXT NOT NULL DEFAULT '',
  tax_id INTEGER REFERENCES taxes(id),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS product_variants(
  id INTEGER PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  attribute TEXT NOT NULL,
  value TEXT NOT NULL,
  extra_price REAL NOT NULL DEFAULT 0,
  UNIQUE(product_id, attribute, value)
);
CREATE TABLE IF NOT EXISTS plans(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0 CHECK(price>=0),
  billing_period TEXT NOT NULL CHECK(billing_period IN('daily','weekly','monthly','yearly')),
  min_quantity INTEGER NOT NULL DEFAULT 1 CHECK(min_quantity>=1),
  start_date TEXT NOT NULL,
  end_date TEXT,
  auto_close INTEGER NOT NULL DEFAULT 0,
  allow_early_close INTEGER NOT NULL DEFAULT 0,
  allow_pause INTEGER NOT NULL DEFAULT 0,
  allow_renew INTEGER NOT NULL DEFAULT 0,
  tax_id INTEGER REFERENCES taxes(id),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS quotation_templates(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  validity_days INTEGER NOT NULL DEFAULT 30 CHECK(validity_days>=1),
  notes TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS quotation_template_lines(
  id INTEGER PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES quotation_templates(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>=1)
);
CREATE TABLE IF NOT EXISTS subscriptions(
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  plan_id INTEGER NOT NULL REFERENCES plans(id),
  template_id INTEGER REFERENCES quotation_templates(id) ON DELETE SET NULL,
  start_date TEXT NOT NULL,
  expiry_date TEXT NOT NULL,
  payment_terms TEXT NOT NULL DEFAULT 'Net 30',
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','quotation','confirmed','active','closed')),
  paused INTEGER NOT NULL DEFAULT 0,
  quote_valid_until TEXT,
  cycles_billed INTEGER NOT NULL DEFAULT 0,
  next_invoice_date TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sub_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_sub_customer ON subscriptions(customer_id);
CREATE INDEX IF NOT EXISTS idx_sub_billing ON subscriptions(status, paused, next_invoice_date);
CREATE TABLE IF NOT EXISTS subscription_lines(
  id INTEGER PRIMARY KEY,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id),
  variant_id INTEGER REFERENCES product_variants(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL CHECK(quantity>=1),
  unit_price REAL NOT NULL,
  tax_id INTEGER REFERENCES taxes(id),
  amount REAL NOT NULL,
  is_plan_fee INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_sublines_sub ON subscription_lines(subscription_id);
CREATE TABLE IF NOT EXISTS discounts(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN('fixed','percent')),
  value REAL NOT NULL CHECK(value>0),
  min_purchase REAL NOT NULL DEFAULT 0,
  min_quantity INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  usage_limit INTEGER,
  times_used INTEGER NOT NULL DEFAULT 0,
  applies_to TEXT NOT NULL CHECK(applies_to IN('product','subscription')),
  product_id INTEGER REFERENCES products(id),
  subscription_id INTEGER REFERENCES subscriptions(id),
  active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS invoices(
  id INTEGER PRIMARY KEY,
  number TEXT UNIQUE,
  subscription_id INTEGER NOT NULL REFERENCES subscriptions(id),
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN('draft','confirmed','paid','cancelled')),
  subtotal REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  tax_total REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  amount_paid REAL NOT NULL DEFAULT 0,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(subscription_id, period_start)   -- guarantees nothing is billed twice
);
CREATE INDEX IF NOT EXISTS idx_inv_status_due ON invoices(status, due_date);
CREATE INDEX IF NOT EXISTS idx_inv_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_inv_issue ON invoices(issue_date);
CREATE TABLE IF NOT EXISTS invoice_lines(
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  kind TEXT NOT NULL DEFAULT 'line' CHECK(kind IN('line','discount')),
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL,
  tax_amount REAL NOT NULL DEFAULT 0,
  discount_id INTEGER REFERENCES discounts(id)
);
CREATE INDEX IF NOT EXISTS idx_invlines_inv ON invoice_lines(invoice_id);
CREATE TABLE IF NOT EXISTS payments(
  id INTEGER PRIMARY KEY,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  method TEXT NOT NULL CHECK(method IN('cash','card','bank_transfer','upi','cheque')),
  amount REAL NOT NULL CHECK(amount>0),
  payment_date TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  recorded_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_pay_invoice ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pay_date ON payments(payment_date);
