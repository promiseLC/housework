from sqlalchemy import select
from app import models as m
from app.core.store import one


def wage_view(conn, row):
    task = one(conn, m.chore_tasks, m.chore_tasks.c.id == row["task_id"])
    return {**row, "chore_name": task["name_snapshot"]}


def task_view(conn, row, detail=False):
    w = one(conn, m.wage_entries, m.wage_entries.c.task_id == row["id"])
    result = {**row, "wage": wage_view(conn, w) if w else None}
    if detail:
        result["review_events"] = (
            conn.execute(
                select(m.task_review_events)
                .where(m.task_review_events.c.task_id == row["id"])
                .order_by(m.task_review_events.c.created_at, m.task_review_events.c.id)
            )
            .mappings()
            .all()
        )
    return result


def payment_items_view(conn, rows):
    result = []
    for row in rows:
        wage = one(conn, m.wage_entries, m.wage_entries.c.id == row["wage_entry_id"])
        task = one(conn, m.chore_tasks, m.chore_tasks.c.id == wage["task_id"])
        result.append(
            {
                "wage_id": wage["id"],
                "amount_fen": row["amount_fen"],
                "chore_name": task["name_snapshot"],
                "task_id": task["id"],
            }
        )
    return result


def payment_view(conn, row):
    items = (
        conn.execute(
            select(m.payment_items)
            .where(m.payment_items.c.payment_id == row["id"])
            .order_by(m.payment_items.c.wage_entry_id)
        )
        .mappings()
        .all()
    )
    return {**row, "items": payment_items_view(conn, items)}
