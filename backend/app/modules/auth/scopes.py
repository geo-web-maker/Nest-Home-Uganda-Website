"""The scope registry (BUILDER_INSTRUCTIONS 12.2). The only place scopes are listed.

There are no roles. No scope implies another. A superadmin holds every scope here.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Scope:
    id: str
    group: str
    label: str


SCOPES: tuple[Scope, ...] = (
    Scope("dashboard:view", "Dashboard", "See the dashboard"),
    Scope("enquiries:read", "Enquiries", "View enquiries"),
    Scope("enquiries:write", "Enquiries", "Change status, assign, add notes, create enquiries"),
    Scope("jobs:read", "Careers", "View jobs"),
    Scope("jobs:write", "Careers", "Create, edit, publish, close and delete jobs"),
    Scope("applications:read", "Applications", "View applications and CV links"),
    Scope("applications:write", "Applications", "Change stage, rating, reason and notes"),
    Scope("content:read", "Content", "View content"),
    Scope("content:write", "Content", "Edit drafts, reorder and undo the last change"),
    Scope("content:publish", "Content", "Publish content to the website"),
    Scope("media:write", "Media", "Upload, edit alt text and delete media"),
    Scope("translations:write", "Translations", "Edit translated text"),
    Scope("translations:review", "Translations", "Mark a translation as reviewed"),
    Scope("settings:read", "Settings", "View site settings (except SMS)"),
    Scope("settings:write", "Settings", "Edit site settings (except SMS)"),
    Scope("users:read", "Users", "View users and the list of scopes"),
    Scope("users:write", "Users", "Invite users, edit scopes, deactivate, reset passwords"),
    Scope("reports:read", "Reports", "View report summaries"),
    Scope("reports:export", "Reports", "Export reports to CSV and Excel"),
    Scope("activity:read", "Activity", "View the activity log"),
    Scope("system:manage", "System", "Manage SMS and data retention settings"),
    Scope("field:use", "Field app", "Use the nurse field app"),
    Scope("flags:read", "Care alerts", "View care flags"),
    Scope("flags:write", "Care alerts", "Resolve care flags"),
    Scope("sos:send", "Safety", "Send a safety alert"),
    Scope("nurses:read", "Care setup", "View nurse profiles"),
    Scope("nurses:write", "Care setup", "Manage nurse profiles and devices"),
    Scope("carecfg:read", "Care settings", "View care settings"),
    Scope("carecfg:write", "Care settings", "Change care settings"),
    Scope("clients:read", "Care clients", "View assigned care clients"),
    Scope("clients:write", "Care clients", "Manage care client assignments"),
    Scope("places:read", "Care places", "View care places"),
    Scope("places:write", "Care places", "Manage care places"),
    Scope("visits:read", "Care visits", "View visits and visit events"),
    Scope("visits:write", "Care visits", "Schedule and assign visits"),
    Scope("photos:read", "Visit photos", "View visit photos through audited routes"),
    Scope("photos:hide", "Visit photos", "Hide a photo with a reason"),
    Scope("alerts:read", "Care alerts", "View care alerts and flags"),
    Scope("alerts:write", "Care alerts", "Acknowledge and resolve alerts"),
    Scope("timesheets:read", "Timesheets", "View nurse timesheets"),
    Scope("timesheets:write", "Timesheets", "Review timesheets"),
    Scope("care-reports:read", "Care reports", "View care reports"),
    Scope("care-reports:export", "Care reports", "Export care reports"),
)

ALL_SCOPE_IDS: frozenset[str] = frozenset(s.id for s in SCOPES)

# Only a superadmin may grant these (12.5).
SUPERADMIN_ONLY_SCOPES: frozenset[str] = frozenset({"system:manage", "carecfg:write"})

if len(ALL_SCOPE_IDS) != len(SCOPES):
    raise RuntimeError("duplicate scope id in the registry")


def is_valid_scope(scope_id: str) -> bool:
    return scope_id in ALL_SCOPE_IDS


def read_scope_for(write_scope: str) -> str | None:
    """'x:write' -> 'x:read' if that scope exists (used by the Users screen and tests)."""
    if not write_scope.endswith(":write"):
        return None
    candidate = write_scope.removesuffix(":write") + ":read"
    return candidate if candidate in ALL_SCOPE_IDS else None


# Presets are bundles of scopes only; access is never inferred from a role name.
SCOPE_PRESETS: dict[str, frozenset[str]] = {
    "nurse": frozenset({"field:use", "sos:send"}),
    "supervisor": frozenset(
        {
            "dashboard:view",
            "nurses:read",
            "clients:read",
            "clients:write",
            "places:read",
            "places:write",
            "visits:read",
            "visits:write",
            "flags:read",
            "flags:write",
            "alerts:read",
            "alerts:write",
            "timesheets:read",
            "timesheets:write",
            "care-reports:read",
        }
    ),
    "admin": frozenset(
        {
            "dashboard:view",
            "nurses:read",
            "nurses:write",
            "clients:read",
            "clients:write",
            "places:read",
            "places:write",
            "visits:read",
            "visits:write",
            "flags:read",
            "flags:write",
            "alerts:read",
            "alerts:write",
            "timesheets:read",
            "timesheets:write",
            "care-reports:read",
            "care-reports:export",
        }
    ),
    "executive": frozenset(
        {
            "dashboard:view",
            "nurses:read",
            "clients:read",
            "places:read",
            "visits:read",
            "flags:read",
            "alerts:read",
            "timesheets:read",
            "care-reports:read",
        }
    ),
    "super_admin": ALL_SCOPE_IDS,
}
