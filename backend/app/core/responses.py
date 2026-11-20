from app.schemas import ErrorResponse
ERRORS = {status: {"model": ErrorResponse, "description": description} for status, description in {401:"未登录或令牌无效",403:"无权限",404:"资源不存在或不可见",409:"状态或并发冲突",422:"请求参数校验失败"}.items()}
