import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
export type SystemPromptMode = 'replace' | 'replace-all' | 'append';
export type AgentSource = 'global' | 'project';

export interface AgentConfig {
  name: string;
  description?: string;
  tools: string[];
  model?: string;
  thinking: ThinkingLevel;
  systemPromptMode: SystemPromptMode;
  allowedAgents?: string[];
  maxDepth: number;
  debug: boolean;
  skills?: string[];
  prompt: string;
  source: AgentSource;
  filePath: string;
}

export interface AgentDefinitionWarning {
  filePath: string;
  message: string;
}

export interface AgentDefinitionResult {
  agents: AgentConfig[];
  warnings: AgentDefinitionWarning[];
}

export interface AgentDefinitionFs {
  listFiles(dir: string): Promise<string[]>;
  readFile(filePath: string): Promise<string>;
}

export interface LoadAgentDefinitionsOptions {
  cwd?: string;
  globalDir?: string;
  projectDir?: string;
  fs?: AgentDefinitionFs;
}

const defaultFs: AgentDefinitionFs = {
  async listFiles(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() || entry.isSymbolicLink())
        .map((entry) => path.join(dir, entry.name))
        .sort();
    } catch {
      return [];
    }
  },
  readFile(filePath) {
    return fs.readFile(filePath, 'utf8');
  },
};

export function defaultGlobalAgentsDir(): string {
  return path.join(os.homedir(), '.pi', 'agent', 'agents');
}

export function defaultProjectAgentsDir(cwd = process.cwd()): string {
  return path.join(cwd, '.pi', 'agents');
}

function splitCsv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseFrontmatter(content: string): { data: Record<string, string>; body: string } {
  if (!content.startsWith('---\n')) throw new Error('missing frontmatter');
  const end = content.indexOf('\n---', 4);
  if (end === -1) throw new Error('missing frontmatter terminator');

  const rawFrontmatter = content.slice(4, end);
  const body = content.slice(end + '\n---'.length).replace(/^\n/, '');
  const data: Record<string, string> = {};

  for (const line of rawFrontmatter.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf(':');
    if (separator === -1) throw new Error(`invalid frontmatter line: ${line}`);
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (!key) throw new Error(`invalid frontmatter key: ${line}`);
    data[key] = value.replace(/^['"]|['"]$/g, '');
  }

  return { data, body };
}

function parseAgentFile(content: string, filePath: string, source: AgentSource): AgentConfig {
  const { data, body } = parseFrontmatter(content);
  if (!data.name) throw new Error('missing required field: name');

  const thinking = (data.thinking ?? 'off') as ThinkingLevel;
  if (!['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].includes(thinking)) {
    throw new Error(`invalid thinking: ${data.thinking}`);
  }

  const systemPromptMode = (data.systemPrompt ?? 'append') as SystemPromptMode;
  if (!['replace', 'replace-all', 'append'].includes(systemPromptMode)) {
    throw new Error(`invalid systemPrompt: ${data.systemPrompt}`);
  }

  const maxDepth = data.maxDepth === undefined ? 10 : Number(data.maxDepth);
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new Error(`invalid maxDepth: ${data.maxDepth}`);
  }

  let debug = false;
  if (data.debug !== undefined) {
    if (data.debug !== 'true' && data.debug !== 'false') {
      throw new Error(`invalid debug: ${data.debug}`);
    }
    debug = data.debug === 'true';
  }

  const allowedAgents = splitCsv(data.allowedAgents);
  const skills = splitCsv(data.skills);

  return {
    name: data.name,
    description: data.description,
    tools: splitCsv(data.tools),
    skills: skills.length > 0 ? skills : undefined,
    model: data.model || undefined,
    thinking,
    systemPromptMode,
    allowedAgents: allowedAgents.length > 0 ? allowedAgents : undefined,
    maxDepth,
    debug,
    prompt: body,
    source,
    filePath,
  };
}

async function loadDirectory(
  dir: string,
  source: AgentSource,
  fileSystem: AgentDefinitionFs,
  warnings: AgentDefinitionWarning[],
): Promise<AgentConfig[]> {
  const agents: AgentConfig[] = [];
  const seen = new Set<string>();

  for (const filePath of await fileSystem.listFiles(dir)) {
    if (!filePath.endsWith('.md')) continue;

    try {
      const agent = parseAgentFile(await fileSystem.readFile(filePath), filePath, source);
      if (seen.has(agent.name)) continue;
      seen.add(agent.name);
      agents.push(agent);
    } catch (error) {
      warnings.push({
        filePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return agents;
}

export async function loadAgentDefinitions(
  options: LoadAgentDefinitionsOptions = {},
): Promise<AgentDefinitionResult> {
  const fileSystem = options.fs ?? defaultFs;
  const globalDir = options.globalDir ?? defaultGlobalAgentsDir();
  const projectDir = options.projectDir ?? defaultProjectAgentsDir(options.cwd);
  const warnings: AgentDefinitionWarning[] = [];

  const globalAgents = await loadDirectory(globalDir, 'global', fileSystem, warnings);
  const projectAgents = await loadDirectory(projectDir, 'project', fileSystem, warnings);

  const byName = new Map<string, AgentConfig>();
  for (const agent of globalAgents) byName.set(agent.name, agent);
  for (const agent of projectAgents) byName.set(agent.name, agent);

  return { agents: [...byName.values()], warnings };
}
