"""Initial immutable InnoDB schema snapshot."""

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None
from alembic import op

"""InnoDB schema. Amounts are integer fen; DATETIME(3) values are UTC."""
from sqlalchemy import (
    MetaData,
    Table,
    Column,
    String,
    Integer,
    BigInteger,
    Boolean,
    JSON,
    Enum,
    ForeignKey,
    UniqueConstraint,
    CheckConstraint,
    Computed,
)
from sqlalchemy.dialects.mysql import DATETIME

metadata = MetaData(
    naming_convention={
        "ix": "ix_%(column_0_label)s",
        "uq": "uq_%(table_name)s_%(column_0_name)s",
        "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
        "pk": "pk_%(table_name)s",
    }
)


def col(name, type_=String(36), **kw):
    return Column(name, type_, **kw)


def pk():
    return col("id", primary_key=True)


def ref(name, target, **kw):
    return Column(name, String(36), ForeignKey(target), **kw)


def dt(name, nullable=True):
    return col(name, DATETIME(fsp=3), nullable=nullable)


def table(name, *columns):
    return Table(
        name,
        metadata,
        *columns,
        mysql_engine="InnoDB",
        mysql_charset="utf8mb4",
        mysql_collate="utf8mb4_unicode_ci",
    )


users = table(
    "users",
    pk(),
    col("username", String(32), nullable=False, unique=True),
    col("password_hash", String(255), nullable=False),
    col("display_name", String(20), nullable=False),
    dt("created_at", False),
    dt("updated_at", False),
)
refresh_tokens = table(
    "refresh_tokens",
    pk(),
    ref("user_id", "users.id", nullable=False),
    col("token_hash", String(64), nullable=False, unique=True),
    dt("expires_at", False),
    dt("revoked_at"),
    dt("created_at", False),
)
households = table(
    "households",
    pk(),
    col("status", Enum("active", "dissolved"), nullable=False),
    dt("created_at", False),
    dt("dissolved_at"),
)
household_members = table(
    "household_members",
    pk(),
    ref("household_id", "households.id", nullable=False),
    ref("user_id", "users.id", nullable=False),
    dt("joined_at", False),
    dt("left_at"),
    Column(
        "active_user_id",
        String(36),
        Computed("IF(left_at IS NULL, user_id, NULL)", persisted=True),
    ),
    UniqueConstraint("active_user_id"),
    UniqueConstraint("household_id", "user_id"),
)
household_invites = table(
    "household_invites",
    pk(),
    ref("inviter_user_id", "users.id", nullable=False),
    col("code", String(16)),
    col("code_hash", String(64), nullable=False, unique=True),
    col("status", Enum("pending", "accepted", "expired", "cancelled"), nullable=False),
    dt("expires_at", False),
    ref("accepted_by_user_id", "users.id"),
    dt("accepted_at"),
    ref("household_id", "households.id"),
    dt("created_at", False),
    Column(
        "pending_inviter",
        String(36),
        Computed("IF(status = 'pending', inviter_user_id, NULL)", persisted=True),
    ),
    UniqueConstraint("pending_inviter"),
)
chore_types = table(
    "chore_types",
    pk(),
    ref("household_id", "households.id", nullable=False),
    col("name", String(40), nullable=False),
    col("unit_price_fen", Integer, nullable=False),
    col("is_active", Boolean, nullable=False),
    ref("created_by_user_id", "users.id", nullable=False),
    dt("created_at", False),
    dt("updated_at", False),
    Column(
        "active_name",
        String(40),
        Computed("IF(is_active = 1, name, NULL)", persisted=True),
    ),
    UniqueConstraint("household_id", "active_name"),
    CheckConstraint("unit_price_fen BETWEEN 1 AND 100000000", name="ck_chore_amount"),
)
chore_tasks = table(
    "chore_tasks",
    pk(),
    ref("household_id", "households.id", nullable=False),
    ref("chore_type_id", "chore_types.id", nullable=False),
    col("name_snapshot", String(40), nullable=False),
    col("unit_price_fen_snapshot", Integer, nullable=False),
    ref("worker_user_id", "users.id", nullable=False),
    ref("payer_user_id", "users.id", nullable=False),
    col(
        "status",
        Enum("in_progress", "pending_confirm", "rejected", "confirmed", "cancelled"),
        nullable=False,
    ),
    col("note", String(200)),
    dt("started_at", False),
    dt("submitted_at"),
    dt("cancelled_at"),
    dt("confirmed_at"),
    dt("rejected_at"),
    col("reject_reason", String(200)),
    col("version", Integer, nullable=False),
    CheckConstraint(
        "unit_price_fen_snapshot BETWEEN 1 AND 100000000", name="ck_task_amount"
    ),
    CheckConstraint("worker_user_id <> payer_user_id", name="ck_task_parties"),
)
task_review_events = table(
    "task_review_events",
    pk(),
    ref("household_id", "households.id", nullable=False),
    ref("task_id", "chore_tasks.id", nullable=False),
    ref("actor_user_id", "users.id", nullable=False),
    col("action", Enum("submit", "withdraw", "confirm", "reject"), nullable=False),
    col("reason", String(200)),
    dt("created_at", False),
)
payments = table(
    "payments",
    pk(),
    ref("household_id", "households.id", nullable=False),
    ref("payer_user_id", "users.id", nullable=False),
    ref("payee_user_id", "users.id", nullable=False),
    col("total_amount_fen", BigInteger, nullable=False),
    col("status", Enum("awaiting_receipt", "settled", "rejected"), nullable=False),
    col("reject_reason", String(200)),
    dt("marked_paid_at", False),
    dt("settled_at"),
    dt("rejected_at"),
    dt("created_at", False),
    CheckConstraint("total_amount_fen > 0", name="ck_payment_amount"),
    CheckConstraint("payer_user_id <> payee_user_id", name="ck_payment_parties"),
)
wage_entries = table(
    "wage_entries",
    pk(),
    ref("household_id", "households.id", nullable=False),
    ref("task_id", "chore_tasks.id", nullable=False, unique=True),
    col("amount_fen", Integer, nullable=False),
    ref("worker_user_id", "users.id", nullable=False),
    ref("payer_user_id", "users.id", nullable=False),
    col("status", Enum("payable", "awaiting_receipt", "settled"), nullable=False),
    ref("locked_payment_id", "payments.id"),
    dt("created_at", False),
    dt("settled_at"),
    CheckConstraint("amount_fen BETWEEN 1 AND 100000000", name="ck_wage_amount"),
)
payment_items = table(
    "payment_items",
    pk(),
    ref("payment_id", "payments.id", nullable=False),
    ref("wage_entry_id", "wage_entries.id", nullable=False),
    ref("household_id", "households.id", nullable=False),
    col("amount_fen", Integer, nullable=False),
    UniqueConstraint("payment_id", "wage_entry_id"),
)
idempotency_keys = table(
    "idempotency_keys",
    ref("user_id", "users.id", primary_key=True),
    col("idempotency_key", String(64, collation="utf8mb4_bin"), primary_key=True),
    col("method", String(8), nullable=False),
    col("path", String(255), nullable=False),
    col("request_hash", String(64), nullable=False),
    col("response_status", Integer),
    col("response_body", JSON),
    dt("created_at", False),
)
audit_logs = table(
    "audit_logs",
    pk(),
    ref("household_id", "households.id"),
    ref("actor_user_id", "users.id", nullable=False),
    col("action", String(64), nullable=False),
    col("entity_type", String(40), nullable=False),
    col("entity_id", String(36), nullable=False),
    col("payload_json", JSON, nullable=False),
    col("request_id", String(36), nullable=False),
    dt("created_at", False),
)


def upgrade():
    metadata.create_all(op.get_bind())


def downgrade():
    metadata.drop_all(op.get_bind())
