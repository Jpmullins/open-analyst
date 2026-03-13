import json
import os
import sys
import types

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

_stubbed_module_names: list[str] = []


def _install_stub(name: str, module: types.ModuleType) -> None:
    if name in sys.modules:
        return
    sys.modules[name] = module
    _stubbed_module_names.append(name)


strands_mod = types.ModuleType("strands")
_install_stub("strands", strands_mod)

strands_session_mod = types.ModuleType("strands.session")
_install_stub("strands.session", strands_session_mod)

repo_session_manager_mod = types.ModuleType("strands.session.repository_session_manager")


class _FakeRepositorySessionManager:
    pass


repo_session_manager_mod.RepositorySessionManager = _FakeRepositorySessionManager
_install_stub("strands.session.repository_session_manager", repo_session_manager_mod)

session_repository_mod = types.ModuleType("strands.session.session_repository")


class _FakeSessionRepository:
    pass


session_repository_mod.SessionRepository = _FakeSessionRepository
_install_stub("strands.session.session_repository", session_repository_mod)

exceptions_mod = types.ModuleType("strands.types.exceptions")
exceptions_mod.SessionException = Exception
_install_stub("strands.types.exceptions", exceptions_mod)

session_types_mod = types.ModuleType("strands.types.session")
session_types_mod.Session = object
session_types_mod.SessionAgent = object
session_types_mod.SessionMessage = object
_install_stub("strands.types.session", session_types_mod)

from postgres_session_manager import compact_session_message_payload

for _module_name in reversed(_stubbed_module_names):
    sys.modules.pop(_module_name, None)


def test_compact_session_message_payload_summarizes_large_search_results():
    large_payload = {
        "query": "Chinese embodied AI unmanned aerial systems UAS journals",
        "current_date": "2026-03-12",
        "results": [
            {
                "canonical_id": f"paper:{idx}",
                "provider": "openalex",
                "source_id": f"W{idx}",
                "title": f"Paper {idx}",
                "abstract": "A" * 4000,
                "publication_year": 2024,
                "journal": "Example Journal",
                "url": f"https://example.com/{idx}",
            }
            for idx in range(12)
        ],
    }
    message = {
        "role": "user",
        "content": [
            {
                "toolResult": {
                    "status": "success",
                    "content": [
                        {
                            "text": json.dumps(large_payload, ensure_ascii=False),
                        }
                    ],
                }
            }
        ],
    }

    compacted = compact_session_message_payload(message)
    text = compacted["content"][0]["toolResult"]["content"][0]["text"]
    data = json.loads(text)

    assert data["query"] == large_payload["query"]
    assert data["result_count"] == 12
    assert len(data["results"]) == 8
    assert data["truncated"] is True
    assert "abstract" not in data["results"][0]


def test_compact_session_message_payload_leaves_small_tool_results_unchanged():
    message = {
        "role": "user",
        "content": [
            {
                "toolResult": {
                    "status": "success",
                    "content": [
                        {
                            "text": '{"query":"small","results":[{"title":"Paper"}]}',
                        }
                    ],
                }
            }
        ],
    }

    compacted = compact_session_message_payload(message)

    assert compacted == message


def test_compact_session_message_payload_truncates_large_plain_text():
    large_text = "X" * 20000
    message = {
        "role": "user",
        "content": [
            {
                "toolResult": {
                    "status": "success",
                    "content": [{"text": large_text}],
                }
            }
        ],
    }

    compacted = compact_session_message_payload(message)
    text = compacted["content"][0]["toolResult"]["content"][0]["text"]

    assert text.startswith("[tool result compacted from 20000 chars]")
    assert text.endswith("...[truncated]")
