import hashlib
import secrets
from datetime import datetime, timedelta, timezone
import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from sqlalchemy import select
from app.core.config import settings
from app.core.errors import fail
from app import models as m

hasher = PasswordHasher()


def now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def check_password(hashed, value):
    try:
        return hasher.verify(hashed, value)
    except (VerificationError, InvalidHashError):
        return False


def authenticate(conn, authorization):
    try:
        if not authorization or not authorization.startswith("Bearer "):
            raise ValueError()
        data = jwt.decode(
            authorization[7:],
            settings.jwt_secret,
            algorithms=["HS256"],
            options={"require": ["sub", "exp", "iat", "type"]},
        )
        if data["type"] != "access":
            raise ValueError()
        user = (
            conn.execute(select(m.users).where(m.users.c.id == data["sub"]))
            .mappings()
            .first()
        )
        if not user:
            raise ValueError()
        return user
    except (jwt.PyJWTError, ValueError):
        fail("UNAUTHORIZED", "请重新登录", 401)


def tokens(conn, user):
    from app.core.store import add

    stamp = now()
    access = jwt.encode(
        {
            "sub": user["id"],
            "type": "access",
            "iat": stamp.replace(tzinfo=timezone.utc),
            "exp": (stamp + timedelta(seconds=settings.access_seconds)).replace(
                tzinfo=timezone.utc
            ),
        },
        settings.jwt_secret,
        algorithm="HS256",
    )
    refresh = secrets.token_urlsafe(48)
    add(
        conn,
        m.refresh_tokens,
        user_id=user["id"],
        token_hash=digest(refresh),
        expires_at=stamp + timedelta(seconds=settings.refresh_seconds),
        created_at=stamp,
    )
    return {
        "access_token": access,
        "refresh_token": refresh,
        "token_type": "bearer",
        "expires_in": settings.access_seconds,
        "user": {k: user[k] for k in ("id", "username", "display_name")},
    }
