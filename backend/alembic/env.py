from alembic import context
from app.core.db import engine
from app.models import metadata

if context.is_offline_mode():
    raise RuntimeError("Run migrations against a real MySQL/MariaDB instance")
with engine.connect() as connection:
    context.configure(connection=connection, target_metadata=metadata)
    with context.begin_transaction():
        context.run_migrations()
