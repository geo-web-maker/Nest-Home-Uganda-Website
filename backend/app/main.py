import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core import db
from app.core.config import get_settings
from app.core.errors import install_error_handlers
from app.jobs import build_scheduler
from app.registry import API_PREFIX, CARE_DOCUMENT_MODELS, DOCUMENT_MODELS, ROUTERS


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    scheduler = None
    if settings.mongodb_uri:
        await db.connect(
            settings.mongodb_uri,
            settings.mongodb_db,
            DOCUMENT_MODELS,
            care_uri=settings.care_mongodb_uri or settings.mongodb_uri,
            care_db_name=settings.care_mongodb_db,
            care_models=CARE_DOCUMENT_MODELS,
        )
        if settings.scheduler_enabled:
            scheduler = build_scheduler()
            scheduler.start()
    try:
        yield
    finally:
        if scheduler is not None:
            scheduler.shutdown(wait=False)
        await db.disconnect()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Well Nest Home Care Uganda API",
        version="0.0.0",
        lifespan=lifespan,
        docs_url="/docs" if settings.is_development else None,
        redoc_url=None,
        openapi_url=f"{API_PREFIX}/openapi.json" if settings.is_development else None,
    )
    install_error_handlers(app)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-CSRF-Token", "X-Client", "X-Device-ID"],
    )

    @app.middleware("http")
    async def security_headers(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        if request.url.path.startswith(API_PREFIX):
            response.headers.setdefault("Cache-Control", "no-store")
        if not settings.is_development:
            response.headers.setdefault(
                "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
            )
        return response

    api = APIRouter(prefix=API_PREFIX)

    @api.get("/health", tags=["health"])
    async def health() -> JSONResponse:
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

    for router in ROUTERS:
        api.include_router(router)
    app.include_router(api)
    return app


app = create_app()
