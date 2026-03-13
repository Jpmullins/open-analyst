import { eq } from "drizzle-orm";
import { db, DEV_USER_ID } from "../index.server";
import { settings, type Settings } from "../schema";

export interface SettingsData {
  activeProjectId: string | null;
  model: string;
  workingDir: string | null;
  workingDirType: string;
  s3Uri: string | null;
  agentBackend: string;
  devLogsEnabled: boolean;
}

const DEFAULTS: SettingsData = {
  activeProjectId: null,
  model: "",
  workingDir: null,
  workingDirType: "local",
  s3Uri: null,
  agentBackend: "strands",
  devLogsEnabled: false,
};

function toSettingsData(row: Settings): SettingsData {
  return {
    activeProjectId: row.activeProjectId ?? null,
    model: row.model ?? DEFAULTS.model,
    workingDir: row.workingDir ?? null,
    workingDirType: row.workingDirType ?? DEFAULTS.workingDirType,
    s3Uri: row.s3Uri ?? null,
    agentBackend: row.agentBackend ?? DEFAULTS.agentBackend,
    devLogsEnabled: row.devLogsEnabled ?? DEFAULTS.devLogsEnabled,
  };
}

export async function getSettings(
  userId: string = DEV_USER_ID
): Promise<SettingsData> {
  const [row] = await db
    .select()
    .from(settings)
    .where(eq(settings.userId, userId))
    .limit(1);
  if (!row) return { ...DEFAULTS };
  return toSettingsData(row);
}

export async function upsertSettings(
  updates: Partial<SettingsData>,
  userId: string = DEV_USER_ID
): Promise<SettingsData> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.activeProjectId !== undefined)
    values.activeProjectId = updates.activeProjectId;
  if (typeof updates.model === "string") values.model = updates.model;
  if (updates.workingDir !== undefined) values.workingDir = updates.workingDir;
  if (typeof updates.workingDirType === "string")
    values.workingDirType = updates.workingDirType;
  if (updates.s3Uri !== undefined) values.s3Uri = updates.s3Uri;
  if (typeof updates.agentBackend === "string")
    values.agentBackend = updates.agentBackend;
  if (typeof updates.devLogsEnabled === "boolean")
    values.devLogsEnabled = updates.devLogsEnabled;

  const [row] = await db
    .insert(settings)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: settings.userId,
      set: values,
    })
    .returning();

  return toSettingsData(row);
}
