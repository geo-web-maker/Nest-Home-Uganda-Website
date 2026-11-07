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
