from typing import Literal
from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy import select, func
from app import models as m, schemas as s
from app.core.types import UUIDString
from app.core.responses import ERRORS
from app.core.dependencies import connection, current_user
from app.core.errors import fail
from app.core.store import add, change, audit, household, resource
from app.core.security import now
from app.core.idempotency import execute
from app.presenters import task_view

router = APIRouter(prefix="/households/{householdId}", responses=ERRORS)


def paginate(conn, table, conditions, page, page_size, presenter=dict):
    query = select(table).where(*conditions)
    total = conn.scalar(select(func.count()).select_from(query.subquery()))
    date = table.c.started_at if table.name == "chore_tasks" else table.c.created_at
    rows = (
        conn.execute(
            query.order_by(date.desc(), table.c.id)
            .limit(page_size)
            .offset((page - 1) * page_size)
        )
        .mappings()
        .all()
    )
    return {
        "items": [presenter(row) for row in rows],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.get(
    "/chore-types",
    response_model=s.ChoreTypeListResponse,
    operation_id="listChoreTypes",
)
def list_types(
    householdId: UUIDString,
    include_inactive: bool = False,
    conn=Depends(connection),
    user=Depends(current_user),
):
    household(conn, user["id"], householdId)
    q = select(m.chore_types).where(m.chore_types.c.household_id == householdId)
    if not include_inactive:
        q = q.where(m.chore_types.c.is_active.is_(True))
    return {
        "items": conn.execute(
            q.order_by(m.chore_types.c.created_at, m.chore_types.c.id)
        )
        .mappings()
        .all()
    }


@router.post(
    "/chore-types",
    status_code=201,
    response_model=s.ChoreType,
    operation_id="createChoreType",
)
def create_type(
    householdId: UUIDString,
    body: s.ChoreTypeWriteRequest,
    request: Request,
    conn=Depends(connection),
    user=Depends(current_user),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
):
    def operation():
        household(conn, user["id"], householdId, True)
        row = add(
            conn,
            m.chore_types,
            household_id=householdId,
            name=body.name,
            unit_price_fen=body.unit_price_fen,
            is_active=True,
            created_by_user_id=user["id"],
            created_at=now(),
            updated_at=now(),
        )
        audit(conn, user, "chore_type.create", row, householdId)
        return row

    return execute(
        conn,
        user,
        key,
        "POST",
        request,
        body.model_dump(mode="json"),
        201,
        operation,
    )


@router.patch(
    "/chore-types/{choreTypeId}",
    response_model=s.ChoreType,
    operation_id="updateChoreType",
)
def update_type(
    householdId: UUIDString,
    choreTypeId: UUIDString,
    body: s.ChoreTypePatchRequest,
    conn=Depends(connection),
    user=Depends(current_user),
):
    household(conn, user["id"], householdId, True)
    resource(conn, m.chore_types, householdId, choreTypeId, True)
    fields = body.model_dump(exclude_unset=True)
    if any(v is None for v in fields.values()):
        fail("VALIDATION_ERROR", "名称和金额不能为null", 422)
    row = change(conn, m.chore_types, choreTypeId, **fields, updated_at=now())
    audit(conn, user, "chore_type.update", row, householdId)
    return row


@router.post(
    "/chore-types/{choreTypeId}/deactivate",
    response_model=s.ChoreType,
    operation_id="deactivateChoreType",
)
def deactivate(
    householdId: UUIDString,
    choreTypeId: UUIDString,
    request: Request,
    conn=Depends(connection),
    user=Depends(current_user),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
):
    def operation():
        household(conn, user["id"], householdId, True)
        resource(conn, m.chore_types, householdId, choreTypeId, True)
        row = change(
            conn, m.chore_types, choreTypeId, is_active=False, updated_at=now()
        )
        audit(conn, user, "chore_type.deactivate", row, householdId)
        return row

    return execute(conn, user, key, "POST", request, None, 200, operation)


@router.post("/tasks", status_code=201, response_model=s.Task, operation_id="startTask")
def start(
    householdId: UUIDString,
    body: s.StartTaskRequest,
    request: Request,
    conn=Depends(connection),
    user=Depends(current_user),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
):
    def operation():
        household(conn, user["id"], householdId, True)
        chore = resource(
            conn, m.chore_types, householdId, str(body.chore_type_id), True
        )
        if not chore["is_active"]:
            fail("CHORE_TYPE_INACTIVE", "家务模板已停用")
        partner = conn.scalar(
            select(m.household_members.c.user_id).where(
                (m.household_members.c.household_id == householdId)
                & (m.household_members.c.user_id != user["id"])
            )
        )
        row = add(
            conn,
            m.chore_tasks,
            household_id=householdId,
            chore_type_id=chore["id"],
            name_snapshot=chore["name"],
            unit_price_fen_snapshot=chore["unit_price_fen"],
            worker_user_id=user["id"],
            payer_user_id=partner,
            status="in_progress",
            started_at=now(),
            version=1,
        )
        audit(conn, user, "task.start", row, householdId)
        return task_view(conn, row)

    return execute(
        conn,
        user,
        key,
        "POST",
        request,
        body.model_dump(mode="json"),
        201,
        operation,
    )


@router.get("/tasks", response_model=s.TaskListResponse, operation_id="listTasks")
def list_tasks(
    householdId: UUIDString,
    status: s.TaskStatus | None = None,
    role: Literal["worker", "reviewer"] | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    conn=Depends(connection),
    user=Depends(current_user),
):
    household(conn, user["id"], householdId)
    cond = [m.chore_tasks.c.household_id == householdId]
    if status:
        cond.append(m.chore_tasks.c.status == status)
    if role:
        cond.append(
            (
                m.chore_tasks.c.worker_user_id
                if role == "worker"
                else m.chore_tasks.c.payer_user_id
            )
            == user["id"]
        )
    return paginate(
        conn, m.chore_tasks, cond, page, page_size, lambda row: task_view(conn, row)
    )


@router.get("/tasks/{taskId}", response_model=s.TaskDetail, operation_id="getTask")
def get_task(
    householdId: UUIDString,
    taskId: UUIDString,
    conn=Depends(connection),
    user=Depends(current_user),
):
    household(conn, user["id"], householdId)
    return task_view(conn, resource(conn, m.chore_tasks, householdId, taskId), True)


def transition(conn, user, hid, tid, action, body=None):
    household(conn, user["id"], hid, True)
    row = resource(conn, m.chore_tasks, hid, tid, True)
    worker = row["worker_user_id"] == user["id"]
    if action in ("confirm", "reject") and worker:
        fail("CANNOT_REVIEW_OWN_TASK", "不能审核自己的任务", 403)
    if action in ("submit", "withdraw", "cancel") and not worker:
        fail(
            "CANNOT_WITHDRAW_OTHERS_TASK" if action == "withdraw" else "FORBIDDEN",
            "仅执行人可以操作",
            403,
        )
    allowed = {
        "submit": ["in_progress", "rejected"],
        "withdraw": ["pending_confirm"],
        "cancel": ["in_progress"],
        "confirm": ["pending_confirm"],
        "reject": ["pending_confirm"],
    }
    if row["status"] not in allowed[action]:
        fail("TASK_INVALID_STATE", "当前任务状态不允许这个操作")
    values = {"version": row["version"] + 1}
    if action == "submit":
        values.update(
            status="pending_confirm",
            submitted_at=now(),
            note=body.note if body else None,
            reject_reason=None,
            rejected_at=None,
        )
    elif action == "withdraw":
        values.update(status="in_progress", submitted_at=None)
    elif action == "cancel":
        values.update(status="cancelled", cancelled_at=now())
    elif action == "confirm":
        values.update(status="confirmed", confirmed_at=now())
    else:
        values.update(status="rejected", rejected_at=now(), reject_reason=body.reason)
    row = change(conn, m.chore_tasks, tid, **values)
    if action != "cancel":
        add(
            conn,
            m.task_review_events,
            household_id=hid,
            task_id=tid,
            actor_user_id=user["id"],
            action=action,
            reason=body.reason if action == "reject" else None,
            created_at=now(),
        )
    if action == "confirm":
        add(
            conn,
            m.wage_entries,
            household_id=hid,
            task_id=tid,
            amount_fen=row["unit_price_fen_snapshot"],
            worker_user_id=row["worker_user_id"],
            payer_user_id=row["payer_user_id"],
            status="payable",
            created_at=now(),
        )
    audit(conn, user, "task." + action, row, hid)
    return task_view(conn, row, True)


@router.post(
    "/tasks/{taskId}/submit", response_model=s.TaskDetail, operation_id="submitTask"
)
def submit(
    householdId: UUIDString,
    taskId: UUIDString,
    request: Request,
    body: s.SubmitTaskRequest | None = None,
    conn=Depends(connection),
    user=Depends(current_user),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
):
    return execute(
        conn,
        user,
        key,
        "POST",
        request,
        body.model_dump(mode="json") if body else None,
        200,
        lambda: transition(conn, user, householdId, taskId, "submit", body),
    )


@router.post(
    "/tasks/{taskId}/reject", response_model=s.TaskDetail, operation_id="rejectTask"
)
def reject(
    householdId: UUIDString,
    taskId: UUIDString,
    body: s.RejectRequest,
    request: Request,
    conn=Depends(connection),
    user=Depends(current_user),
    key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
):
    return execute(
        conn,
        user,
        key,
        "POST",
        request,
        body.model_dump(mode="json"),
        200,
        lambda: transition(conn, user, householdId, taskId, "reject", body),
    )


def register_action(action, operation_id, model):
    def endpoint(
        householdId: UUIDString,
        taskId: UUIDString,
        request: Request,
        conn=Depends(connection),
        user=Depends(current_user),
        key: str = Header(..., alias="Idempotency-Key", min_length=8, max_length=64),
    ):
        return execute(
            conn,
            user,
            key,
            "POST",
            request,
            None,
            200,
            lambda: transition(conn, user, householdId, taskId, action),
        )

    router.add_api_route(
        "/tasks/{taskId}/" + action,
        endpoint,
        methods=["POST"],
        response_model=model,
        operation_id=operation_id,
    )


register_action("withdraw", "withdrawTask", s.TaskDetail)
register_action("confirm", "confirmTask", s.TaskDetail)
register_action("cancel", "cancelTask", s.Task)
