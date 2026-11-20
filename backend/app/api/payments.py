from typing import Literal
from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy import select, update, text
from app import models as m, schemas as s
from app.core.dependencies import connection,current_user
from app.core.errors import fail
from app.core.store import add,one,change,audit,household,resource,public
from app.core.security import now
from app.core.idempotency import execute
from app.presenters import wage_view,payment_view,payment_items_view
from app.api.chores import paginate

router=APIRouter(prefix="/households/{householdId}")

def selection(conn,user,hid,ids,lock=False):
    ids=[str(x) for x in ids]
    if len(set(ids))!=len(ids):fail("VALIDATION_ERROR","工资不能重复勾选",422)
    q=select(m.wage_entries).where((m.wage_entries.c.household_id==hid)&m.wage_entries.c.id.in_(ids)).order_by(m.wage_entries.c.id)
    if lock:q=q.with_for_update()
    rows=conn.execute(q).mappings().all()
    if len(rows)!=len(ids):fail("NOT_FOUND","部分工资不存在",404)
    if len({(r["payer_user_id"],r["worker_user_id"]) for r in rows})!=1:fail("WAGES_DIRECTION_MISMATCH","只能勾选同方向的工资")
    if rows[0]["payer_user_id"]!=user["id"]:fail("FORBIDDEN","只能由付款方标记付款",403)
    for row in rows:
        if row["status"]=="settled":fail("WAGE_NOT_PAYABLE","工资已结清，不能重复付款")
        if row["locked_payment_id"] is not None:fail("WAGE_ALREADY_LOCKED","工资已被结算单占用")
        if row["status"]!="payable":fail("WAGE_NOT_PAYABLE","工资不是待付款状态")
    return rows

@router.get("/wages",response_model=s.WageListResponse,operation_id="listWages")
def list_wages(householdId:str,status:s.WageStatus|None=None,direction:Literal["receivable","payable"]|None=None,page:int=Query(1,ge=1),page_size:int=Query(20,ge=1,le=100),conn=Depends(connection),user=Depends(current_user)):
    household(conn,user["id"],householdId)
    cond=[m.wage_entries.c.household_id==householdId]
    if status:cond.append(m.wage_entries.c.status==status)
    if direction:cond.append((m.wage_entries.c.worker_user_id if direction=="receivable" else m.wage_entries.c.payer_user_id)==user["id"])
    return paginate(conn,m.wage_entries,cond,page,page_size,lambda row:wage_view(conn,row))

@router.get("/wages/{wageId}",response_model=s.Wage,operation_id="getWage")
def get_wage(householdId:str,wageId:str,conn=Depends(connection),user=Depends(current_user)):
    household(conn,user["id"],householdId)
    return wage_view(conn,resource(conn,m.wage_entries,householdId,wageId))

@router.post("/payments/preview",response_model=s.PaymentPreview,operation_id="previewPayment")
def preview(householdId:str,body:s.CreatePaymentRequest,conn=Depends(connection),user=Depends(current_user)):
    # No row locks, no audit/idempotency writes: preview is advisory only.
    household(conn,user["id"],householdId,False)
    h=one(conn,m.households,m.households.c.id==householdId)
    if h["status"]!="active":fail("HOUSEHOLD_DISSOLVED","家庭已解绑，历史只读")
    rows=selection(conn,user,householdId,body.wage_ids,False)
    return {"payer":public(user),"payee":public(one(conn,m.users,m.users.c.id==rows[0]["worker_user_id"])),"items":payment_items_view(conn,[{"wage_entry_id":r["id"],"amount_fen":r["amount_fen"]} for r in rows]),"total_amount_fen":sum(r["amount_fen"] for r in rows),"wage_count":len(rows)}

@router.post("/payments",status_code=201,response_model=s.PaymentDetail,operation_id="createPayment")
def create_payment(householdId:str,body:s.CreatePaymentRequest,request:Request,conn=Depends(connection),user=Depends(current_user),key:str|None=Header(None,alias="Idempotency-Key")):
    def operation():
        household(conn,user["id"],householdId,True)
        rows=selection(conn,user,householdId,body.wage_ids,True)
        payment=add(conn,m.payments,household_id=householdId,payer_user_id=user["id"],payee_user_id=rows[0]["worker_user_id"],total_amount_fen=sum(r["amount_fen"] for r in rows),status="awaiting_receipt",marked_paid_at=now(),created_at=now())
        for row in rows:
            add(conn,m.payment_items,payment_id=payment["id"],wage_entry_id=row["id"],household_id=householdId,amount_fen=row["amount_fen"])
            change(conn,m.wage_entries,row["id"],status="awaiting_receipt",locked_payment_id=payment["id"])
        audit(conn,user,"payment.create",payment,householdId)
        return payment_view(conn,payment)
    return execute(conn,user,key,"POST",request.url.path,body.model_dump(mode="json"),201,operation)

@router.get("/payments",response_model=s.PaymentListResponse,operation_id="listPayments")
def list_payments(householdId:str,status:s.PaymentStatus|None=None,page:int=Query(1,ge=1),page_size:int=Query(20,ge=1,le=100),conn=Depends(connection),user=Depends(current_user)):
    household(conn,user["id"],householdId)
    cond=[m.payments.c.household_id==householdId]
    if status:cond.append(m.payments.c.status==status)
    return paginate(conn,m.payments,cond,page,page_size)

