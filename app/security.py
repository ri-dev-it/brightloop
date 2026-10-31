import re
from functools import wraps
from flask import current_app, g, request
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from werkzeug.security import check_password_hash, generate_password_hash
from .db import q1
from .errors import ApiError


def hash_password(pw):
    return generate_password_hash(pw)


def verify_password(h, pw):
    return check_password_hash(h, pw)


def password_error(pw):
    """More than 8 chars, an uppercase, a lowercase and a special character."""
    if not isinstance(pw, str) or len(pw) <= 8:
        return "Password must be more than 8 characters"
    if not re.search(r"[A-Z]", pw):
        return "Password needs an uppercase letter"
    if not re.search(r"[a-z]", pw):
        return "Password needs a lowercase letter"
    if not re.search(r"[^A-Za-z0-9]", pw):
        return "Password needs a special character"
    return None


def _ser(salt):
    return URLSafeTimedSerializer(current_app.config["SECRET_KEY"], salt=salt)


def issue(payload, salt="auth"):
    return _ser(salt).dumps(payload)


def read(token, salt="auth", max_age=None):
    max_age = max_age or current_app.config["TOKEN_MAX_AGE"]
    try:
        return _ser(salt).loads(token, max_age=max_age)
    except (BadSignature, SignatureExpired):
        return None


def auth_required(*roles):
    """Authenticates the Bearer token and (optionally) restricts to the given roles."""
    def deco(fn):
        @wraps(fn)
        def wrapper(*a, **kw):
            hdr = request.headers.get("Authorization", "")
            uid = read(hdr[7:]) if hdr.startswith("Bearer ") else None
            if uid is None:
                raise ApiError("Please sign in to continue", 401)
            user = q1("SELECT id,name,email,role,active FROM users WHERE id=?", (uid,))
            if not user or not user["active"]:
                raise ApiError("Please sign in to continue", 401)
            if roles and user["role"] not in roles:
                raise ApiError("You do not have permission to do that", 403)
            g.user = user
            return fn(*a, **kw)
        return wrapper
    return deco


def my_customer_id():
    """For portal users: the customer record they own. None for admin/staff."""
    if g.user["role"] != "customer":
        return None
    row = q1("SELECT id FROM customers WHERE user_id=?", (g.user["id"],))
    if not row:
        raise ApiError("No customer profile is linked to this account", 403)
    return row["id"]
