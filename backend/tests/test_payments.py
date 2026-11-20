from uuid import uuid4
from sqlalchemy import select, func
from app import models as m
from app.core.db import engine
from conftest import code
from test_chores import template, task


def wage(worker, payer, root, tid):
    path=task(worker,root,tid)
    assert worker.post(path+"/submit").status_code == 200
    r=payer.post(path+"/confirm")
    assert r.status_code == 200, r.text
    return r.json()["wage"]


def counts(hid):
    with engine.connect() as c:
        return [c.scalar(select(func.count()).select_from(t).where(t.c.household_id==hid)) for t in (m.payments,m.payment_items,m.audit_logs)]


def test_preview_is_read_only_and_payer_only(pair):
    a,b,root=pair
    tid=template(a,root,99)["id"]
    w=wage(a,b,root,tid)
    before=counts(w["household_id"])
    r=b.post(root+"/payments/preview", {"wage_ids":[w["id"]]},idem=False)
    assert r.status_code == 200, r.text
    assert r.json()["payer"]["id"]==b.id and r.json()["payee"]["id"]==a.id
    assert r.json()["total_amount_fen"]==99 and r.json()["wage_count"]==1
    assert counts(w["household_id"])==before
    assert b.get(root+"/wages/"+w["id"]).json()["status"]=="payable"
    code(a.post(root+"/payments/preview", {"wage_ids":[w["id"]]}),403,"FORBIDDEN")
    code(a.post(root+"/payments", {"wage_ids":[w["id"]]}),403,"FORBIDDEN")


def test_payment_reject_release_repay_confirm_closed_loop(pair):
    a,b,root=pair
    tid=template(a,root,123)["id"]
    w1,w2=wage(a,b,root,tid),wage(a,b,root,tid)
    req={"wage_ids":[w1["id"],w2["id"]]}
    r=b.post(root+"/payments", req,key="payment-key-000")
    assert r.status_code==201, r.text
    paid=r.json(); path=root+"/payments/"+paid["id"]
    assert paid["status"]=="awaiting_receipt" and paid["total_amount_fen"]==246 and len(paid["items"])==2
    assert b.post(root+"/payments",req,key="payment-key-000").json()==paid
    code(b.post(path+"/confirm-received"),403,"CANNOT_CONFIRM_OWN_PAYMENT")
    code(b.post(root+"/payments",req),409,"WAGE_ALREADY_LOCKED")
    code(a.post(root+"/unbind"),409,"UNBIND_BLOCKED")
    code(a.post(path+"/reject-received",{"reason":""}),422,"VALIDATION_ERROR")
    assert a.post(path+"/reject-received",{"reason":"未收到"}).json()["status"]=="rejected"
    assert b.get(root+"/wages/"+w1["id"]).json()["locked_payment_id"] is None
    r=b.post(root+"/payments",req)
    assert r.status_code==201, r.text
    second=root+"/payments/"+r.json()["id"]
    r=a.post(second+"/confirm-received",key="receipt-key-000")
    assert r.status_code==200 and r.json()["status"]=="settled"
    assert a.post(second+"/confirm-received",key="receipt-key-000").json()==r.json()
    code(a.post(second+"/reject-received",{"reason":"反悔"}),409,"PAYMENT_INVALID_STATE")
    code(b.post(root+"/payments",req),409,"WAGE_NOT_PAYABLE")
    assert b.get(path).json()["status"]=="rejected"
    for w in (w1,w2):
        value=a.get(root+"/wages/"+w["id"]).json()
        assert value["status"]=="settled" and value["settled_at"]
    assert len(b.get(root+"/payments?status=rejected").json()["items"])==1
    assert b.get(root+"/payments?page_size=1").json()["total"]==2
    assert a.post(root+"/unbind").status_code==200
    code(a.post(second+"/confirm-received"),409,"HOUSEHOLD_DISSOLVED")
    assert a.get(second).status_code==200


def test_invalid_selection_direction_and_no_partial_write(pair,register):
    a,b,root=pair
    tid=template(a,root)["id"]
    x,y=wage(a,b,root,tid),wage(b,a,root,tid)
    for endpoint in ("/payments/preview","/payments"):
        code(a.post(root+endpoint,{"wage_ids":[]}),422,"VALIDATION_ERROR")
        code(a.post(root+endpoint,{"wage_ids":[x["id"],x["id"]]}),422,"VALIDATION_ERROR")
        code(a.post(root+endpoint,{"wage_ids":[x["id"],y["id"]]}),409,"WAGES_DIRECTION_MISMATCH")
        before=counts(x["household_id"])
        code(b.post(root+endpoint,{"wage_ids":[x["id"],str(uuid4())]}),404,"NOT_FOUND")
        assert counts(x["household_id"])==before
    outsider=register()
    code(outsider.get(root+"/wages/"+x["id"]),403,"FORBIDDEN")
    code(outsider.post(root+"/payments/preview",{"wage_ids":[x["id"]]}),403,"FORBIDDEN")


def test_ledger_perspective_direction_filters_and_no_netting(pair):
    a,b,root=pair
    tid=template(a,root,177)["id"]
    x=wage(a,b,root,tid); wage(b,a,root,tid)
    p=task(a,root,tid)
    a.post(p+"/submit")
    p2=task(a,root,tid)
    summary=a.get(root+"/ledger/summary")
    assert summary.status_code==200, summary.text
    s=summary.json()
    assert s["payable_to_me_fen"]==177 and s["payable_by_me_fen"]==177
    assert s["pending_confirm_as_worker_count"]==1 and s["in_progress_count"]==1
    assert b.get(root+"/ledger/summary").json()["pending_confirm_as_reviewer_count"]==1
    assert a.get(root+"/wages?direction=receivable&status=payable").json()["total"]==1
    assert a.get(root+"/wages?direction=payable").json()["total"]==1
    r=b.post(root+"/payments",{"wage_ids":[x["id"]]})
    s=a.get(root+"/ledger/summary").json()
    assert s["awaiting_my_receipt_fen"]==177 and s["payable_to_me_fen"]==0 and s["payable_by_me_fen"]==177
    assert b.get(root+"/ledger/summary").json()["awaiting_partner_receipt_fen"]==177
    a.post(root+"/payments/"+r.json()["id"]+"/confirm-received")
    assert a.get(root+"/ledger/summary").json()["settled_to_me_fen"]==177
    assert b.get(root+"/ledger/summary").json()["settled_by_me_fen"]==177
    code(a.get(root+"/wages?direction=wrong"),422,"VALIDATION_ERROR")
