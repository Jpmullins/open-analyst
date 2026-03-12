"""Auto-capture utility for deliverable files written by write_file."""

import json
import os
from pathlib import Path

from util.capture import ProjectAPI

DEFAULT_DELIVERABLE_EXTENSIONS: set[str] = {
    # Documents
    ".pdf", ".docx", ".xlsx", ".xls", ".csv", ".html", ".htm", ".pptx",
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp",
    # Text / data
    ".md", ".txt", ".json", ".xml", ".yaml", ".yml",
}


def is_deliverable(filename: str, extensions: set[str] | None = None) -> bool:
    """Check whether a filename has a deliverable extension."""
    ext = Path(filename).suffix.lower()
    return ext in (extensions or DEFAULT_DELIVERABLE_EXTENSIONS)


def try_auto_capture(
    relative_path: str,
    workspace_dir: str,
    project_id: str,
    api_base_url: str,
    collection_id: str = "",
    collection_name: str = "Artifacts",
) -> dict | None:
    """Capture a deliverable file into the project document store.

    Returns artifact metadata dict on success, None on failure.
    Never raises — errors are swallowed so write_file always succeeds.
    """
    try:
        api = ProjectAPI(api_base_url, project_id)
        result = api.capture_artifact(
            relative_path=relative_path,
            title=Path(relative_path).name,
            collection_id=collection_id,
            collection_name=collection_name,
            source_type="generated",
        )
        if not result:
            return None

        doc = result.get("document", {})
        artifact = result.get("artifact", {})
        if not doc.get("id"):
            return None

        abs_path = os.path.join(workspace_dir, relative_path)
        size = os.path.getsize(abs_path) if os.path.exists(abs_path) else 0

        return {
            "documentId": doc["id"],
            "filename": Path(relative_path).name,
            "mimeType": artifact.get("mimeType", "application/octet-stream"),
            "size": size,
            "artifactUrl": f"/api/projects/{project_id}/documents/{doc['id']}/artifact",
            "downloadUrl": f"/api/projects/{project_id}/documents/{doc['id']}/artifact?download=1",
        }
    except Exception:
        return None


def format_tool_output_with_artifact(
    base_message: str, artifact_meta: dict | None
) -> str:
    """Append an artifact sentinel to the tool output when metadata is present."""
    if not artifact_meta:
        return base_message
    sentinel = f"<!-- ARTIFACT_META {json.dumps(artifact_meta)} -->"
    return f"{base_message}\n{sentinel}"
