from __future__ import annotations

from functools import cached_property
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class RuntimeSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = Field(default="0.0.0.0")
    port: int = Field(default=8081)
    litellm_base_url: str = Field(default="http://localhost:4000", alias="LITELLM_BASE_URL")
    litellm_api_key: str = Field(default="", alias="LITELLM_API_KEY")
    default_chat_model: str = Field(default="gpt-4.1-mini", alias="LITELLM_CHAT_MODEL")
    litellm_embedding_model: str = Field(default="", alias="LITELLM_EMBEDDING_MODEL")
    database_url: str = Field(default="", alias="DATABASE_URL")
    analyst_mcp_base_url: str = Field(default="http://localhost:8000", alias="ANALYST_MCP_BASE_URL")
    analyst_mcp_api_key: str = Field(default="change-me", alias="ANALYST_MCP_API_KEY")
    request_timeout_seconds: float = Field(default=120.0)
    embedding_dimensions: int = Field(default=1024)
    retrieval_limit: int = Field(default=6)
    retrieval_min_score: float = Field(default=0.2)
    langsmith_tracing: bool = Field(default=True, alias="LANGSMITH_TRACING")
    otel_service_name: str = Field(default="open-analyst-langgraph-runtime", alias="OTEL_SERVICE_NAME")
    otel_exporter_otlp_endpoint: str | None = Field(default=None, alias="OTEL_EXPORTER_OTLP_ENDPOINT")

    @cached_property
    def chat_model_kwargs(self) -> dict[str, object]:
        return {
            "model": self.default_chat_model,
            "base_url": self.litellm_base_url,
            "api_key": self.litellm_api_key or "unused",
            "timeout": self.request_timeout_seconds,
        }

    @cached_property
    def database_url_psycopg(self) -> str:
        return normalize_psycopg_dsn(self.database_url)


def normalize_psycopg_dsn(value: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw)
    params = dict(parse_qsl(parsed.query, keep_blank_values=True))
    if params.get("sslmode") == "no-verify":
        params["sslmode"] = "require"
    return urlunparse(
        (
            parsed.scheme,
            parsed.netloc,
            parsed.path,
            parsed.params,
            urlencode(params),
            parsed.fragment,
        )
    )


settings = RuntimeSettings()
