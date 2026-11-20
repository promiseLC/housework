from typing import Annotated
from uuid import UUID
from pydantic import AfterValidator, Field


def normalize_uuid(value: str) -> str:
    return str(UUID(value))


UUIDString = Annotated[
    str, AfterValidator(normalize_uuid), Field(json_schema_extra={"format": "uuid"})
]
