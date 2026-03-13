"""Shared test fixtures for strands-agent tests."""

import os
import tempfile
import shutil

import pytest


@pytest.fixture
def workspace(tmp_path):
    """Create a temporary workspace directory with sample files."""
    ws = tmp_path / "workspace"
    ws.mkdir()

    # Create some test files
    (ws / "hello.txt").write_text("Hello, world!")
    (ws / "data.json").write_text('{"key": "value"}')

    subdir = ws / "subdir"
    subdir.mkdir()
    (subdir / "nested.txt").write_text("nested content")

    return str(ws)
