"""Project management tools for the Strands agent."""

from strands import tool

from util.capture import ProjectAPI


@tool
def collection_overview(
    collection_id: str = "",
    project_id: str = "",
    api_base_url: str = "http://localhost:5173",
) -> str:
    """Get an overview of project collections and their documents.

    Args:
        collection_id: Optional collection ID to focus on.
        project_id: The project ID.
        api_base_url: Base URL of the Node.js API.

    Returns:
        Formatted overview of collections and documents.
    """
    if not project_id:
        raise ValueError("project context is required")

    api = ProjectAPI(api_base_url, project_id)
    collections = api.list_collections()
    selected = None
    if collection_id:
        selected = next((c for c in collections if c.get("id") == collection_id), None)

    docs = api.list_documents(collection_id)
    top_docs = docs[:20]

    lines = []
    lines.append(f"Project collections: {len(collections)}")
    if selected:
        lines.append(f"Target collection: {selected.get('name', '')} ({selected.get('id', '')})")
    elif collection_id:
        lines.append(f"Target collection: {collection_id}")
    else:
        lines.append("Target collection: All Collections")
    lines.append(f"Document count: {len(docs)}")
    lines.append("")
    lines.append("Documents:")

    for doc in top_docs:
        snippet = str(doc.get("content", "")).replace("\n", " ").replace("\r", "")[:220]
        title = doc.get("title", "Untitled")
        source = doc.get("sourceUri") or doc.get("sourceType", "local source")
        lines.append(f"- {title} | {source}")
        if snippet:
            lines.append(f"  snippet: {snippet}" + ("..." if len(snippet) >= 220 else ""))

    if len(docs) > len(top_docs):
        lines.append(f"...and {len(docs) - len(top_docs)} more documents.")

    return "\n".join(lines)


@tool
def collection_artifact_metadata(
    collection_id: str = "",
    project_id: str = "",
    api_base_url: str = "http://localhost:5173",
) -> str:
    """List stored artifact metadata for documents in a project collection.

    Args:
        collection_id: Optional collection ID to scope the listing.
        project_id: The project ID.
        api_base_url: Base URL of the Node.js API.

    Returns:
        A formatted artifact metadata summary.
    """
    if not project_id:
        raise ValueError("project context is required")

    api = ProjectAPI(api_base_url, project_id)
    docs = api.list_documents(collection_id)
    documents_with_artifacts = [doc for doc in docs if doc.get("storageUri")]

    lines = [
        f"Documents with stored artifacts: {len(documents_with_artifacts)}",
        f"Scope: {collection_id or 'all collections'}",
        "",
    ]

    for doc in documents_with_artifacts[:25]:
        metadata = doc.get("metadata") if isinstance(doc.get("metadata"), dict) else {}
        doc_id = str(doc.get("id", "")).strip()
        artifact_url = str(metadata.get("artifactUrl", "")).strip()
        download_url = str(metadata.get("downloadUrl", "")).strip()
        if doc_id and not artifact_url:
            artifact_url = (
                f"{api_base_url}/api/projects/{project_id}/documents/{doc_id}/artifact"
            )
        if artifact_url and not download_url:
            download_url = f"{artifact_url}?download=1"

        lines.append(f"- {doc.get('title', 'Untitled')}")
        if doc.get("storageUri"):
            lines.append(f"  storage: {doc['storageUri']}")
        if artifact_url:
            lines.append(f"  open: {artifact_url}")
        if download_url:
            lines.append(f"  download: {download_url}")
        workspace_slug = str(metadata.get("workspaceSlug", "")).strip()
        if workspace_slug:
            lines.append(f"  workspace: {workspace_slug}")

    if len(documents_with_artifacts) > 25:
        lines.append(f"...and {len(documents_with_artifacts) - 25} more artifacts.")

    return "\n".join(lines)


@tool
def capture_artifact(
    relative_path: str,
    title: str = "",
    collection_id: str = "",
    collection_name: str = "Artifacts",
    project_id: str = "",
    api_base_url: str = "http://localhost:5173",
) -> str:
    """Capture a generated workspace file into the project store and artifact backend.

    Args:
        relative_path: Path to the file relative to the current project workspace.
        title: Optional document title to show in the UI.
        collection_id: Optional target collection ID.
        collection_name: Target collection name when collection_id is omitted.
        project_id: The current project ID.
        api_base_url: Base URL of the Node.js API.

    Returns:
        A summary string describing the stored project document.
    """
    if not project_id:
        raise ValueError("project context is required")
    if not relative_path or not relative_path.strip():
        raise ValueError("relative_path is required")

    api = ProjectAPI(api_base_url, project_id)
    result = api.capture_artifact(
        relative_path=relative_path,
        title=title,
        collection_id=collection_id,
        collection_name=collection_name,
    )
    document = result.get("document", {}) if isinstance(result, dict) else {}
    if not document:
        raise RuntimeError("Failed to capture artifact")

    doc_title = document.get("title", title or relative_path)
    source_uri = document.get("sourceUri") or document.get("storageUri") or ""
    document_id = document.get("id", "")
    artifact_url = ""
    download_url = ""
    if document_id:
        artifact_url = (
            f"{api_base_url}/api/projects/{project_id}/documents/{document_id}/artifact"
        )
        download_url = f"{artifact_url}?download=1"

    lines = [f"Captured artifact: {doc_title}"]
    if source_uri:
        lines.append(f"Storage URI: {source_uri}")
    if artifact_url:
        lines.append(f"Open artifact: {artifact_url}")
        lines.append(f"Download artifact: {download_url}")
    return "\n".join(lines)
