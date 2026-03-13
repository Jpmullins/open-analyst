"""Validated environment configuration using Pydantic Settings."""

from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic_settings import BaseSettings, SettingsConfigDict


def _env_files(current_file: Path) -> tuple[Path, ...]:
    seen: set[Path] = set()
    env_files: list[Path] = []
    for parent in current_file.resolve().parents:
        env_path = parent / ".env"
        if env_path in seen:
            continue
        seen.add(env_path)
        env_files.append(env_path)
    return tuple(env_files)


ENV_FILES = _env_files(Path(__file__))


class Settings(BaseSettings):
    database_url: str | None = None
    strands_postgres_dsn: str | None = None
    litellm_base_url: str = "http://localhost:4000"
    litellm_api_key: str
    node_api_base_url: str = "http://localhost:5173"
    request_timeout_seconds: int = 60

    model_config = SettingsConfigDict(
        env_prefix="",
        env_file=ENV_FILES,
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
