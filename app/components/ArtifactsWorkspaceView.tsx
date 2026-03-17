import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { headlessGetArtifacts, type HeadlessArtifact } from "~/lib/headless-api";
import { useAppStore } from "~/lib/store";

function buildArtifactUrls(projectId: string, artifactId: string) {
  const artifactUrl = `/api/projects/${encodeURIComponent(projectId)}/artifacts/${encodeURIComponent(artifactId)}/content`;
  return {
    artifactUrl,
    downloadUrl: `${artifactUrl}?download=1`,
  };
}

export function ArtifactsWorkspaceView() {
  const params = useParams();
  const projectId = params.projectId!;
  const openFileViewer = useAppStore((state) => state.openFileViewer);
  const [artifacts, setArtifacts] = useState<HeadlessArtifact[]>([]);
  const [versionsByArtifactId, setVersionsByArtifactId] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    const loadArtifacts = async () => {
      try {
        const response = await headlessGetArtifacts(projectId);
        if (cancelled) return;
        setArtifacts(response.artifacts);
        setVersionsByArtifactId(response.versionsByArtifactId);
      } catch {
        if (cancelled) return;
        setArtifacts([]);
        setVersionsByArtifactId({});
      }
    };

    const handleFocus = () => {
      void loadArtifacts();
    };

    void loadArtifacts();
    const intervalId = window.setInterval(() => {
      void loadArtifacts();
    }, 5000);
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, [projectId]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-text-muted mb-2">Artifacts</div>
          <h1 className="text-2xl font-semibold">Versioned Deliverables</h1>
          <p className="text-sm text-text-secondary mt-2">
            Generated files, working outputs, and their version history.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {artifacts.length === 0 ? (
            <div className="card p-5 text-sm text-text-muted">No artifacts yet.</div>
          ) : (
            artifacts.map((artifact) => (
              <button
                key={artifact.id}
                type="button"
                className="card p-5 text-left"
                onClick={() => {
                  const links = buildArtifactUrls(projectId, artifact.id);
                  const metadata =
                    artifact.metadata && typeof artifact.metadata === "object"
                      ? (artifact.metadata as Record<string, unknown>)
                      : {};
                  openFileViewer({
                    artifactId: artifact.id,
                    filename: (metadata.filename as string) || artifact.title || "artifact",
                    mimeType: artifact.mimeType,
                    size: typeof metadata.bytes === "number" ? metadata.bytes : 0,
                    artifactUrl: links.artifactUrl,
                    downloadUrl: links.downloadUrl,
                    title: artifact.title,
                    storageUri: artifact.storageUri || undefined,
                    metadata,
                    textPreview:
                      typeof metadata.textPreview === "string" ? metadata.textPreview : "",
                  });
                }}
              >
                <div className="text-sm font-medium">{artifact.title}</div>
                <div className="text-xs text-text-muted mt-1">
                  {artifact.kind} · {artifact.mimeType}
                </div>
                <div className="text-xs text-text-secondary mt-3">
                  {versionsByArtifactId[artifact.id] || 0} versions
                </div>
                {artifact.storageUri && (
                  <div className="text-xs text-text-muted mt-2 break-all">{artifact.storageUri}</div>
                )}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