@router.get("/payments/{paymentId}",response_model=s.PaymentDetail,operation_id="getPayment")
def get_payment(householdId:str,paymentId:str,conn=Depends(connection),user=Depends(current_user)):
    household(conn,user["id"],householdId)
    return payment_view(conn,resource(conn,m.payments,householdId,paymentId))

def receipt(conn,user,hid,pid,reason=None):
    household(conn,user["id"],hid,True)
    payment=resource(conn,m.payments,hid,pid,True)
    if payment["payee_user_id"]!=user["id"]:fail("CANNOT_CONFIRM_OWN_PAYMENT","只能由收款人确认或拒绝到账",403)
    if payment["status"]!="awaiting_receipt":fail("PAYMENT_INVALID_STATE","结算单不是待收款确认状态")
    ids=conn.execute(select(m.payment_items.c.wage_entry_id).where(m.payment_items.c.payment_id==pid)).scalars().all()
    rows=conn.execute(select(m.wage_entries).where(m.wage_entries.c.id.in_(ids)).order_by(m.wage_entries.c.id).with_for_update()).mappings().all()
    if len(rows)!=len(ids) or any(r["status"]!="awaiting_receipt" or r["locked_payment_id"]!=pid for r in rows):fail("PAYMENT_INVALID_STATE","工资占用状态与结算单不一致")
    stamp=now()
    if reason is not None:
        payment=change(conn,m.payments,pid,status="rejected",reject_reason=reason,rejected_at=stamp)
        for row in rows:change(conn,m.wage_entries,row["id"],status="payable",locked_payment_id=None)
    else:
        payment=change(conn,m.payments,pid,status="settled",settled_at=stamp)
        for row in rows:change(conn,m.wage_entries,row["id"],status="settled",settled_at=stamp)
    audit(conn,user,"payment.reject" if reason is not None else "payment.confirm",payment,hid)
    return payment_view(conn,payment)

@router.post("/payments/{paymentId}/confirm-received",response_model=s.PaymentDetail,operation_id="confirmPaymentReceived")
def confirm_received(householdId:str,paymentId:str,request:Request,conn=Depends(connection),user=Depends(current_user),key:str|None=Header(None,alias="Idempotency-Key")):
    return execute(conn,user,key,"POST",request.url.path,None,200,lambda:receipt(conn,user,householdId,paymentId))

@router.post("/payments/{paymentId}/reject-received",response_model=s.PaymentDetail,operation_id="rejectPaymentReceived")
def reject_received(householdId:str,paymentId:str,body:s.RejectRequest,request:Request,conn=Depends(connection),user=Depends(current_user),key:str|None=Header(None,alias="Idempotency-Key")):
    return execute(conn,user,key,"POST",request.url.path,body.model_dump(mode="json"),200,lambda:receipt(conn,user,householdId,paymentId,body.reason))

@router.get("/ledger/summary",response_model=s.LedgerSummary,operation_id="getLedgerSummary")
def summary(householdId:str,conn=Depends(connection),user=Depends(current_user)):
    h=household(conn,user["id"],householdId)
    uid=user["id"]
    partner=conn.scalar(select(m.household_members.c.user_id).where((m.household_members.c.household_id==householdId)&(m.household_members.c.user_id!=uid)))
    # One statement gives a consistent snapshot for every aggregate under READ COMMITTED.
    aggregates=conn.execute(text("""SELECT
    (SELECT COUNT(*) FROM chore_tasks WHERE household_id=:h AND status='pending_confirm' AND payer_user_id=:u) AS pending_confirm_as_reviewer_count,
    (SELECT COUNT(*) FROM chore_tasks WHERE household_id=:h AND status='pending_confirm' AND worker_user_id=:u) AS pending_confirm_as_worker_count,
    (SELECT COUNT(*) FROM chore_tasks WHERE household_id=:h AND status='in_progress' AND worker_user_id=:u) AS in_progress_count,
    COALESCE(SUM(IF(status='payable' AND worker_user_id=:u,amount_fen,0)),0) AS payable_to_me_fen,
    COALESCE(SUM(IF(status='payable' AND payer_user_id=:u,amount_fen,0)),0) AS payable_by_me_fen,
    COALESCE(SUM(IF(status='awaiting_receipt' AND worker_user_id=:u,amount_fen,0)),0) AS awaiting_my_receipt_fen,
    COALESCE(SUM(IF(status='awaiting_receipt' AND payer_user_id=:u,amount_fen,0)),0) AS awaiting_partner_receipt_fen,
    COALESCE(SUM(IF(status='settled' AND worker_user_id=:u,amount_fen,0)),0) AS settled_to_me_fen,
    COALESCE(SUM(IF(status='settled' AND payer_user_id=:u,amount_fen,0)),0) AS settled_by_me_fen
    FROM wage_entries WHERE household_id=:h"""),{"h":householdId,"u":uid}).mappings().one()
    return {"household_id":householdId,"household_status":h["status"],"me":public(user),"partner":public(one(conn,m.users,m.users.c.id==partner)) if partner else None,**{k:int(v) for k,v in aggregates.items()}}
