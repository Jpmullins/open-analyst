from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse, urlunparse
from uuid import UUID

from psycopg.rows import dict_row
from psycopg_pool import AsyncConnectionPool

from config import settings
from models import RuntimeProjectContext

LOCAL_TOOL_DEFINITIONS: list[dict[str, str]] = [
    {"name": "list_directory", "description": "List directory contents"},
    {"name": "read_file", "description": "Read a UTF-8 text file"},
    {"name": "write_file", "description": "Write a UTF-8 text file"},
    {"name": "edit_file", "description": "Replace text in a file"},
    {"name": "glob", "description": "Find files with a glob pattern"},
    {"name": "grep", "description": "Search file contents by regex"},
    {"name": "web_fetch", "description": "Fetch URL content from the web and capture sources"},
    {"name": "web_search", "description": "Search the web for a query and return summary results"},
    {"name": "hf_daily_papers", "description": "Fetch Hugging Face daily papers for a date"},
    {"name": "hf_paper", "description": "Fetch a Hugging Face paper by arXiv id"},
    {"name": "collection_overview", "description": "Summarize the active collection or project"},
    {"name": "collection_artifact_metadata", "description": "List stored artifact metadata"},
    {"name": "capture_artifact", "description": "Capture a generated workspace file into the project store"},
    {"name": "execute_command", "description": "Run a shell command in the project workspace"},
    {"name": "generate_file", "description": "Create a structured binary or text file from instructions"},
]

DEFAULT_MCP_SERVERS: list[dict[str, Any]] = [
    {
        "id": "mcp-analystMcp-default",
        "name": "Analyst MCP",
        "alias": "analyst",
        "type": "http",
        "url": "http://localhost:8000/mcp/",
        "headers": {"x-api-key": "change-me"},
        "enabled": True,
    },
    {
        "id": "mcp-example-filesystem",
        "name": "Filesystem (Example)",
        "alias": "filesystem",
        "type": "stdio",
        "command": "npx",
        "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
        "env": {},
        "enabled": False,
    },
]

DEFAULT_SKILL_RECORDS: list[dict[str, Any]] = [
    {
        "id": "builtin-web-research",
        "name": "Web Research",
        "description": "Web search/fetch and HF capture workflow",
        "type": "builtin",
        "enabled": True,
        "config": {
            "tools": [
                "web_search",
                "web_fetch",
                "hf_daily_papers",
                "hf_paper",
            ]
        },
        "createdAt": 0,
    },
    {
        "id": "builtin-code-ops",
        "name": "Code Operations",
        "description": "Read/write/edit/grep/glob/execute workflow",
        "type": "builtin",
        "enabled": True,
        "config": {
            "tools": [
                "list_directory",
                "read_file",
                "write_file",
                "edit_file",
                "glob",
                "grep",
                "execute_command",
                "generate_file",
            ]
        },
        "createdAt": 0,
    },
]


def _trimmed(value: Any) -> str:
    return str(value or "").strip()


def _normalize_analysis_mode(value: Any) -> str:
    mode = _trimmed(value).lower()
    if mode == "product":
        return "product"
    if mode == "research":
        return "research"
    return "chat"


def _trimmed_or_none(value: Any) -> str | None:
    trimmed = _trimmed(value)
    return trimmed or None


def _uuid_or_none(value: Any) -> str | None:
    trimmed = _trimmed_or_none(value)
    if not trimmed:
        return None
    try:
        return str(UUID(trimmed))
    except Exception:
        return None


