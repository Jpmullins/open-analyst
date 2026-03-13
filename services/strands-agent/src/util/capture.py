"""HTTP client for Node.js project store API callbacks."""

import httpx


class ProjectAPI:
    """Client for the Node.js project store REST API.

    The Python agent cannot access the project store directly (JSON files
    managed by Node.js). It calls back to existing Node.js API routes.
    """

    def __init__(self, base_url: str, project_id: str):
        self.base_url = base_url.rstrip("/")
        self.project_id = project_id
        self._client = httpx.Client(timeout=30.0)

    def rag_query(self, query: str, limit: int = 6) -> dict:
        """Query the project RAG index."""
        try:
            r = self._client.post(
                f"{self.base_url}/api/projects/{self.project_id}/rag/query",
                json={"query": query, "limit": limit},
            )
            return r.json() if r.is_success else {"results": []}
        except Exception:
            return {"results": []}

    def ensure_collection(self, name: str, description: str = "") -> dict:
        """Create or retrieve an existing collection by name (case-insensitive)."""
        try:
            r = self._client.post(
                f"{self.base_url}/api/projects/{self.project_id}/collections/ensure",
                json={"name": name, "description": description},
            )
            return r.json().get("collection", {}) if r.is_success else {}
        except Exception:
            return {}

    def create_document(
        self,
        *,
        collection_id: str,
        title: str,
        source_type: str,
        source_uri: str,
        content: str,
        metadata: dict | None = None,
    ) -> dict:
        """Create a document in the project store."""
        try:
            r = self._client.post(
                f"{self.base_url}/api/projects/{self.project_id}/documents",
                json={
                    "collectionId": collection_id,
                    "title": title,
                    "sourceType": source_type,
                    "sourceUri": source_uri,
                    "content": content,
                    "metadata": metadata or {},
                },
            )
            return r.json() if r.is_success else {}
        except Exception:
            return {}

    def capture_artifact(
        self,
        *,
        relative_path: str,
        title: str = "",
        collection_id: str = "",
        collection_name: str = "Artifacts",
        source_type: str = "generated",
        metadata: dict | None = None,
    ) -> dict:
        """Capture a workspace file into the project document store."""
        try:
            r = self._client.post(
                f"{self.base_url}/api/projects/{self.project_id}/artifacts/capture",
                json={
                    "relativePath": relative_path,
                    "title": title,
                    "collectionId": collection_id,
                    "collectionName": collection_name,
                    "sourceType": source_type,
                    "metadata": metadata or {},
                },
            )
            return r.json() if r.is_success else {}
        except Exception:
            return {}

    def list_collections(self) -> list:
        """List all collections in the project."""
        try:
            r = self._client.get(
                f"{self.base_url}/api/projects/{self.project_id}/collections"
            )
            return r.json().get("collections", []) if r.is_success else []
        except Exception:
            return []

    def list_documents(self, collection_id: str = "") -> list:
        """List documents in the project, optionally filtered by collection."""
        try:
            url = f"{self.base_url}/api/projects/{self.project_id}/documents"
            if collection_id:
                url += f"?collectionId={collection_id}"
            r = self._client.get(url)
            return r.json().get("documents", []) if r.is_success else []
        except Exception:
            return []
