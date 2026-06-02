import { describe, expect, test } from 'bun:test';
import { resolveSkills, type SkillResolverFs } from '../extensions/skill-resolver.ts';
import * as path from 'node:path';

function mockFs(files: Record<string, string>): SkillResolverFs {
  return {
    exists(filePath) {
      return filePath in files;
    },
    readFile(filePath) {
      const content = files[filePath];
      if (content === undefined) throw new Error(`File not found: ${filePath}`);
      return content;
    },
  };
}

describe('resolveSkills', () => {
  test('returns empty results for empty input', async () => {
    const { resolved, missing, skippedPackages } = await resolveSkills([], {
      cwd: '/project',
      fs: mockFs({}),
    });

    expect(resolved).toEqual([]);
    expect(missing).toEqual([]);
    expect(skippedPackages).toEqual([]);
  });

  test('returns missing for non-existent skill names', async () => {
    const { resolved, missing } = await resolveSkills(['nonexistent-skill'], {
      cwd: '/project',
      fs: mockFs({}),
    });

    expect(resolved).toEqual([]);
    expect(missing).toEqual(['nonexistent-skill']);
  });

  test('resolves a skill from .agents/skills/<name>/SKILL.md', async () => {
    const cwd = path.resolve(__dirname, '..');
    const { resolved, missing } = await resolveSkills(['caveman'], { cwd });

    expect(missing).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].name).toBe('caveman');
    expect(resolved[0].description).toContain('Ultra-compressed');
    expect(resolved[0].location).toContain(path.join('.agents', 'skills', 'caveman', 'SKILL.md'));
  });

  test('project skill takes priority over global skill with same name', async () => {
    const { resolved, missing } = await resolveSkills(['shared-skill'], {
      cwd: '/project',
      globalDir: '/home/.pi/agent/skills',
      fs: mockFs({
        '/project/.agents/skills/shared-skill/SKILL.md':
          '---\nname: shared-skill\ndescription: project version\n---\nProject body.\n',
        '/home/.pi/agent/skills/shared-skill/SKILL.md':
          '---\nname: shared-skill\ndescription: global version\n---\nGlobal body.\n',
      }),
    });

    expect(missing).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].description).toBe('project version');
  });

  test('falls back to global skill when project skill does not exist', async () => {
    const { resolved, missing } = await resolveSkills(['global-only'], {
      cwd: '/project',
      globalDir: '/home/.pi/agent/skills',
      fs: mockFs({
        '/home/.pi/agent/skills/global-only/SKILL.md':
          '---\nname: global-only\ndescription: global fallback\n---\nGlobal body.\n',
      }),
    });

    expect(missing).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].description).toBe('global fallback');
  });

  test('skill with missing description in frontmatter is treated as missing', async () => {
    const { resolved, missing } = await resolveSkills(['no-desc'], {
      cwd: '/project',
      fs: mockFs({
        '/project/.agents/skills/no-desc/SKILL.md': '---\nname: no-desc\n---\nNo description.\n',
      }),
    });

    expect(resolved).toEqual([]);
    expect(missing).toEqual(['no-desc']);
  });

  test('falls back to enabled package skill files by frontmatter name', async () => {
    const { resolved, missing } = await resolveSkills(['ask-user'], {
      cwd: '/project',
      fs: mockFs({
        '/package/skills/ask/SKILL.md':
          '---\nname: ask-user\ndescription: Uses ask_user as a requirements gate.\n---\nAsk user.\n',
      }),
      packageSkillFiles: ['/package/skills/ask/SKILL.md'],
    });

    expect(missing).toEqual([]);
    expect(resolved).toEqual([
      {
        name: 'ask-user',
        description: 'Uses ask_user as a requirements gate.',
        location: '/package/skills/ask/SKILL.md',
      },
    ]);
  });
});
