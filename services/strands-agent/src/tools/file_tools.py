"""File system tools for the Strands agent.

These tools operate within a sandboxed workspace directory.
The workspace_dir is injected via the tool context at invocation time.
"""

import os
import glob as glob_module
import re
from pathlib import Path

from strands import tool

from util.sandbox import resolve_in_workspace
from util.auto_capture import is_deliverable, try_auto_capture, format_tool_output_with_artifact


@tool
def list_directory(path: str = ".", workspace_dir: str = ".") -> str:
    """List files and directories at the given path within the workspace.

    Args:
        path: Relative path to list (default: current workspace root).
        workspace_dir: The workspace root directory.

    Returns:
        A formatted listing of files and directories.
    """
    dir_path = resolve_in_workspace(workspace_dir, path)
    entries = []
    for entry in sorted(os.listdir(dir_path)):
        full = os.path.join(dir_path, entry)
        if os.path.isdir(full):
            entries.append(f"[DIR] {entry}")
        else:
            size = os.path.getsize(full) if os.path.exists(full) else 0
            entries.append(f"[FILE] {entry} ({size} B)")
    return "\n".join(entries) if entries else "Directory is empty"


@tool
def read_file(path: str, workspace_dir: str = ".") -> str:
    """Read the contents of a file within the workspace.

    Args:
        path: Relative path to the file.
        workspace_dir: The workspace root directory.

    Returns:
        The file contents as text.
    """
    file_path = resolve_in_workspace(workspace_dir, path)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {path}")
    return Path(file_path).read_text(encoding="utf-8")


@tool
def write_file(
    path: str,
    content: str,
    workspace_dir: str = ".",
    project_id: str = "",
    api_base_url: str = "",
    collection_id: str = "",
    collection_name: str = "",
) -> str:
    """Write content to a file within the workspace, creating directories as needed.

    Args:
        path: Relative path to the file.
        content: The content to write.
        workspace_dir: The workspace root directory.
        project_id: Project ID for auto-capture (injected by tool binding).
        api_base_url: API base URL for auto-capture (injected by tool binding).
        collection_id: Collection ID for auto-capture (injected by tool binding).
        collection_name: Collection name for auto-capture (injected by tool binding).

    Returns:
        Confirmation message with the relative path, plus artifact metadata if captured.
    """
    file_path = resolve_in_workspace(workspace_dir, path)
    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    Path(file_path).write_text(content or "", encoding="utf-8")

    relpath = os.path.relpath(file_path, workspace_dir)
    base_msg = f"Wrote file: {relpath}"

    if project_id and api_base_url and is_deliverable(relpath):
        artifact = try_auto_capture(
            relative_path=relpath,
            workspace_dir=workspace_dir,
            project_id=project_id,
            api_base_url=api_base_url,
            collection_id=collection_id,
            collection_name=collection_name or "Artifacts",
        )
        return format_tool_output_with_artifact(base_msg, artifact)

    return base_msg


@tool
def edit_file(
    path: str, old_string: str, new_string: str, workspace_dir: str = "."
) -> str:
    """Replace a string in a file within the workspace.

    Args:
        path: Relative path to the file.
        old_string: The exact text to find.
        new_string: The replacement text.
        workspace_dir: The workspace root directory.

    Returns:
        Confirmation message with the relative path.
    """
    file_path = resolve_in_workspace(workspace_dir, path)
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {path}")
    text = Path(file_path).read_text(encoding="utf-8")
    if old_string not in text:
        raise ValueError("old_string not found in file")
    Path(file_path).write_text(
        text.replace(old_string, new_string, 1), encoding="utf-8"
    )
    return f"Edited file: {os.path.relpath(file_path, workspace_dir)}"


@tool
def glob_search(
    pattern: str = "**/*", path: str = ".", workspace_dir: str = "."
) -> str:
    """Search for files matching a glob pattern within the workspace.

    Args:
        pattern: Glob pattern (e.g., '**/*.py').
        path: Subdirectory to search in.
        workspace_dir: The workspace root directory.

    Returns:
        Newline-separated list of matching paths.
    """
    search_root = resolve_in_workspace(workspace_dir, path)
    matches = glob_module.glob(
        pattern,
        root_dir=search_root,
        recursive=True,
    )
    # Filter out common noise directories
    filtered = [
        m
        for m in matches
        if not any(
            part in m.split(os.sep) for part in ("node_modules", ".git")
        )
    ]
    return "\n".join(filtered[:200]) if filtered else "No matches"


@tool
def grep_search(
    pattern: str, path: str = ".", workspace_dir: str = "."
) -> str:
    """Search file contents for a regex pattern within the workspace.

    Args:
        pattern: Regular expression pattern to search for.
        path: Subdirectory to search in.
        workspace_dir: The workspace root directory.

    Returns:
        Matching lines with file paths and line numbers.
    """
    if not pattern:
        raise ValueError("pattern is required")

    search_root = resolve_in_workspace(workspace_dir, path)
    regex = re.compile(pattern, re.IGNORECASE)
    all_files = glob_module.glob("**/*", root_dir=search_root, recursive=True)
    results = []

    for file_rel in all_files[:500]:
        if any(
            part in file_rel.split(os.sep)
            for part in ("node_modules", ".git")
        ):
            continue
        full = os.path.join(search_root, file_rel)
        if not os.path.isfile(full):
            continue
        try:
            text = Path(full).read_text(encoding="utf-8", errors="ignore")
        except (OSError, UnicodeDecodeError):
            continue

        for i, line in enumerate(text.split("\n")):
            if regex.search(line):
                results.append(f"{file_rel}:{i + 1}: {line[:200]}")
            if len(results) >= 200:
                break
        if len(results) >= 200:
            break

    return "\n".join(results) if results else "No matches"
