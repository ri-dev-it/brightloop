import sqlite3
from flask import jsonify
from werkzeug.exceptions import HTTPException


class ApiError(Exception):
    def __init__(self, message, status=400, errors=None):
        super().__init__(message)
        self.message, self.status, self.errors = message, status, errors or {}


def register_errors(app):
    @app.errorhandler(ApiError)
    def api_error(e):
        return jsonify(error=e.message, errors=e.errors), e.status

    @app.errorhandler(sqlite3.IntegrityError)
    def integrity(e):
        return jsonify(error="That change conflicts with existing data.", errors={}), 409

    @app.errorhandler(HTTPException)
    def http_error(e):
        return jsonify(error=e.description, errors={}), e.code
