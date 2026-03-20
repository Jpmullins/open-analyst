export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  datastores: unknown[];
  workspaceSlug: string;
  workspaceLocalRoot: string | null;
  artifactBackend: string | null;
  artifactLocalRoot: string | null;
  artifactS3Bucket: string | null;
  artifactS3Region: string | null;
  artifactS3Endpoint: string | null;
  artifactS3Prefix: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type NewProject = Omit<Project, "id" | "createdAt" | "updatedAt">;

export interface Collection {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type NewCollection = Omit<Collection, "id" | "createdAt" | "updatedAt">;

export interface Document {
  id: string;
  projectId: string;
  collectionId: string | null;
  title: string | null;
  sourceType: string | null;
  sourceUri: string | null;
  storageUri: string | null;
  content: string | null;
  metadata: Record<string, unknown> | null;
  embedding: number[] | null;
  embeddingVector: number[] | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type NewDocument = Omit<Document, "id" | "createdAt" | "updatedAt">;

export interface Settings {
  id: string;
  userId: string;
  activeProjectId: string | null;
  model: string | null;
  workingDir: string | null;
  workingDirType: string | null;
  s3Uri: string | null;
  agentBackend: string | null;
  devLogsEnabled: boolean | null;
  updatedAt: Date | null;
}

export type NewSettings = Omit<Settings, "id" | "updatedAt">;

export interface ProjectProfile {
  id: string;
  projectId: string;
  brief: string | null;
  retrievalPolicy: Record<string, unknown> | null;
  memoryProfile: Record<string, unknown> | null;
  templates: unknown[] | null;
  agentPolicies: Record<string, unknown> | null;
  defaultConnectorIds: string[] | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type NewProjectProfile = Omit<ProjectProfile, "id" | "createdAt" | "updatedAt">;

export interface Artifact {
  id: string;
  projectId: string;
  title: string;
  kind: string;
  mimeType: string;
  storageUri: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type NewArtifact = Omit<Artifact, "id" | "createdAt" | "updatedAt">;

export interface ArtifactVersion {
  id: string;
  artifactId: string;
  version: number;
  title: string;
  changeSummary: string | null;
  storageUri: string | null;
  contentText: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
}

export type NewArtifactVersion = Omit<ArtifactVersion, "id" | "createdAt">;

export interface EvidenceItem {
  id: string;
  projectId: string;
  collectionId: string | null;
  documentId: string | null;
  artifactId: string | null;
  title: string;
  evidenceType: string;
  sourceUri: string | null;
  citationText: string | null;
  extractedText: string | null;
  confidence: string | null;
  provenance: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type NewEvidenceItem = Omit<EvidenceItem, "id" | "createdAt" | "updatedAt">;

export interface SourceIngestBatch {
  id: string;
  projectId: string;
  collectionId: string | null;
  collectionName: string | null;
  origin: string;
  status: string;
  query: string | null;
  summary: string | null;
  requestedCount: number;
  importedCount: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  approvedAt: Date | null;
  completedAt: Date | null;
  rejectedAt: Date | null;
}

export type NewSourceIngestBatch = Omit<SourceIngestBatch, "id" | "createdAt" | "updatedAt">;

export interface SourceIngestItem {
  id: string;
  batchId: string;
  projectId: string;
  documentId: string | null;
  externalId: string | null;
  sourceUrl: string | null;
  title: string;
  mimeTypeHint: string | null;
  targetFilename: string | null;
  normalizedMetadata: Record<string, unknown> | null;
  storageUri: string | null;
  status: string;
  error: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
  importedAt: Date | null;
}

export type NewSourceIngestItem = Omit<SourceIngestItem, "id" | "createdAt" | "updatedAt">;

export interface CanvasDocument {
  id: string;
  projectId: string;
  artifactId: string | null;
  title: string;
  documentType: string;
  content: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type NewCanvasDocument = Omit<CanvasDocument, "id" | "createdAt" | "updatedAt">;
