from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient

from app.core.errors import install_error_handlers


def test_http_exception_keeps_actionable_public_detail():
    app = FastAPI()
    install_error_handlers(app)

    @app.get('/attachments/{attachment_id}')
    async def attachment(attachment_id: str):
        raise HTTPException(404, detail=f'Attachment {attachment_id} was not found in this mailbox.')

    response = TestClient(app).get('/attachments/file-123')
    assert response.status_code == 404
    assert response.json()['error']['message'] == 'Attachment file-123 was not found in this mailbox.'


def test_generic_server_error_does_not_leak_exception_secrets():
    app = FastAPI()
    install_error_handlers(app)

    @app.get('/boom')
    async def boom():
        raise RuntimeError('smtp_password=do-not-leak')

    response = TestClient(app, raise_server_exceptions=False).get('/boom')
    assert response.status_code == 500
    assert 'smtp_password' not in response.json()['error']['message']
