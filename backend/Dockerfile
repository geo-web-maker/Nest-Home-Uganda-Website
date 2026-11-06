# Backend container, portable between Render and Northflank. Built by the `docker-build` job in ci.yml.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# WeasyPrint needs the Pango/Cairo runtime to create selectable vector PDFs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b libffi8 shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Dependencies first so the layer is cached until requirements.lock changes.
COPY requirements.lock ./
RUN pip install -r requirements.lock

# Mongo and mail migrations are copied beside the app so both runners work in the image.
COPY app ./app
COPY migrations ./migrations
COPY mail_migrations ./mail_migrations

RUN useradd --system --no-create-home appuser
USER appuser

EXPOSE 8000
# FastAPI lifespan applies MongoDB and configured mail SQL migrations before accepting
# traffic. Keeping this in the app lifecycle also covers platforms that override CMD.
# The platform sets PORT.
CMD ["sh", "-c", "exec python -m uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
