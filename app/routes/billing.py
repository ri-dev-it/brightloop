from flask import Blueprint, Response, g, jsonify, request
from ..security import auth_required, my_customer_id
from ..services import billing as svc
from ..validators import Validator
from . import body, paging

bp = Blueprint("billing", __name__, url_prefix="/api")
INTERNAL = ("admin", "staff")


@bp.post("/billing/run")
@auth_required(*INTERNAL)
def run():
    d = Validator(body()).date("as_of", False).flag("auto_confirm").done()
    return jsonify(svc.run_billing(d["as_of"], bool(d["auto_confirm"])))


@bp.get("/invoices")
@auth_required()
def invoices():
    return jsonify(svc.list_invoices(request.args, *paging(), customer_id=my_customer_id()))


@bp.get("/invoices/<int:i>")
@auth_required()
def invoice(i):
    return jsonify(svc.get_invoice(i, my_customer_id()))


@bp.post("/invoices/<int:i>/confirm")
@auth_required(*INTERNAL)
def confirm(i):
    return jsonify(svc.confirm(i))


@bp.post("/invoices/<int:i>/cancel")
@auth_required(*INTERNAL)
def cancel(i):
    return jsonify(svc.cancel(i))


@bp.post("/invoices/<int:i>/send")
@auth_required(*INTERNAL)
def send(i):
    return jsonify(svc.send(i))


@bp.get("/invoices/<int:i>/print")
@auth_required()
def print_(i):
    return Response(svc.render_print(i, my_customer_id()), mimetype="text/html")


@bp.post("/invoices/<int:i>/payments")
@auth_required(*INTERNAL)
def pay(i):
    return jsonify(svc.record_payment(i, body(), g.user["id"])), 201


@bp.get("/payments")
@auth_required(*INTERNAL)
def payments():
    return jsonify(svc.list_payments(request.args, *paging()))
