from flask import Blueprint, g, jsonify, request
from .. import repositories as R
from ..db import paginate
from ..errors import ApiError
from ..security import auth_required, my_customer_id
from ..validators import Validator
from . import body, paging

bp = Blueprint("customers", __name__, url_prefix="/api")


def _validate(data):
    return (Validator(data).text("name", max_len=100).email("email").text("phone", False, 30)
            .text("company", False, 120).text("address", False, 300).done())


@bp.get("/customers")
@auth_required("admin", "staff")
def list_customers():
    page, per = paging()
    s = f"%{request.args.get('q', '').strip()}%"
    return jsonify(paginate("SELECT * FROM customers WHERE name LIKE ? OR email LIKE ? OR company LIKE ? ORDER BY name",
                            "SELECT COUNT(*) n FROM customers WHERE name LIKE ? OR email LIKE ? OR company LIKE ?", (s, s, s), page, per))


@bp.post("/customers")
@auth_required("admin", "staff")
def create_customer():
    return jsonify(R.customers.get(R.customers.insert(_validate(body())))), 201


@bp.put("/customers/<int:i>")
@auth_required("admin", "staff")
def update_customer(i):
    if not R.customers.get(i):
        raise ApiError("Customer not found", 404)
    R.customers.update(i, _validate(body()))
    return jsonify(R.customers.get(i))


@bp.get("/me/profile")
@auth_required("customer")
def my_profile():
    return jsonify(R.customers.get(my_customer_id()))


@bp.put("/me/profile")
@auth_required("customer")
def update_my_profile():
    cid = my_customer_id()
    d = Validator(body()).text("name", max_len=100).text("phone", False, 30).text("company", False, 120).text("address", False, 300).done()
    R.customers.update(cid, d)
    return jsonify(R.customers.get(cid))
