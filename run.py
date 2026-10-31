"""Entry point.

    python run.py              start the development server
    python run.py billing      run the daily billing job (cron / Task Scheduler)
    python run.py bulk 5000    load-test data (N subscriptions)
"""
import os
import sys

from app import create_app
from app.db import commit

app = create_app()  # also what gunicorn imports:  gunicorn run:app


def main(argv):
    cmd = argv[1] if len(argv) > 1 else "serve"
    if cmd == "billing":
        from app.services import billing
        with app.app_context():
            result = billing.run_billing(auto_confirm=True)
            commit()  # no HTTP request here, so nothing else would persist the work
        print(result)
    elif cmd == "bulk":
        from scripts.bulk import bulk
        bulk(app, int(argv[2]) if len(argv) > 2 else 5000)
    elif cmd == "serve":
        app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", 5000)),
                debug=os.environ.get("DEBUG") == "1")
    else:
        sys.exit(f"Unknown command '{cmd}'. Use: serve | billing | bulk N")


if __name__ == "__main__":
    main(sys.argv)
