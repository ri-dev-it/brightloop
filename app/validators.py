"""Small, dependency-free input validation. Collects every error, then raises once."""
import re
from datetime import datetime
from .errors import ApiError

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class Validator:
    def __init__(self, data):
        self.d = data if isinstance(data, dict) else {}
        self.errors, self.out = {}, {}

    def error(self, field, msg):
        self.errors.setdefault(field, msg)
        return self

    def _blank(self, f):
        v = self.d.get(f)
        return v is None or (isinstance(v, str) and v.strip() == "")

    def text(self, f, required=True, max_len=200, default=""):
        if self._blank(f):
            if required:
                self.error(f, "This field is required")
            self.out[f] = default
            return self
        v = str(self.d[f]).strip()
        if len(v) > max_len:
            self.error(f, f"Keep this under {max_len} characters")
        self.out[f] = v
        return self

    def email(self, f, required=True):
        self.text(f, required, 254)
        v = self.out.get(f, "")
        if v and not EMAIL_RE.match(v):
            self.error(f, "Enter a valid email address")
        self.out[f] = v.lower()
        return self

    def number(self, f, required=True, min_v=None, max_v=None, integer=False, default=None):
        if self._blank(f):
            if required:
                self.error(f, "This field is required")
            self.out[f] = default
            return self
        try:
            n = float(self.d[f])
            if n != n or n in (float("inf"), float("-inf")):
                raise ValueError
        except (TypeError, ValueError):
            self.error(f, "Enter a number")
            self.out[f] = default
            return self
        if integer:
            if n != int(n):
                self.error(f, "Enter a whole number")
            n = int(n)
        if min_v is not None and n < min_v:
            self.error(f, f"Must be at least {min_v}")
        if max_v is not None and n > max_v:
            self.error(f, f"Must be at most {max_v}")
        self.out[f] = n
        return self

    def date(self, f, required=True, default=None):
        if self._blank(f):
            if required:
                self.error(f, "Pick a date")
            self.out[f] = default
            return self
        try:
            datetime.strptime(str(self.d[f]), "%Y-%m-%d")
            self.out[f] = str(self.d[f])
        except ValueError:
            self.error(f, "Use the format YYYY-MM-DD")
            self.out[f] = default
        return self

    def choice(self, f, choices, required=True, default=None):
        if self._blank(f):
            if required:
                self.error(f, "Choose an option")
            self.out[f] = default
            return self
        v = str(self.d[f])
        if v not in choices:
            self.error(f, "Choose a valid option")
        self.out[f] = v
        return self

    def flag(self, f, default=False):
        v = self.d.get(f, default)
        self.out[f] = 1 if v in (True, 1, "1", "true", "on") else 0
        return self

    def done(self):
        if self.errors:
            raise ApiError("Please fix the highlighted fields", 422, self.errors)
        return self.out


def page_args(args):
    try:
        page = max(1, int(args.get("page", 1)))
        per = min(100, max(1, int(args.get("per_page", 10))))
    except ValueError:
        page, per = 1, 10
    return page, per
