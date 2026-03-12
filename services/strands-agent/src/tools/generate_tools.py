"""File generation tool for binary deliverables."""

import os
import subprocess
import sys

from strands import tool

from util.auto_capture import is_deliverable, try_auto_capture, format_tool_output_with_artifact
from util.sandbox import resolve_in_workspace


@tool
def generate_file(
    path: str,
    python_code: str,
    workspace_dir: str = ".",
    project_id: str = "",
    api_base_url: str = "",
    collection_id: str = "",
    collection_name: str = "",
) -> str:
    """Generate a file by executing Python code.

    Use this tool to create binary files (DOCX, PDF, XLSX, images, etc.)
    that cannot be written as plain text. The code has access to an
    OUTPUT_PATH environment variable — the absolute path where the file
    should be saved.

    Args:
        path: Relative path for the output file in the workspace.
        python_code: Python code to execute. Must write to the path in the OUTPUT_PATH environment variable.
        workspace_dir: The workspace root directory.
        project_id: Project ID for auto-capture (injected by tool binding).
        api_base_url: API base URL for auto-capture (injected by tool binding).
        collection_id: Collection ID for auto-capture (injected by tool binding).
        collection_name: Collection name for auto-capture (injected by tool binding).

    Returns:
        Confirmation message with file path and size, plus artifact metadata if captured.
    """
    output_path = resolve_in_workspace(workspace_dir, path)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    result = subprocess.run(
        [sys.executable, "-c", python_code],
        env={**os.environ, "OUTPUT_PATH": output_path},
        cwd=os.path.dirname(output_path),
        capture_output=True,
        text=True,
        timeout=120,
    )

    if not os.path.exists(output_path):
        error = result.stderr or result.stdout or "No output"
        raise RuntimeError(f"File not created at {path}: {error}")

    relpath = os.path.relpath(output_path, workspace_dir)
    size = os.path.getsize(output_path)
    base_msg = f"Generated file: {relpath} ({size} bytes)"

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
