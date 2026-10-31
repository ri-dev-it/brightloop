# syntax=docker/dockerfile:1
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000 \
    HOST=0.0.0.0 \
    DATABASE=/app/data/brightloop.db

WORKDIR /app

# Dependencies first: this layer is cached until requirements change.
COPY requirements.txt requirements-prod.txt ./
RUN pip install -r requirements-prod.txt

COPY . .

# Run as an unprivileged user; /app/data is the only writable location (mount a volume here).
RUN useradd --system --uid 10001 --no-create-home brightloop \
    && mkdir -p /app/data && chown -R brightloop /app/data \
    && chmod +x docker/entrypoint.sh
USER brightloop
VOLUME ["/app/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import os,urllib.request as u; u.urlopen('http://127.0.0.1:%s/healthz' % os.environ.get('PORT','8000'), timeout=4)"

ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["gunicorn", "run:app", "-c", "gunicorn.conf.py"]
