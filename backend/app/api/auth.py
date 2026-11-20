from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app import models as m, schemas as s
from app.core.dependencies import connection, current_user
from app.core.security import hasher, check_password, tokens, digest, now
from app.core.store import add, one, change, active_membership, household_view
from app.core.errors import fail

router=APIRouter()

@router.post("/auth/register", status_code=201, response_model=s.AuthTokenResponse, operation_id="register")
def register(body: s.RegisterRequest, conn=Depends(connection)):
    if one(conn, m.users, m.users.c.username == body.username): fail("USERNAME_TAKEN", "账号已被使用")
    try:
        user=add(conn, m.users, username=body.username, password_hash=hasher.hash(body.password), display_name=body.display_name, created_at=now(), updated_at=now())
    except IntegrityError:
        fail("USERNAME_TAKEN", "账号已被使用")
    return tokens(conn, user)

@router.post("/auth/login", response_model=s.AuthTokenResponse, operation_id="login")
def login(body: s.LoginRequest, conn=Depends(connection)):
    user=one(conn, m.users, m.users.c.username == body.username)
    if not user or not check_password(user["password_hash"], body.password): fail("UNAUTHORIZED", "账号或密码不正确", 401)
    return tokens(conn, user)

@router.post("/auth/refresh", response_model=s.AuthTokenResponse, operation_id="refreshToken")
def refresh(body: s.RefreshRequest, conn=Depends(connection)):
    row=one(conn, m.refresh_tokens, m.refresh_tokens.c.token_hash == digest(body.refresh_token), lock=True)
    if not row or row["revoked_at"] or row["expires_at"] <= now(): fail("UNAUTHORIZED", "刷新令牌已失效", 401)
    change(conn, m.refresh_tokens, row["id"], revoked_at=now())
    return tokens(conn, one(conn, m.users, m.users.c.id == row["user_id"]))

@router.post("/auth/logout", status_code=204, operation_id="logout")
def logout(body: s.RefreshRequest | None = None, conn=Depends(connection), user=Depends(current_user)):
    if body:
        row=one(conn, m.refresh_tokens, (m.refresh_tokens.c.token_hash == digest(body.refresh_token)) & (m.refresh_tokens.c.user_id == user["id"]), lock=True)
        if row: change(conn, m.refresh_tokens, row["id"], revoked_at=now())
    return Response(status_code=204)

@router.get("/me", response_model=s.MeResponse, operation_id="getMe")
def me(conn=Depends(connection), user=Depends(current_user)):
    membership=active_membership(conn, user["id"])
    h=one(conn, m.households, m.households.c.id == membership["household_id"]) if membership else None
    return {"user": user, "active_household": household_view(conn, h) if h else None}
