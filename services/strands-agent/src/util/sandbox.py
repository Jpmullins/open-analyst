"""Path safety utilities for workspace isolation."""

import os


def resolve_in_workspace(workspace_dir: str, relative_path: str) -> str:
    """Resolve a path within the workspace directory, preventing traversal escapes.

    Args:
        workspace_dir: The root workspace directory (must be absolute).
        relative_path: The user-supplied path (relative or absolute).

    Returns:
        The resolved absolute path guaranteed to be within workspace_dir.

    Raises:
        ValueError: If the resolved path escapes the workspace.
    """
    workspace = os.path.realpath(workspace_dir)
    user_input = (relative_path or ".").strip()

    if os.path.isabs(user_input):
        candidate = user_input
    else:
        candidate = os.path.join(workspace, user_input)

    resolved = os.path.realpath(candidate)

    if not resolved.startswith(workspace + os.sep) and resolved != workspace:
        raise ValueError("Path is outside working directory")

    return resolved
