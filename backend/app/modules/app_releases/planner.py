"""Reads the release records and works out the current and next version of each app.

Only releases that were really published count, so an APK build that failed never uses its
number up: the next attempt gets the same number again.
"""

from app.modules.app_releases import rules
from app.modules.app_releases.models import AppRelease


async def plan(app: str) -> dict[str, str | int | None]:
    """Current/next versions plus the APK versionCode a new web update needs at least."""
    rows = [row for row in await AppRelease.find().to_list() if row.app == app]
    apk = [r.version for r in rows if r.platform == "android"]
    web = [r.version for r in rows if r.platform == "web"]
    out: dict[str, str | int | None] = dict(rules.plan_versions(apk, web))
    generation = rules.apk_generation(apk)
    codes = [
        r.version_code
        for r in rows
        if r.platform == "android"
        and r.version_code
        and rules.parse_version(r.version)[0] == generation
    ]
    out["min_native_version_code"] = max(codes, default=1)
    return out
