"""Staff-number generation shared by runtime provisioning and data migrations."""
from collections.abc import Collection
import re


def provisional_staff_number(user_id: str, taken: Collection[str] = ()) -> str:
    """Return a stable, collision-free provisional STF number for a Mongo user id.

    ObjectIds are hexadecimal, so we start with their final six characters and extend the
    suffix by two characters on collision. The function is intentionally database-free so
    migrations and unit tests can use exactly the same rule.
    """
    identity = re.sub(r"[^0-9a-f]", "", str(user_id).lower())
    if len(identity) < 6:
        identity = ("0" * (6 - len(identity))) + identity
    if not identity:
        raise ValueError("A user id is required to generate a staff number.")
    occupied = {str(value).strip().casefold() for value in taken}
    for length in range(6, len(identity) + 1, 2):
        candidate = f"STF-{identity[-length:].upper()}"
        if candidate.casefold() not in occupied:
            return candidate
    # A real Mongo ObjectId is unique and 24 hex chars. This final suffix keeps the pure
    # helper deterministic even for unusual test ids or legacy non-ObjectId identifiers.
    candidate = f"STF-{identity.upper()}"
    counter = 2
    while candidate.casefold() in occupied:
        candidate = f"STF-{identity.upper()}-{counter}"
        counter += 1
    return candidate
