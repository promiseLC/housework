from fastapi import Request
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException
from fastapi.responses import JSONResponse

class DomainError(Exception):
    def __init__(self, code: str, message: str, status: int = 409, details=None):
        self.code, self.message, self.status, self.details = code, message, status, details or {}

def fail(code, message, status=409):
    raise DomainError(code, message, status)

def install_errors(app):
    @app.exception_handler(DomainError)
    async def domain(request: Request, exc: DomainError):
        return JSONResponse({"error": {"code": exc.code, "message": exc.message, "details": exc.details}}, status_code=exc.status)
    @app.exception_handler(RequestValidationError)
    async def validation(request: Request, exc: RequestValidationError):
        # Do not echo password, bearer token or other rejected input.
        return JSONResponse({"error": {"code": "VALIDATION_ERROR", "message": "请求参数不符合要求", "details": {"fields": [".".join(map(str, e["loc"])) for e in exc.errors()]}}}, status_code=422)
    @app.exception_handler(HTTPException)
    async def http(request: Request, exc: HTTPException):
        code = {401: "UNAUTHORIZED", 403: "FORBIDDEN", 404: "NOT_FOUND", 409: "CONFLICT", 422: "VALIDATION_ERROR"}.get(exc.status_code, "HTTP_ERROR")
        return JSONResponse({"error": {"code": code, "message": str(exc.detail), "details": {}}}, status_code=exc.status_code)
