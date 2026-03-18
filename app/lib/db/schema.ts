import {
  customType,
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  boolean,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const vector = (dimensions: number) =>
  customType<{ data: number[] | null; driverData: string | null }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value) {
      if (!Array.isArray(value) || value.length === 0) {
        return null;
      }
      const numbers = value
        .map((item) => Number(item))
        .filter((item) => Number.isFinite(item));
      if (!numbers.length) {
        return null;
      }
      return `[${numbers.join(",")}]`;
    },
    fromDriver(value) {
      if (typeof value !== "string" || !value.trim()) {
        return null;
      }
      return value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((item) => Number(item.trim()))
        .filter((item) => Number.isFinite(item));
    },
  });

// --- projects ---

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").default(""),
    datastores: jsonb("datastores").default([]),
    workspaceSlug: varchar("workspace_slug", { length: 255 }).notNull().default(""),
    workspaceLocalRoot: text("workspace_local_root"),
    artifactBackend: varchar("artifact_backend", { length: 16 })
      .notNull()
      .default("env"),
    artifactLocalRoot: text("artifact_local_root"),
    artifactS3Bucket: text("artifact_s3_bucket"),
    artifactS3Region: varchar("artifact_s3_region", { length: 255 }),
    artifactS3Endpoint: text("artifact_s3_endpoint"),
    artifactS3Prefix: text("artifact_s3_prefix"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("projects_user_id_idx").on(table.userId)]
);

// --- collections ---

export const collections = pgTable(
  "collections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("collections_project_id_idx").on(table.projectId),
    uniqueIndex("collections_project_name_idx").on(
      table.projectId,
      table.name
    ),
  ]
);

// --- documents ---

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id").references(() => collections.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 500 }).default("Untitled"),
    sourceType: varchar("source_type", { length: 50 }).default("manual"),
    sourceUri: text("source_uri"),
    storageUri: text("storage_uri"),
    content: text("content"),
    metadata: jsonb("metadata").default({}),
    embedding: jsonb("embedding").$type<number[] | null>(),
    embeddingVector: vector(1024)("embedding_vector"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("documents_project_id_idx").on(table.projectId),
    index("documents_collection_id_idx").on(table.collectionId),
    index("documents_project_source_uri_idx").on(table.projectId, table.sourceUri),
  ]
);

// --- settings (per-user) ---

export const settings = pgTable(
  "settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    activeProjectId: uuid("active_project_id"),
    model: varchar("model", { length: 255 }).default(""),
    workingDir: text("working_dir"),
    workingDirType: varchar("working_dir_type", { length: 20 }).default(
      "local"
    ),
    s3Uri: text("s3_uri"),
    agentBackend: varchar("agent_backend", { length: 50 }).default("langgraph"),
    devLogsEnabled: boolean("dev_logs_enabled").default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("settings_user_id_idx").on(table.userId)]
);

// --- project_profiles ---

export const projectProfiles = pgTable(
  "project_profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    brief: text("brief").default(""),
    retrievalPolicy: jsonb("retrieval_policy").default({}),
    memoryProfile: jsonb("memory_profile").default({}),
    templates: jsonb("templates").default([]),
    agentPolicies: jsonb("agent_policies").default({}),
    defaultConnectorIds: jsonb("default_connector_ids").default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("project_profiles_project_id_idx").on(table.projectId),
  ]
);

// --- artifacts ---

export const artifacts = pgTable(
  "artifacts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull().default("Untitled Artifact"),
    kind: varchar("kind", { length: 100 }).notNull().default("note"),
    mimeType: varchar("mime_type", { length: 255 }).notNull().default("text/markdown"),
    storageUri: text("storage_uri"),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("artifacts_project_updated_idx").on(table.projectId, table.updatedAt),
  ]
);

// --- artifact_versions ---

export const artifactVersions = pgTable(
  "artifact_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    artifactId: uuid("artifact_id")
      .notNull()
      .references(() => artifacts.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: varchar("title", { length: 500 }).notNull().default("Untitled Version"),
    changeSummary: text("change_summary").default(""),
    storageUri: text("storage_uri"),
    contentText: text("content_text").default(""),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    uniqueIndex("artifact_versions_artifact_version_idx").on(table.artifactId, table.version),
    index("artifact_versions_artifact_created_idx").on(table.artifactId, table.createdAt),
  ]
);

