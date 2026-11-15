from __future__ import annotations

import re
from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Cookie, Depends, Query, Request, Response
from fastapi.responses import JSONResponse
from fastapi.responses import Response as RawResponse
from pymongo import DESCENDING

from app.core.deps import Principal, require_scopes
from app.core.errors import NotFound, RateLimited, error_body
from app.core.pagination import PageParams, page_params
from app.core.rate_limit import client_ip, limiter
from app.core.security import hash_ip
from app.core.storage import content_disposition
from app.core.totp_guard import assert_totp_session
from app.modules.audit import service as audit
from app.modules.billing import service
from app.modules.billing.models import Invoice, Payment
from app.modules.billing.schemas import InvoiceIn, PaymentIn, VoidIn

admin_router = APIRouter(prefix="/admin/billing", tags=["admin-billing"])
public_router = APIRouter(prefix="/public/billing", tags=["public-billing"])

CanRead = Annotated[Principal, Depends(require_scopes("billing:read"))]
CanWrite = Annotated[Principal, Depends(require_scopes("billing:write"))]
CanVoid = Annotated[Principal, Depends(require_scopes("billing:void"))]


def _ip(request: Request) -> str:
    return hash_ip(client_ip(request))


@admin_router.get("/invoices")
async def list_invoices(
    _: CanRead,
    pagination: Annotated[PageParams, Depends(page_params)],
    status: str | None = Query(default=None, max_length=20),
    q: str | None = Query(default=None, max_length=100),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    include_test: bool = False,
):
    page, page_size = pagination.page, pagination.page_size
    filters: dict = {} if include_test else {"is_test": False}
    if status:
        if status not in {"draft", "issued", "part_paid", "paid", "void"}:
            from app.core.errors import ValidationFailed

            raise ValidationFailed("Invalid invoice status.")
        filters["status"] = status
    if from_date or to_date:
        filters["issue_date"] = {}
        if from_date:
            filters["issue_date"]["$gte"] = from_date
        if to_date:
            filters["issue_date"]["$lte"] = to_date
    if q:
        filters["$or"] = [
            {"bill_to.name": {"$regex": re.escape(q), "$options": "i"}},
            {"reference": {"$regex": re.escape(q), "$options": "i"}},
        ]
    total = await Invoice.find(filters).count()
    items = (
        await Invoice.find(filters)
        .sort([("issue_date", DESCENDING), ("created_at", DESCENDING)])
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return {
        "items": [service.invoice_data(x) for x in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@admin_router.post("/invoices", status_code=201)
async def create_invoice(body: InvoiceIn, principal: CanWrite, request: Request):
    doc = await service.create_invoice(principal, body, _ip(request))
    return service.invoice_data(doc)


@admin_router.get("/invoices/{invoice_id}")
async def get_invoice(invoice_id: str, _: CanRead, response: Response):
    doc = await service.get_invoice(invoice_id)
    payments = await Payment.find(Payment.invoice_id == doc.id).sort("-created_at").to_list()
    response.headers["Cache-Control"] = "no-store"
    return service.invoice_data(doc, payments)


@admin_router.patch("/invoices/{invoice_id}")
async def patch_invoice(invoice_id: str, body: InvoiceIn, principal: CanWrite, request: Request):
    doc = await service.get_invoice(invoice_id)
    return service.invoice_data(await service.update_draft(doc, body, principal, _ip(request)))


@admin_router.delete("/invoices/{invoice_id}", status_code=204)
async def delete_invoice(invoice_id: str, principal: CanWrite, request: Request):
    doc = await service.get_invoice(invoice_id)
    await service.delete_draft(doc, principal, _ip(request))
    return Response(status_code=204)


@admin_router.post("/invoices/{invoice_id}/issue")
async def issue_invoice(invoice_id: str, principal: CanWrite, request: Request):
    doc = await service.get_invoice(invoice_id)
    return service.invoice_data(await service.issue_invoice(doc, principal, _ip(request)))


@admin_router.post("/invoices/{invoice_id}/payments")
async def record_payment(
    invoice_id: str, body: PaymentIn, principal: CanWrite, request: Request, response: Response
):
    doc = await service.get_invoice(invoice_id)
    payment, created = await service.record_payment(doc, body, principal, _ip(request))
    response.status_code = 201 if created else 200
    return service.payment_data(payment)


@admin_router.post("/invoices/{invoice_id}/void")
async def void_invoice(
    invoice_id: str,
    body: VoidIn,
    principal: CanVoid,
    request: Request,
    response: Response,
    mail_totp: str | None = Cookie(default=None),
):
    await assert_totp_session(principal, mail_totp)
    doc = await service.get_invoice(invoice_id)
    await service.void_invoice(doc, body.reason, principal, _ip(request))
    response.headers["Cache-Control"] = "no-store"
    return service.invoice_data(doc)


@admin_router.post("/payments/{payment_id}/void")
async def void_payment(
    payment_id: str,
    body: VoidIn,
    principal: CanVoid,
    request: Request,
    response: Response,
    mail_totp: str | None = Cookie(default=None),
):
    await assert_totp_session(principal, mail_totp)
    payment = await service.get_payment(payment_id)
    await service.void_payment(payment, body.reason, principal, _ip(request))
    response.headers["Cache-Control"] = "no-store"
    return service.payment_data(payment)


@admin_router.get("/payments")
async def list_payments(
    _: CanRead,
    pagination: Annotated[PageParams, Depends(page_params)],
    status: str | None = None,
    q: str | None = Query(default=None, max_length=100),
    from_date: date | None = Query(default=None, alias="from"),
    to_date: date | None = Query(default=None, alias="to"),
    method: str | None = None,
    include_test: bool = False,
):
    page, page_size = pagination.page, pagination.page_size
    filters: dict = {} if include_test else {"is_test": False}
    if status:
        if status not in {"valid", "void"}:
            from app.core.errors import ValidationFailed

            raise ValidationFailed("Invalid receipt status.")
        filters["status"] = status
    if method:
        if method not in {"mtn_momo", "airtel_money", "bank_transfer", "cash", "cheque", "other"}:
            from app.core.errors import ValidationFailed

            raise ValidationFailed("Invalid payment method.")
        filters["method"] = method
    if from_date or to_date:
        filters["paid_on"] = {}
        if from_date:
            filters["paid_on"]["$gte"] = from_date
        if to_date:
            filters["paid_on"]["$lte"] = to_date
    if q:
        filters["$or"] = [
            {"reference": {"$regex": re.escape(q), "$options": "i"}},
            {"invoice_reference": {"$regex": re.escape(q), "$options": "i"}},
            {"payer_reference": {"$regex": re.escape(q), "$options": "i"}},
        ]
    total = await Payment.find(filters).count()
    items = (
        await Payment.find(filters)
        .sort("-created_at")
        .skip((page - 1) * page_size)
        .limit(page_size)
        .to_list()
    )
    return {
        "items": [service.payment_data(x) for x in items],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


async def _pdf_response(
    doc, layout: str, principal: Principal, request: Request, *, original: bool = False
) -> RawResponse:
    data = await service.get_pdf(doc, layout, original=original)
    item_type = "invoice" if isinstance(doc, Invoice) else "payment"
    action = f"{item_type}.pdf_downloaded"
    await audit.record(
        principal,
        action,
        item_type,
        str(doc.id),
        doc.reference,
        after={"layout": layout, "status": doc.status},
        ip_hash=_ip(request),
    )
    response = RawResponse(data, media_type="application/pdf")
    response.headers["Cache-Control"] = "no-store"
    response.headers["Content-Disposition"] = content_disposition(f"{doc.reference}-{layout}.pdf")
    return response


@admin_router.get("/invoices/{invoice_id}/pdf")
async def invoice_pdf(
    invoice_id: str,
    principal: CanRead,
    request: Request,
    layout: Literal["ledger", "slip"] = "ledger",
    original: bool = False,
):
    return await _pdf_response(
        await service.get_invoice(invoice_id), layout, principal, request, original=original
    )


@admin_router.get("/payments/{payment_id}/pdf")
async def payment_pdf(
    payment_id: str,
    principal: CanRead,
    request: Request,
    layout: Literal["ledger", "slip"] = "ledger",
    original: bool = False,
):
    return await _pdf_response(
        await service.get_payment(payment_id), layout, principal, request, original=original
    )


@admin_router.post("/invoices/{invoice_id}/email")
async def email_invoice(invoice_id: str, principal: CanWrite, request: Request):
    retry_after = limiter.hit(f"billing_email:{principal.user_id}", 10, 3600)
    if retry_after is not None:
        raise RateLimited(retry_after)
    doc = await service.get_invoice(invoice_id)
    await service.email_document(doc, principal, _ip(request))
    return {"sent": True}


@admin_router.post("/payments/{payment_id}/email")
async def email_payment(payment_id: str, principal: CanWrite, request: Request):
    retry_after = limiter.hit(f"billing_email:{principal.user_id}", 10, 3600)
    if retry_after is not None:
        raise RateLimited(retry_after)
    doc = await service.get_payment(payment_id)
    await service.email_document(doc, principal, _ip(request))
    return {"sent": True}


@admin_router.post("/invoices/{invoice_id}/reissue", status_code=201)
async def reissue_invoice(invoice_id: str, principal: CanWrite, request: Request):
    old = await service.get_invoice(invoice_id)
    if old.status != "void":
        from app.core.errors import Conflict

        raise Conflict("Only a void invoice can be reissued.")
    if old.superseded_by:
        from app.core.errors import Conflict

        raise Conflict("This invoice already has a replacement.")
    body = InvoiceIn(
        bill_to=old.bill_to.model_dump(),
        care_recipient=old.care_recipient.model_dump(),
        agreement_reference=old.agreement_reference,
        items=[x.model_dump(exclude={"amount_ugx"}) for x in old.items],
        issue_date=date.today(),
        due_date=max(date.today(), old.due_date),
        payment_instructions=old.payment_instructions,
        notes=old.notes,
        is_test=old.is_test,
    )
    new_doc = await service.create_invoice(principal, body, _ip(request))
    new_doc.supersedes = old.reference
    await new_doc.save()
    return service.invoice_data(new_doc)


@admin_router.get("/invoices/{invoice_id}/whatsapp")
async def invoice_whatsapp(invoice_id: str, _: CanRead):
    doc = await service.get_invoice(invoice_id)
    if not doc.sealed:
        from app.core.errors import Conflict

        raise Conflict("Issue the invoice before sharing it.")
    from app.modules.agreements.render import verify_url

    return {
        "text": (
            f"Bloomwell invoice {doc.reference}. Amount: UGX {doc.total_ugx:,}. "
            f"Verify: {verify_url(doc.reference, doc.sealed['content_hash'])}"
        )
    }


@admin_router.get("/payments/{payment_id}/whatsapp")
async def payment_whatsapp(payment_id: str, _: CanRead):
    doc = await service.get_payment(payment_id)
    if not doc.sealed:
        from app.core.errors import Conflict

        raise Conflict("The receipt is not sealed and cannot be shared.")
    from app.modules.agreements.render import verify_url

    return {
        "text": (
            f"Bloomwell receipt {doc.reference}. Amount received: UGX {doc.amount_ugx:,}. "
            f"Verify: {verify_url(doc.reference, doc.sealed['content_hash'])}"
        )
    }


@public_router.get("/verify/{reference}/{code}")
async def public_verify(reference: str, code: str, request: Request, response: Response):
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Robots-Tag"] = "noindex"
    key = f"billing_verify:{hash_ip(client_ip(request))}"
    retry_after = limiter.hit(key, 20, 900)
    if retry_after is not None:
        return JSONResponse(
            error_body("rate_limited", "Too many attempts. Please try again later."),
            status_code=429,
            headers={
                "Retry-After": str(retry_after),
                "Cache-Control": "no-store",
                "X-Robots-Tag": "noindex",
            },
        )
    reference, code = reference[:64].strip(), code[:32].strip().lower()
    try:
        result = await service.verify_public(reference, code)
    except NotFound:
        return JSONResponse(
            error_body("not_found", "No document matches this link."),
            status_code=404,
            headers={"Cache-Control": "no-store", "X-Robots-Tag": "noindex"},
        )
    return result
