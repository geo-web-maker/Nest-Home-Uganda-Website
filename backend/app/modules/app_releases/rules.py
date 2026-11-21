"""Pure semantic-version parsing and precedence for app-release policy."""

import re
from functools import cmp_to_key

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


# --- Version numbers -------------------------------------------------------------------------
#
# Every version is  <apk>.<a>.<b>
#   apk  counts Android app releases. It only goes up when an APK build SUCCEEDED (a failed build
#        never uses the number up), and every new APK starts its web counter again at 0.0.
#   a.b  counts web updates published since that APK, 0.1 .. 99.99, assigned automatically.
# Examples: first APK 1.0.0, then web updates 1.0.1, 1.0.2 ... 1.0.99, 1.1.0 ... ; the next APK
# is 2.0.0 and its web updates start again at 2.0.1.

WEB_COUNTER_MAX = 99


def apk_generation(apk_versions: list[str]) -> int:
    """The APK number of the newest successful Android release (0 when none exists yet)."""
    return max((parse_version(v)[0] for v in apk_versions), default=0)


def next_apk_version(apk_versions: list[str]) -> str:
    return f"{apk_generation(apk_versions) + 1}.0.0"


def next_web_version(apk_versions: list[str], web_versions: list[str]) -> str:
    """Next web update for the current APK: the highest published a.b of this APK plus one."""
    generation = apk_generation(apk_versions)
    used = [parse_version(v)[1:3] for v in web_versions if parse_version(v)[0] == generation]
    minor, patch = max(used, default=(0, 0))
    if patch < WEB_COUNTER_MAX:
        patch += 1
    else:
        minor, patch = minor + 1, 0
    if minor > WEB_COUNTER_MAX:
        raise ValueError(
            f"The web counter for app {generation} is full ({generation}.{WEB_COUNTER_MAX}."
            f"{WEB_COUNTER_MAX}). Release a new Android app to start again at "
            f"{generation + 1}.0.0."
        )
    return f"{generation}.{minor}.{patch}"


def plan_versions(apk_versions: list[str], web_versions: list[str]) -> dict[str, str | None]:
    """What is current and what the next build of each kind will be called."""
    generation = apk_generation(apk_versions)
    current_apk = max(apk_versions, key=cmp_to_key(compare_versions), default=None)
    in_line = [v for v in web_versions if parse_version(v)[0] == generation]
    current_web = max(in_line, key=cmp_to_key(compare_versions), default=None)
    try:
        next_web: str | None = next_web_version(apk_versions, web_versions)
    except ValueError:
        next_web = None
    return {
        "current_apk": current_apk,
        "current_web": current_web,
        "next_apk": next_apk_version(apk_versions),
        "next_web": next_web,
    }


def check_build_version(kind: str, expected: str, requested: str) -> None:
    """Versions are assigned by the server; a requested number must be the one it would assign."""
    if kind not in ("apk", "web"):
        raise ValueError("Unknown build kind")
    parse_version(requested)
    if requested != expected:
        raise ValueError(
            f"The next {'Android app' if kind == 'apk' else 'web update'} is {expected}, "
            f"not {requested}. Versions are numbered automatically."
        )
