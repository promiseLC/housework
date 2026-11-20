from datetime import datetime, timedelta, timezone
from sqlalchemy import select, update, func
from app.core.db import engine
from app import models as m
from conftest import code


def test_register_trim_case_unique_login_hash_and_me(client, register):
    a = register()
    username = a.data["user"]["username"]
    r = client.post(
        "/api/v1/auth/register",
        json={
            "username": "  " + username.upper() + "  ",
            "password": "safe-password-123",
            "display_name": "其他",
        },
    )
    code(r, 409, "USERNAME_TAKEN")
    r = client.post(
        "/api/v1/auth/login",
        json={"username": username.upper(), "password": "safe-password-123"},
    )
    assert r.status_code == 200 and r.json()["user"]["id"] == a.id
    assert a.get("/me").json() == {"user": a.data["user"], "active_household": None}
    with engine.connect() as c:
        password = c.scalar(select(m.users.c.password_hash).where(m.users.c.id == a.id))
        assert password.startswith("$argon2id$") and "safe-password" not in password


def test_refresh_rotation_logout(client, register):
    a = register()
    old = a.data["refresh_token"]
    r = client.post("/api/v1/auth/refresh", json={"refresh_token": old})
    assert r.status_code == 200
    code(
        client.post("/api/v1/auth/refresh", json={"refresh_token": old}),
        401,
        "UNAUTHORIZED",
    )
    new = r.json()["refresh_token"]
    assert a.post("/auth/logout", {"refresh_token": new}).status_code == 204
    code(
        client.post("/api/v1/auth/refresh", json={"refresh_token": new}),
        401,
        "UNAUTHORIZED",
    )


def test_auth_validation(client):
    code(client.get("/api/v1/me"), 401, "UNAUTHORIZED")
    code(
        client.get("/api/v1/me", headers={"Authorization": "Bearer invalid"}),
        401,
        "UNAUTHORIZED",
    )
    for username in ["x", "space name", "?name"]:
        code(
            client.post(
                "/api/v1/auth/register",
                json={
                    "username": username,
                    "password": "12345678",
                    "display_name": "名",
                },
            ),
            422,
            "VALIDATION_ERROR",
        )
    code(
        client.post(
            "/api/v1/auth/login", json={"username": "not_here", "password": "bad"}
        ),
        401,
        "UNAUTHORIZED",
    )


def test_invite_read_regenerate_cancel_and_errors(register):
    a, b = register(), register()
    assert a.get("/invites/current").json() == {"invite": None}
    first = a.post("/invites")
    assert first.status_code == 201
    value = first.json()
    assert a.get("/invites/current").json()["invite"]["code"] == value["code"]
    assert b.get("/invites/current").json()["invite"] is None
    code(a.post("/invites"), 409, "CONFLICT")
    code(a.post("/invites/accept", {"code": value["code"]}), 409, "CANNOT_INVITE_SELF")
    r = a.post("/invites/regenerate")
    assert r.status_code == 201 and r.json()["code"] != value["code"]
    code(b.post("/invites/accept", {"code": value["code"]}), 409, "INVITE_CANCELLED")
    assert a.delete("/invites/current").status_code == 204
    assert a.get("/invites/current").json()["invite"]["code"] is None
    code(a.post("/invites/regenerate"), 409, "CONFLICT")


def test_expired_invite_is_cleared_and_new_allowed(register):
    a, b = register(), register()
    inv = a.post("/invites").json()
    with engine.begin() as c:
        c.execute(
            update(m.household_invites)
            .where(m.household_invites.c.id == inv["id"])
            .values(
                expires_at=datetime.now(timezone.utc).replace(tzinfo=None)
                - timedelta(seconds=1)
            )
        )
    r = a.get("/invites/current").json()["invite"]
    assert r["status"] == "expired" and r["code"] is None
    code(b.post("/invites/accept", {"code": inv["code"]}), 409, "INVITE_EXPIRED")
    assert a.post("/invites").status_code == 201


