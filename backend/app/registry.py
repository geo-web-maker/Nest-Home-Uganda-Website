"""The one place that lists every Beanie model and every router.

New modules are added here and nowhere else in the app wiring.
"""

from collections.abc import Iterator

from beanie import Document
from fastapi import APIRouter
from fastapi.routing import APIRoute

from app.modules.activity import router as activity_router
from app.modules.app_releases import router as app_releases_router
from app.modules.app_releases.models import AppRelease
from app.modules.applications import router as applications_router
from app.modules.applications.models import Application
from app.modules.areas import router as areas_router
from app.modules.areas.models import Area
from app.modules.articles import router as articles_router
from app.modules.articles.models import Article
from app.modules.audit.models import AuditLog, ContentVersion
from app.modules.auth import router as auth_router
from app.modules.auth.models import PasswordReset, RefreshToken, User
from app.modules.care_admin import router as care_admin_router
from app.modules.care_clients.models import CareClient
from app.modules.care_ops import router as care_ops_router
from app.modules.care_ops.models import (
    CareAlert,
    CareConsent,
    CareDataRequest,
    CareInboxNotification,
    CareSetting,
    CareTimesheet,
    PushDelivery,
    SOSCase,
    SOSEvent,
)
from app.modules.clicks import router as clicks_router
from app.modules.clicks.models import ClickStat
from app.modules.dashboard import router as dashboard_router
from app.modules.enquiries import router as enquiries_router
from app.modules.enquiries.models import Enquiry
from app.modules.faqs import router as faqs_router
from app.modules.faqs.models import Faq
from app.modules.field import router as field_router
from app.modules.field_ops import router as field_ops_router
from app.modules.field_ops.models import SyncPushReceipt
from app.modules.flags.models import VisitFlag
from app.modules.jobs import router as jobs_router
from app.modules.jobs.models import Job
from app.modules.media import router as media_router
from app.modules.media.models import Media
from app.modules.notifications.models import SmsLog
from app.modules.nurses import router as nurses_router
from app.modules.nurses.models import Device, NurseProfile
from app.modules.pages import router as pages_router
from app.modules.pages.models import ContentPage
from app.modules.places.models import CarePlace, PlaceStay
from app.modules.pricing import router as pricing_router
from app.modules.pricing.models import PricingBlock
from app.modules.reports import router as reports_router
from app.modules.services import router as services_router
from app.modules.services.models import Service
from app.modules.settings import router as settings_router
from app.modules.settings.models import SiteSetting
from app.modules.team import router as team_router
from app.modules.team.models import TeamMember
from app.modules.testimonials import router as testimonials_router
from app.modules.testimonials.models import Testimonial
from app.modules.users import router as users_router
from app.modules.visits.models import (
    Visit,
    VisitAnnotation,
    VisitEvent,
    VisitNote,
    VisitPhoto,
    VisitSyncTombstone,
)

API_PREFIX = "/api/v1"

DOCUMENT_MODELS: list[type[Document]] = [
    User,
    RefreshToken,
    PasswordReset,
    AuditLog,
    ContentVersion,
    Service,
    Enquiry,
    ClickStat,
    SmsLog,
    TeamMember,
    Faq,
    Testimonial,
    Area,
    PricingBlock,
    Article,
    ContentPage,
    Media,
    Job,
    Application,
    SiteSetting,
]

CARE_DOCUMENT_MODELS: list[type[Document]] = [
    NurseProfile,
    Device,
    CareClient,
    CarePlace,
    PlaceStay,
    Visit,
    VisitEvent,
    VisitNote,
    VisitPhoto,
    VisitAnnotation,
    VisitSyncTombstone,
    VisitFlag,
    CareAlert,
    CareTimesheet,
    SOSCase,
    CareInboxNotification,
    CareDataRequest,
    CareSetting,
    SOSEvent,
    CareConsent,
    PushDelivery,
    SyncPushReceipt,
    AppRelease,
]

ROUTERS: list[APIRouter] = [
    auth_router.router,
    auth_router.admin_router,
    app_releases_router.router,
    services_router.public_router,
    services_router.admin_router,
    enquiries_router.public_router,
    enquiries_router.admin_router,
    clicks_router.public_router,
    team_router.public_router,
    team_router.admin_router,
    faqs_router.public_router,
    faqs_router.admin_router,
    testimonials_router.public_router,
    testimonials_router.admin_router,
    areas_router.public_router,
    areas_router.admin_router,
    pricing_router.public_router,
    pricing_router.admin_router,
    articles_router.public_router,
    articles_router.admin_router,
    pages_router.public_router,
    pages_router.admin_router,
    media_router.router,
    jobs_router.public_router,
    jobs_router.admin_router,
    applications_router.public_router,
    applications_router.admin_router,
    settings_router.public_router,
    settings_router.admin_router,
    dashboard_router.router,
    reports_router.router,
    activity_router.router,
    users_router.public_router,
    users_router.admin_router,
    nurses_router.router,
    nurses_router.field_router,
    field_router.router,
    field_ops_router.router,
    care_admin_router.router,
    care_ops_router.router,
]


def iter_api_routes() -> Iterator[tuple[str, APIRoute]]:
    """Every registered route with its full path. Used by tests to check scope coverage."""
    for router in ROUTERS:
        for route in router.routes:
            if isinstance(route, APIRoute):
                yield API_PREFIX + route.path, route
