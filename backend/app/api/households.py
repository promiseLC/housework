import secrets
from datetime import timedelta
from fastapi import APIRouter, Depends, Header, Request, Response
from sqlalchemy import select, update
from app import models as m, schemas as s
from app.core.types import UUIDString
from app.core.responses import ERRORS
from app.core.dependencies import connection, current_user
from app.core.db import engine
from app.core.security import now, digest
from app.core.store import (
    add,
    one,
    change,
    audit,
    active_membership,
    household,
    household_view,
)
from app.core.idempotency import execute
from app.core.errors import fail

router = APIRouter(responses=ERRORS)


def lock_users(conn, ids):
    conn.execute(
        select(m.users.c.id)
        .where(m.users.c.id.in_(ids))
        .order_by(m.users.c.id)
        .with_for_update()
    ).all()


def expire(conn, uid):
    conn.execute(
        update(m.household_invites)
        .where(
            (m.household_invites.c.inviter_user_id == uid)
            & (m.household_invites.c.status == "pending")
            & (m.household_invites.c.expires_at <= now())
        )
        .values(status="expired", code=None)
    )


def current(conn, uid):
    return (
        conn.execute(
            select(m.household_invites)
            .where(m.household_invites.c.inviter_user_id == uid)
            .order_by(
                m.household_invites.c.created_at.desc(), m.household_invites.c.id.desc()
            )
            .limit(1)
        )
        .mappings()
        .first()
    )


def pending(conn, uid):
    return one(
        conn,
        m.household_invites,
        (m.household_invites.c.inviter_user_id == uid)
        & (m.household_invites.c.status == "pending"),
    )


def make_invite(conn, user, regenerate=False):
    lock_users(conn, [user["id"]])
    if active_membership(conn, user["id"]):
        fail("ALREADY_BOUND", "已经有关联对象")
    expire(conn, user["id"])
    old = pending(conn, user["id"])
    if regenerate:
        if not old:
            fail("CONFLICT", "没有有效邀请，请创建邀请码")
        change(conn, m.household_invites, old["id"], status="cancelled", code=None)
        audit(conn, user, "invite.cancel", old)
    elif old:
        fail("CONFLICT", "已有有效邀请，请查看或重新生成")
    value = secrets.token_hex(6).upper()
    row = add(
        conn,
        m.household_invites,
        inviter_user_id=user["id"],
        code=value,
        code_hash=digest(value),
        status="pending",
        expires_at=now() + timedelta(days=7),
        created_at=now(),
    )
    audit(conn, user, "invite.create", row)
    return row


@router.post(
    "/invites",
    status_code=201,
    response_model=s.InviteCreatedResponse,
    operation_id="createInvite",
)
def create_invite(
    request: Request,
    conn=Depends(connection),
    user=Depends(current_user),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
):
    return execute(
        conn,
        user,
        key,
        "POST",
        request,
        None,
        201,
        lambda: make_invite(conn, user),
    )


@router.post(
    "/invites/regenerate",
    status_code=201,
    response_model=s.InviteCreatedResponse,
    operation_id="regenerateInvite",
)
def regenerate_invite(
    request: Request,
    conn=Depends(connection),
    user=Depends(current_user),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
):
    return execute(
        conn,
        user,
        key,
        "POST",
        request,
        None,
        201,
        lambda: make_invite(conn, user, True),
    )


@router.get(
    "/invites/current",
    response_model=s.InviteStatusResponse,
    operation_id="getCurrentInvite",
)
def get_current(conn=Depends(connection), user=Depends(current_user)):
    lock_users(conn, [user["id"]])
    expire(conn, user["id"])
    return {"invite": current(conn, user["id"])}


@router.delete("/invites/current", status_code=204, operation_id="cancelCurrentInvite")
def cancel_current(conn=Depends(connection), user=Depends(current_user)):
    lock_users(conn, [user["id"]])
    expire(conn, user["id"])
    old = pending(conn, user["id"])
    if old:
        change(conn, m.household_invites, old["id"], status="cancelled", code=None)
        audit(conn, user, "invite.cancel", old)
    return Response(status_code=204)


