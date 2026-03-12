"""Command execution tool for the Strands agent."""

import re
import subprocess
import sys

from strands import tool

from util.sandbox import resolve_in_workspace

_PYTHON_SCRIPT_RE = re.compile(
    r"""(?:^|\s)(?:python3?|"""
    + re.escape(sys.executable)
    + r""")(?:\s+-c\s)""",
    re.IGNORECASE,
)


@tool
def execute_command(
    command: str, cwd: str = ".", workspace_dir: str = "."
) -> str:
    """Execute a shell command within the workspace.

    Use for installing packages, running linters, checking system state, etc.
    Do NOT use this tool to generate or create files — use generate_file instead.

    Args:
        command: The shell command to run.
        cwd: Working directory relative to workspace (default: workspace root).
        workspace_dir: The workspace root directory.

    Returns:
        The combined stdout/stderr output (truncated to 100KB).
    """
    if not command or not command.strip():
        raise ValueError("command is required")

    if _PYTHON_SCRIPT_RE.search(command):
        return (
            "Error: Do not use execute_command to run Python scripts that create files. "
            "Use the generate_file tool instead — it handles output paths and artifact "
            "capture automatically."
        )

    resolved_cwd = resolve_in_workspace(workspace_dir, cwd)

    result = subprocess.run(
        command,
        shell=True,
        cwd=resolved_cwd,
        capture_output=True,
        text=True,
        timeout=60,
        env=None,  # inherit current env
    )

    output = result.stdout or result.stderr or "Command completed"
    return output[:100_000]
