"""Tests for file_tools.py — file system operations within a sandboxed workspace."""

import os
import sys
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from tools.file_tools import (
    list_directory,
    read_file,
    write_file,
    edit_file,
    glob_search,
    grep_search,
)


class TestListDirectory:
    def test_lists_files_and_dirs(self, workspace):
        result = list_directory(path=".", workspace_dir=workspace)
        assert "[FILE] hello.txt" in result
        assert "[FILE] data.json" in result
        assert "[DIR] subdir" in result

    def test_empty_directory(self, workspace):
        empty = os.path.join(workspace, "empty")
        os.makedirs(empty)
        result = list_directory(path="empty", workspace_dir=workspace)
        assert result == "Directory is empty"


class TestReadFile:
    def test_reads_file_content(self, workspace):
        result = read_file(path="hello.txt", workspace_dir=workspace)
        assert result == "Hello, world!"

    def test_file_not_found(self, workspace):
        with pytest.raises(FileNotFoundError):
            read_file(path="nonexistent.txt", workspace_dir=workspace)

    def test_path_traversal_blocked(self, workspace):
        with pytest.raises(ValueError, match="outside working directory"):
            read_file(path="../../etc/passwd", workspace_dir=workspace)


class TestWriteFile:
    def test_write_and_read_roundtrip(self, workspace):
        write_file(path="new.txt", content="new content", workspace_dir=workspace)
        result = read_file(path="new.txt", workspace_dir=workspace)
        assert result == "new content"

    def test_creates_parent_directories(self, workspace):
        write_file(
            path="deep/nested/file.txt",
            content="deep",
            workspace_dir=workspace,
        )
        result = read_file(path="deep/nested/file.txt", workspace_dir=workspace)
        assert result == "deep"


class TestEditFile:
    def test_replaces_string(self, workspace):
        edit_file(
            path="hello.txt",
            old_string="world",
            new_string="Python",
            workspace_dir=workspace,
        )
        result = read_file(path="hello.txt", workspace_dir=workspace)
        assert result == "Hello, Python!"

    def test_old_string_not_found(self, workspace):
        with pytest.raises(ValueError, match="old_string not found"):
            edit_file(
                path="hello.txt",
                old_string="MISSING",
                new_string="replacement",
                workspace_dir=workspace,
            )


class TestGlobSearch:
    def test_finds_txt_files(self, workspace):
        result = glob_search(pattern="**/*.txt", workspace_dir=workspace)
        assert "hello.txt" in result
        assert "nested.txt" in result

    def test_no_matches(self, workspace):
        result = glob_search(pattern="**/*.xyz", workspace_dir=workspace)
        assert result == "No matches"


class TestGrepSearch:
    def test_finds_matching_lines(self, workspace):
        result = grep_search(pattern="Hello", workspace_dir=workspace)
        assert "hello.txt:1:" in result
        assert "Hello" in result

    def test_no_matches(self, workspace):
        result = grep_search(pattern="ZZZZNOTFOUND", workspace_dir=workspace)
        assert result == "No matches"

    def test_pattern_required(self, workspace):
        with pytest.raises(ValueError, match="pattern is required"):
            grep_search(pattern="", workspace_dir=workspace)
