from fastapi import Response

from app.modules.agreements import service


def _cookie(root_path: str) -> str:
    response = Response()
    service.session_cookie("tok", response, root_path)
    return response.headers["set-cookie"]


def test_session_cookie_path_is_the_plain_api_path_by_default():
    assert "Path=/api/v1/public/agreements" in _cookie("")


def test_session_cookie_path_includes_the_mount_prefix():
    # Hosted under the multi-site mounter the API lives at /nest/api/v1/...; a cookie scoped to
    # /api/v1/... would never be sent back and signing would fail after the OTP step.
    assert "Path=/nest/api/v1/public/agreements" in _cookie("/nest")
    assert "Path=/nest/api/v1/public/agreements" in _cookie("/nest/")
