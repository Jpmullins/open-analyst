import path from "path";
import { randomUUID } from "crypto";
import {
  ensureConfigDir,
  getConfigDir,
  loadJsonArray,
  saveJsonArray,
  nowIso,
} from "./helpers.server";
import type { Credential } from "./types";

const CREDENTIALS_FILENAME = "credentials.json";

function getCredentialsPath(configDir?: string): string {
  return path.join(configDir ?? getConfigDir(), CREDENTIALS_FILENAME);
}

export function listCredentials(configDir?: string): Credential[] {
  ensureConfigDir(configDir);
  return loadJsonArray<Credential>(getCredentialsPath(configDir));
}

export function createCredential(
  input: {
    name?: string;
    type?: string;
    service?: string;
    username?: string;
    password?: string;
    url?: string;
    notes?: string;
  },
  configDir?: string
): Credential {
  const credentials = listCredentials(configDir);
  const now = nowIso();
  const credential: Credential = {
    id: randomUUID(),
    name: String(input.name || "").trim(),
    type: (["email", "website", "api", "other"].includes(input.type || "")
      ? input.type
      : "other") as Credential["type"],
    service: String(input.service || "").trim() || undefined,
    username: String(input.username || "").trim(),
    password: typeof input.password === "string" ? input.password : undefined,
    url: String(input.url || "").trim() || undefined,
    notes: String(input.notes || "").trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  credentials.unshift(credential);
  saveJsonArray(getCredentialsPath(configDir), credentials);
  return credential;
}

export function updateCredential(
  id: string,
  updates: Partial<Omit<Credential, "id" | "createdAt">>,
  configDir?: string
): Credential | null {
  const credentials = listCredentials(configDir);
  const idx = credentials.findIndex((item) => item.id === id);
  if (idx === -1) return null;
  const previous = credentials[idx];
  credentials[idx] = {
    ...previous,
    ...updates,
    id: previous.id,
    createdAt: previous.createdAt,
    updatedAt: nowIso(),
  };
  saveJsonArray(getCredentialsPath(configDir), credentials);
  return credentials[idx];
}

export function deleteCredential(
  id: string,
  configDir?: string
): { success: boolean } {
  const credentials = listCredentials(configDir);
  const next = credentials.filter((item) => item.id !== id);
  saveJsonArray(getCredentialsPath(configDir), next);
  return { success: true };
}
