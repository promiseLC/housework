from fastapi import Depends, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError, OperationalError
from app.core.db import engine
from app.core.security import authenticate
from app.core.errors import fail

def connection():
    try:
        with engine.connect() as conn:
            try:
                yield conn
                conn.commit()
            except BaseException:
                conn.rollback()
                raise
    except IntegrityError:
        fail("CONFLICT", "唯一约束或关联记录冲突，请刷新重试")
    except OperationalError as exc:
        if exc.orig.args[0] in (1205, 1213):
            fail("CONFLICT", "并发操作冲突，请使用原幂等键重试")
        raise

bearer = HTTPBearer(auto_error=False)

def current_user(conn=Depends(connection), credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    return authenticate(conn, "Bearer " + credentials.credentials if credentials else None)
