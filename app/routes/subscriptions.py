from flask import Blueprint, g, jsonify, request
from ..security import auth_required, my_customer_id
from ..services import subscriptions as svc
from . import body, paging

bp = Blueprint("subscriptions", __name__, url_prefix="/api/subscriptions")


@bp.get("")
@auth_required()
def list_():
    return jsonify(svc.list_subs(request.args, *paging(), customer_id=my_customer_id()))


@bp.post("")
@auth_required("admin", "staff")
def create():
    return jsonify(svc.create(body(), g.user["id"])), 201


@bp.get("/<int:i>")
@auth_required()
def get(i):
    return jsonify(svc.get(i, my_customer_id()))


@bp.put("/<int:i>")
@auth_required("admin", "staff")
def update(i):
    return jsonify(svc.update(i, body()))


@bp.post("/<int:i>/actions/<action>")
@auth_required()
def action(i, action):
    return jsonify(svc.act(i, action, my_customer_id()))
