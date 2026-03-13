"""Tests for project_tools.py and bound project tools."""

import os
import sys
import types
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

_stubbed_module_names: list[str] = []


def _install_stub(name: str, module: types.ModuleType) -> None:
    if name in sys.modules:
        return
    sys.modules[name] = module
    _stubbed_module_names.append(name)

strands_mod = types.ModuleType("strands")


def _mock_tool(fn=None, *, name=None, **_kw):
    """Mock @tool that supports both @tool and @tool(name=...) forms."""
    def decorator(func):
        if name:
            func.tool_name = name
        return func
    if fn is not None:
        return decorator(fn)
    return decorator


strands_mod.tool = _mock_tool
strands_mod.Agent = object
_install_stub("strands", strands_mod)

from tools.project_tools import collection_artifact_metadata, collection_overview
from tools import create_project_tools

for _module_name in reversed(_stubbed_module_names):
    sys.modules.pop(_module_name, None)


class TestCollectionOverview:
    @patch("util.capture.httpx.Client")
    def test_calls_correct_apis(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client

        # Mock list_collections response
        collections_resp = MagicMock()
        collections_resp.is_success = True
        collections_resp.json.return_value = {
            "collections": [
                {"id": "col-1", "name": "Research"},
                {"id": "col-2", "name": "Notes"},
            ]
        }

        # Mock list_documents response
        documents_resp = MagicMock()
        documents_resp.is_success = True
        documents_resp.json.return_value = {
            "documents": [
                {"title": "Paper A", "sourceUri": "https://example.com/a", "content": "Content A"},
                {"title": "Paper B", "sourceUri": "https://example.com/b", "content": "Content B"},
            ]
        }

        mock_client.get.side_effect = [collections_resp, documents_resp]

        result = collection_overview(
            project_id="proj-1",
            api_base_url="http://localhost:5173",
        )

        assert "Project collections: 2" in result
        assert "Document count: 2" in result
        assert "Paper A" in result
        assert "Paper B" in result

    def test_requires_project_id(self):
        with pytest.raises(ValueError, match="project context is required"):
            collection_overview(project_id="")


class TestBoundProjectTools:
    def test_file_tools_are_bound_to_workspace(self, workspace):
        tools = {
            getattr(tool, "tool_name", None) or tool.__name__: tool
            for tool in create_project_tools(workspace_dir=workspace)
        }

        result = tools["write_file"]("reports/output.txt", "artifact")

        assert "Wrote file: reports/output.txt" in result
        with open(os.path.join(workspace, "reports", "output.txt"), "r", encoding="utf-8") as handle:
            assert handle.read() == "artifact"


class TestCollectionArtifactMetadata:
    @patch("util.capture.httpx.Client")
    def test_lists_storage_uris_and_links(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value = mock_client

        documents_resp = MagicMock()
        documents_resp.is_success = True
        documents_resp.json.return_value = {
            "documents": [
                {
                    "id": "doc-1",
                    "title": "Embodied AI Review",
                    "storageUri": "s3://bucket/workspace/artifacts/doc-1.pdf",
                    "metadata": {
                        "artifactUrl": "http://localhost:5173/api/projects/proj-1/documents/doc-1/artifact",
                        "downloadUrl": "http://localhost:5173/api/projects/proj-1/documents/doc-1/artifact?download=1",
                        "workspaceSlug": "mission-alpha-1234abcd",
                    },
                }
            ]
        }
        mock_client.get.return_value = documents_resp

        result = collection_artifact_metadata(
            project_id="proj-1",
            api_base_url="http://localhost:5173",
        )

        assert "Documents with stored artifacts: 1" in result
        assert "storage: s3://bucket/workspace/artifacts/doc-1.pdf" in result
        assert "open: http://localhost:5173/api/projects/proj-1/documents/doc-1/artifact" in result
        assert "workspace: mission-alpha-1234abcd" in result
