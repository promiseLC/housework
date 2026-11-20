from sqlalchemy import select
from app import models as m
from app.core.store import one

def wage_view(conn, row):
    task=one(conn, m.chore_tasks, m.chore_tasks.c.id == row["task_id"])
    return {**row, "chore_name": task["name_snapshot"]}

def task_view(conn, row, detail=False):
    w=one(conn, m.wage_entries, m.wage_entries.c.task_id == row["id"])
    result={**row, "wage": wage_view(conn, w) if w else None}
    if detail:
        result["review_events"]=conn.execute(select(m.task_review_events).where(m.task_review_events.c.task_id == row["id"]).order_by(m.task_review_events.c.created_at, m.task_review_events.c.id)).mappings().all()
    return result
