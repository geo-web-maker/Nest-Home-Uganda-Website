import logging
import uuid
import time
from collections import OrderedDict
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core import db, site_rebuild
from app.core.config import get_settings
from app.core.errors import error_body, install_error_handlers
from app.core.rate_limit import client_ip, rate_limit
from app.core.security import hash_ip
from app.jobs import build_scheduler
from app.migrate import run_mongo_migrations
from app.modules.mail import db as mail_db
from app.registry import API_PREFIX, CARE_DOCUMENT_MODELS, DOCUMENT_MODELS, ROUTERS

_AUDIT_SAMPLE: OrderedDict[str, float] = OrderedDict()
_AUDIT_SAMPLE_WINDOW = 60.0
_AUDIT_SAMPLE_MAX = 20_000
_LAST_AUDIT_THROTTLE_CLEANUP = 0.0


def _local_should_audit_4xx(request: Request, status: int) -> bool:
    # Ordinary 404 probes and anonymous 401 scanner traffic are not durable audit events.
    # Keep one event per route/status/IP/minute for repeated authenticated client failures.
    if status == 404:
        return False
    principal = getattr(request.state, "principal", None)
    if status == 401 and principal is None:
        return False
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    key = f"{request.method}:{path}:{status}:{hash_ip(client_ip(request))}"
    now = time.monotonic()
    last = _AUDIT_SAMPLE.get(key)
    if last is not None and now - last < _AUDIT_SAMPLE_WINDOW:
        return False
    _AUDIT_SAMPLE[key] = now
    _AUDIT_SAMPLE.move_to_end(key)
    while len(_AUDIT_SAMPLE) > _AUDIT_SAMPLE_MAX:
        _AUDIT_SAMPLE.popitem(last=False)
    return True


