import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  ensureConfigDir,
  getConfigDir,
  loadJsonArray,
  saveJsonArray,
} from "./helpers.server";
import type { Skill, SkillCatalogEntry, SkillConfig } from "./types";
import {
  parseSkillManifest,
  validateParsedSkill,
} from "./skill-manifest.server";

const SKILLS_FILENAME = "skills.json";
const REPO_SKILLS_DIR = path.resolve(process.cwd(), "skills");

function getSkillsPath(configDir?: string): string {
  return path.join(configDir ?? getConfigDir(), SKILLS_FILENAME);
}

function defaultSkillRecords(): SkillConfig[] {
  const ts = Date.now();
  return [
    {
      id: "builtin-web-research",
      name: "Web Research",
      description: "Web search/fetch/arXiv/HF capture workflow",
      type: "builtin",
      enabled: true,
      config: {
        tools: [
          "deep_research",
          "web_search",
          "web_fetch",
          "arxiv_search",
          "hf_daily_papers",
          "hf_paper",
        ],
      },
      createdAt: ts,
    },
    {
      id: "builtin-code-ops",
      name: "Code Operations",
      description: "Read/write/edit/grep/glob/execute workflow",
      type: "builtin",
      enabled: true,
      config: {
        tools: [
          "list_directory",
          "read_file",
          "write_file",
          "edit_file",
          "glob",
          "grep",
          "execute_command",
        ],
      },
      createdAt: ts,
    },
  ];
}

function getStoredSkills(configDir?: string): SkillConfig[] {
  ensureConfigDir(configDir);
  const existing = loadJsonArray<SkillConfig>(getSkillsPath(configDir));
  if (existing.length) return existing;
  const defaults = defaultSkillRecords();
  saveJsonArray(getSkillsPath(configDir), defaults);
  return defaults;
}

function saveStoredSkills(skills: SkillConfig[], configDir?: string): void {
  saveJsonArray(getSkillsPath(configDir), skills);
}

function builtinRuntimeSkills(): Skill[] {
  const ts = Date.now();
  return [
    {
      id: "builtin-web-research",
      name: "Web Research",
      description: "Web search, fetch, and deep research workflow",
      type: "builtin",
      enabled: true,
      createdAt: ts,
      tools: [
        "deep_research",
        "web_search",
        "web_fetch",
        "arxiv_search",
        "hf_daily_papers",
        "hf_paper",
      ],
      instructions:
        "Use this skill when the task requires external research, source discovery, web retrieval, arXiv lookup, or Hugging Face paper capture. Prefer cited, source-grounded answers.",
      source: { kind: "builtin" },
      config: {},
    },
    {
      id: "builtin-code-ops",
      name: "Code Operations",
      description: "Workspace file editing and shell workflow",
      type: "builtin",
      enabled: true,
      createdAt: ts,
      tools: [
        "list_directory",
        "read_file",
        "write_file",
        "edit_file",
        "glob",
        "grep",
        "execute_command",
      ],
      instructions:
        "Use this skill when the task requires inspecting, editing, or executing code and workspace files. Stay within the project workspace and prefer direct file inspection before editing.",
      source: { kind: "builtin" },
      config: {},
    },
  ];
}

function serializeSkill(skill: Skill): SkillConfig {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description || "",
    type: skill.type === "custom" ? "custom" : "builtin",
    enabled: skill.enabled,
    createdAt: skill.createdAt,
    config: {
      ...(skill.config || {}),
      tools: skill.tools || [],
      instructions: skill.instructions || "",
      sourceKind: skill.source?.kind,
    },
  };
}

function mergeWithStored(skill: Skill, storedById: Map<string, SkillConfig>): Skill {
  const stored = storedById.get(skill.id);
  if (!stored) return skill;
  return {
    ...skill,
    name: stored.name || skill.name,
    description: stored.description || skill.description,
    enabled: stored.enabled,
    config: { ...(skill.config || {}), ...(stored.config || {}) },
    tools:
      Array.isArray(stored.config?.tools) && stored.config.tools.length
        ? stored.config.tools.map((item) => String(item))
        : skill.tools,
    instructions:
      typeof stored.config?.instructions === "string" &&
      stored.config.instructions.trim()
        ? stored.config.instructions
        : skill.instructions,
  };
}

function discoverRepositorySkills(storedById: Map<string, SkillConfig>): Skill[] {
  if (!fs.existsSync(REPO_SKILLS_DIR) || !fs.statSync(REPO_SKILLS_DIR).isDirectory()) {
    return [];
  }

  return fs
    .readdirSync(REPO_SKILLS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(REPO_SKILLS_DIR, entry.name))
    .filter((folderPath) => fs.existsSync(path.join(folderPath, "SKILL.md")))
    .map((folderPath) => {
      const id = `repo-skill-${path.basename(folderPath)}`;
      const base: Partial<Skill> = {
        id,
        type: "builtin",
        enabled: false,
        source: { kind: "repository", path: folderPath },
      };
      try {
        return mergeWithStored(parseSkillManifest(folderPath, base), storedById);
      } catch {
        return mergeWithStored(
          {
            id,
            name: path.basename(folderPath),
            description: `Failed to parse ${folderPath}/SKILL.md`,
            type: "builtin",
            enabled: false,
            createdAt: Date.now(),
            config: { folderPath },
            instructions: "",
            tools: [],
            source: { kind: "repository", path: folderPath },
          },
          storedById
        );
      }
    });
}

