"""Everyday password rules: length first, no forced symbols, block obvious choices.

Matches frontend/src/lib/passwordStrength.ts (minimum 8 characters).
"""

MIN_PASSWORD_LENGTH = 8
MAX_PASSWORD_LENGTH = 128

_COMMON = frozenset(
    """password password1 password12 password123 passw0rd p@ssw0rd p@ssword qwerty qwerty12 qwerty123
    qwertyuiop 12345678 123456789 1234567890 11111111 00000000 87654321 abc12345 abcd1234 iloveyou
    letmein welcome welcome1 welcome123 admin123 administrator monkey123 dragon123 football baseball
    sunshine princess trustno1 whatever changeme internet bloomwell bloomwell1 uganda123 kampala123
    nurse123 nursenurse homecare""".split()
)


def password_problem(password: str) -> str | None:
    """Return a plain-language reason the password is not acceptable, or None if it is fine."""
    if len(password) < MIN_PASSWORD_LENGTH:
        return f"Use at least {MIN_PASSWORD_LENGTH} characters."
    if len(password) > MAX_PASSWORD_LENGTH:
        return f"Use at most {MAX_PASSWORD_LENGTH} characters."
    if len(set(password)) == 1 or password.lower() in _COMMON:
        return "That password is too easy to guess. Choose something less common."
    return None


def validate_password(password: str) -> str:
    """Pydantic-friendly validator: returns the password or raises ValueError."""
    problem = password_problem(password)
    if problem:
        raise ValueError(problem)
    return password
