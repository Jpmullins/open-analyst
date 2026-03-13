"""Tests for util/auto_capture.py — deliverable detection and artifact formatting."""

import json
import os
import sys
from unittest.mock import patch, MagicMock

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from util.auto_capture import (
    DEFAULT_DELIVERABLE_EXTENSIONS,
    is_deliverable,
    try_auto_capture,
    format_tool_output_with_artifact,
)


class TestIsDeliverable:
    @pytest.mark.parametrize(
        "filename",
        [
            "report.pdf",
            "data.csv",
            "output.xlsx",
            "results.json",
            "chart.png",
            "page.html",
            "notes.md",
            "doc.docx",
            "slide.pptx",
            "config.yaml",
            "photo.jpg",
            "diagram.svg",
        ],
    )
    def test_deliverable_extensions(self, filename):
        assert is_deliverable(filename) is True

    @pytest.mark.parametrize(
        "filename",
        [
            "script.py",
            "app.js",
            "Makefile",
            "main.go",
            "styles.css",
            "program.rs",
            "module.ts",
        ],
    )
    def test_non_deliverable_extensions(self, filename):
        assert is_deliverable(filename) is False

    def test_case_insensitive(self):
        assert is_deliverable("REPORT.PDF") is True
        assert is_deliverable("Data.CSV") is True

    def test_custom_extensions(self):
        custom = {".custom", ".special"}
        assert is_deliverable("file.custom", extensions=custom) is True
        assert is_deliverable("file.pdf", extensions=custom) is False

    def test_no_extension(self):
        assert is_deliverable("Makefile") is False

    def test_nested_path(self):
        assert is_deliverable("output/reports/summary.pdf") is True
        assert is_deliverable("src/main.py") is False


class TestFormatToolOutputWithArtifact:
    def test_appends_sentinel(self):
        meta = {
            "documentId": "doc-123",
            "filename": "report.pdf",
            "mimeType": "application/pdf",
            "size": 1024,
            "artifactUrl": "/api/projects/p1/documents/doc-123/artifact",
            "downloadUrl": "/api/projects/p1/documents/doc-123/artifact?download=1",
        }
        result = format_tool_output_with_artifact("Wrote file: report.pdf", meta)
        assert "Wrote file: report.pdf" in result
        assert "<!-- ARTIFACT_META " in result
        parsed = json.loads(result.split("<!-- ARTIFACT_META ")[1].split(" -->")[0])
        assert parsed["documentId"] == "doc-123"
        assert parsed["filename"] == "report.pdf"

    def test_no_meta_returns_base(self):
        result = format_tool_output_with_artifact("Wrote file: script.py", None)
        assert result == "Wrote file: script.py"
        assert "ARTIFACT_META" not in result


class TestTryAutoCapture:
    @patch("util.auto_capture.ProjectAPI")
    def test_successful_capture(self, MockAPI, tmp_path):
        # Create test file
        test_file = tmp_path / "report.pdf"
        test_file.write_bytes(b"fake pdf content")

        mock_api = MagicMock()
        MockAPI.return_value = mock_api
        mock_api.capture_artifact.return_value = {
            "document": {"id": "doc-456", "title": "report.pdf"},
            "artifact": {"mimeType": "application/pdf"},
        }

        result = try_auto_capture(
            relative_path="report.pdf",
            workspace_dir=str(tmp_path),
            project_id="proj-1",
            api_base_url="http://localhost:5173",
        )

        assert result is not None
        assert result["documentId"] == "doc-456"
        assert result["filename"] == "report.pdf"
        assert result["mimeType"] == "application/pdf"
        assert result["size"] == len(b"fake pdf content")
        assert "/artifact" in result["artifactUrl"]
        assert "download=1" in result["downloadUrl"]

    @patch("util.auto_capture.ProjectAPI")
    def test_api_failure_returns_none(self, MockAPI):
        mock_api = MagicMock()
        MockAPI.return_value = mock_api
        mock_api.capture_artifact.return_value = {}

        result = try_auto_capture(
            relative_path="report.pdf",
            workspace_dir="/tmp",
            project_id="proj-1",
            api_base_url="http://localhost:5173",
        )

        assert result is None

    @patch("util.auto_capture.ProjectAPI")
    def test_exception_returns_none(self, MockAPI):
        MockAPI.side_effect = Exception("connection refused")

        result = try_auto_capture(
            relative_path="report.pdf",
            workspace_dir="/tmp",
            project_id="proj-1",
            api_base_url="http://localhost:5173",
        )

        assert result is None
