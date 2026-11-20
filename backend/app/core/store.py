from uuid import uuid4
from sqlalchemy import select, insert, update
from fastapi.encoders import jsonable_encoder
from datetime import datetime, timezone
from app.core.errors import fail
from app.core.security import now
from app import models as m


def add(conn, table, **values):
    values.setdefault("id", str(uuid4()))
    conn.execute(insert(table).values(**values))
    return values


def one(conn, table, condition, lock=False):
    q = select(table).where(condition)
    if lock:
        q = q.with_for_update()
    return conn.execute(q).mappings().first()


def change(conn, table, id, **values):
    conn.execute(update(table).where(table.c.id == id).values(**values))
    return one(conn, table, table.c.id == id)


def public(row):
    return {k: row[k] for k in ("id", "username", "display_name")}


def wire(value):
    return jsonable_encoder(
        value,
        custom_encoder={
            datetime: lambda d: (
                d.replace(tzinfo=timezone.utc)
                .isoformat(timespec="milliseconds")
                .replace("+00:00", "Z")
            )
        },
    )


def audit(conn, user, action, entity, household_id=None, payload=None):
    add(
        conn,
        m.audit_logs,
        household_id=household_id,
        actor_user_id=user["id"],
        action=action,
        entity_type=action.split(".")[0],
        entity_id=entity["id"],
        payload_json=wire(
            payload
            if payload is not None
            else {
                k: entity[k]
                for k in (
                    "status",
                    "name",
                    "unit_price_fen",
                    "name_snapshot",
                    "unit_price_fen_snapshot",
                    "worker_user_id",
                    "payer_user_id",
                    "payee_user_id",
                    "amount_fen",
                    "total_amount_fen",
                    "task_id",
                    "locked_payment_id",
                    "note",
                    "reject_reason",
                    "version",
                    "is_active",
                )
                if k in entity
            }
        ),
        request_id=str(uuid4()),
        created_at=now(),
    )


def active_membership(conn, uid):
    return one(
        conn,
        m.household_members,
        (m.household_members.c.user_id == uid)
        & m.household_members.c.left_at.is_(None),
    )


def household(conn, uid, hid, write=False):
    member = one(
        conn,
        m.household_members,
        (m.household_members.c.user_id == uid)
        & (m.household_members.c.household_id == hid),
    )
    if not member:
        fail("FORBIDDEN", "无权访问这个家庭", 403)
    h = one(conn, m.households, m.households.c.id == hid, lock=write)
    if write and h["status"] != "active":
        fail("HOUSEHOLD_DISSOLVED", "家庭已解绑，历史只读")
    return h


def resource(conn, table, hid, id, lock=False):
    row = one(conn, table, (table.c.id == id) & (table.c.household_id == hid), lock)
    if not row:
        fail("NOT_FOUND", "记录不存在", 404)
    return row


def household_view(conn, h):
    rows = (
        conn.execute(
            select(m.household_members, m.users.c.display_name)
            .join(m.users, m.users.c.id == m.household_members.c.user_id)
            .where(m.household_members.c.household_id == h["id"])
            .order_by(m.household_members.c.user_id)
        )
        .mappings()
        .all()
    )
    return {
        **h,
        "members": [
            {k: row[k] for k in ("user_id", "display_name", "joined_at", "left_at")}
            for row in rows
        ],
    }
