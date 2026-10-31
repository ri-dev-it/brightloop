from flask import current_app
from .. import repositories as R
from ..db import q, q1, paginate
from ..errors import ApiError
from ..security import hash_password, issue, password_error, read, verify_password
from ..validators import Validator
from . import mailer


def public(u):
    return {k: u[k] for k in ("id", "name", "email", "role")}


def _email_taken(email):
    return q1("SELECT id FROM users WHERE email=?", (email,)) is not None


def signup(data):
    v = Validator(data).text("name", max_len=80).email("email").text("company", False, 120)
    pw = (data or {}).get("password")
    err = password_error(pw)
    if err:
        v.error("password", err)
    d = v.done()
    if _email_taken(d["email"]):
        raise ApiError("Please fix the highlighted fields", 422, {"email": "This email is already registered"})
    uid = R.users.insert(dict(name=d["name"], email=d["email"], password_hash=hash_password(pw), role="customer", active=1))
    R.customers.insert(dict(user_id=uid, name=d["name"], email=d["email"], company=d["company"]))
    return {"token": issue(uid), "user": public(R.users.get(uid))}


def login(data):
    email = str((data or {}).get("email", "")).strip().lower()
    pw = (data or {}).get("password") or ""
    u = q1("SELECT * FROM users WHERE email=?", (email,))
    if not u or not u["active"] or not verify_password(u["password_hash"], pw):
        raise ApiError("Invalid email or password", 401)
    return {"token": issue(u["id"]), "user": public(u)}


def forgot_password(data):
    email = str((data or {}).get("email", "")).strip().lower()
    u = q1("SELECT * FROM users WHERE email=?", (email,))
    out = {"message": "If that email is registered, a reset link is on its way."}
    if u and u["active"]:
        token = issue({"id": u["id"], "h": u["password_hash"][-10:]}, salt="reset")
        link = f"{current_app.config['FRONTEND_URL']}/#/reset?token={token}"
        mailer.get_mailer().send(u["email"], "Reset your Brightloop password",
                                 f"Hi {u['name']},\n\nUse this link to choose a new password (valid 1 hour):\n{link}\n")
        if mailer.is_console():  # dev convenience only; never enabled with SMTP
            out["dev_reset_link"] = link
    return out


def reset_password(data):
    token, pw = (data or {}).get("token", ""), (data or {}).get("password")
    err = password_error(pw)
    if err:
        raise ApiError("Please fix the highlighted fields", 422, {"password": err})
    p = read(token, salt="reset", max_age=current_app.config["RESET_MAX_AGE"])
    u = R.users.get(p["id"]) if p else None
    if not u or u["password_hash"][-10:] != p["h"]:
        raise ApiError("This reset link is invalid or has expired. Request a new one.", 400)
    R.users.update(u["id"], {"password_hash": hash_password(pw)})
    return {"message": "Password updated. You can sign in now."}


def create_staff(data):
    v = Validator(data).text("name", max_len=80).email("email")
    pw = (data or {}).get("password")
    err = password_error(pw)
    if err:
        v.error("password", err)
    d = v.done()
    if _email_taken(d["email"]):
        raise ApiError("Please fix the highlighted fields", 422, {"email": "This email is already registered"})
    uid = R.users.insert(dict(name=d["name"], email=d["email"], password_hash=hash_password(pw), role="staff", active=1))
    return public(R.users.get(uid))


def list_team(page, per):
    return paginate("SELECT id,name,email,role,active,created_at FROM users WHERE role IN('admin','staff') ORDER BY role,name",
                    "SELECT COUNT(*) n FROM users WHERE role IN('admin','staff')", (), page, per)


def set_active(uid, active, actor_id):
    u = R.users.get(uid)
    if not u or u["role"] == "customer":
        raise ApiError("Team member not found", 404)
    if u["id"] == actor_id:
        raise ApiError("You cannot deactivate your own account", 400)
    R.users.update(uid, {"active": 1 if active else 0})
    return {"id": uid, "active": 1 if active else 0}
