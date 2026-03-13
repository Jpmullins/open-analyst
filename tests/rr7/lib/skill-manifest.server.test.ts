import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parseSkillManifest, validateParsedSkill } from '~/lib/skill-manifest.server';

const repoSkillsDir = path.resolve(process.cwd(), 'skills');

describe('repository skill manifests', () => {
  it('parses and validates every built-in repository skill', () => {
    const skillDirs = fs
      .readdirSync(repoSkillsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(repoSkillsDir, entry.name))
      .filter((dirPath) => fs.existsSync(path.join(dirPath, 'SKILL.md')));

    expect(skillDirs.length).toBeGreaterThan(0);

    const invalid = skillDirs
      .map((dirPath) => {
        const skill = parseSkillManifest(dirPath, {
          id: `repo-skill-${path.basename(dirPath)}`,
          type: 'builtin',
          enabled: true,
          source: { kind: 'repository', path: dirPath },
        });
        return {
          dirPath,
          validation: validateParsedSkill(skill),
        };
      })
      .filter((entry) => !entry.validation.valid);

    expect(invalid).toEqual([]);
  });
});
