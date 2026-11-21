"""Pure semantic-version parsing and precedence for app-release policy."""

import re

_SEMVER = re.compile(
    r"^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$"
)


def parse_version(value: str) -> tuple[int, int, int, str | None]:
    """Parse numeric semver; build metadata does not affect precedence."""
    match = _SEMVER.fullmatch(value)
    if not match:
        raise ValueError("Version must use numeric major.minor.patch semver")
    major, minor, patch, prerelease, _build = match.groups()
    if prerelease is not None:
        for identifier in prerelease.split("."):
            if identifier.isdigit() and len(identifier) > 1 and identifier.startswith("0"):
                raise ValueError("Numeric prerelease identifiers cannot contain leading zeroes")
    return int(major), int(minor), int(patch), prerelease


def _compare_prerelease(left: str, right: str) -> int:
    a, b = left.split("."), right.split(".")
    for one, two in zip(a, b, strict=False):
        if one == two:
            continue
        one_numeric, two_numeric = one.isdigit(), two.isdigit()
        if one_numeric and two_numeric:
            return 1 if int(one) > int(two) else -1
        if one_numeric != two_numeric:
            return -1 if one_numeric else 1
        return 1 if one > two else -1
    if len(a) == len(b):
        return 0
    return 1 if len(a) > len(b) else -1


def compare_versions(left: str, right: str) -> int:
    """Return positive when left has higher SemVer precedence, negative when lower."""
    a, b = parse_version(left), parse_version(right)
    numeric_a, numeric_b = a[:3], b[:3]
    if numeric_a != numeric_b:
        return 1 if numeric_a > numeric_b else -1
    if a[3] == b[3]:
        return 0
    if a[3] is None:
        return 1
    if b[3] is None:
        return -1
    return _compare_prerelease(a[3], b[3])


def effective_minimum_version(release_minimum: str, configured_minimum: str) -> str:
    """Use the stricter of release metadata and the organisation's configured floor."""
    return (
        release_minimum
        if compare_versions(release_minimum, configured_minimum) >= 0
        else configured_minimum
    )


def check_build_version(kind: str, current: str, new: str) -> None:
    """Policy for a requested build version against the version in package.json.

    - ``apk``: a new install, so it must be exactly the next major version (1.4.2 -> 2.0.0).
      The current version itself is allowed only to build an APK that was never built.
    - ``web``: a no-reinstall update, so the first number stays and the version goes up
      (1.0.0 -> 1.0.1 or 1.1.0).
    Nothing may go below the current version.
    """
    cur, req = parse_version(current), parse_version(new)
    if compare_versions(new, current) < 0:
        raise ValueError(f"{new} is lower than the current version {current}.")
    if kind == "apk":
        if req[0] == cur[0] and compare_versions(new, current) == 0:
            return
        if req[0] != cur[0] + 1 or (req[1], req[2]) != (0, 0):
            raise ValueError(
                f"A new Android app must be the next major version, "
                f"{cur[0] + 1}.0.0 (current is {current})."
            )
    elif kind == "web":
        if req[0] != cur[0]:
            raise ValueError(
                f"A web update keeps the first number ({cur[0]}). Use {cur[0]}.{cur[1]}.{cur[2] + 1} "
                f"or {cur[0]}.{cur[1] + 1}.0; a new first number needs a new Android app."
            )
        if compare_versions(new, current) == 0:
            raise ValueError(f"{new} is already the current version. Raise it to publish an update.")
    else:
        raise ValueError("Unknown build kind")


def suggest_versions(current: str) -> dict[str, str]:
    major, minor, patch, _ = parse_version(current)
    return {
        "apk": f"{major + 1}.0.0",
        "web_patch": f"{major}.{minor}.{patch + 1}",
        "web_minor": f"{major}.{minor + 1}.0",
    }
