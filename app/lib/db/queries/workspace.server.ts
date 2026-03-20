import { queryRow, queryRows, withTransaction } from "../index.server";
import {
  type Artifact,
  type ArtifactVersion,
  type CanvasDocument,
  type ProjectProfile,
} from "../schema";

function jsonParam(value: unknown, fallback: unknown): string {
  return JSON.stringify(value !== undefined ? value : fallback);
}

export async function getProjectProfile(projectId: string): Promise<ProjectProfile | undefined> {
  return queryRow<ProjectProfile>(
    `
      SELECT *
      FROM project_profiles
      WHERE project_id = $1
      LIMIT 1
    `,
    [projectId],
  );
}

export async function upsertProjectProfile(
  projectId: string,
  updates: {
    brief?: string;
    retrievalPolicy?: Record<string, unknown>;
    memoryProfile?: Record<string, unknown>;
    templates?: unknown[];
    agentPolicies?: Record<string, unknown>;
    defaultConnectorIds?: string[];
  }
): Promise<ProjectProfile> {
  const profile = await queryRow<ProjectProfile>(
    `
      INSERT INTO project_profiles (
        project_id,
        brief,
        retrieval_policy,
        memory_profile,
        templates,
        agent_policies,
        default_connector_ids
      )
      VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb)
      ON CONFLICT (project_id) DO UPDATE
      SET
        brief = COALESCE(EXCLUDED.brief, project_profiles.brief),
        retrieval_policy = COALESCE(EXCLUDED.retrieval_policy, project_profiles.retrieval_policy),
        memory_profile = COALESCE(EXCLUDED.memory_profile, project_profiles.memory_profile),
        templates = COALESCE(EXCLUDED.templates, project_profiles.templates),
        agent_policies = COALESCE(EXCLUDED.agent_policies, project_profiles.agent_policies),
        default_connector_ids = COALESCE(EXCLUDED.default_connector_ids, project_profiles.default_connector_ids),
        updated_at = NOW()
      RETURNING *
    `,
    [
      projectId,
      updates.brief !== undefined ? String(updates.brief || "") : null,
      updates.retrievalPolicy !== undefined ? jsonParam(updates.retrievalPolicy, {}) : null,
      updates.memoryProfile !== undefined ? jsonParam(updates.memoryProfile, {}) : null,
      updates.templates !== undefined ? JSON.stringify(updates.templates || []) : null,
      updates.agentPolicies !== undefined ? jsonParam(updates.agentPolicies, {}) : null,
      updates.defaultConnectorIds !== undefined ? JSON.stringify(updates.defaultConnectorIds || []) : null,
    ],
  );
  if (!profile) throw new Error(`Project profile upsert failed: ${projectId}`);
  return profile;
}

export async function listArtifacts(projectId: string): Promise<Artifact[]> {
  return queryRows<Artifact>(
    `
      SELECT *
      FROM artifacts
      WHERE project_id = $1
      ORDER BY updated_at DESC
    `,
    [projectId],
  );
}

export async function getArtifact(projectId: string, artifactId: string): Promise<Artifact | undefined> {
  return queryRow<Artifact>(
    `
      SELECT *
      FROM artifacts
      WHERE project_id = $1 AND id = $2
      LIMIT 1
    `,
    [projectId, artifactId],
  );
}