def _json_object(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _string_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    items: list[str] = []
    for item in value:
        trimmed = _trimmed(item)
        if trimmed:
            items.append(trimmed)
    return items


def _normalize_text(value: Any) -> str:
    return " ".join(re.findall(r"[a-z0-9]+(?:[._-][a-z0-9]+)?", _trimmed(value).lower()))


def _extract_message_text(content: Any) -> str:
    if isinstance(content, str):
        return content.strip()
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    for item in content:
        if isinstance(item, dict) and str(item.get("type") or "").strip() == "text":
            text = _trimmed(item.get("text"))
            if text:
                parts.append(text)
    return "\n".join(parts).strip()


def _latest_user_text(messages: Any) -> str:
    if not isinstance(messages, list):
        return ""
    for message in reversed(messages):
        if not isinstance(message, dict):
            continue
        if _trimmed(message.get("role")).lower() != "user":
            continue
        text = _extract_message_text(message.get("content"))
        if text:
            return text
    return ""


def get_config_dir() -> Path:
    env_dir = _trimmed_or_none(settings.open_analyst_data_dir)
    if env_dir:
        return Path(env_dir)
    return Path.home() / ".config" / "open-analyst"


def _load_json_array(path: Path, fallback: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not path.exists():
        return [dict(item) for item in fallback]
    try:
        loaded = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return [dict(item) for item in fallback]
    if not isinstance(loaded, list):
        return [dict(item) for item in fallback]
    return [item for item in loaded if isinstance(item, dict)]


def slugify_project_name(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", _trimmed(value).lower())
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    return normalized[:48] or "project"


def build_project_workspace_slug(name: str, project_id: str) -> str:
    base = slugify_project_name(name)
    suffix = re.sub(r"[^a-z0-9]", "", _trimmed(project_id).lower())[:8]
    return f"{base}-{suffix}" if suffix else base


def get_default_workspace_root() -> Path:
    configured = _trimmed_or_none(settings.project_workspaces_root)
    if configured:
        return Path(configured)
    return get_config_dir() / "workspaces"


def get_default_artifact_root() -> Path:
    configured = _trimmed_or_none(settings.artifact_local_dir)
    if configured:
        return Path(configured)
    return get_config_dir() / "captures"


def resolve_project_workspace(project: dict[str, Any]) -> str:
    workspace_root = _trimmed_or_none(project.get("workspace_local_root"))
    workspace_slug = _trimmed_or_none(project.get("workspace_slug")) or build_project_workspace_slug(
        _trimmed(project.get("name")) or "Untitled Project",
        _trimmed(project.get("id")),
    )
    return str((Path(workspace_root) if workspace_root else get_default_workspace_root()) / workspace_slug)


def _join_storage_key(*parts: Any) -> str:
    cleaned = [str(part or "").strip().strip("/") for part in parts if str(part or "").strip()]
    return "/".join(cleaned)


def resolve_project_shared_storage(project: dict[str, Any]) -> dict[str, str]:
    workspace_slug = _trimmed_or_none(project.get("workspace_slug")) or build_project_workspace_slug(
        _trimmed(project.get("name")) or "Untitled Project",
        _trimmed(project.get("id")),
    )
    setting = _trimmed_or_none(project.get("artifact_backend")) or "env"
    backend = settings.artifact_storage_backend if setting == "env" else setting
    if backend == "s3":
        bucket = _trimmed_or_none(project.get("artifact_s3_bucket")) or _trimmed_or_none(settings.artifact_s3_bucket)
        region = _trimmed_or_none(project.get("artifact_s3_region")) or _trimmed_or_none(settings.artifact_s3_region) or "us-east-1"
        endpoint = _trimmed_or_none(project.get("artifact_s3_endpoint")) or _trimmed_or_none(settings.artifact_s3_endpoint)
        base_prefix = _trimmed_or_none(project.get("artifact_s3_prefix")) or _trimmed_or_none(settings.artifact_s3_prefix) or "open-analyst-vnext"
        return {
            "backend": "s3",
            "local_root": "",
            "bucket": bucket or "",
            "region": region,
            "endpoint": endpoint or "",
            "prefix": _join_storage_key(base_prefix, workspace_slug),
        }

    local_root = _trimmed_or_none(project.get("artifact_local_root"))
    if local_root:
        resolved_root = Path(local_root) / workspace_slug
    else:
        resolved_root = get_default_artifact_root() / workspace_slug
    return {
        "backend": "local",
        "local_root": str(resolved_root),
        "bucket": "",
        "region": "",
        "endpoint": "",
        "prefix": "",
    }


def _parse_frontmatter(raw: str) -> dict[str, Any]:
    trimmed = str(raw or "")
    if not trimmed.startswith("---\n"):
        return {}
    end = trimmed.find("\n---\n", 4)
    if end == -1:
        return {}
    block = trimmed[4:end].strip()
    parsed: dict[str, Any] = {}
    current_array_key: str | None = None
    for raw_line in block.splitlines():
        line = raw_line.rstrip()
        if not line.strip():
            continue
        if current_array_key and re.match(r"^\s*-\s+", raw_line):
            parsed.setdefault(current_array_key, []).append(re.sub(r"^\s*-\s+", "", raw_line).strip())
            continue
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if not value:
            current_array_key = key
            parsed[key] = []
            continue
        current_array_key = None
        if value.startswith("[") and value.endswith("]"):
            parsed[key] = [
                part.strip().strip("'\"")
                for part in value[1:-1].split(",")
                if part.strip().strip("'\"")
            ]
            continue
        parsed[key] = value.strip("'\"")
    return parsed


def _merge_skill(skill: dict[str, Any], stored_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    stored = stored_by_id.get(str(skill.get("id") or ""))
    if not stored:
        return skill
    merged = dict(skill)
    merged["name"] = _trimmed(stored.get("name")) or skill.get("name") or ""
    merged["description"] = _trimmed(stored.get("description")) or skill.get("description") or ""
    merged["enabled"] = bool(stored.get("enabled", skill.get("enabled")))
    config = _json_object(stored.get("config"))
    tools = _string_list(config.get("tools"))
    if tools:
        merged["tools"] = tools
    return merged


def _discover_repository_skills(stored_by_id: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    skills_root = Path(__file__).resolve().parents[3] / "skills"
    if not skills_root.exists():
        return []
    discovered: list[dict[str, Any]] = []
    for child in sorted(skills_root.iterdir()):
        skill_file = child / "SKILL.md"
        if not child.is_dir() or not skill_file.exists():
            continue
        skill_id = f"repo-skill-{child.name}"
        raw = skill_file.read_text(encoding="utf-8")
        frontmatter = _parse_frontmatter(raw)
        discovered.append(
            _merge_skill(
                {
                    "id": skill_id,
                    "name": _trimmed(frontmatter.get("name")) or child.name,
                    "description": _trimmed(frontmatter.get("description")),
                    "enabled": False,
                    "tools": _string_list(frontmatter.get("tools")),
                    "match_phrases": _string_list(frontmatter.get("matchPhrases")),
                    "deny_phrases": _string_list(frontmatter.get("denyPhrases")),
                    "file_extensions": _string_list(frontmatter.get("fileExtensions")),
                    "source": {"kind": "repository", "path": str(child)},
                },
                stored_by_id,
            )
        )
    return discovered


def _list_skills_catalog() -> list[dict[str, Any]]:
    stored = _load_json_array(get_config_dir() / "skills.json", DEFAULT_SKILL_RECORDS)
    stored_by_id = {str(item.get("id") or ""): item for item in stored}
    builtin = [_merge_skill(dict(item), stored_by_id) for item in DEFAULT_SKILL_RECORDS]
    repository = _discover_repository_skills(stored_by_id)
    return builtin + repository


def _skill_runtime_summary(skill: dict[str, Any]) -> dict[str, Any]:
    source = _json_object(skill.get("source"))
    return {
        "id": _trimmed(skill.get("id")),
        "name": _trimmed(skill.get("name")),
        "description": _trimmed(skill.get("description")),
        "enabled": bool(skill.get("enabled")),
        "tools": _string_list(skill.get("tools")),
        "source_kind": _trimmed_or_none(source.get("kind")),
        "source": source,
    }


def _match_relevant_repository_skills(
    skills: list[dict[str, Any]],
    *,
    prompt: str = "",
    messages: list[dict[str, Any]] | None = None,
) -> list[dict[str, Any]]:
    prompt_text = _trimmed(prompt)
    full_text = prompt_text or _latest_user_text(messages)
    normalized_prompt = _normalize_text(prompt_text)
    normalized_full_text = _normalize_text(full_text)
    if not normalized_full_text:
        return []

    scored: list[tuple[int, str, dict[str, Any]]] = []
    for skill in skills:
        if _trimmed(skill.get("id")) == "repo-skill-skill-creator":
            continue
        source = _json_object(skill.get("source"))
        if _trimmed(source.get("kind")) != "repository":
            continue

        score = 0
        match_phrases = [_normalize_text(item) for item in _string_list(skill.get("match_phrases"))]
        deny_phrases = [_normalize_text(item) for item in _string_list(skill.get("deny_phrases"))]
        file_extensions = [
            item.lower() if str(item).startswith(".") else f".{str(item).lower()}"
            for item in _string_list(skill.get("file_extensions"))
        ]

        if any(phrase and phrase in normalized_full_text for phrase in deny_phrases):
            continue

        for phrase in match_phrases:
            if phrase and phrase in normalized_full_text:
                score += 18 if phrase in normalized_prompt else 12

        aliases = {
            _normalize_text(skill.get("name")),
            _normalize_text(Path(_trimmed(source.get("path"))).name),
        }
        for alias in aliases:
            if alias and alias in normalized_full_text:
                score += 14 if alias in normalized_prompt else 10

        lowered_full_text = full_text.lower()
        for extension in file_extensions:
            if extension and extension in lowered_full_text:
                score += 8

        if score > 0:
            scored.append((score, _trimmed(skill.get("name")) or _trimmed(skill.get("id")), skill))

    scored.sort(key=lambda item: (-item[0], item[1].lower()))
    return [item[2] for item in scored[:4]]


def list_active_skills() -> list[dict[str, Any]]:
    skills = _list_skills_catalog()
    active: list[dict[str, Any]] = []
    for skill in skills:
        if not skill.get("enabled"):
            continue
        active.append(_skill_runtime_summary(skill))
    return active


def list_mcp_servers() -> list[dict[str, Any]]:
    servers = _load_json_array(get_config_dir() / "mcp-servers.json", DEFAULT_MCP_SERVERS)
    normalized: list[dict[str, Any]] = []
    for server in servers:
        normalized.append(
            {
                "id": _trimmed(server.get("id")),
                "name": _trimmed(server.get("name")),
                "alias": _trimmed_or_none(server.get("alias")),
                "enabled": bool(server.get("enabled")),
            }
        )
    return [server for server in normalized if server["id"] and server["name"]]


def derive_api_base_url(*, origin: str | None = None, fallback_host: str | None = None) -> str:
    if _trimmed(origin):
        return _trimmed(origin).rstrip("/")
    if _trimmed(settings.open_analyst_web_url):
        return _trimmed(settings.open_analyst_web_url).rstrip("/")
    host = _trimmed_or_none(fallback_host)
    if not host:
        return ""
    parsed = urlparse(host)
    if not parsed.scheme or not parsed.hostname:
        return host.rstrip("/")
    netloc = parsed.hostname
    if settings.open_analyst_web_port:
        netloc = f"{netloc}:{settings.open_analyst_web_port}"
    elif parsed.port:
        netloc = f"{netloc}:{parsed.port}"
    return urlunparse((parsed.scheme, netloc, "", "", "", "")).rstrip("/")


class RuntimeContextService:
    def __init__(self) -> None:
        self._pool: AsyncConnectionPool | None = None

    async def build_context(
        self,
        project_id: str,
        *,
        collection_id: str | None = None,
        analysis_mode: str | None = None,
        api_base_url: str = "",
        prompt: str = "",
        messages: list[dict[str, Any]] | None = None,
    ) -> RuntimeProjectContext:
        project = await self._load_project(project_id)
        if not project:
            raise ValueError(f"Project not found: {project_id}")
        profile = await self._load_project_profile(project_id)
        server_configs = list_mcp_servers()
        raw_skills = [
            skill
            for skill in _list_skills_catalog()
            if _trimmed(skill.get("id")) != "repo-skill-skill-creator"
        ]
        all_skills = [_skill_runtime_summary(skill) for skill in raw_skills]
        active_skills = [skill for skill in all_skills if skill.get("enabled")]
        matched_skills = _match_relevant_repository_skills(raw_skills, prompt=prompt, messages=messages)
        pinned_skill_ids = [skill["id"] for skill in active_skills]
        matched_skill_ids = [
            _trimmed(skill.get("id"))
            for skill in matched_skills
            if _trimmed(skill.get("id")) and _trimmed(skill.get("id")) not in pinned_skill_ids
        ]
        enabled_connector_ids = [server["id"] for server in server_configs if server.get("enabled")]
        configured_default_connectors = _string_list(profile.get("default_connector_ids"))
        active_connector_ids = configured_default_connectors or enabled_connector_ids
        now = datetime.now(timezone.utc)
        shared_storage = resolve_project_shared_storage(project)
        workspace_slug = _trimmed(project.get("workspace_slug")) or build_project_workspace_slug(
            _trimmed(project.get("name")),
            _trimmed(project.get("id")),
        )

        return {
            "project_id": _trimmed(project["id"]),
            "project_name": _trimmed(project.get("name")),
            "workspace_path": resolve_project_workspace(project),
            "workspace_slug": workspace_slug,
            "shared_storage_backend": "s3" if shared_storage["backend"] == "s3" else "local",
            "shared_storage_local_root": shared_storage["local_root"],
            "shared_storage_bucket": shared_storage["bucket"],
            "shared_storage_region": shared_storage["region"],
            "shared_storage_endpoint": shared_storage["endpoint"],
            "shared_storage_prefix": shared_storage["prefix"],
            "current_date": now.date().isoformat(),
            "current_datetime_utc": now.isoformat().replace("+00:00", "Z"),
            "analysis_mode": _normalize_analysis_mode(analysis_mode),
            "brief": _trimmed(profile.get("brief")),
            "retrieval_policy": _json_object(profile.get("retrieval_policy")),
            "memory_profile": _json_object(profile.get("memory_profile")),
            "templates": profile.get("templates") if isinstance(profile.get("templates"), list) else [],
            "agent_policies": _json_object(profile.get("agent_policies")),
            "connector_ids": enabled_connector_ids,
            "active_connector_ids": active_connector_ids,
            "available_tools": [
                {
                    "name": tool["name"],
                    "description": tool["description"],
                    "source": "local",
                    "active": True,
                }
                for tool in LOCAL_TOOL_DEFINITIONS
            ],
            "available_skills": all_skills,
            "pinned_skill_ids": pinned_skill_ids,
            "matched_skill_ids": matched_skill_ids,
            "api_base_url": _trimmed(api_base_url),
            "collection_id": _uuid_or_none(collection_id),
        }

    async def _load_project(self, project_id: str) -> dict[str, Any] | None:
        rows = await self._fetch(
            """
            SELECT
                id,
                name,
                workspace_slug,
                workspace_local_root,
                artifact_backend,
                artifact_local_root,
                artifact_s3_bucket,
                artifact_s3_region,
                artifact_s3_endpoint,
                artifact_s3_prefix
            FROM projects
            WHERE id = %s
            LIMIT 1
            """,
            [project_id],
        )
        return rows[0] if rows else None

    async def _load_project_profile(self, project_id: str) -> dict[str, Any]:
        rows = await self._fetch(
            """
            SELECT
                brief,
                retrieval_policy,
                memory_profile,
                templates,
                agent_policies,
                default_connector_ids
            FROM project_profiles
            WHERE project_id = %s
            LIMIT 1
            """,
            [project_id],
        )
        return rows[0] if rows else {}

    async def _fetch(self, query: str, params: list[Any]) -> list[dict[str, Any]]:
        if not settings.database_url_psycopg:
            raise RuntimeError("Runtime database is not configured.")
        pool = self._get_pool()
        async with pool.connection() as conn:
            async with conn.cursor() as cursor:
                await cursor.execute(query, params)
                rows = await cursor.fetchall()
        return list(rows)

    def _get_pool(self) -> AsyncConnectionPool:
        if self._pool is None:
            self._pool = AsyncConnectionPool(
                conninfo=settings.database_url_psycopg,
                kwargs={"row_factory": dict_row},
                min_size=1,
                max_size=5,
                open=True,
            )
        return self._pool


runtime_context_service = RuntimeContextService()
