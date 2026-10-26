# Backend container, portable between Render and Northflank. Built by the `docker-build` job in ci.yml.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Dependencies first so the layer is cached until requirements.lock changes.
COPY requirements.lock ./
RUN pip install -r requirements.lock

# app.migrate finds migrations/ next to app/, so both are copied and the app runs from /app.
COPY app ./app
COPY migrations ./migrations

RUN useradd --system --no-create-home appuser
USER appuser

EXPOSE 8000
# Migrations are idempotent (tracked in the `migrations` collection). The platform sets PORT.
CMD ["sh", "-c", "python -m app.migrate && exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