function resolveCustomSkill(record: SkillConfig): Skill {
  const folderPath = String(record.config?.folderPath || "").trim();
  if (!folderPath) {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      type: "custom",
      enabled: record.enabled,
      createdAt: record.createdAt,
      config: record.config,
      instructions: "",
      tools: [],
      source: { kind: "custom" },
    };
  }

  try {
    return parseSkillManifest(folderPath, {
      id: record.id,
      name: record.name,
      description: record.description,
      type: "custom",
      enabled: record.enabled,
      createdAt: record.createdAt,
      source: { kind: "custom", path: folderPath },
      config: record.config,
    });
  } catch {
    return {
      id: record.id,
      name: record.name,
      description: `${record.description || "Installed skill"} (folder unavailable)`,
      type: "custom",
      enabled: false,
      createdAt: record.createdAt,
      config: record.config,
      instructions: "",
      tools: [],
      source: { kind: "custom", path: folderPath },
    };
  }
}

export function listSkills(configDir?: string): Skill[] {
  const stored = getStoredSkills(configDir);
  const storedById = new Map(stored.map((skill) => [skill.id, skill]));
  const builtins = builtinRuntimeSkills().map((skill) =>
    mergeWithStored(skill, storedById)
  );
  const repoSkills = discoverRepositorySkills(storedById);
  const customSkills = stored
    .filter((skill) => skill.type === "custom")
    .map((skill) => resolveCustomSkill(skill));

  return [...customSkills, ...repoSkills, ...builtins].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function listActiveSkills(configDir?: string): Skill[] {
  return listSkills(configDir).filter((skill) => skill.enabled);
}

function getSkillMatchTerms(skill: Skill): string[] {
  const terms = new Set<string>();
  const addTokens = (value: string | undefined) => {
    String(value || "")
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .forEach((token) => terms.add(token));
  };

  addTokens(skill.name);
  addTokens(skill.description);
  addTokens(skill.source?.path ? path.basename(skill.source.path) : "");

  if (terms.has("pdf")) terms.add(".pdf");
  if (terms.has("docx")) terms.add(".docx");
  if (terms.has("pptx")) terms.add(".pptx");
  if (terms.has("xlsx")) terms.add(".xlsx");

  return Array.from(terms);
}

export function getSkillCatalog(skills: Skill[]): SkillCatalogEntry[] {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description || "",
    tools: skill.tools || [],
  }));
}

export function getActiveSkillToolNames(skills: Skill[]): string[] {
  return Array.from(
    new Set(
      skills.flatMap((skill) =>
        Array.isArray(skill.tools) ? skill.tools.map((tool) => String(tool)) : []
      )
    )
  );
}

export function selectMatchedSkills(
  skills: Skill[],
  input: { prompt?: string; messages?: Array<{ role?: string; content?: unknown }> }
): Skill[] {
  const latestUserText = [
    String(input.prompt || "").trim(),
    ...(Array.isArray(input.messages)
      ? input.messages
          .filter((message) => message?.role === "user")
          .map((message) => String(message?.content || "").trim())
      : []),
  ]
    .filter(Boolean)
    .pop()
    ?.toLowerCase() || "";

  if (!latestUserText) return [];

  return skills.filter((skill) =>
    getSkillMatchTerms(skill).some((term) => latestUserText.includes(term))
  );
}

export function validateSkillPath(
  folderPath: string
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!folderPath) {
    errors.push("folderPath is required");
  } else {
    if (!fs.existsSync(folderPath)) errors.push("Folder does not exist");
    if (fs.existsSync(folderPath) && !fs.statSync(folderPath).isDirectory())
      errors.push("Path is not a directory");
    if (
      fs.existsSync(folderPath) &&
      !fs.existsSync(path.join(folderPath, "SKILL.md"))
    )
      errors.push("Missing SKILL.md");
  }
  if (errors.length > 0) return { valid: false, errors };

  try {
    const parsed = parseSkillManifest(folderPath, {
      id: `skill-${path.basename(path.resolve(folderPath))}`,
      type: "custom",
      enabled: true,
      source: { kind: "custom", path: path.resolve(folderPath) },
    });
    return validateParsedSkill(parsed);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function installSkill(
  folderPath: string,
  configDir?: string
): Skill {
  const skillPath = path.resolve(folderPath);
  const skill = parseSkillManifest(skillPath, {
    id: `skill-${randomUUID()}`,
    type: "custom",
    enabled: true,
    createdAt: Date.now(),
    source: { kind: "custom", path: skillPath },
    config: { folderPath: skillPath },
  });
  const stored = getStoredSkills(configDir);
  stored.unshift(serializeSkill(skill));
  saveStoredSkills(stored, configDir);
  return skill;
}

export function deleteSkill(
  id: string,
  configDir?: string
): { success: boolean } {
  const skills = getStoredSkills(configDir);
  saveStoredSkills(
    skills.filter((item) => item.id !== id),
    configDir
  );
  return { success: true };
}

export function setSkillEnabled(
  id: string,
  enabled: boolean,
  configDir?: string
): Skill | null {
  const stored = getStoredSkills(configDir);
  const idx = stored.findIndex((item) => item.id === id);

  if (idx !== -1) {
    stored[idx] = { ...stored[idx], enabled };
    saveStoredSkills(stored, configDir);
    return listSkills(configDir).find((item) => item.id === id) || null;
  }

  const discovered = listSkills(configDir).find((item) => item.id === id);
  if (!discovered) return null;

  const next = { ...discovered, enabled };
  stored.unshift(serializeSkill(next));
  saveStoredSkills(stored, configDir);
  return next;
}
