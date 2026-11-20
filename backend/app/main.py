from fastapi import FastAPI
from sqlalchemy import text
from app.core.db import engine
from app.core.errors import install_errors

app = FastAPI(title="Household Pay API", version="0.1.2", openapi_url="/api/v1/openapi.json")
install_errors(app)

@app.get("/healthz", include_in_schema=False)
def healthz():
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))
    return {"status": "ok"}

from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import auth, households
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_methods=["GET", "POST", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type", "Idempotency-Key"])
app.include_router(auth.router, prefix="/api/v1")
app.include_router(households.router, prefix="/api/v1")

from app.api import chores
app.include_router(chores.router, prefix="/api/v1")

from app.api import payments
app.include_router(payments.router, prefix="/api/v1")
