"""One error shape for the whole API (spec 9.1).

{"error": {"code": "...", "message": "...", "fields": {"name": "message"}}}
Stack traces are never returned.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

log = logging.getLogger("app.errors")

_STATUS_TO_CODE = {
    401: "unauthorised",
    403: "forbidden",
    404: "not_found",
    409: "conflict",
    422: "validation_error",
    429: "rate_limited",
}


class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int,
        fields: dict[str, str] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.fields = fields
        self.headers = headers


class Unauthorised(AppError):
    def __init__(self, message: str = "Please sign in.") -> None:
        super().__init__("unauthorised", message, 401, headers={"WWW-Authenticate": "Bearer"})


class Forbidden(AppError):
    def __init__(self, message: str = "You do not have access to this.") -> None:
        super().__init__("forbidden", message, 403)


class NotFound(AppError):
    def __init__(self, message: str = "Not found.") -> None:
        super().__init__("not_found", message, 404)


class Conflict(AppError):
    def __init__(self, message: str, fields: dict[str, str] | None = None) -> None:
        super().__init__("conflict", message, 409, fields)


class ValidationFailed(AppError):
    def __init__(self, message: str, fields: dict[str, str] | None = None) -> None:
        super().__init__("validation_error", message, 422, fields)


class RateLimited(AppError):
    def __init__(self, retry_after: int) -> None:
        super().__init__(
            "rate_limited",
            "Too many attempts. Please try again later.",
            429,
            headers={"Retry-After": str(retry_after)},
        )


def error_body(code: str, message: str, fields: dict[str, str] | None = None) -> dict:
    body: dict = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    return {"error": body}


def _field_name(loc: tuple) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(parts) or "request"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(_: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            error_body(exc.code, exc.message, exc.fields),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(_: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for err in exc.errors():
            fields.setdefault(_field_name(tuple(err["loc"])), str(err["msg"]))
        return JSONResponse(
            error_body("validation_error", "Please check the highlighted fields.", fields),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(_: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_TO_CODE.get(exc.status_code, "server_error")
        message = "Not found." if exc.status_code == 404 else "Request failed."
        return JSONResponse(
            error_body(code, message), status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(Exception)
    async def _unhandled(_: Request, exc: Exception) -> JSONResponse:
        log.error("unhandled error", exc_info=exc)
        return JSONResponse(
            error_body("server_error", "Something went wrong on our side."), status_code=500
        )
