"""SQLite access. One connection per request; committed on success, rolled back on error."""
import os
import sqlite3
from flask import current_app, g

SCHEMA = os.path.join(os.path.dirname(__file__), "schema.sql")


def get_db():
    if "db" not in g:
        path = current_app.config["DATABASE"]
        if path != ":memory:":
            os.makedirs(os.path.dirname(path), exist_ok=True)
        conn = sqlite3.connect(path, timeout=15)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA synchronous=NORMAL")
        g.db = conn
    return g.db


def init_app(app):
    @app.teardown_appcontext
    def close(_=None):
        conn = g.pop("db", None)
        if conn is not None:
            conn.close()  # uncommitted work is rolled back

    @app.after_request
    def commit(resp):
        if "db" in g and resp.status_code < 400:
            g.db.commit()
        return resp


def init_db():
    with open(SCHEMA, encoding="utf-8") as f:
        get_db().executescript(f.read())


def commit():
    """Explicit commit for work done outside an HTTP request (CLI jobs, scripts)."""
    if "db" in g:
        g.db.commit()


def q(sql, args=()):
    return [dict(r) for r in get_db().execute(sql, args).fetchall()]


def q1(sql, args=()):
    r = get_db().execute(sql, args).fetchone()
    return dict(r) if r else None


def run(sql, args=()):
    return get_db().execute(sql, args).lastrowid


def execute(sql, args=()):
    return get_db().execute(sql, args).rowcount


def paginate(select, count, args, page, per):
    total = q1(count, args)["n"]
    items = q(select + " LIMIT ? OFFSET ?", (*args, per, (page - 1) * per))
    return {"items": items, "total": total, "page": page, "per_page": per}
