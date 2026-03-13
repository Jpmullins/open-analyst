from __future__ import annotations

import os
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from zoneinfo import ZoneInfo

from pydantic import Field, SecretStr
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
    model_config = SettingsConfigDict(
        env_prefix="ANALYST_MCP_",
        env_file=ENV_FILES,
        extra="ignore",
    )

    service_name: str = "analyst-mcp"
    host: str = "0.0.0.0"
    port: int = 8000
    api_key: SecretStr = SecretStr("change-me")
    contact_email: str = "research@example.com"
    timezone: str = "UTC"
    data_dir: Path = Path("data")
    storage_backend: str = "local"
    storage_root: Path = Path("data/articles")
    index_root: Path = Path("data/indexes")
    raw_root: Path = Path("data/raw")
    mcp_path: str = "/mcp"

    neo4j_uri: str | None = None
    neo4j_user: str = "neo4j"
    neo4j_password: SecretStr | None = None
    postgres_dsn: str | None = Field(default_factory=lambda: os.getenv("DATABASE_URL"))
    postgres_schema: str = "analyst_mcp"
    redis_url: str | None = None

    minio_endpoint: str | None = None
    s3_bucket: str | None = None
    aws_region: str = "us-east-1"
    aws_access_key_id: str | None = None
    aws_secret_access_key: SecretStr | None = None

    litellm_base_url: str | None = None
    litellm_api_key: SecretStr | None = None
    litellm_chat_model: str | None = None
    litellm_embedding_model: str | None = None

    semantic_scholar_api_key: SecretStr | None = None

    arxiv_base_url: str = "https://export.arxiv.org/api/query"
    openalex_base_url: str = "https://api.openalex.org"
    openalex_api_key: SecretStr | None = None
    semantic_scholar_base_url: str = "https://api.semanticscholar.org/graph/v1"

    request_timeout_seconds: float = 30.0
    default_result_limit: int = 10
    chunk_size: int = 1400
    chunk_overlap: int = 200
    embedding_batch_size: int = Field(default=8, ge=1, le=64)
    embedding_batch_char_limit: int = Field(default=12000, ge=1000, le=200000)
    embedding_dimensions: int = Field(default=384, ge=8)
    rag_min_score: float = Field(default=0.2, ge=0.0, le=1.0)
    rag_max_matches: int = Field(default=24, ge=1, le=200)
    rag_diversity_per_paper: int = Field(default=2, ge=1, le=10)
    scheduler_interval_seconds: int = Field(default=86_400, ge=60)
    daily_sync_lookback_days: int = Field(default=2, ge=1)
    daily_sync_result_limit: int = Field(default=1000, ge=1, le=10000)
    bootstrap_disk_multiplier: float = Field(default=1.5, ge=1.0)
    bootstrap_memory_floor_gb: int = Field(default=32, ge=1)
    arxiv_bucket: str = "arxiv"
    allow_embedding_fallback: bool = False
    allow_llm_fallback: bool = False

    def ensure_directories(self) -> None:
        for path in {self.data_dir, self.storage_root, self.index_root, self.raw_root}:
            path.mkdir(parents=True, exist_ok=True)

    @property
    def tzinfo(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)

    def user_agent(self) -> str:
        return f"{self.service_name}/0.1 ({self.contact_email})"

    @property
    def psycopg_postgres_dsn(self) -> str | None:
        if not self.postgres_dsn:
            return None

        parsed = urlsplit(self.postgres_dsn)
        query = dict(parse_qsl(parsed.query, keep_blank_values=True))
        if query.get("sslmode") == "no-verify":
            query["sslmode"] = "require"
        return urlunsplit(parsed._replace(query=urlencode(query)))
