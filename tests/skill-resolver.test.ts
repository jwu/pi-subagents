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
  test('returns empty results for empty input', () => {
    const { resolved, missing } = resolveSkills([], {
      cwd: '/project',
      fs: mockFs({}),
    });

    expect(resolved).toEqual([]);
    expect(missing).toEqual([]);
  });

  test('returns missing for non-existent skill names', () => {
    const { resolved, missing } = resolveSkills(['nonexistent-skill'], {
      cwd: '/project',
      fs: mockFs({}),
    });

    expect(resolved).toEqual([]);
    expect(missing).toEqual(['nonexistent-skill']);
  });

  test('resolves a skill from .agents/skills/<name>/SKILL.md', () => {
    const cwd = path.resolve(__dirname, '..');
    const { resolved, missing } = resolveSkills(['caveman'], { cwd });

    expect(missing).toEqual([]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].name).toBe('caveman');
    expect(resolved[0].description).toContain('Ultra-compressed');
    expect(resolved[0].location).toContain(path.join('.agents', 'skills', 'caveman', 'SKILL.md'));
  });

  test('project skill takes priority over global skill with same name', () => {
    const { resolved, missing } = resolveSkills(['shared-skill'], {
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

  test('falls back to global skill when project skill does not exist', () => {
    const { resolved, missing } = resolveSkills(['global-only'], {
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

  test('skill with missing description in frontmatter is treated as missing', () => {
    const { resolved, missing } = resolveSkills(['no-desc'], {
      cwd: '/project',
      fs: mockFs({
        '/project/.agents/skills/no-desc/SKILL.md': '---\nname: no-desc\n---\nNo description.\n',
      }),
    });

    expect(resolved).toEqual([]);
    expect(missing).toEqual(['no-desc']);
  });
});
