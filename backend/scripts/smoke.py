"""Real HTTP smoke against a local dev server; no production target allowed."""

import json
from uuid import uuid4
import httpx

checks = 0
with httpx.Client(base_url="http://127.0.0.1:8000", timeout=15) as client:

    def call(method, path, expected, token=None, body=None, key=True):
        global checks
        headers = {}
        if token:
            headers["Authorization"] = "Bearer " + token
        if method == "POST" and key:
            headers["Idempotency-Key"] = str(uuid4())
        r = client.request(method, path, headers=headers, json=body)
        assert r.status_code == expected, (method, path, r.status_code, r.text)
        checks += 1
        return r.json() if r.content else None

    assert call("GET", "/healthz", 200) == {"status": "ok"}
    tokens = []
    for label in ("a", "b"):
        r = call(
            "POST",
            "/api/v1/auth/register",
            201,
            body={
                "username": "smoke_" + label + "_" + uuid4().hex[:12],
                "password": "local-smoke-password",
                "display_name": label,
            },
        )
        tokens.append(r["access_token"])
    a, b = tokens
    inv = call("POST", "/api/v1/invites", 201, a)
    assert (
        call("GET", "/api/v1/invites/current", 200, a)["invite"]["code"] == inv["code"]
    )
    new = call("POST", "/api/v1/invites/regenerate", 201, a)
    call("POST", "/api/v1/invites/accept", 409, b, {"code": inv["code"]})
    h = call("POST", "/api/v1/invites/accept", 201, b, {"code": new["code"]})
    root = "/api/v1/households/" + h["id"]
    t = call(
        "POST",
        root + "/chore-types",
        201,
        a,
        {"name": "HTTP冒烟洗碗", "unit_price_fen": 888},
    )
    task = call("POST", root + "/tasks", 201, a, {"chore_type_id": t["id"]})
    path = root + "/tasks/" + task["id"]
    call("POST", root + "/unbind", 409, a)
    call("POST", path + "/submit", 200, a, {"note": "完成"})
    call("POST", path + "/withdraw", 200, a)
    call("POST", path + "/submit", 200, a)
    call("POST", path + "/confirm", 403, a)
    confirmed = call("POST", path + "/confirm", 200, b)
    selected = {"wage_ids": [confirmed["wage"]["id"]]}
    preview = call("POST", root + "/payments/preview", 200, b, selected, key=False)
    assert preview["total_amount_fen"] == 888 and preview["wage_count"] == 1
    first = call("POST", root + "/payments", 201, b, selected)
    assert first["status"] == "awaiting_receipt"
    p = root + "/payments/" + first["id"]
    call("POST", p + "/confirm-received", 403, b)
    call("POST", p + "/reject-received", 200, a, {"reason": "未到账"})
    second = call("POST", root + "/payments", 201, b, selected)
    call("POST", root + "/payments/" + second["id"] + "/confirm-received", 200, a)
    summary = call("GET", root + "/ledger/summary", 200, a)
    assert summary["settled_to_me_fen"] == 888 and summary["payable_to_me_fen"] == 0
    call("POST", root + "/unbind", 200, a)
    call("POST", root + "/tasks", 409, a, {"chore_type_id": t["id"]})
    call("GET", path, 200, a)
print(json.dumps({"checks": checks, "passed": checks, "failed": 0, "result": "PASS"}))
