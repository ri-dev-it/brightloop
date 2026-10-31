from flask import request
from ..validators import page_args


def paging():
    return page_args(request.args)


def body():
    return request.get_json(silent=True) or {}


def register_routes(app):
    from . import auth, billing, catalog, customers, reports, subscriptions
    for m in (auth, catalog, customers, subscriptions, billing, reports):
        app.register_blueprint(m.bp)
