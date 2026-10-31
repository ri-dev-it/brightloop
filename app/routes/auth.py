from flask import Blueprint, g, jsonify
from ..security import auth_required
from ..services import auth as svc
from . import body, paging

bp = Blueprint("auth", __name__, url_prefix="/api")


@bp.post("/auth/signup")
def signup():
    return jsonify(svc.signup(body())), 201


@bp.post("/auth/login")
def login():
    return jsonify(svc.login(body()))


@bp.post("/auth/forgot-password")
def forgot():
    return jsonify(svc.forgot_password(body()))


@bp.post("/auth/reset-password")
def reset():
    return jsonify(svc.reset_password(body()))


@bp.get("/auth/me")
@auth_required()
def me():
    return jsonify(user=svc.public(g.user))


# Team management: admin only (only the admin can add staff)
@bp.get("/users")
@auth_required("admin")
def team():
    return jsonify(svc.list_team(*paging()))


@bp.post("/users")
@auth_required("admin")
def add_staff():
    return jsonify(svc.create_staff(body())), 201


@bp.patch("/users/<int:uid>")
@auth_required("admin")
def toggle(uid):
    return jsonify(svc.set_active(uid, bool(body().get("active")), g.user["id"]))
