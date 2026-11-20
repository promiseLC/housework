import hashlib
import json
from sqlalchemy import select, update
from sqlalchemy.dialects.mysql import insert
from app import models as m
from app.core.errors import fail
from app.core.security import now
from app.core.store import wire

def execute(conn, user, key, method, path, body, status, operation):
    if not key or not 8 <= len(key) <= 64:
        fail("VALIDATION_ERROR", "Idempotency-Key 必须为8到64字符", 422)
    hashed = hashlib.sha256(json.dumps(wire(body), sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()).hexdigest()
    t=m.idempotency_keys
    # The PK serializes simultaneous calls even before the first response exists.
    stmt=insert(t).values(user_id=user["id"], idempotency_key=key, method=method, path=path, request_hash=hashed, created_at=now())
    conn.execute(stmt.on_duplicate_key_update(idempotency_key=stmt.inserted.idempotency_key))
    cond=(t.c.user_id == user["id"]) & (t.c.idempotency_key == key)
    row=conn.execute(select(t).where(cond).with_for_update()).mappings().one()
    if (row["method"], row["path"], row["request_hash"]) != (method, path, hashed):
        fail("IDEMPOTENCY_CONFLICT", "幂等键已用于不同请求，请为新操作生成新键")
    if row["response_status"] is not None:
        return row["response_body"]
    result=wire(operation())
    conn.execute(update(t).where(cond).values(response_status=status, response_body=result))
    return result
