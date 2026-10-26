from app.core.config import Settings
from app.core.photo_store import (
    signed_delivery_url,
    temporary_stream_signature,
    upload_signature,
    verify_temporary_stream_signature,
)


def settings():
    return Settings(
        secret_key="test-secret-0123456789",
        cloudinary_cloud_name="sample",
        cloudinary_api_key="key",
        cloudinary_api_secret="secret",
    )


def test_photo_upload_signing_defaults_to_private_and_restricts_folder():
    result = upload_signature(settings(), public_id="photo-12345678", timestamp=1800000000)
    assert result["type"] == "private"
    assert "/image/upload" in result["upload_url"]


def test_photo_delivery_uses_fixed_signed_transformations():
    original = signed_delivery_url(
        settings(), "nest-home-care/visit-proof/photo-12345678", delivery_type="private"
    )
    thumb = signed_delivery_url(
        settings(),
        "nest-home-care/visit-proof/photo-12345678",
        delivery_type="private",
        thumbnail=True,
    )
    assert "/image/private/s--" in original
    assert "q_auto,f_auto" in original
    assert "c_fill,w_480,h_320" in thumb
    assert original != thumb


def test_temporary_photo_signature_is_actor_and_expiry_bound():
    cfg = settings()
    expiry = 1800000120
    sig = temporary_stream_signature(
        cfg,
        actor_id="actor-a",
        visit_id="visit-1",
        photo_id="photo-1",
        variant="thumbnail",
        expires=expiry,
    )
    assert verify_temporary_stream_signature(
        cfg,
        actor_id="actor-a",
        visit_id="visit-1",
        photo_id="photo-1",
        variant="thumbnail",
        expires=expiry,
        signature=sig,
        now=expiry - 30,
    )
    assert not verify_temporary_stream_signature(
        cfg,
        actor_id="actor-b",
        visit_id="visit-1",
        photo_id="photo-1",
        variant="thumbnail",
        expires=expiry,
        signature=sig,
        now=expiry - 30,
    )
    assert not verify_temporary_stream_signature(
        cfg,
        actor_id="actor-a",
        visit_id="visit-1",
        photo_id="photo-1",
        variant="original",
        expires=expiry,
        signature=sig,
        now=expiry - 30,
    )
    assert not verify_temporary_stream_signature(
        cfg,
        actor_id="actor-a",
        visit_id="visit-1",
        photo_id="photo-1",
        variant="thumbnail",
        expires=expiry,
        signature=sig,
        now=expiry + 1,
    )
    assert not verify_temporary_stream_signature(
        cfg,
        actor_id="actor-a",
        visit_id="visit-1",
        photo_id="photo-1",
        variant="thumbnail",
        expires=expiry + 600,
        signature=sig,
        now=expiry,
    )
