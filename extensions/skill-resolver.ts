import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface ResolvedSkill {
  name: string;
  description: string;
  location: string;
}

export interface SkillResolverFs {
  exists(filePath: string): boolean;
  readFile(filePath: string): string;
}

export interface ResolveSkillsOptions {
  cwd: string;
  globalDir?: string;
  fs?: SkillResolverFs;
}

const defaultSkillFs: SkillResolverFs = {
  exists(filePath) {
    return fs.existsSync(filePath);
  },
  readFile(filePath) {
    return fs.readFileSync(filePath, 'utf-8');
  },
};

function defaultGlobalSkillsDir(): string {
  return path.join(os.homedir(), '.pi', 'agent', 'skills');
}

function parseSkillFrontmatter(content: string): { name: string; description: string } | undefined {
  const normalized = content.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---')) return undefined;

  const endIndex = normalized.indexOf('\n---', 3);
  if (endIndex === -1) return undefined;

  const frontmatterBlock = normalized.slice(4, endIndex);
  const lines = frontmatterBlock.split('\n');
  const data: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Check if this is a YAML block scalar continuation (| or >)
    if (
      data._currentBlockKey !== undefined &&
      (lines[i].startsWith('  ') || lines[i].startsWith('\t'))
    ) {
      const current = data[data._currentBlockKey] ?? '';
      data[data._currentBlockKey] = current ? `${current} ${trimmed}` : trimmed;
      continue;
    }
    delete data._currentBlockKey;

    const separator = trimmed.indexOf(':');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    // Handle YAML block scalar indicators (| and >)
    if (value === '|' || value === '>') {
      data._currentBlockKey = key;
      data[key] = '';
      continue;
    }

    value = value.replace(/^['"]|['"]$/g, '');
    if (key) data[key] = value;
  }
  delete data._currentBlockKey;

  if (!data.description || !data.description.trim()) return undefined;
  return { name: data.name || '', description: data.description.trim() };
}

function findSkillFile(
  skillName: string,
  cwd: string,
  globalDir: string,
  fileSystem: SkillResolverFs,
): string | undefined {
  // Priority 1: Project .agents/skills/<name>/SKILL.md
  const projectAgentsPath = path.join(cwd, '.agents', 'skills', skillName, 'SKILL.md');
  if (fileSystem.exists(projectAgentsPath)) return projectAgentsPath;

  // Priority 1: Project .pi/skills/<name>/SKILL.md
  const projectPiPath = path.join(cwd, '.pi', 'skills', skillName, 'SKILL.md');
  if (fileSystem.exists(projectPiPath)) return projectPiPath;

  // Priority 4: Global ~/.pi/agent/skills/<name>/SKILL.md
  const globalPiPath = path.join(globalDir, skillName, 'SKILL.md');
  if (fileSystem.exists(globalPiPath)) return globalPiPath;

  // Priority 4: Global ~/.agents/skills/<name>/SKILL.md
  const globalAgentsPath = path.join(os.homedir(), '.agents', 'skills', skillName, 'SKILL.md');
  if (fileSystem.exists(globalAgentsPath)) return globalAgentsPath;

  return undefined;
}

export function resolveSkills(
  skillNames: string[],
  options: ResolveSkillsOptions,
): { resolved: ResolvedSkill[]; missing: string[] } {
  const cwd = options.cwd;
  const globalDir = options.globalDir ?? defaultGlobalSkillsDir();
  const fileSystem = options.fs ?? defaultSkillFs;
  const resolved: ResolvedSkill[] = [];
  const missing: string[] = [];

  for (const name of skillNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;

    const filePath = findSkillFile(trimmed, cwd, globalDir, fileSystem);
    if (!filePath) {
      missing.push(trimmed);
      continue;
    }

    try {
      const content = fileSystem.readFile(filePath);
      const frontmatter = parseSkillFrontmatter(content);
      if (!frontmatter) {
        missing.push(trimmed);
        continue;
      }

      resolved.push({
        name: frontmatter.name || trimmed,
        description: frontmatter.description,
        location: filePath,
      });
    } catch {
      missing.push(trimmed);
    }
  }

  return { resolved, missing };
}
