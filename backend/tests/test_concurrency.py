import pytest
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from sqlalchemy import select,func
from app import models as m
from app.core.db import engine
from test_chores import template,task
from test_payments import wage


def race(*calls):
    gate=Barrier(len(calls))
    def invoke(f):
        gate.wait(timeout=10)
        return f()
    with ThreadPoolExecutor(max_workers=len(calls)) as pool:
        return list(pool.map(invoke,calls))


def test_concurrent_confirm_generates_one_wage(pair):
    a,b,root=pair
    p=task(a,root,template(a,root)["id"])
    a.post(p+"/submit")
    results=race(lambda:b.post(p+"/confirm"),lambda:b.post(p+"/confirm"))
    assert sorted(r.status_code for r in results)==[200,409]
    with engine.connect() as c:
        assert c.scalar(select(func.count()).select_from(m.wage_entries).where(m.wage_entries.c.task_id==p.split("/")[-1]))==1


def test_concurrent_withdraw_vs_confirm(pair):
    a,b,root=pair
    p=task(a,root,template(a,root)["id"])
    for _ in range(5):
        if a.get(p).json()["status"]=="in_progress":a.post(p+"/submit")
        else:
            p=task(a,root,a.get(p).json()["chore_type_id"])
            a.post(p+"/submit")
        results=race(lambda:a.post(p+"/withdraw"),lambda:b.post(p+"/confirm"))
        assert sorted(r.status_code for r in results)==[200,409]
        t=a.get(p).json()
        assert (t["status"]=="confirmed" and t["wage"] is not None) or (t["status"]=="in_progress" and t["wage"] is None)


def test_concurrent_payment_competes_for_same_wage(pair):
    a,b,root=pair
    w=wage(a,b,root,template(a,root)["id"])
    body={"wage_ids":[w["id"]]}
    results=race(lambda:b.post(root+"/payments",body),lambda:b.post(root+"/payments",body))
    assert sorted(r.status_code for r in results)==[201,409]
    with engine.connect() as c:
        assert c.scalar(select(func.count()).select_from(m.payment_items).where(m.payment_items.c.wage_entry_id==w["id"]))==1


@pytest.mark.parametrize("_attempt", range(10))
def test_same_idempotency_key_competes_once(register, _attempt):
    a=register()
    results=race(lambda:a.post("/invites",key="concurrent-key"),lambda:a.post("/invites",key="concurrent-key"))
    assert [r.status_code for r in results]==[201,201], [r.text for r in results]
    assert results[0].json()==results[1].json()


def test_unbind_vs_new_task_is_consistent(pair):
    a,b,root=pair
    tid=template(a,root)["id"]
    results=race(lambda:a.post(root+"/unbind"),lambda:b.post(root+"/tasks",{"chore_type_id":tid}))
    statuses=[r.status_code for r in results]
    assert statuses in ([200,409],[409,201])
    h=a.get(root).json()
    if h["status"]=="dissolved":assert a.get(root+"/tasks").json()["total"]==0
    else:assert a.get(root+"/tasks").json()["total"]==1
