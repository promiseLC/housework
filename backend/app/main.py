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