export async function createArtifact(
  projectId: string,
  input: {
    title?: string;
    kind?: string;
    mimeType?: string;
    storageUri?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<Artifact> {
  const artifact = await queryRow<Artifact>(
    `
      INSERT INTO artifacts (project_id, title, kind, mime_type, storage_uri, metadata)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      RETURNING *
    `,
    [
      projectId,
      String(input.title || "Untitled Artifact").trim(),
      String(input.kind || "note"),
      String(input.mimeType || "text/markdown"),
      input.storageUri || null,
      jsonParam(input.metadata, {}),
    ],
  );
  if (!artifact) throw new Error("Artifact insert failed");
  return artifact;
}

export async function createArtifactVersion(
  projectId: string,
  artifactId: string,
  input: {
    title?: string;
    changeSummary?: string;
    storageUri?: string | null;
    contentText?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<ArtifactVersion> {
  return withTransaction(async (client) => {
    const artifact = await queryRow<Artifact>(
      `
        SELECT *
        FROM artifacts
        WHERE project_id = $1 AND id = $2
        LIMIT 1
      `,
      [projectId, artifactId],
      client,
    );
    if (!artifact) throw new Error(`Artifact not found: ${artifactId}`);

    const version = await queryRow<ArtifactVersion>(
      `
        INSERT INTO artifact_versions (
          artifact_id,
          version,
          title,
          change_summary,
          storage_uri,
          content_text,
          metadata
        )
        SELECT
          $1,
          COALESCE(MAX(version), 0) + 1,
          $2,
          $3,
          $4,
          $5,
          $6::jsonb
        FROM artifact_versions
        WHERE artifact_id = $1
        RETURNING *
      `,
      [
        artifactId,
        String(input.title || artifact.title).trim(),
        String(input.changeSummary || ""),
        input.storageUri || artifact.storageUri || null,
        String(input.contentText || ""),
        jsonParam(input.metadata, {}),
      ],
      client,
    );
    if (!version) throw new Error(`Artifact version insert failed: ${artifactId}`);

    await queryRow<Artifact>(
      `
        UPDATE artifacts
        SET title = $1, storage_uri = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING *
      `,
      [version.title, version.storageUri, artifactId],
      client,
    );

    return version;
  });
}

export async function getArtifactVersionCounts(projectId: string): Promise<Record<string, number>> {
  const rows = await queryRows<{ artifactId: string; count: number }>(
    `
      SELECT artifact_versions.artifact_id, count(*)::int AS count
      FROM artifact_versions
      INNER JOIN artifacts ON artifact_versions.artifact_id = artifacts.id
      WHERE artifacts.project_id = $1
      GROUP BY artifact_versions.artifact_id
    `,
    [projectId],
  );
  return Object.fromEntries(rows.map((row) => [row.artifactId, Number(row.count)]));
}

export async function listArtifactVersions(
  projectId: string,
  artifactId: string
): Promise<ArtifactVersion[]> {
  const artifact = await getArtifact(projectId, artifactId);
  if (!artifact) return [];
  return queryRows<ArtifactVersion>(
    `
      SELECT *
      FROM artifact_versions
      WHERE artifact_id = $1
      ORDER BY version DESC
    `,
    [artifactId],
  );
}

export async function listCanvasDocuments(projectId: string): Promise<CanvasDocument[]> {
  return queryRows<CanvasDocument>(
    `
      SELECT *
      FROM canvas_documents
      WHERE project_id = $1
      ORDER BY updated_at DESC
    `,
    [projectId],
  );
}

export async function getCanvasDocument(
  projectId: string,
  canvasDocumentId: string
): Promise<CanvasDocument | undefined> {
  return queryRow<CanvasDocument>(
    `
      SELECT *
      FROM canvas_documents
      WHERE project_id = $1 AND id = $2
      LIMIT 1
    `,
    [projectId, canvasDocumentId],
  );
}

export async function createCanvasDocument(
  projectId: string,
  input: {
    artifactId?: string | null;
    title?: string;
    documentType?: string;
    content?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<CanvasDocument> {
  const doc = await queryRow<CanvasDocument>(
    `
      INSERT INTO canvas_documents (project_id, artifact_id, title, document_type, content, metadata)
      VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)
      RETURNING *
    `,
    [
      projectId,
      input.artifactId || null,
      String(input.title || "Untitled Canvas").trim(),
      String(input.documentType || "markdown"),
      jsonParam(input.content, {}),
      jsonParam(input.metadata, {}),
    ],
  );
  if (!doc) throw new Error("Canvas document insert failed");
  return doc;
}

export async function updateCanvasDocument(
  projectId: string,
  canvasDocumentId: string,
  updates: {
    title?: string;
    documentType?: string;
    content?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    artifactId?: string | null;
  }
): Promise<CanvasDocument> {
  const clauses: string[] = ["updated_at = NOW()"];
  const params: unknown[] = [];
  if (typeof updates.title === "string") {
    params.push(updates.title.trim());
    clauses.push(`title = $${params.length}`);
  }
  if (typeof updates.documentType === "string") {
    params.push(updates.documentType);
    clauses.push(`document_type = $${params.length}`);
  }
  if (updates.content !== undefined) {
    params.push(jsonParam(updates.content, {}));
    clauses.push(`content = $${params.length}::jsonb`);
  }
  if (updates.metadata !== undefined) {
    params.push(jsonParam(updates.metadata, {}));
    clauses.push(`metadata = $${params.length}::jsonb`);
  }
  if (updates.artifactId !== undefined) {
    params.push(updates.artifactId);
    clauses.push(`artifact_id = $${params.length}`);
  }
  params.push(projectId, canvasDocumentId);
  const doc = await queryRow<CanvasDocument>(
    `
      UPDATE canvas_documents
      SET ${clauses.join(", ")}
      WHERE project_id = $${params.length - 1} AND id = $${params.length}
      RETURNING *
    `,
    params,
  );
  if (!doc) throw new Error(`Canvas document not found: ${canvasDocumentId}`);
  return doc;
}
