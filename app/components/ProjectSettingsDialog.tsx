import { useEffect, useId, useRef, useState } from "react";
import type { HeadlessProject } from "~/lib/headless-api";

type ProjectStorageForm = {
  workspaceLocalRoot: string;
  artifactBackend: string;
  artifactLocalRoot: string;
  artifactS3Bucket: string;
  artifactS3Region: string;
  artifactS3Endpoint: string;
  artifactS3Prefix: string;
};

interface ProjectSettingsDialogProps {
  open: boolean;
  project: HeadlessProject | null;
  isSaving?: boolean;
  onCancel: () => void;
  onSave: (values: ProjectStorageForm) => void;
}

function toInitialState(project: HeadlessProject | null): ProjectStorageForm {
  return {
    workspaceLocalRoot: project?.workspaceLocalRoot || "",
    artifactBackend: project?.artifactBackend || "env",
    artifactLocalRoot: project?.artifactLocalRoot || "",
    artifactS3Bucket: project?.artifactS3Bucket || "",
    artifactS3Region: project?.artifactS3Region || "",
    artifactS3Endpoint: project?.artifactS3Endpoint || "",
    artifactS3Prefix: project?.artifactS3Prefix || "",
  };
}

export function ProjectSettingsDialog({
  open,
  project,
  isSaving = false,
  onCancel,
  onSave,
}: ProjectSettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<ProjectStorageForm>(() => toInitialState(project));
  const workspaceRootId = useId();
  const localArtifactRootId = useId();
  const s3BucketId = useId();
  const s3RegionId = useId();
  const s3EndpointId = useId();
  const s3PrefixId = useId();

  useEffect(() => {
    setForm(toInitialState(project));
  }, [project, open]);

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  if (!open || !project) return null;

  const isS3 = form.artifactBackend === "s3";
  const isLocal = form.artifactBackend === "local";

  const handleSubmit = () => {
    onSave(form);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onClick={onCancel}
    >
      <dialog
        ref={dialogRef}
        className="bg-surface rounded-xl border border-border shadow-2xl p-0 w-full max-w-2xl mx-4 backdrop:bg-transparent"
        onClose={onCancel}
      >
        <div className="p-5 space-y-5" onClick={(event) => event.stopPropagation()}>
          <div className="space-y-1">
            <h3 className="text-base font-semibold text-text-primary">Project Storage</h3>
            <p className="text-sm text-text-secondary">
              Configure where this project keeps its workspace and artifacts.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label htmlFor={workspaceRootId} className="text-sm text-text-secondary">
                Workspace root override
              </label>
              <input
                id={workspaceRootId}
                type="text"
                className="input w-full"
                value={form.workspaceLocalRoot}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    workspaceLocalRoot: event.target.value,
                  }))
                }
                placeholder="Use .env default when blank"
              />
            </div>

            <div className="space-y-1">
              <span className="text-sm text-text-secondary">Workspace slug</span>
              <div className="input w-full flex items-center bg-background-secondary text-text-secondary">
                {project.workspaceSlug || project.id}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-sm text-text-secondary">Artifact backend</span>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "env", label: "Use .env defaults" },
                { value: "local", label: "Local override" },
                { value: "s3", label: "S3 override" },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                    form.artifactBackend === option.value
                      ? "border-accent bg-accent-muted text-accent"
                      : "border-border text-text-secondary hover:bg-surface-hover"
                  }`}
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      artifactBackend: option.value,
                    }))
                  }
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {(form.artifactBackend === "env" || isLocal) && (
            <div className="space-y-1">
              <label htmlFor={localArtifactRootId} className="text-sm text-text-secondary">
                Local artifact root override
              </label>
              <input
                id={localArtifactRootId}
                type="text"
                className="input w-full"
                value={form.artifactLocalRoot}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    artifactLocalRoot: event.target.value,
                  }))
                }
                placeholder={isLocal ? "Absolute path for project artifacts" : "Optional override"}
              />
            </div>
          )}

          {(form.artifactBackend === "env" || isS3) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor={s3BucketId} className="text-sm text-text-secondary">
                  S3 bucket override
                </label>
                <input
                  id={s3BucketId}
                  type="text"
                  className="input w-full"
                  value={form.artifactS3Bucket}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      artifactS3Bucket: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={s3RegionId} className="text-sm text-text-secondary">
                  S3 region override
                </label>
                <input
                  id={s3RegionId}
                  type="text"
                  className="input w-full"
                  value={form.artifactS3Region}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      artifactS3Region: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={s3EndpointId} className="text-sm text-text-secondary">
                  S3 endpoint override
                </label>
                <input
                  id={s3EndpointId}
                  type="text"
                  className="input w-full"
                  value={form.artifactS3Endpoint}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      artifactS3Endpoint: event.target.value,
                    }))
                  }
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={s3PrefixId} className="text-sm text-text-secondary">
                  S3 prefix override
                </label>
                <input
                  id={s3PrefixId}
                  type="text"
                  className="input w-full"
                  value={form.artifactS3Prefix}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      artifactS3Prefix: event.target.value,
                    }))
                  }
                />
              </div>
            </div>
          )}

          <div className="rounded-lg border border-border bg-background-secondary px-3 py-2 text-sm text-text-secondary">
            Files are stored under the project workspace slug, and artifact metadata keeps both
            the raw storage URI and the stable app link.
          </div>

          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={onCancel} disabled={isSaving}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
