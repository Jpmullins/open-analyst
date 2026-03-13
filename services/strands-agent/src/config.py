"""Validated environment configuration using Pydantic Settings."""

from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


REPO_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"
SERVICE_ENV = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    database_url: str | None = None
    strands_postgres_dsn: str | None = None
    litellm_base_url: str = "http://localhost:4000"
    litellm_api_key: str
    node_api_base_url: str = "http://localhost:5173"
    request_timeout_seconds: int = 60

    model_config = SettingsConfigDict(
        env_prefix="",
        env_file=(REPO_ROOT_ENV, SERVICE_ENV),
        extra="ignore",
    )

    @property
    def session_postgres_dsn(self) -> str | None:
        return self.strands_postgres_dsn or self.database_url

    @property
    def psycopg_session_postgres_dsn(self) -> str | None:
        dsn = self.session_postgres_dsn
        if not dsn:
            return None

        parsed = urlsplit(dsn)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        if query.get("sslmode") == "no-verify":
            query["sslmode"] = "require"
        return urlunsplit(parsed._replace(query=urlencode(query)))


settings = Settings()
