from fastapi import Depends, Header
from sqlalchemy.exc import IntegrityError, OperationalError
from app.core.db import engine
from app.core.security import authenticate
from app.core.errors import fail

def connection():
    try:
        with engine.begin() as conn:
            yield conn
    except IntegrityError:
        fail("CONFLICT", "唯一约束或关联记录冲突，请刷新重试")
    except OperationalError as exc:
        if exc.orig.args[0] in (1205, 1213):
            fail("CONFLICT", "并发操作冲突，请使用原幂等键重试")
        raise

def current_user(conn=Depends(connection), authorization: str | None = Header(None)):
    return authenticate(conn, authorization)
