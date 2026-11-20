import importlib
from fastapi.testclient import TestClient
from sqlalchemy import inspect, text


def test_healthz_and_error_envelope():
    assert importlib.util.find_spec("app.main"), "FastAPI app missing"
    from app.main import app
    with TestClient(app) as client:
        assert client.get("/healthz").json() == {"status": "ok"}
        r = client.get("/does-not-exist")
        assert r.status_code == 404
        assert r.json()["error"]["code"] == "NOT_FOUND"


def test_real_mysql_schema():
    assert importlib.util.find_spec("app.core.db"), "MySQL schema missing"
    from app.core.db import engine
    assert engine.dialect.name == "mysql"
    with engine.connect() as c:
        assert c.scalar(text("SELECT VERSION()"))
        cols = c.execute(text("SHOW CREATE TABLE household_members")).one()[1]
        assert "active_user_id" in cols and "GENERATED ALWAYS" in cols
    i = inspect(engine)
    assert any(u["column_names"] == ["task_id"] for u in i.get_unique_constraints("wage_entries"))
    keys = i.get_unique_constraints("payment_items")
    assert any(u["column_names"] == ["payment_id", "wage_entry_id"] for u in keys)
    assert not any(u["column_names"] == ["wage_entry_id"] for u in keys)