async def _should_audit_4xx(request: Request, status: int) -> bool:
    """Sample repeated 4xx events once per route/status/IP/minute.

    PostgreSQL provides a cross-worker throttle when mail DB is configured; the
    bounded local sampler is a fail-safe fallback for deployments without it.
    """
    if status == 404:
        return False
    principal = getattr(request.state, "principal", None)
    if status == 401 and principal is None:
        return False
    route = request.scope.get("route")
    path = getattr(route, "path", request.url.path)
    source = f"{request.method}:{path}:{status}:{hash_ip(client_ip(request))}"
    key = __import__("hashlib").sha256(source.encode()).hexdigest()
    try:
        pool = mail_db.get_pool()
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                "INSERT INTO security_rate_limit(bucket_key,window_start,hits) "
                "VALUES($1,to_timestamp(floor(extract(epoch from now())/60)*60),1) "
                "ON CONFLICT(bucket_key) DO UPDATE SET "
                "hits=CASE WHEN security_rate_limit.window_start=EXCLUDED.window_start "
                "THEN security_rate_limit.hits+1 ELSE 1 END, "
                "window_start=EXCLUDED.window_start RETURNING hits",
                f"api4xx:{key}",
            )
            global _LAST_AUDIT_THROTTLE_CLEANUP
            now = time.monotonic()
            if now - _LAST_AUDIT_THROTTLE_CLEANUP > 300:
                _LAST_AUDIT_THROTTLE_CLEANUP = now
                await conn.execute(
                    "DELETE FROM security_rate_limit WHERE window_start < now()-interval '2 days'"
                )
            return int(row["hits"]) == 1
    except Exception:
        # A missing/unavailable optional mail DB must not prevent API responses.
        return _local_should_audit_4xx(request, status)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    scheduler = None
    try:
        if settings.mongodb_uri:
            main_ran, care_ran = await run_mongo_migrations(settings)
            logging.getLogger("app.migrations").info(
                "MongoDB migrations complete (main=%s, care=%s)",
                ",".join(main_ran) or "current",
                ",".join(care_ran) or "current",
            )
            await db.connect(
                settings.mongodb_uri,
                settings.mongodb_db,
                DOCUMENT_MODELS,
                care_uri=settings.care_mongodb_uri or settings.mongodb_uri,
                care_db_name=settings.care_mongodb_db,
                care_models=CARE_DOCUMENT_MODELS,
            )
        if settings.nest_pg_url:
            try:
                await mail_db.connect(settings.nest_pg_url)
            except Exception:
                if settings.mail_migrations_required:
                    logging.getLogger("app.mail.db").exception(
                        "required mail database startup/migration failed; refusing to start"
                    )
                    raise
                # Mail is optional unless deployment explicitly requires it. Keep the main
                # Mongo-backed application available and let /health retry the connection.
                logging.getLogger("app.mail.db").warning(
                    "mail database is unavailable at startup; mail endpoints will remain unavailable"
                )
        if settings.mongodb_uri and settings.scheduler_enabled:
            scheduler = build_scheduler()
            scheduler.start()
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)
        await mail_db.close()
        await db.disconnect()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Bloomwell Home Care Uganda API",
        version="0.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.is_development else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if settings.is_development else None,
    )
    install_error_handlers(app)

    @app.middleware("http")
    async def request_diagnostics(request: Request, call_next):
        supplied = request.headers.get("X-Request-ID", "").strip()
        request_id = supplied[:80] if supplied and all(c.isalnum() or c in "-_." for c in supplied) else uuid.uuid4().hex
        request.state.request_id = request_id
        from app.modules.audit.service import set_request_id, reset_request_id
        context_token = set_request_id(request_id)
        try:
            response = await call_next(request)
        except Exception as exc:
            # This path is essential: exception handlers / outer CORS middleware can
            # transform the exception only after this middleware unwinds.
            try:
                from app.modules.audit.service import record_system_event
                principal = getattr(request.state, "principal", None)
                route = request.scope.get("route")
                safe_path = getattr(route, "path", request.url.path)
                await record_system_event(
                    action="api.unhandled_exception",
                    message="An unhandled API exception occurred. Inspect protected server logs using its request ID.",
                    severity="critical", source="api", request_id=request_id,
                    endpoint=f"{request.method} {safe_path}", http_status=500,
                    user_id=getattr(principal, "user_id", None),
                    details={"exception_type": type(exc).__name__, "method": request.method, "route": safe_path},
                    event_type="error",
                )
            except Exception:
                logging.getLogger("app.audit").exception("could not persist unhandled API exception request_id=%s", request_id)
            raise
        finally:
            reset_request_id(context_token)
        response.headers["X-Request-ID"] = request_id
        should_record_failure = False
        if request.url.path.startswith(API_PREFIX):
            if response.status_code >= 500:
                should_record_failure = True
            elif 400 <= response.status_code < 500:
                should_record_failure = await _should_audit_4xx(request, response.status_code)
        if response.status_code >= 400 and should_record_failure:
            try:
                from app.modules.audit.service import record_system_event

                principal = getattr(request.state, "principal", None)
                status = response.status_code
                severity = "critical" if status >= 500 else "warning"
                action = "api.server_error" if status >= 500 else "api.request_rejected"
                message = (
                    "The API request failed unexpectedly. Use the request ID to find the matching server diagnostic."
                    if status >= 500
                    else "The API rejected the request. Review authentication, permissions, request size or rate limits."
                )
                route = request.scope.get("route")
                safe_path = getattr(route, "path", request.url.path)
                await record_system_event(
                    action=action,
                    message=message,
                    severity=severity,
                    source="api",
                    request_id=request_id,
                    endpoint=f"{request.method} {safe_path}",
                    http_status=status,
                    user_id=getattr(principal, "user_id", None),
                    details={"method": request.method, "route": safe_path},
                    event_type="security" if status in {401, 403} else "error",
                )
            except Exception:
                logging.getLogger("app.audit").exception(
                    "could not persist API failure event request_id=%s", request_id
                )
        return response

    @app.middleware("http")
    async def keep_cors_on_server_errors(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        # Added before CORS so it sits inside it: an unhandled error becomes a JSON 500 that still
        # carries CORS headers. Without this the browser hides it as "Network request failed".
        try:
            return await call_next(request)
        except Exception:
            request_id = getattr(request.state, "request_id", None)
            logging.getLogger("app.request").exception(
                "unhandled error request_id=%s on %s %s", request_id, request.method, request.url.path
            )
            return JSONResponse(
                error_body("server_error", "The server encountered an unexpected error while processing this request.", request_id=request_id),
                status_code=500,
                headers={"X-Request-ID": request_id} if request_id else {},
            )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Client", "X-Device-ID", "X-Request-ID"],
        expose_headers=["X-Request-ID"],
    )

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if API_PREFIX in request.url.path:
            response.headers.setdefault("Cache-Control", "no-store")
        if not settings.is_development:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response

    @app.middleware("http")
    async def rebuild_public_site(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        if site_rebuild.affects_public_site(
            request.method, request.url.path, response.status_code
        ):
            site_rebuild.request_rebuild(settings)
        return response

    api = APIRouter(prefix=API_PREFIX)

    @api.get("/health", tags=["health"])
    async def health() -> JSONResponse:
        # Mail probes run in the background and never make the main health response wait.
        await mail_db.health_hook(settings.nest_pg_url)
        if not settings.mongodb_uri:
            return JSONResponse({"status": "ok", "env": settings.app_env, "database": "off"})
        if await db.ping() and await db.ping_care():
            return JSONResponse(
                {"status": "ok", "env": settings.app_env, "database": "ok", "care_database": "ok"}
            )
        return JSONResponse(
            {
                "status": "degraded",
                "env": settings.app_env,
                "database": "down",
                "care_database": "down",
            },
            status_code=503,
        )

    class ClientErrorPayload(BaseModel):
        name: str = Field(default="ClientError", max_length=120)
        message: str = Field(min_length=1, max_length=800)
        stack: str | None = Field(default=None, max_length=6000)
        source: str = Field(default="frontend", max_length=40)
        route: str | None = Field(default=None, max_length=300)
        user_agent: str | None = Field(default=None, max_length=500)

    @api.post("/client-errors", status_code=202, dependencies=[Depends(rate_limit("client_error", 10, 60))])
    async def receive_client_error(payload: ClientErrorPayload, request: Request):
        import re
        from app.modules.audit.service import record_system_event
        def scrub(value: str | None, maximum: int) -> str | None:
            if not value:
                return None
            value = re.sub(r"(?i)(authorization|cookie|token|password|secret|api[_-]?key)[:=]\s*[^\s&;]+", r"\1=[redacted]", value)
            value = re.sub(r"(?i)\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]+", r"\1 [redacted]", value)
            value = re.sub(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", "[email]", value)
            return value[:maximum]
        await record_system_event(
            action="frontend.unhandled_error", message=scrub(payload.message, 800) or "Client error",
            severity="error", source="frontend", request_id=getattr(request.state, "request_id", None),
            endpoint=scrub(payload.route, 300), http_status=None, details={
                "name": scrub(payload.name, 120), "stack": scrub(payload.stack, 6000),
                "user_agent": scrub(payload.user_agent, 500), "error_source": scrub(payload.source, 40),
            }, event_type="error",
        )
        return {"accepted": True}

    for router in ROUTERS:
        api.include_router(router)
    app.include_router(api)
    return app


app = create_app()
