import { DEV_USER_ID, queryRow } from "../index.server";
import { type Settings } from "../schema";

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
  agentBackend: "langgraph",
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

export async function getSettings(userId: string = DEV_USER_ID): Promise<SettingsData> {
  const row = await queryRow<Settings>(
    `
      SELECT *
      FROM settings
      WHERE user_id = $1
      LIMIT 1
    `,
    [userId],
  );
  if (!row) return { ...DEFAULTS };
  return toSettingsData(row);
}

export async function upsertSettings(
  updates: Partial<SettingsData>,
  userId: string = DEV_USER_ID
): Promise<SettingsData> {
  const row = await queryRow<Settings>(
    `
      INSERT INTO settings (
        user_id,
        active_project_id,
        model,
        working_dir,
        working_dir_type,
        s3_uri,
        agent_backend,
        dev_logs_enabled,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET
        active_project_id = CASE WHEN $9::boolean THEN EXCLUDED.active_project_id ELSE settings.active_project_id END,
        model = CASE WHEN $10::boolean THEN EXCLUDED.model ELSE settings.model END,
        working_dir = CASE WHEN $11::boolean THEN EXCLUDED.working_dir ELSE settings.working_dir END,
        working_dir_type = CASE WHEN $12::boolean THEN EXCLUDED.working_dir_type ELSE settings.working_dir_type END,
        s3_uri = CASE WHEN $13::boolean THEN EXCLUDED.s3_uri ELSE settings.s3_uri END,
        agent_backend = CASE WHEN $14::boolean THEN EXCLUDED.agent_backend ELSE settings.agent_backend END,
        dev_logs_enabled = CASE WHEN $15::boolean THEN EXCLUDED.dev_logs_enabled ELSE settings.dev_logs_enabled END,
        updated_at = NOW()
      RETURNING *
    `,
    [
      userId,
      updates.activeProjectId !== undefined ? updates.activeProjectId : null,
      typeof updates.model === "string" ? updates.model : null,
      updates.workingDir !== undefined ? updates.workingDir : null,
      typeof updates.workingDirType === "string" ? updates.workingDirType : null,
      updates.s3Uri !== undefined ? updates.s3Uri : null,
      typeof updates.agentBackend === "string" ? updates.agentBackend : null,
      typeof updates.devLogsEnabled === "boolean" ? updates.devLogsEnabled : null,
      updates.activeProjectId !== undefined,
      typeof updates.model === "string",
      updates.workingDir !== undefined,
      typeof updates.workingDirType === "string",
      updates.s3Uri !== undefined,
      typeof updates.agentBackend === "string",
      typeof updates.devLogsEnabled === "boolean",
    ],
  );
  if (!row) throw new Error("Settings upsert failed");
  return toSettingsData(row);
}
