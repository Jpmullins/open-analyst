import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";

// Custom type for pgvector — nullable vector(1536)
const vector = customType<{ data: number[]; driverParam: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]): string {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: unknown): number[] {
    // pgvector returns "[1,2,3]" string
    return JSON.parse(value as string);
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
    embedding: vector("embedding"),
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
    agentBackend: varchar("agent_backend", { length: 50 }).default("strands"),
    devLogsEnabled: boolean("dev_logs_enabled").default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [uniqueIndex("settings_user_id_idx").on(table.userId)]
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
