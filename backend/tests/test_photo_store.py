from app.core.config import Settings
from app.core.photo_store import ALLOWED_IMAGE_TYPES, PHOTO_FOLDER, upload_signature


def test_upload_signature_uses_only_the_approved_folder_and_image_types():
    settings = Settings(
        cloudinary_cloud_name="example-cloud",
        cloudinary_api_key="test-key",
        cloudinary_api_secret="test-secret",
    )
    result = upload_signature(settings, public_id="photo-12345678", timestamp=1_800_000_000)
    assert result["folder"] == PHOTO_FOLDER
    assert result["public_id"] == "photo-12345678"
    assert result["upload_url"] == "https://api.cloudinary.com/v1_1/example-cloud/image/upload"
    assert len(result["signature"]) == 40
    assert ALLOWED_IMAGE_TYPES == {"image/jpeg", "image/png", "image/webp"}


def test_upload_signature_rejects_unconfigured_storage_and_path_injection():
    settings = Settings(
        cloudinary_cloud_name="example-cloud",
        cloudinary_api_key="test-key",
        cloudinary_api_secret="",
    )
    try:
        upload_signature(settings, public_id="photo-12345678", timestamp=1_800_000_000)
    except ValueError as exc:
        assert "not configured" in str(exc)
    else:
        raise AssertionError("Unconfigured photo storage must be rejected")

    configured = Settings(
        cloudinary_cloud_name="example-cloud",
        cloudinary_api_key="test-key",
        cloudinary_api_secret="test-secret",
    )
    try:
        upload_signature(configured, public_id="../outside", timestamp=1_800_000_000)
    except ValueError as exc:
        assert "Invalid photo identifier" in str(exc)
    else:
        raise AssertionError("Path injection must be rejected")


def test_asset_verification_requires_configured_credentials_and_approved_folder():
    import asyncio

    from app.core.photo_store import verify_asset

    missing = Settings(
        cloudinary_cloud_name="example-cloud",
        cloudinary_api_key="test-key",
        cloudinary_api_secret="",
    )
    try:
        asyncio.run(verify_asset(missing, f"{PHOTO_FOLDER}/photo-12345678"))
    except ValueError as exc:
        assert "not configured" in str(exc)
    else:
        raise AssertionError("Asset verification must fail closed without credentials")

    configured = Settings(
        cloudinary_cloud_name="example-cloud",
        cloudinary_api_key="test-key",
        cloudinary_api_secret="test-secret",
    )
    try:
        asyncio.run(verify_asset(configured, "other-folder/photo-12345678"))
    except ValueError as exc:
        assert "approved folder" in str(exc)
    else:
        raise AssertionError("Asset verification must reject paths outside the approved folder")
