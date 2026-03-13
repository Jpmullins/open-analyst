import fs from "fs";
import path from "path";
import type { Skill } from "./types";

function parseFrontmatter(content: string): { attributes: Record<string, unknown>; body: string } {
  const trimmed = String(content || "");
  if (!trimmed.startsWith("---\n")) {
    return { attributes: {}, body: trimmed.trim() };
  }

  const end = trimmed.indexOf("\n---\n", 4);
  if (end === -1) {
    return { attributes: {}, body: trimmed.trim() };
  }

  const rawFrontmatter = trimmed.slice(4, end).trim();
  const body = trimmed.slice(end + 5).trim();
  const attributes: Record<string, unknown> = {};

  let currentArrayKey: string | null = null;
  for (const rawLine of rawFrontmatter.split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) continue;

    if (currentArrayKey && /^\s*-\s+/.test(rawLine)) {
      const value = rawLine.replace(/^\s*-\s+/, "").trim();
      const arr = attributes[currentArrayKey];
      if (Array.isArray(arr)) arr.push(value);
      continue;
    }

    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();

    if (!value) {
      currentArrayKey = key;
      attributes[key] = [];
      continue;
    }

    currentArrayKey = null;
    if (value.startsWith("[") && value.endsWith("]")) {
      attributes[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
      continue;
    }
    attributes[key] = value.replace(/^['"]|['"]$/g, "");
  }

  return { attributes, body };
}

function listChildFiles(dirPath: string): string[] {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) return [];
  return fs.readdirSync(dirPath).sort();
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : [];
}

export function parseSkillManifest(folderPath: string, base: Partial<Skill> = {}): Skill {
  const skillPath = path.resolve(folderPath);
  const skillFile = path.join(skillPath, "SKILL.md");
  const raw = fs.readFileSync(skillFile, "utf8");
  const stats = fs.statSync(skillFile);
  const { attributes, body } = parseFrontmatter(raw);
  const name =
    String(attributes.name || base.name || path.basename(skillPath)).trim() ||
    path.basename(skillPath);
  const description = String(attributes.description || base.description || "").trim();
  const frontmatterTools = Array.isArray(attributes.tools)
    ? attributes.tools.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const references = listChildFiles(path.join(skillPath, "references")).map((item) =>
    path.join("references", item)
  );
  const scripts = listChildFiles(path.join(skillPath, "scripts")).map((item) =>
    path.join("scripts", item)
  );

  return {
    id: base.id || `skill-${path.basename(skillPath)}`,
    name,
    description,
    type: base.type || "custom",
    enabled: Boolean(base.enabled),
    createdAt: base.createdAt || stats.mtimeMs,
    config: {
      ...(base.config || {}),
      folderPath: skillPath,
      license: typeof attributes.license === "string" ? attributes.license : undefined,
      matchPhrases: readStringArray(attributes.matchPhrases),
      denyPhrases: readStringArray(attributes.denyPhrases),
      fileExtensions: readStringArray(attributes.fileExtensions),
    },
    instructions: body,
    tools: Array.isArray(base.tools) && base.tools.length ? base.tools : frontmatterTools,
    references,
    scripts,
    source: base.source || {
      kind: "custom",
      path: skillPath,
    },
  };
}

export function validateParsedSkill(skill: Skill): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const folderPath = String(skill.config?.folderPath || "").trim();
  if (!skill.name.trim()) errors.push("Missing skill name");
  if (!skill.instructions?.trim()) errors.push("SKILL.md must include instruction body");
  if (!folderPath) errors.push("Missing folderPath");

  for (const relPath of skill.references || []) {
    if (!fs.existsSync(path.join(folderPath, relPath))) {
      errors.push(`Missing reference: ${relPath}`);
    }
  }

  for (const relPath of skill.scripts || []) {
    if (!fs.existsSync(path.join(folderPath, relPath))) {
      errors.push(`Missing script: ${relPath}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
