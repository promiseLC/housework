import pytest
from sqlalchemy import select, func
from app import models as m
from app.core.db import engine
from conftest import code


def template(a, root, amount=100, name="洗碗"):
    r = a.post(root + "/chore-types", {"name": name, "unit_price_fen": amount})
    assert r.status_code == 201, r.text
    return r.json()


def task(a, root, tid):
    r = a.post(root + "/tasks", {"chore_type_id": tid})
    assert r.status_code == 201, r.text
    return root + "/tasks/" + r.json()["id"]


@pytest.mark.parametrize("amount", [0, -1, 1.5, "100", True, None, 100000001])
def test_integer_amount_validation(pair, amount):
    a, b, root = pair
    code(
        a.post(root + "/chore-types", {"name": "洗碗", "unit_price_fen": amount}),
        422,
        "VALIDATION_ERROR",
    )


def test_snapshot_deactivate_and_template_uniqueness(pair):
    a, b, root = pair
    t = template(a, root, 123)
    code(
        b.post(root + "/chore-types", {"name": "洗碗", "unit_price_fen": 100}),
        409,
        "CONFLICT",
    )
    path = task(a, root, t["id"])
    r = b.patch(
        root + "/chore-types/" + t["id"], {"name": "洗碗新价", "unit_price_fen": 999}
    )
    assert r.status_code == 200
    r = a.get(path).json()
    assert r["name_snapshot"] == "洗碗" and r["unit_price_fen_snapshot"] == 123
    assert a.post(root + "/chore-types/" + t["id"] + "/deactivate").status_code == 200
    code(
        a.post(root + "/tasks", {"chore_type_id": t["id"]}), 409, "CHORE_TYPE_INACTIVE"
    )
    assert a.get(root + "/chore-types").json()["items"] == []
    assert len(a.get(root + "/chore-types?include_inactive=true").json()["items"]) == 1
    assert template(a, root, 100, "洗碗新价")


def test_submit_withdraw_cancel_and_unbind_blocks(pair):
    a, b, root = pair
    path = task(a, root, template(a, root)["id"])
    code(a.post(root + "/unbind"), 409, "UNBIND_BLOCKED")
    code(b.post(path + "/submit"), 403, "FORBIDDEN")
    assert (
        a.post(path + "/submit", {"note": "做完"}).json()["status"] == "pending_confirm"
    )
    code(b.post(path + "/withdraw"), 403, "CANNOT_WITHDRAW_OTHERS_TASK")
    code(a.post(path + "/cancel"), 409, "TASK_INVALID_STATE")
    r = a.post(path + "/withdraw")
    assert (
        r.status_code == 200
        and r.json()["status"] == "in_progress"
        and r.json()["submitted_at"] is None
    )
    assert [e["action"] for e in r.json()["review_events"]] == ["submit", "withdraw"]
    code(a.post(root + "/unbind"), 409, "UNBIND_BLOCKED")
    assert a.post(path + "/cancel").json()["status"] == "cancelled"
    assert a.post(root + "/unbind").status_code == 200
    code(
        a.post(root + "/tasks", {"chore_type_id": a.get(path).json()["chore_type_id"]}),
        409,
        "HOUSEHOLD_DISSOLVED",
    )
    assert a.get(path).status_code == 200


def test_review_reject_resubmit_confirm_one_wage_and_idempotency(pair):
    a, b, root = pair
    path = task(a, root, template(a, root, 321)["id"])
    assert a.post(path + "/submit").status_code == 200
    code(a.post(path + "/confirm"), 403, "CANNOT_REVIEW_OWN_TASK")
    code(a.post(path + "/reject", {"reason": "bad"}), 403, "CANNOT_REVIEW_OWN_TASK")
    code(b.post(path + "/reject", {"reason": ""}), 422, "VALIDATION_ERROR")
    assert (
        b.post(path + "/reject", {"reason": "没洗干净"}).json()["status"] == "rejected"
    )
    code(a.post(root + "/unbind"), 409, "UNBIND_BLOCKED")
    code(b.post(path + "/confirm"), 409, "TASK_INVALID_STATE")
    code(a.post(path + "/withdraw"), 409, "TASK_INVALID_STATE")
    assert a.post(path + "/submit", {"note": "重做"}).status_code == 200
    r = b.post(path + "/confirm", key="confirm-task-001")
    assert r.status_code == 200, r.text
    assert r.json()["wage"]["amount_fen"] == 321
    assert b.post(path + "/confirm", key="confirm-task-001").json() == r.json()
    code(b.post(path + "/confirm"), 409, "TASK_INVALID_STATE")
    code(a.post(path + "/withdraw"), 409, "TASK_INVALID_STATE")
    events = a.get(path).json()["review_events"]
    assert [e["action"] for e in events] == ["submit", "reject", "submit", "confirm"]
    with engine.connect() as c:
        assert (
            c.scalar(
                select(func.count())
                .select_from(m.wage_entries)
                .where(m.wage_entries.c.task_id == path.split("/")[-1])
            )
            == 1
        )
    code(a.post(root + "/unbind"), 409, "UNBIND_BLOCKED")


def test_pagination_roles_isolation_and_body_conflict(pair, register):
    a, b, root = pair
    t = template(a, root)
    p = task(a, root, t["id"])
    task(b, root, t["id"])
    assert a.get(root + "/tasks?role=worker&page_size=1").json()["total"] == 1
    assert a.get(root + "/tasks?role=reviewer").json()["total"] == 1
    code(a.get(root + "/tasks?page=0"), 422, "VALIDATION_ERROR")
    code(a.get(root + "/tasks?status=wrong"), 422, "VALIDATION_ERROR")
    outsider = register()
    code(outsider.get(p), 403, "FORBIDDEN")
    assert (
        a.post(p + "/submit", {"note": "first"}, key="samebody-000").status_code == 200
    )
    code(
        a.post(p + "/submit", {"note": "second"}, key="samebody-000"),
        409,
        "IDEMPOTENCY_CONFLICT",
    )
