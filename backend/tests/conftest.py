# ruff: noqa: E402
# App imports must follow the test database environment and migration setup.
import os
from pathlib import Path
from uuid import uuid4
import pytest
from dotenv import dotenv_values
from sqlalchemy.engine import make_url

values = dotenv_values(Path(__file__).parents[1] / ".env")
url = os.environ.get("TEST_DATABASE_URL") or values.get("TEST_DATABASE_URL")
assert url and make_url(url).database == "household_pay_test", (
    "Tests require isolated real household_pay_test MySQL database"
)
os.environ["DATABASE_URL"] = url
os.environ.setdefault("JWT_SECRET", values.get("JWT_SECRET", ""))
from alembic.config import Config
from alembic import command

cfg = Config(str(Path(__file__).parents[1] / "alembic.ini"))
cfg.set_main_option("script_location", str(Path(__file__).parents[1] / "alembic"))
command.upgrade(cfg, "head")
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


class Actor:
    def __init__(self, client, data):
        self.client, self.data = client, data
        self.id = data["user"]["id"]
        self.headers = {"Authorization": "Bearer " + data["access_token"]}

    def get(self, path, **kw):
        return self.client.get("/api/v1" + path, headers=self.headers, **kw)

    def post(self, path, json=None, key=None, idem=True):
        headers = dict(self.headers)
        if idem:
            headers["Idempotency-Key"] = key or str(uuid4())
        return self.client.post("/api/v1" + path, json=json, headers=headers)

    def patch(self, path, json):
        return self.client.patch("/api/v1" + path, json=json, headers=self.headers)

    def delete(self, path):
        return self.client.delete("/api/v1" + path, headers=self.headers)


@pytest.fixture
def register(client):
    def make(username=None):
        r = client.post(
            "/api/v1/auth/register",
            json={
                "username": username or "u_" + uuid4().hex[:20],
                "password": "safe-password-123",
                "display_name": "测试",
            },
        )
        assert r.status_code == 201, r.text
        return Actor(client, r.json())

    return make


@pytest.fixture
def pair(register):
    a, b = register(), register()
    inv = a.post("/invites")
    assert inv.status_code == 201, inv.text
    r = b.post("/invites/accept", {"code": inv.json()["code"]})
    assert r.status_code == 201, r.text
    return a, b, "/households/" + r.json()["id"]


def code(response, status, expected):
    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == expected, response.text
