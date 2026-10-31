"""Production server settings (used by the Docker image). Override any value with environment variables."""
import os

bind = f"{os.environ.get('HOST', '0.0.0.0')}:{os.environ.get('PORT', '8000')}"
workers = int(os.environ.get("WEB_CONCURRENCY", 2))   # SQLite (WAL) handles several readers + one writer at a time
threads = int(os.environ.get("WEB_THREADS", 4))
timeout = 60
preload_app = True        # build the app (schema + demo seed) once in the master, so workers never race on first start
accesslog = "-"
