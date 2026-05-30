import { AuthStorage, ModelRegistry, withFileMutationQueue } from '@earendil-works/pi-coding-agent';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentConfig } from './agent-loader.ts';

export interface AgentUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  contextWindow?: number;
}

export interface AgentToolLog {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: 'running' | 'done';
  nested?: AgentProgress;
}

export interface AgentProgress {
  agent: string;
  status: 'running' | 'done' | 'error';
  output: string;
  tools: AgentToolLog[];
  usage: AgentUsage;
  startedAt: number;
  elapsedMs: number;
  model?: string;
}

export interface AgentResult extends AgentProgress {
  isError: boolean;
  exitCode: number;
  stderr: string;
}

export interface PiResolution {
  command: string;
  entryPoint: string;
}

export interface ProcessInvocation {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

export interface ProcessHandlers {
  stdout(chunk: string): void;
  stderr(chunk: string): void;
}

export type ProcessRunner = (
  invocation: ProcessInvocation,
  handlers: ProcessHandlers,
  signal?: AbortSignal,
) => Promise<{ exitCode: number }>;

export interface ExecutorFs {
  makeTempDir(prefix: string): Promise<string>;
  writeFile(filePath: string, content: string): Promise<void>;
  removeDir(dir: string): Promise<void>;
}

export interface RunSubagentOptions {
  agent: AgentConfig;
  task: string;
  cwd: string;
  signal?: AbortSignal;
  onProgress?: (progress: AgentProgress) => void;
  depth?: number;
  tempRoot?: string;
  outputArchiveDir?: string;
  agentDir?: string;
  resolvePi?: () => Promise<PiResolution> | PiResolution;
  runner?: ProcessRunner;
  fs?: ExecutorFs;
  now?: () => number;
}

const TASK_FILE_THRESHOLD = 8000;
const OUTPUT_MAX_BYTES = 50 * 1024;
const OUTPUT_MAX_LINES = 2000;

const defaultFs: ExecutorFs = {
  makeTempDir(prefix) {
    return fs.mkdtemp(prefix);
  },
  async writeFile(filePath, content) {
    await withFileMutationQueue(filePath, async () => {
      await fs.writeFile(filePath, content, { encoding: 'utf8', mode: 0o600 });
    });
  },
  async removeDir(dir) {
    await fs.rm(dir, { recursive: true, force: true });
  },
};

const emptyUsage = (): AgentUsage => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  cost: 0,
  contextTokens: 0,
});

export function subagentSessionDir(
  cwd: string,
  agentDir = path.join(os.homedir(), '.pi', 'agent'),
): string {
  const safeProject = `--${path
    .resolve(cwd)
    .replace(/^[/\\]/, '')
    .replace(/[/\\:]/g, '-')}--`;
  return path.join(agentDir, 'sessions', safeProject, 'subagents');
}

export function resolvePiEntryPoint(): PiResolution {
  const packageEntryPoint = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));
  const packageRoot = path.dirname(path.dirname(packageEntryPoint));

  return {
    command: process.execPath,
    entryPoint: path.join(packageRoot, 'dist', 'cli.js'),
  };
}

