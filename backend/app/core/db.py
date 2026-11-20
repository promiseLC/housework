from sqlalchemy import create_engine, event
from app.core.config import settings

engine = create_engine(settings.database_url, pool_pre_ping=True, isolation_level="READ COMMITTED", pool_size=10, max_overflow=20)
if engine.dialect.name != "mysql":
    raise RuntimeError("Only a real MySQL/MariaDB database is supported")

@event.listens_for(engine, "connect")
def session_utc(dbapi_connection, connection_record):
    with dbapi_connection.cursor() as cursor:
        cursor.execute("SET time_zone = '+00:00'")
