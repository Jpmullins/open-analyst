"""Tests for generate_tools.py."""

import os
import sys
import types
from unittest.mock import patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

strands_mod = types.ModuleType("strands")


def _mock_tool(fn=None, *, name=None, **_kw):
    def decorator(func):
        if name:
            func.tool_name = name
        return func

    if fn is not None:
        return decorator(fn)
    return decorator


strands_mod.tool = _mock_tool
sys.modules.setdefault("strands", strands_mod)

from tools.generate_tools import generate_file


def test_generate_file_writes_output(workspace):
    result = generate_file(
        path="reports/output.txt",
        python_code="from pathlib import Path; Path(__import__('os').environ['OUTPUT_PATH']).write_text('ready', encoding='utf-8')",
        workspace_dir=workspace,
    )

    assert "Generated file: reports/output.txt" in result
    with open(os.path.join(workspace, "reports", "output.txt"), "r", encoding="utf-8") as handle:
        assert handle.read() == "ready"


@patch("tools.generate_tools.try_auto_capture")
def test_generate_file_auto_captures_deliverable(mock_capture, workspace):
    mock_capture.return_value = {
        "documentId": "doc-1",
        "filename": "report.pdf",
        "mimeType": "application/pdf",
        "size": 10,
        "artifactUrl": "/api/projects/proj-1/documents/doc-1/artifact",
        "downloadUrl": "/api/projects/proj-1/documents/doc-1/artifact?download=1",
    }

    result = generate_file(
        path="deliverables/report.pdf",
        python_code="from pathlib import Path; Path(__import__('os').environ['OUTPUT_PATH']).write_bytes(b'%PDF-1.7')",
        workspace_dir=workspace,
        project_id="proj-1",
        api_base_url="http://localhost:5173",
        collection_name="Deliverables",
    )

    assert "Generated file: deliverables/report.pdf" in result
    assert "ARTIFACT_META" in result
    mock_capture.assert_called_once()


def test_generate_file_raises_when_output_missing(workspace):
    with pytest.raises(RuntimeError, match="File not created at missing.txt"):
        generate_file(
            path="missing.txt",
            python_code="print('no file written')",
            workspace_dir=workspace,
        )
