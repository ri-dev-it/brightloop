from flask import Blueprint, jsonify, request
from ..security import auth_required
from ..services import reports as svc
from ..validators import Validator

bp = Blueprint("reports", __name__, url_prefix="/api/reports")


@bp.get("/dashboard")
@auth_required("admin", "staff")
def dashboard():
    d = Validator(request.args.to_dict()).date("date_from", False).date("date_to", False).done()
    return jsonify(svc.dashboard(d["date_from"], d["date_to"]))
