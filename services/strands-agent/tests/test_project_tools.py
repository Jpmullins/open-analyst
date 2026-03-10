"""Tests for project_tools.py and bound project tools."""

import os
import sys
import types
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

strands_mod = types.ModuleType("strands")
strands_mod.tool = lambda fn: fn
strands_mod.Agent = object
sys.modules.setdefault("strands", strands_mod)

from tools.project_tools import collection_overview
from tools import create_project_tools


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
            tool.__name__: tool
            for tool in create_project_tools(workspace_dir=workspace)
        }

        result = tools["write_file"]("reports/output.txt", "artifact")

        assert "Wrote file: reports/output.txt" in result
        with open(os.path.join(workspace, "reports", "output.txt"), "r", encoding="utf-8") as handle:
            assert handle.read() == "artifact"