export const defaultRunner: ProcessRunner = (invocation, handlers, signal) =>
  new Promise((resolve, reject) => {
    const child = spawn(invocation.command, invocation.args, {
      cwd: invocation.cwd,
      env: invocation.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => handlers.stdout(String(chunk)));
    child.stderr.on('data', (chunk) => handlers.stderr(String(chunk)));
    child.on('error', reject);
    child.on('close', (code) => resolve({ exitCode: code ?? 0 }));

    if (signal) {
      const abort = () => child.kill('SIGTERM');
      if (signal.aborted) abort();
      else signal.addEventListener('abort', abort, { once: true });
    }
  });

function textFromMessage(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return undefined;

  for (const part of content) {
    if (part && typeof part === 'object' && (part as { type?: unknown }).type === 'text') {
      const text = (part as { text?: unknown }).text;
      if (typeof text === 'string') return text;
    }
  }

  return undefined;
}

type ContextWindowLookup = {
  find: (provider: string, modelId: string) => { contextWindow?: number } | undefined;
};

function contextWindowFromMessage(
  message: unknown,
  modelRegistry?: ContextWindowLookup,
): number | undefined {
  if (!message || typeof message !== 'object' || !modelRegistry) return undefined;
  const provider = (message as { provider?: unknown }).provider;
  const model = (message as { model?: unknown }).model;
  if (typeof provider !== 'string' || typeof model !== 'string') return undefined;
  return modelRegistry.find(provider, model)?.contextWindow;
}

function usageFromMessage(
  message: unknown,
  modelRegistry?: ContextWindowLookup,
): Partial<AgentUsage> | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const usage = (message as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return undefined;
  const typed = usage as Record<string, unknown>;
  const cost =
    typed.cost && typeof typed.cost === 'object'
      ? (typed.cost as Record<string, unknown>)
      : undefined;

  return {
    input: typeof typed.input === 'number' ? typed.input : undefined,
    output: typeof typed.output === 'number' ? typed.output : undefined,
    cacheRead: typeof typed.cacheRead === 'number' ? typed.cacheRead : undefined,
    cacheWrite: typeof typed.cacheWrite === 'number' ? typed.cacheWrite : undefined,
    cost: typeof cost?.total === 'number' ? cost.total : undefined,
    contextTokens: typeof typed.totalTokens === 'number' ? typed.totalTokens : undefined,
    contextWindow:
      typeof typed.contextWindow === 'number'
        ? typed.contextWindow
        : contextWindowFromMessage(message, modelRegistry),
  };
}

function modelFromMessage(message: unknown): string | undefined {
  if (!message || typeof message !== 'object') return undefined;
  const model = (message as { model?: unknown }).model;
  return typeof model === 'string' ? model : undefined;
}

function updateUsage(target: AgentUsage, update: Partial<AgentUsage> | undefined) {
  if (!update) return;
  target.input += update.input ?? 0;
  target.output += update.output ?? 0;
  target.cacheRead += update.cacheRead ?? 0;
  target.cacheWrite += update.cacheWrite ?? 0;
  target.cost += update.cost ?? 0;
  target.contextTokens = update.contextTokens ?? target.contextTokens;
  target.contextWindow = update.contextWindow ?? target.contextWindow;
}

function replaceUsage(target: AgentUsage, source: AgentUsage) {
  target.input = source.input;
  target.output = source.output;
  target.cacheRead = source.cacheRead;
  target.cacheWrite = source.cacheWrite;
  target.cost = source.cost;
  target.contextTokens = source.contextTokens;
  target.contextWindow = source.contextWindow;
}

function usageFromMessages(
  messages: unknown,
  modelRegistry?: ContextWindowLookup,
): AgentUsage | undefined {
  if (!Array.isArray(messages)) return undefined;
  const aggregate = emptyUsage();
  let sawUsage = false;

  for (const message of messages) {
    if (!message || typeof message !== 'object') continue;
    if ((message as { role?: unknown }).role !== 'assistant') continue;
    const update = usageFromMessage(message, modelRegistry);
    if (!update) continue;
    sawUsage = true;
    updateUsage(aggregate, update);
  }

  return sawUsage ? aggregate : undefined;
}

function lastAssistantModel(messages: unknown): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (!message || typeof message !== 'object') continue;
    if ((message as { role?: unknown }).role !== 'assistant') continue;
    const model = modelFromMessage(message);
    if (model) return model;
  }
  return undefined;
}

function buildTaskArgument(task: string, taskFilePath: string | undefined): string {
  return taskFilePath ? `Task: @${taskFilePath}` : `Task: ${task}`;
}

function byteLength(text: string): number {
  return Buffer.byteLength(text, 'utf8');
}

function keepTailByBytes(text: string, maxBytes: number): string {
  let kept = text;
  while (byteLength(kept) > maxBytes) kept = kept.slice(1);
  return kept;
}

function truncateHeadContent(text: string, maxBytes: number, maxLines: number): string | undefined {
  const lines = text.split('\n');
  if (byteLength(text) <= maxBytes && lines.length <= maxLines) return undefined;

  const lineLimited = lines.length > maxLines ? lines.slice(-maxLines).join('\n') : text;
  return keepTailByBytes(lineLimited, maxBytes);
}

function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]+/g, '_');
}

function progressFromPartialResult(partialResult: unknown): AgentProgress | undefined {
  if (!partialResult || typeof partialResult !== 'object') return undefined;
  const details = (partialResult as { details?: unknown }).details;
  if (!details || typeof details !== 'object') return undefined;
  const agent = (details as { agent?: unknown }).agent;
  const status = (details as { status?: unknown }).status;
  if (typeof agent !== 'string') return undefined;
  if (status !== 'running' && status !== 'done' && status !== 'error') return undefined;
  return details as AgentProgress;
}

