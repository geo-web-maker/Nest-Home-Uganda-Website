"""Seed the first superadmin, content defaults and site settings.

    python -m app.seed

Fails if FIRST_SUPERADMIN_EMAIL or FIRST_SUPERADMIN_PASSWORD is empty. Never prints
the password. Safe to run again: existing records are left as they are.
"""

import asyncio

from app.core.config import get_settings
from app.core.security import hash_password
from app.modules.areas.seed import seed_areas
from app.modules.auth.models import User
from app.modules.faqs.seed import seed_faqs
from app.modules.jobs.models import Job
from app.modules.jobs.seed import seed_jobs
from app.modules.pricing.seed import seed_pricing
from app.modules.services.seed import seed_services
from app.modules.settings.service import seed_settings

MIN_PASSWORD_LENGTH = 12


async def seed_first_superadmin(email: str, password: str) -> bool:
    """Create the first superadmin if no user has this email. Returns True if created."""
    email = email.strip().lower()
    if not email or not password:
        raise SystemExit("FIRST_SUPERADMIN_EMAIL and FIRST_SUPERADMIN_PASSWORD are required.")
    if len(password) < MIN_PASSWORD_LENGTH:
        raise SystemExit(f"FIRST_SUPERADMIN_PASSWORD must be at least {MIN_PASSWORD_LENGTH} long.")
    if await User.find_one(User.email == email) is not None:
        return False
    await User(
        name="Superadmin", email=email, password_hash=hash_password(password), is_superadmin=True
    ).insert()
    return True


async def _main() -> None:
    from app.core import db
    from app.registry import DOCUMENT_MODELS

    settings = get_settings()
    if not settings.mongodb_uri:
        raise SystemExit("MONGODB_URI is empty.")
    # Fail before touching the database if the first superadmin is not configured.
    if not settings.first_superadmin_email.strip() or not settings.first_superadmin_password:
        raise SystemExit("FIRST_SUPERADMIN_EMAIL and FIRST_SUPERADMIN_PASSWORD are required.")
    await db.connect(settings.mongodb_uri, settings.mongodb_db, DOCUMENT_MODELS)
    try:
        created = await seed_first_superadmin(
            settings.first_superadmin_email, settings.first_superadmin_password
        )
        print("superadmin:", "created" if created else "already exists")  # noqa: T201
        print("services created:", await seed_services())  # noqa: T201
        print("areas created:", await seed_areas())  # noqa: T201
        print("faqs created:", await seed_faqs())  # noqa: T201
        print("pricing blocks created:", await seed_pricing())  # noqa: T201
        print("jobs created:", await seed_jobs(Job))  # noqa: T201
        print("settings created:", await seed_settings(settings))  # noqa: T201
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(_main())
