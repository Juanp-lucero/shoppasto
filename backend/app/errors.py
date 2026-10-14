import grpc
from fastapi import HTTPException

HTTP_STATUS_BY_GRPC = {
    grpc.StatusCode.INVALID_ARGUMENT: 400,
    grpc.StatusCode.NOT_FOUND: 404,
    grpc.StatusCode.ALREADY_EXISTS: 409,
    grpc.StatusCode.ABORTED: 409,
    grpc.StatusCode.FAILED_PRECONDITION: 409,
    grpc.StatusCode.DEADLINE_EXCEEDED: 504,
    grpc.StatusCode.UNAVAILABLE: 503,
}


def raise_http_from_rpc(error: grpc.RpcError) -> None:
    code = error.code()
    detail = error.details() or "El servicio solicitado no pudo completar la operación."
    raise HTTPException(status_code=HTTP_STATUS_BY_GRPC.get(code, 502), detail=detail)
