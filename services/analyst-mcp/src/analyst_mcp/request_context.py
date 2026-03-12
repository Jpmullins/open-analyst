from __future__ import annotations

from contextvars import ContextVar, Token
from dataclasses import dataclass


@dataclass(slots=True)
class OpenAnalystRequestContext:
    project_id: str = ""
    project_name: str = ""
    workspace_slug: str = ""
    api_base_url: str = ""
    artifact_backend: str = ""
    local_artifact_root: str = ""
    s3_bucket: str = ""
    s3_region: str = ""
    s3_endpoint: str = ""
    s3_prefix: str = ""


_request_context: ContextVar[OpenAnalystRequestContext] = ContextVar(
    "analyst_mcp_request_context",
    default=OpenAnalystRequestContext(),
)


def set_request_context(context: OpenAnalystRequestContext) -> Token[OpenAnalystRequestContext]:
    return _request_context.set(context)


def reset_request_context(token: Token[OpenAnalystRequestContext]) -> None:
    _request_context.reset(token)


def get_request_context() -> OpenAnalystRequestContext:
    return _request_context.get()