// --- evidence_items ---

export const evidenceItems = pgTable(
  "evidence_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id").references(() => collections.id, {
      onDelete: "set null",
    }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    artifactId: uuid("artifact_id").references(() => artifacts.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 500 }).notNull().default("Untitled Evidence"),
    evidenceType: varchar("evidence_type", { length: 100 }).notNull().default("note"),
    sourceUri: text("source_uri"),
    citationText: text("citation_text").default(""),
    extractedText: text("extracted_text").default(""),
    confidence: varchar("confidence", { length: 20 }).default("medium"),
    provenance: jsonb("provenance").default({}),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("evidence_items_project_updated_idx").on(table.projectId, table.updatedAt),
    index("evidence_items_collection_created_idx").on(table.collectionId, table.createdAt),
  ]
);

// --- source_ingest_batches ---

export const sourceIngestBatches = pgTable(
  "source_ingest_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    collectionId: uuid("collection_id").references(() => collections.id, {
      onDelete: "set null",
    }),
    collectionName: varchar("collection_name", { length: 255 }).default("Research Inbox"),
    origin: varchar("origin", { length: 32 }).notNull().default("literature"),
    status: varchar("status", { length: 32 }).notNull().default("staged"),
    query: text("query").default(""),
    summary: text("summary").default(""),
    requestedCount: integer("requested_count").notNull().default(0),
    importedCount: integer("imported_count").notNull().default(0),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  },
  (table) => [
    index("source_ingest_batches_project_updated_idx").on(table.projectId, table.updatedAt),
    index("source_ingest_batches_project_status_idx").on(table.projectId, table.status),
  ]
);

// --- source_ingest_items ---

export const sourceIngestItems = pgTable(
  "source_ingest_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => sourceIngestBatches.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").references(() => documents.id, {
      onDelete: "set null",
    }),
    externalId: text("external_id"),
    sourceUrl: text("source_url"),
    title: varchar("title", { length: 500 }).notNull().default("Untitled Source"),
    mimeTypeHint: varchar("mime_type_hint", { length: 255 }),
    targetFilename: varchar("target_filename", { length: 255 }),
    normalizedMetadata: jsonb("normalized_metadata").default({}),
    storageUri: text("storage_uri"),
    status: varchar("status", { length: 32 }).notNull().default("staged"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    importedAt: timestamp("imported_at", { withTimezone: true }),
  },
  (table) => [
    index("source_ingest_items_batch_idx").on(table.batchId, table.createdAt),
    index("source_ingest_items_project_status_idx").on(table.projectId, table.status),
    index("source_ingest_items_document_idx").on(table.documentId),
  ]
);

// --- canvas_documents ---

export const canvasDocuments = pgTable(
  "canvas_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    artifactId: uuid("artifact_id").references(() => artifacts.id, {
      onDelete: "set null",
    }),
    title: varchar("title", { length: 500 }).notNull().default("Untitled Canvas"),
    documentType: varchar("document_type", { length: 100 }).notNull().default("markdown"),
    content: jsonb("content").default({}),
    metadata: jsonb("metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("canvas_documents_project_updated_idx").on(table.projectId, table.updatedAt),
    index("canvas_documents_artifact_updated_idx").on(table.artifactId, table.updatedAt),
  ]
);

// --- Type exports ---

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;
export type Collection = typeof collections.$inferSelect;
export type NewCollection = typeof collections.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
export type ProjectProfile = typeof projectProfiles.$inferSelect;
export type NewProjectProfile = typeof projectProfiles.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type ArtifactVersion = typeof artifactVersions.$inferSelect;
export type NewArtifactVersion = typeof artifactVersions.$inferInsert;
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type NewEvidenceItem = typeof evidenceItems.$inferInsert;
export type SourceIngestBatch = typeof sourceIngestBatches.$inferSelect;
export type NewSourceIngestBatch = typeof sourceIngestBatches.$inferInsert;
export type SourceIngestItem = typeof sourceIngestItems.$inferSelect;
export type NewSourceIngestItem = typeof sourceIngestItems.$inferInsert;
export type CanvasDocument = typeof canvasDocuments.$inferSelect;
export type NewCanvasDocument = typeof canvasDocuments.$inferInsert;
