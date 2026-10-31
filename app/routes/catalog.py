from flask import Blueprint, jsonify, request
from .. import repositories as R
from ..security import auth_required
from ..services import catalog as svc
from . import body, paging

bp = Blueprint("catalog", __name__, url_prefix="/api")
INTERNAL = ("admin", "staff")


def _s():
    return request.args.get("q", "")


def _active():
    return request.args.get("active") == "1"


# products (admin writes, staff reads)
@bp.get("/products")
@auth_required(*INTERNAL)
def products():
    return jsonify(svc.list_products(_s(), *paging(), _active()))


@bp.post("/products")
@auth_required("admin")
def product_create():
    return jsonify(svc.save_product(body())), 201


@bp.put("/products/<int:i>")
@auth_required("admin")
def product_update(i):
    return jsonify(svc.save_product(body(), i))


@bp.delete("/products/<int:i>")
@auth_required("admin")
def product_archive(i):
    return jsonify(svc.archive(R.products, i, "Product"))


# plans (every signed-in role may read: portal needs plan names)
@bp.get("/plans")
@auth_required()
def plans():
    return jsonify(svc.list_plans(_s(), *paging(), _active()))


@bp.post("/plans")
@auth_required("admin")
def plan_create():
    return jsonify(svc.save_plan(body())), 201


@bp.put("/plans/<int:i>")
@auth_required("admin")
def plan_update(i):
    return jsonify(svc.save_plan(body(), i))


@bp.delete("/plans/<int:i>")
@auth_required("admin")
def plan_archive(i):
    return jsonify(svc.archive(R.plans, i, "Plan"))


# taxes
@bp.get("/taxes")
@auth_required(*INTERNAL)
def taxes():
    return jsonify(svc.list_taxes(_s(), *paging(), _active()))


@bp.post("/taxes")
@auth_required("admin")
def tax_create():
    return jsonify(svc.save_tax(body())), 201


@bp.put("/taxes/<int:i>")
@auth_required("admin")
def tax_update(i):
    return jsonify(svc.save_tax(body(), i))


@bp.delete("/taxes/<int:i>")
@auth_required("admin")
def tax_archive(i):
    return jsonify(svc.archive(R.taxes, i, "Tax"))


# discounts: ONLY the admin can create/modify
@bp.get("/discounts")
@auth_required(*INTERNAL)
def discounts():
    return jsonify(svc.list_discounts(_s(), *paging()))


@bp.post("/discounts")
@auth_required("admin")
def discount_create():
    return jsonify(svc.save_discount(body())), 201


@bp.put("/discounts/<int:i>")
@auth_required("admin")
def discount_update(i):
    return jsonify(svc.save_discount(body(), i))


@bp.delete("/discounts/<int:i>")
@auth_required("admin")
def discount_archive(i):
    return jsonify(svc.archive(R.discounts, i, "Discount"))


# quotation templates
@bp.get("/templates")
@auth_required(*INTERNAL)
def templates():
    return jsonify(svc.list_templates(_s(), *paging(), _active()))


@bp.post("/templates")
@auth_required(*INTERNAL)
def template_create():
    return jsonify(svc.save_template(body())), 201


@bp.put("/templates/<int:i>")
@auth_required(*INTERNAL)
def template_update(i):
    return jsonify(svc.save_template(body(), i))


@bp.delete("/templates/<int:i>")
@auth_required(*INTERNAL)
def template_archive(i):
    return jsonify(svc.archive(R.templates, i, "Template"))
