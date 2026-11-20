import hashlib
import json
from fastapi import Request
from fastapi import FastAPI
from sqlalchemy import text
from app.core.db import engine
from app.core.errors import install_errors
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, households
from app.api import chores
from app.api import payments


app = FastAPI(
    title="Household Pay API", version="0.1.2", openapi_url="/api/v1/openapi.json"
)
install_errors(app)


@app.get("/healthz", include_in_schema=False)
def healthz():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "Idempotency-Key"],
)
app.include_router(auth.router, prefix="/api/v1")
app.include_router(households.router, prefix="/api/v1")


app.include_router(chores.router, prefix="/api/v1")


app.include_router(payments.router, prefix="/api/v1")


@app.middleware("http")
async def fingerprint_body(request: Request, call_next):
    # Preserve the actual JSON body, including fields ignored by a bodyless
    # operation. Never persist plaintext body data; only its SHA256 is saved.
    if request.method == "POST":
        raw = await request.body()
        try:
            payload = json.loads(raw) if raw else None
            raw = json.dumps(
                payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False
            ).encode()
        except (ValueError, UnicodeDecodeError):
            pass
        request.state.body_fingerprint = hashlib.sha256(raw).hexdigest()
    return await call_next(request)
