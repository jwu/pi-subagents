import {
  DefaultPackageManager,
  SettingsManager,
  getAgentDir,
  type ResolvedResource,
} from '@earendil-works/pi-coding-agent';
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
  agentDir?: string;
  globalDir?: string;
  fs?: SkillResolverFs;
  packageSkillFiles?: string[];
}

export interface ResolveSkillsResult {
  resolved: ResolvedSkill[];
  missing: string[];
  skippedPackages: string[];
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

function findLocalSkillFile(
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

async function resolvePackageSkillFiles(options: ResolveSkillsOptions): Promise<{
  files: string[];
  skippedPackages: string[];
}> {
  if (options.packageSkillFiles) {
    return { files: options.packageSkillFiles, skippedPackages: [] };
  }
  if (options.fs) {
    return { files: [], skippedPackages: [] };
  }

  const skippedPackages: string[] = [];
  const agentDir = options.agentDir ?? getAgentDir();
  const settingsManager = SettingsManager.create(options.cwd, agentDir);
  const packageManager = new DefaultPackageManager({
    cwd: options.cwd,
    agentDir,
    settingsManager,
  });
  const resolvedPaths = await packageManager.resolve(async (source) => {
    skippedPackages.push(source);
    return 'skip';
  });

  return {
    files: resolvedPaths.skills
      .filter((resource: ResolvedResource) => resource.enabled)
      .map((resource: ResolvedResource) => resource.path),
    skippedPackages,
  };
}

function readSkill(
  filePath: string,
  requestedName: string,
  fileSystem: SkillResolverFs,
  requireNameMatch: boolean,
): ResolvedSkill | undefined {
  const content = fileSystem.readFile(filePath);
  const frontmatter = parseSkillFrontmatter(content);
  if (!frontmatter) return undefined;

  const fileSkillName = frontmatter.name || path.basename(path.dirname(filePath));
  const markdownName = path.basename(filePath, '.md');
  if (requireNameMatch && fileSkillName !== requestedName && markdownName !== requestedName) {
    return undefined;
  }

  return {
    name: fileSkillName || requestedName,
    description: frontmatter.description,
    location: filePath,
  };
}

export async function resolveSkills(
  skillNames: string[],
  options: ResolveSkillsOptions,
): Promise<ResolveSkillsResult> {
  const cwd = options.cwd;
  const globalDir = options.globalDir ?? defaultGlobalSkillsDir();
  const fileSystem = options.fs ?? defaultSkillFs;
  const resolved: ResolvedSkill[] = [];
  const missing: string[] = [];
  const pendingPackageResolution: string[] = [];

  for (const name of skillNames) {
    const trimmed = name.trim();
    if (!trimmed) continue;

    const localFilePath = findLocalSkillFile(trimmed, cwd, globalDir, fileSystem);
    if (localFilePath) {
      try {
        const skill = readSkill(localFilePath, trimmed, fileSystem, false);
        if (skill) {
          resolved.push(skill);
          continue;
        }
      } catch {
        // Try package skills before marking the skill as missing.
      }
    }

    pendingPackageResolution.push(trimmed);
  }

  const packageSkills =
    pendingPackageResolution.length > 0
      ? await resolvePackageSkillFiles(options)
      : { files: [], skippedPackages: [] };

  for (const trimmed of pendingPackageResolution) {
    let packageSkill: ResolvedSkill | undefined;
    for (const filePath of packageSkills.files) {
      try {
        packageSkill = readSkill(filePath, trimmed, fileSystem, true);
        if (packageSkill) break;
      } catch {
        // Try the next package skill file.
      }
    }

    if (packageSkill) resolved.push(packageSkill);
    else missing.push(trimmed);
  }

  return { resolved, missing, skippedPackages: packageSkills.skippedPackages };
}
