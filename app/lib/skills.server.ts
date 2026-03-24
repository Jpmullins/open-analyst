import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { ensureConfigDir, getConfigDir, loadJsonArray, saveJsonArray } from './helpers.server';
import type { Skill, SkillCatalogEntry, SkillConfig } from './types';
import { parseSkillManifest, validateParsedSkill } from './skill-manifest.server';

const SKILLS_FILENAME = 'skills.json';
const REPO_SKILLS_DIR = path.resolve(process.cwd(), 'skills');

function getSkillsPath(configDir?: string): string {
  return path.join(configDir ?? getConfigDir(), SKILLS_FILENAME);
}

function defaultSkillRecords(): SkillConfig[] {
  const ts = Date.now();
  return [
    {
      id: 'builtin-web-research',
      name: 'Web Research',
      description: 'Web search/fetch and HF capture workflow',
      type: 'builtin',
      enabled: true,
      config: {
        tools: [
          'web_search',
          'web_fetch',
          'hf_daily_papers',
          'hf_paper',
        ],
      },
      createdAt: ts,
    },
    {
      id: 'builtin-code-ops',
      name: 'Code Operations',
      description: 'Read/write/edit/grep/glob/execute workflow',
      type: 'builtin',
      enabled: true,
      config: {
        tools: [
          'list_directory',
          'read_file',
          'write_file',
          'edit_file',
          'glob',
          'grep',
          'execute_command',
          'generate_file',
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
      id: 'builtin-web-research',
      name: 'Web Research',
      description: 'Web search, fetch, and paper capture workflow',
      type: 'builtin',
      enabled: true,
      createdAt: ts,
      tools: [
        'web_search',
        'web_fetch',
        'hf_daily_papers',
        'hf_paper',
      ],
      instructions:
        'Use this skill when the task requires external research, source discovery, web retrieval, or Hugging Face paper capture. Prefer cited, source-grounded answers.',
      source: { kind: 'builtin' },
      config: {},
    },
    {
      id: 'builtin-code-ops',
      name: 'Code Operations',
      description: 'Workspace file editing and shell workflow',
      type: 'builtin',
      enabled: true,
      createdAt: ts,
      tools: [
        'list_directory',
        'read_file',
        'write_file',
        'edit_file',
        'glob',
        'grep',
        'execute_command',
        'generate_file',
      ],
      instructions:
        'Use this skill when the task requires inspecting, editing, or executing code and workspace files. '
        + 'Use generate_file (not execute_command) to create binary files like DOCX, PDF, XLSX, or images. '
        + 'Stay within the project workspace and prefer direct file inspection before editing.',
      source: { kind: 'builtin' },
      config: {},
    },
  ];
}

function serializeSkill(skill: Skill): SkillConfig {
  return {
    id: skill.id,
    name: skill.name,
    description: skill.description || '',
    type: skill.type === 'custom' ? 'custom' : 'builtin',
    enabled: skill.enabled,
    createdAt: skill.createdAt,
    config: {
      ...(skill.config || {}),
      tools: skill.tools || [],
      instructions: skill.instructions || '',
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
      typeof stored.config?.instructions === 'string' && stored.config.instructions.trim()
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
    .filter((folderPath) => fs.existsSync(path.join(folderPath, 'SKILL.md')))
    .map((folderPath) => {
      const id = `repo-skill-${path.basename(folderPath)}`;
      const base: Partial<Skill> = {
        id,
        type: 'builtin',
        enabled: false,
        source: { kind: 'repository', path: folderPath },
      };
      try {
        return mergeWithStored(parseSkillManifest(folderPath, base), storedById);
      } catch {
        return mergeWithStored(
          {
            id,
            name: path.basename(folderPath),
            description: `Failed to parse ${folderPath}/SKILL.md`,
            type: 'builtin',
            enabled: false,
            createdAt: Date.now(),
            config: { folderPath },
            instructions: '',
            tools: [],
            source: { kind: 'repository', path: folderPath },
          },
          storedById
        );
      }
    });
}

function resolveCustomSkill(record: SkillConfig): Skill {
  const folderPath = String(record.config?.folderPath || '').trim();
  if (!folderPath) {
    return {
      id: record.id,
      name: record.name,
      description: record.description,
      type: 'custom',
      enabled: record.enabled,
      createdAt: record.createdAt,
      config: record.config,
      instructions: '',
      tools: [],
      source: { kind: 'custom' },
    };
  }

  try {
    return parseSkillManifest(folderPath, {
      id: record.id,
      name: record.name,
      description: record.description,
      type: 'custom',
      enabled: record.enabled,
      createdAt: record.createdAt,
      source: { kind: 'custom', path: folderPath },
      config: record.config,
    });
  } catch {
    return {
      id: record.id,
      name: record.name,
      description: `${record.description || 'Installed skill'} (folder unavailable)`,
      type: 'custom',
      enabled: false,
      createdAt: record.createdAt,
      config: record.config,
      instructions: '',
      tools: [],
      source: { kind: 'custom', path: folderPath },
    };
  }
}

export function listSkills(configDir?: string): Skill[] {
  const stored = getStoredSkills(configDir);
  const storedById = new Map(stored.map((skill) => [skill.id, skill]));
  const builtins = builtinRuntimeSkills().map((skill) => mergeWithStored(skill, storedById));
  const repoSkills = discoverRepositorySkills(storedById);
  const customSkills = stored
    .filter((skill) => skill.type === 'custom')
    .map((skill) => resolveCustomSkill(skill));

  return [...customSkills, ...repoSkills, ...builtins].sort((a, b) => a.name.localeCompare(b.name));
}

export function listActiveSkills(configDir?: string): Skill[] {
  return listSkills(configDir).filter((skill) => skill.enabled);
}

function normalizeText(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getConfigStringList(
  skill: Skill,
  key: 'matchPhrases' | 'denyPhrases' | 'fileExtensions'
): string[] {
  const value = skill.config?.[key];
  return Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
}

function getSkillAliases(skill: Skill): string[] {
  const aliases = new Set<string>();
  const add = (value: string | undefined) => {
    const normalized = normalizeText(value);
    if (normalized.length >= 4) aliases.add(normalized);
  };

  add(skill.name);
  add(skill.id.replace(/^repo-skill-/, '').replace(/^builtin-/, '').replace(/[-_]+/g, ' '));
  add(skill.source?.path ? path.basename(skill.source.path).replace(/\.[^.]+$/, '') : '');

  return Array.from(aliases);
}

function getSkillMatchTerms(skill: Skill): string[] {
  const terms = new Set<string>();
  const addTokens = (value: string | undefined) => {
    String(value || '')
      .toLowerCase()
      .split(/[^a-z0-9.]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .forEach((token) => terms.add(token));
  };

  addTokens(skill.name);
  addTokens(skill.description);
  addTokens(skill.source?.path ? path.basename(skill.source.path) : '');

  if (terms.has('pdf')) terms.add('.pdf');
  if (terms.has('docx')) terms.add('.docx');
  if (terms.has('pptx')) terms.add('.pptx');
  if (terms.has('xlsx')) terms.add('.xlsx');

  return Array.from(terms);
}

export function getSkillCatalog(skills: Skill[]): SkillCatalogEntry[] {
  return skills.map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description || '',
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
  const prompt = String(input.prompt || '')
    .trim()
    .toLowerCase();
  const latestUserText = Array.isArray(input.messages)
    ? [...input.messages]
        .reverse()
        .find((message) => message?.role === 'user' && String(message?.content || '').trim())
    : null;
  const fullText = prompt || String(latestUserText?.content || '').trim().toLowerCase();
  const normalizedPrompt = normalizeText(prompt);
  const normalizedFullText = normalizeText(fullText);

  if (!fullText) return [];

  const scored = skills
    .map((skill) => {
      const matchPhrases = getConfigStringList(skill, 'matchPhrases').map(normalizeText);
      const denyPhrases = getConfigStringList(skill, 'denyPhrases').map(normalizeText);
      const fileExtensions = getConfigStringList(skill, 'fileExtensions').map((item) =>
        item.startsWith('.') ? item.toLowerCase() : `.${item.toLowerCase()}`
      );
      const aliases = getSkillAliases(skill);

      if (denyPhrases.some((phrase) => phrase && normalizedFullText.includes(phrase))) {
        return { skill, score: -1 };
      }

      const terms = getSkillMatchTerms(skill);
      let score = 0;
      let explicitMatch = false;

      for (const phrase of matchPhrases) {
        if (phrase && normalizedFullText.includes(phrase)) {
          score += normalizedPrompt.includes(phrase) ? 18 : 12;
          explicitMatch = true;
        }
      }

      for (const alias of aliases) {
        if (alias && normalizedFullText.includes(alias)) {
          score += normalizedPrompt.includes(alias) ? 14 : 10;
          explicitMatch = true;
        }
      }

      for (const extension of fileExtensions) {
        if (extension && fullText.includes(extension)) {
          score += prompt.includes(extension) ? 12 : 8;
          explicitMatch = true;
        }
      }

      const allowGenericTermScoring = matchPhrases.length === 0 || explicitMatch;
      if (allowGenericTermScoring) {
        for (const term of terms) {
          if (prompt.includes(term)) {
            score += term.startsWith('.') ? 8 : 6;
          } else if (fullText.includes(term)) {
            score += term.startsWith('.') ? 4 : 2;
          }
        }
      }

      const sourcePath = String(skill.source?.path || '').toLowerCase();
      if (sourcePath && /\.(pdf|docx|pptx|xlsx)\b/.test(fullText)) {
        if (sourcePath.includes('pdf') && fullText.includes('.pdf')) score += 10;
        if (sourcePath.includes('docx') && fullText.includes('.docx')) score += 10;
        if (sourcePath.includes('pptx') && fullText.includes('.pptx')) score += 10;
        if (sourcePath.includes('xlsx') && fullText.includes('.xlsx')) score += 10;
      }

      for (const tool of skill.tools || []) {
        const toolName = String(tool).toLowerCase();
        if (toolName && fullText.includes(toolName.replace(/_/g, ' '))) {
          score += 3;
        }
      }

      return { skill, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.skill.name.localeCompare(b.skill.name));

  return scored.slice(0, 4).map((entry) => entry.skill);
}

export function validateSkillPath(folderPath: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!folderPath) {
    errors.push('folderPath is required');
  } else {
    if (!fs.existsSync(folderPath)) errors.push('Folder does not exist');
    if (fs.existsSync(folderPath) && !fs.statSync(folderPath).isDirectory())
      errors.push('Path is not a directory');
    if (fs.existsSync(folderPath) && !fs.existsSync(path.join(folderPath, 'SKILL.md')))
      errors.push('Missing SKILL.md');
  }
  if (errors.length > 0) return { valid: false, errors };

  try {
    const parsed = parseSkillManifest(folderPath, {
      id: `skill-${path.basename(path.resolve(folderPath))}`,
      type: 'custom',
      enabled: true,
      source: { kind: 'custom', path: path.resolve(folderPath) },
    });
    return validateParsedSkill(parsed);
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export function installSkill(folderPath: string, configDir?: string): Skill {
  const skillPath = path.resolve(folderPath);
  const skill = parseSkillManifest(skillPath, {
    id: `skill-${randomUUID()}`,
    type: 'custom',
    enabled: true,
    createdAt: Date.now(),
    source: { kind: 'custom', path: skillPath },
    config: { folderPath: skillPath },
  });
  const stored = getStoredSkills(configDir);
  stored.unshift(serializeSkill(skill));
  saveStoredSkills(stored, configDir);
  return skill;
}

export function deleteSkill(id: string, configDir?: string): { success: boolean } {
  const skills = getStoredSkills(configDir);
  saveStoredSkills(
    skills.filter((item) => item.id !== id),
    configDir
  );
  return { success: true };
}

export function setSkillEnabled(id: string, enabled: boolean, configDir?: string): Skill | null {
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
