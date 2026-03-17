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
  ]
);

// --- tasks (replaces sessions + runs) ---

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).default("New Task"),
    type: varchar("type", { length: 50 }).default("chat"),
    status: varchar("status", { length: 50 }).default("idle"),
    cwd: text("cwd"),
    context: jsonb("context").default({}),
    planSnapshot: jsonb("plan_snapshot"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("tasks_project_updated_idx").on(table.projectId, table.updatedAt),
    index("tasks_status_idx").on(table.status),
  ]
);

// --- messages ---

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    content: jsonb("content").notNull(),
    tokenUsage: jsonb("token_usage"),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("messages_task_timestamp_idx").on(table.taskId, table.timestamp),
  ]
);

// --- task_events (replaces run_events) ---

export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 100 }).notNull(),
    payload: jsonb("payload").default({}),
    timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("task_events_task_id_idx").on(table.taskId)]
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

// --- project_threads ---

export const projectThreads = pgTable(
  "project_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 500 }).notNull().default("New Thread"),
    status: varchar("status", { length: 50 }).notNull().default("idle"),
    summary: text("summary").default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("project_threads_project_updated_idx").on(table.projectId, table.updatedAt),
  ]
);

// --- project_runs ---

export const projectRuns = pgTable(
  "project_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    threadId: uuid("thread_id").references(() => projectThreads.id, {
      onDelete: "set null",
    }),
    parentRunId: uuid("parent_run_id"),
    title: varchar("title", { length: 500 }).notNull().default("New Run"),
    mode: varchar("mode", { length: 50 }).notNull().default("chat"),
    status: varchar("status", { length: 50 }).notNull().default("queued"),
    intent: text("intent").default(""),
    latestOutput: text("latest_output").default(""),
    plan: jsonb("plan").default([]),
    runtimeState: jsonb("runtime_state").default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("project_runs_project_updated_idx").on(table.projectId, table.updatedAt),
    index("project_runs_thread_updated_idx").on(table.threadId, table.updatedAt),
    index("project_runs_status_idx").on(table.status),
  ]
);

// --- run_steps ---

export const runSteps = pgTable(
  "run_steps",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => projectRuns.id, { onDelete: "cascade" }),
    stepType: varchar("step_type", { length: 100 }).notNull(),
    actor: varchar("actor", { length: 100 }).notNull().default("supervisor"),
    title: varchar("title", { length: 500 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("queued"),
    payload: jsonb("payload").default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("run_steps_run_created_idx").on(table.runId, table.createdAt),
    index("run_steps_status_idx").on(table.status),
  ]
);

// --- approvals ---

export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    runId: uuid("run_id")
      .notNull()
      .references(() => projectRuns.id, { onDelete: "cascade" }),
    stepId: uuid("step_id").references(() => runSteps.id, {
      onDelete: "set null",
    }),
    kind: varchar("kind", { length: 100 }).notNull(),
    status: varchar("status", { length: 50 }).notNull().default("pending"),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description").default(""),
    requestPayload: jsonb("request_payload").default({}),
    responsePayload: jsonb("response_payload").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    index("approvals_run_created_idx").on(table.runId, table.createdAt),
    index("approvals_status_idx").on(table.status),
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
    runId: uuid("run_id").references(() => projectRuns.id, {
      onDelete: "set null",
    }),
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
    index("artifacts_run_updated_idx").on(table.runId, table.updatedAt),
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
    runId: uuid("run_id").references(() => projectRuns.id, {
      onDelete: "set null",
    }),
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
    index("evidence_items_run_created_idx").on(table.runId, table.createdAt),
    index("evidence_items_collection_created_idx").on(table.collectionId, table.createdAt),
  ]
);

// --- project_memories ---

export const projectMemories = pgTable(
  "project_memories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, {
      onDelete: "set null",
    }),
    memoryType: varchar("memory_type", { length: 100 }).notNull().default("note"),
    status: varchar("status", { length: 32 }).notNull().default("proposed"),
    title: varchar("title", { length: 500 }).notNull().default("Untitled memory"),
    summary: text("summary").default(""),
    content: text("content").notNull().default(""),
    metadata: jsonb("metadata").default({}),
    provenance: jsonb("provenance").default({}),
    embeddingVector: vector(1024)("embedding_vector"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
    promotedAt: timestamp("promoted_at", { withTimezone: true }),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
  },
  (table) => [
    index("project_memories_project_updated_idx").on(table.projectId, table.updatedAt),
    index("project_memories_project_status_idx").on(table.projectId, table.status),
    index("project_memories_task_idx").on(table.taskId),
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
export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;
export type MessageRow = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type TaskEvent = typeof taskEvents.$inferSelect;
export type NewTaskEvent = typeof taskEvents.$inferInsert;
export type Settings = typeof settings.$inferSelect;
export type NewSettings = typeof settings.$inferInsert;
export type ProjectProfile = typeof projectProfiles.$inferSelect;
export type NewProjectProfile = typeof projectProfiles.$inferInsert;
export type ProjectThread = typeof projectThreads.$inferSelect;
export type NewProjectThread = typeof projectThreads.$inferInsert;
export type ProjectRun = typeof projectRuns.$inferSelect;
export type NewProjectRun = typeof projectRuns.$inferInsert;
export type RunStep = typeof runSteps.$inferSelect;
export type NewRunStep = typeof runSteps.$inferInsert;
export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
export type Artifact = typeof artifacts.$inferSelect;
export type NewArtifact = typeof artifacts.$inferInsert;
export type ArtifactVersion = typeof artifactVersions.$inferSelect;
export type NewArtifactVersion = typeof artifactVersions.$inferInsert;
export type EvidenceItem = typeof evidenceItems.$inferSelect;
export type NewEvidenceItem = typeof evidenceItems.$inferInsert;
export type ProjectMemory = typeof projectMemories.$inferSelect;
export type NewProjectMemory = typeof projectMemories.$inferInsert;
export type CanvasDocument = typeof canvasDocuments.$inferSelect;
export type NewCanvasDocument = typeof canvasDocuments.$inferInsert;