@router.post(
    "/invites/accept",
    status_code=201,
    response_model=s.HouseholdDetail,
    operation_id="acceptInvite",
)
def accept_invite(
    body: s.AcceptInviteRequest,
    request: Request,
    conn=Depends(connection),
    user=Depends(current_user),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
):
    # Expiration is maintenance, independent of a rejected acceptance transaction.
    # Scope to this supplied code and never clear a still-valid/accepted invitation.
    with engine.begin() as maintenance:
        maintenance.execute(
            update(m.household_invites)
            .where(
                (m.household_invites.c.code_hash == digest(body.code))
                & (m.household_invites.c.status == "pending")
                & (m.household_invites.c.expires_at <= now())
            )
            .values(status="expired", code=None)
        )

    def operation():
        inv = one(
            conn,
            m.household_invites,
            m.household_invites.c.code_hash == digest(body.code),
        )
        if not inv:
            fail("NOT_FOUND", "邀请码不存在", 404)
        lock_users(conn, sorted([user["id"], inv["inviter_user_id"]]))
        inv = one(
            conn, m.household_invites, m.household_invites.c.id == inv["id"], lock=True
        )
        if inv["status"] == "accepted":
            fail("INVITE_USED", "邀请码已使用")
        if inv["status"] == "cancelled":
            fail("INVITE_CANCELLED", "邀请码已作废")
        if inv["status"] == "expired" or inv["expires_at"] <= now():
            fail("INVITE_EXPIRED", "邀请码已过期")
        if inv["inviter_user_id"] == user["id"]:
            fail("CANNOT_INVITE_SELF", "不能接受自己的邀请")
        if active_membership(conn, user["id"]):
            fail("ALREADY_BOUND", "你已经绑定对象")
        if active_membership(conn, inv["inviter_user_id"]):
            fail("PARTNER_ALREADY_BOUND", "邀请人已经绑定对象")
        h = add(conn, m.households, status="active", created_at=now())
        for uid in [user["id"], inv["inviter_user_id"]]:
            add(
                conn,
                m.household_members,
                household_id=h["id"],
                user_id=uid,
                joined_at=now(),
            )
        change(
            conn,
            m.household_invites,
            inv["id"],
            status="accepted",
            code=None,
            accepted_by_user_id=user["id"],
            accepted_at=now(),
            household_id=h["id"],
        )
        conn.execute(
            update(m.household_invites)
            .where(
                (
                    m.household_invites.c.inviter_user_id.in_(
                        [user["id"], inv["inviter_user_id"]]
                    )
                )
                & (m.household_invites.c.status == "pending")
            )
            .values(status="cancelled", code=None)
        )
        audit(conn, user, "invite.accept", inv, h["id"])
        return household_view(conn, h)

    return execute(
        conn,
        user,
        key,
        "POST",
        request,
        body.model_dump(mode="json"),
        201,
        operation,
    )


@router.get(
    "/households", response_model=s.HouseholdListResponse, operation_id="listHouseholds"
)
def list_households(conn=Depends(connection), user=Depends(current_user)):
    rows = (
        conn.execute(
            select(m.households)
            .join(m.household_members)
            .where(m.household_members.c.user_id == user["id"])
            .order_by(m.households.c.created_at.desc())
        )
        .mappings()
        .all()
    )
    return {"items": [household_view(conn, h) for h in rows]}


@router.get(
    "/households/{householdId}",
    response_model=s.HouseholdDetail,
    operation_id="getHousehold",
)
def get_household(
    householdId: UUIDString, conn=Depends(connection), user=Depends(current_user)
):
    return household_view(conn, household(conn, user["id"], householdId))


@router.post(
    "/households/{householdId}/unbind",
    response_model=s.HouseholdDetail,
    operation_id="unbindHousehold",
)
def unbind(
    householdId: UUIDString,
    request: Request,
    conn=Depends(connection),
    user=Depends(current_user),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
):
    def operation():
        h = household(conn, user["id"], householdId, True)
        blocked = one(
            conn,
            m.chore_tasks,
            (m.chore_tasks.c.household_id == householdId)
            & m.chore_tasks.c.status.in_(
                ["in_progress", "pending_confirm", "rejected"]
            ),
        )
        wages = one(
            conn,
            m.wage_entries,
            (m.wage_entries.c.household_id == householdId)
            & m.wage_entries.c.status.in_(["payable", "awaiting_receipt"]),
        )
        if blocked or wages:
            fail("UNBIND_BLOCKED", "还有未完成的家务或未结清的工资，暂时不能解绑")
        h = change(
            conn, m.households, householdId, status="dissolved", dissolved_at=now()
        )
        conn.execute(
            update(m.household_members)
            .where(m.household_members.c.household_id == householdId)
            .values(left_at=now())
        )
        audit(conn, user, "household.unbind", h, householdId)
        return household_view(conn, h)

    return execute(conn, user, key, "POST", request, None, 200, operation)