def test_binding_isolation_unbind_and_history(pair, register):
    a, b, root = pair
    outsider = register()
    assert len(a.get(root).json()["members"]) == 2
    assert a.get("/me").json()["active_household"]["id"] == root.split("/")[-1]
    code(outsider.get(root), 403, "FORBIDDEN")
    code(a.post("/invites"), 409, "ALREADY_BOUND")
    r = a.post(root + "/unbind")
    assert r.status_code == 200 and r.json()["status"] == "dissolved"
    assert a.get("/me").json()["active_household"] is None
    assert b.get(root).status_code == 200
    assert a.get("/households").json()["items"][0]["status"] == "dissolved"
    code(b.post(root + "/unbind"), 409, "HOUSEHOLD_DISSOLVED")
    assert a.post("/invites").status_code == 201


def test_idempotency_same_response_conflicts_and_errors_rollback(register):
    a = register()
    r = a.post("/invites", key="first-key-000")
    assert a.post("/invites", key="first-key-000").json() == r.json()
    code(
        a.post("/invites/regenerate", key="first-key-000"), 409, "IDEMPOTENCY_CONFLICT"
    )
    code(a.post("/invites", idem=False), 422, "VALIDATION_ERROR")
    code(a.post("/invites", key="too"), 422, "VALIDATION_ERROR")
    code(a.post("/invites", key="fail-key-000"), 409, "CONFLICT")
    assert a.delete("/invites/current").status_code == 204
    assert a.post("/invites", key="fail-key-000").status_code == 201
    with engine.connect() as c:
        assert (
            c.scalar(
                select(func.count())
                .select_from(m.audit_logs)
                .where(m.audit_logs.c.actor_user_id == a.id)
            )
            == 3
        )


def test_accept_cancels_both_invites_and_bound_users(register):
    a, b, c = register(), register(), register()
    x = a.post("/invites").json()
    y = b.post("/invites").json()
    assert b.post("/invites/accept", {"code": x["code"]}).status_code == 201
    assert a.get("/invites/current").json()["invite"]["code"] is None
    assert b.get("/invites/current").json()["invite"]["status"] == "cancelled"
    code(c.post("/invites/accept", {"code": x["code"]}), 409, "INVITE_USED")
    code(c.post("/invites/accept", {"code": y["code"]}), 409, "INVITE_CANCELLED")
    z = c.post("/invites").json()
    code(a.post("/invites/accept", {"code": z["code"]}), 409, "ALREADY_BOUND")


def test_read_timestamps_are_utc(pair):
    a, b, root = pair
    assert a.get(root).json()["created_at"].endswith(("Z", "+00:00"))


def test_expired_accept_clears_plaintext_even_on_error(register):
    a, b = register(), register()
    inv = a.post("/invites").json()
    with engine.begin() as c:
        c.execute(
            update(m.household_invites)
            .where(m.household_invites.c.id == inv["id"])
            .values(
                expires_at=datetime.now(timezone.utc).replace(tzinfo=None)
                - timedelta(seconds=1)
            )
        )
    code(b.post("/invites/accept", {"code": inv["code"]}), 409, "INVITE_EXPIRED")
    with engine.connect() as c:
        row = (
            c.execute(
                select(m.household_invites).where(m.household_invites.c.id == inv["id"])
            )
            .mappings()
            .one()
        )
        assert row["status"] == "expired" and row["code"] is None


def test_audit_records_safe_snapshot(pair):
    from test_chores import template

    a, b, root = pair
    chore = template(a, root, 789)
    with engine.connect() as c:
        row = (
            c.execute(
                select(m.audit_logs).where(m.audit_logs.c.entity_id == chore["id"])
            )
            .mappings()
            .one()
        )
        assert row["payload_json"]["unit_price_fen"] == 789
        assert (
            "code" not in row["payload_json"]
            and "password_hash" not in row["payload_json"]
        )


def test_whitespace_only_display_name_rejected(client):
    from uuid import uuid4

    code(
        client.post(
            "/api/v1/auth/register",
            json={
                "username": "u_" + uuid4().hex[:10],
                "password": "long-enough-pass",
                "display_name": "   ",
            },
        ),
        422,
        "VALIDATION_ERROR",
    )


def test_idempotency_compares_raw_json_even_on_bodyless_post(register):
    a = register()
    assert (
        a.post("/invites", {"client_note": "one"}, key="raw-body-key-000").status_code
        == 201
    )
    code(
        a.post("/invites", {"client_note": "two"}, key="raw-body-key-000"),
        409,
        "IDEMPOTENCY_CONFLICT",
    )
