import os
from flask import Flask, request
from . import db
from .config import Config
from .errors import register_errors


def create_app(overrides=None):
    app = Flask(__name__, static_folder=os.path.join(Config.BASE, "frontend"), static_url_path="")
    app.config.from_object(Config)
    app.config.update(overrides or {})
    db.init_app(app)
    register_errors(app)
    from .routes import register_routes
    register_routes(app)

    @app.get("/")
    def index():
        return app.send_static_file("index.html")

    @app.get("/healthz")
    def healthz():
        db.q1("SELECT 1 AS ok")  # fails (500) if the database is unreachable
        return {"status": "ok"}

    @app.after_request
    def security_headers(resp):
        origin = request.headers.get("Origin")
        if origin in app.config.get("CORS_ORIGINS", ()):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Access-Control-Allow-Headers"] = "Authorization, Content-Type"
            resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS"
            resp.headers["Vary"] = "Origin"
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "DENY")
        resp.headers.setdefault("Referrer-Policy", "same-origin")
        if resp.mimetype == "application/json":
            resp.headers.setdefault("Cache-Control", "no-store")
        return resp

    with app.app_context():
        db.init_db()
        if app.config["SEED_DEMO"]:
            from .seed import seed_if_empty
            seed_if_empty()
    return app
