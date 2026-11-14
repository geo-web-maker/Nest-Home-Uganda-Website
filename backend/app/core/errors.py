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


class TotpRequired(Forbidden):
    """403 with a stable code so the web app can open the authenticator prompt instead of showing an error."""

    def __init__(self, message: str = "Verify your authenticator code to continue.") -> None:
        super().__init__(message)
        self.code = "totp_required"


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


def error_body(code: str, message: str, fields: dict[str, str] | None = None, request_id: str | None = None) -> dict:
    body: dict = {"code": code, "message": message}
    if fields:
        body["fields"] = fields
    if request_id:
        body["request_id"] = request_id
    return {"error": body}


def _field_name(loc: tuple) -> str:
    parts = [str(p) for p in loc if p not in ("body", "query", "path")]
    return ".".join(parts) or "request"


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(
            error_body(exc.code, exc.message, exc.fields, getattr(request.state, "request_id", None)),
            status_code=exc.status_code,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation(request: Request, exc: RequestValidationError) -> JSONResponse:
        fields: dict[str, str] = {}
        for err in exc.errors():
            fields.setdefault(_field_name(tuple(err["loc"])), str(err["msg"]))
        return JSONResponse(
            error_body("validation_error", "Please check the highlighted fields.", fields, getattr(request.state, "request_id", None)),
            status_code=422,
        )

    @app.exception_handler(StarletteHTTPException)
    async def _http(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _STATUS_TO_CODE.get(exc.status_code, "http_error")
        # FastAPI route handlers often provide actionable, intentionally public details.
        # Preserve those instead of replacing every 4xx/5xx with "Request failed".
        detail = exc.detail
        message = detail if isinstance(detail, str) and detail.strip() else {
            400: "The request was rejected. Check the submitted values.",
            401: "Your session is missing or expired. Sign in again.",
            403: "Your account is not permitted to perform this action.",
            404: f"The requested resource was not found: {request.method} {request.url.path}",
            405: f"The {request.method} method is not supported for this endpoint.",
            408: "The request timed out before the server completed it.",
            413: "The uploaded file is larger than the server allows.",
            415: "The request content type is not supported by this endpoint.",
            429: "Too many requests. Wait before trying again.",
        }.get(exc.status_code, f"The server rejected {request.method} {request.url.path} (HTTP {exc.status_code}).")
        return JSONResponse(
            error_body(code, message, request_id=getattr(request.state, "request_id", None)), status_code=exc.status_code, headers=exc.headers
        )

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        request_id = getattr(request.state, "request_id", None)
        log.error("unhandled error request_id=%s on %s %s", request_id, request.method, request.url.path, exc_info=(type(exc), exc, exc.__traceback__))
        # Never expose exception text/credentials to clients; the request ID joins this
        # safe response to the full traceback in server logs.
        body = error_body("server_error", "The server encountered an unexpected error while processing this request.", request_id=request_id)
        return JSONResponse(body, status_code=500)