export async function runSubagent(options: RunSubagentOptions): Promise<AgentResult> {
  const fileSystem = options.fs ?? defaultFs;
  const resolvePi = options.resolvePi ?? resolvePiEntryPoint;
  const runner = options.runner ?? defaultRunner;
  const now = options.now ?? Date.now;
  const startedAt = now();
  const tempPrefix = path.join(options.tempRoot ?? os.tmpdir(), 'pi-subagent-');
  const tempDir = await fileSystem.makeTempDir(tempPrefix);

  const usage = emptyUsage();
  const tools: AgentToolLog[] = [];
  let output = '';
  let stderr = '';
  let model = options.agent.model;
  let stdoutBuffer = '';

  const progress = (status: AgentProgress['status']): AgentProgress => ({
    agent: options.agent.name,
    status,
    output,
    tools: [...tools],
    usage: { ...usage },
    startedAt,
    elapsedMs: now() - startedAt,
    model,
  });

  const emit = (status: AgentProgress['status'] = 'running') =>
    options.onProgress?.(progress(status));

  try {
    const promptFilePath = path.join(tempDir, 'system-prompt.md');
    await fileSystem.writeFile(promptFilePath, options.agent.prompt);

    let taskFilePath: string | undefined;
    if (options.task.length > TASK_FILE_THRESHOLD) {
      taskFilePath = path.join(tempDir, 'task.md');
      await fileSystem.writeFile(taskFilePath, options.task);
    }

    const pi = await resolvePi();
    const modelRegistry = ModelRegistry.create(
      AuthStorage.create(options.agentDir ? path.join(options.agentDir, 'auth.json') : undefined),
      options.agentDir ? path.join(options.agentDir, 'models.json') : undefined,
    );
    const args = [
      pi.entryPoint,
      '--mode',
      'json',
      '-p',
      '--no-skills',
      '--no-prompt-templates',
      '--no-context-files',
    ];

    if (options.agent.model) args.push('--model', options.agent.model);
    args.push('--thinking', options.agent.thinking);
    if (options.agent.tools.length > 0) args.push('--tools', options.agent.tools.join(','));
    args.push(
      options.agent.systemPromptMode === 'append' ? '--append-system-prompt' : '--system-prompt',
      promptFilePath,
    );
    args.push('--session-dir', subagentSessionDir(options.cwd, options.agentDir));
    args.push(buildTaskArgument(options.task, taskFilePath));

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PI_SUBAGENT_DEPTH: String(options.depth ?? 1),
      PI_SUBAGENT_MAX_DEPTH: String(options.agent.maxDepth),
    };
    if (options.agent.tools.includes('subagent') && options.agent.allowedAgents?.length) {
      env.PI_SUBAGENT_ALLOWED = options.agent.allowedAgents.join(',');
    }

    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return;
      }

      if (event.type === 'tool_execution_start') {
        tools.push({
          id: String(event.toolCallId ?? tools.length),
          name: String(event.toolName ?? 'tool'),
          args:
            event.args && typeof event.args === 'object'
              ? (event.args as Record<string, unknown>)
              : {},
          status: 'running',
        });
        emit();
        return;
      }

      if (event.type === 'tool_execution_update') {
        const id = String(event.toolCallId ?? '');
        const tool = tools.find((item) => item.id === id);
        const nested = progressFromPartialResult(event.partialResult);
        if (tool && nested) tool.nested = nested;
        emit();
        return;
      }

      if (event.type === 'tool_execution_end') {
        const id = String(event.toolCallId ?? '');
        const tool = tools.find((item) => item.id === id);
        if (tool) tool.status = 'done';
        emit();
        return;
      }

      if (event.type === 'message_end' && event.message) {
        const text = textFromMessage(event.message);
        if (text !== undefined) output = text;
        updateUsage(usage, usageFromMessage(event.message, modelRegistry));
        model = modelFromMessage(event.message) ?? model;
        emit();
        return;
      }

      if (event.type === 'agent_end') {
        const aggregate = usageFromMessages(event.messages, modelRegistry);
        if (aggregate) replaceUsage(usage, aggregate);
        model = lastAssistantModel(event.messages) ?? model;
        emit();
      }
    };

    const exit = await runner(
      {
        command: pi.command,
        args,
        cwd: options.cwd,
        env,
      },
      {
        stdout(chunk) {
          stdoutBuffer += chunk;
          const lines = stdoutBuffer.split('\n');
          stdoutBuffer = lines.pop() ?? '';
          for (const line of lines) processLine(line);
        },
        stderr(chunk) {
          stderr += chunk;
        },
      },
      options.signal,
    );

    if (stdoutBuffer.trim()) processLine(stdoutBuffer);
    const isError = exit.exitCode !== 0;
    if (isError && !output) output = stderr || `Subagent exited with code ${exit.exitCode}`;

    const truncated = truncateHeadContent(output, OUTPUT_MAX_BYTES, OUTPUT_MAX_LINES);
    if (truncated !== undefined) {
      const originalOutput = output;
      const fullOutputPath = path.join(
        options.outputArchiveDir ?? os.tmpdir(),
        `${safeFilePart(options.agent.name)}-${startedAt}-output.md`,
      );
      await fileSystem.writeFile(fullOutputPath, originalOutput);
      output = `${truncated}\n\n[Output truncated: original ${originalOutput.split('\n').length} lines / ${byteLength(
        originalOutput,
      )} bytes. Full output: ${fullOutputPath}]`;
    }

    const result: AgentResult = {
      ...progress(isError ? 'error' : 'done'),
      isError,
      exitCode: exit.exitCode,
      stderr,
    };
    emit(isError ? 'error' : 'done');
    return result;
  } catch (error) {
    output = error instanceof Error ? error.message : String(error);
    return {
      ...progress('error'),
      isError: true,
      exitCode: 1,
      stderr,
    };
  } finally {
    await fileSystem.removeDir(tempDir);
  }
}
