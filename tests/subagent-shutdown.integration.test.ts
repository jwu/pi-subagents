import { expect, test } from 'bun:test';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolvePiEntryPoint } from '../extensions/subagent-executor.ts';

const integrationTest = process.platform === 'win32' ? test.skip : test;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFile(
  filePath: string,
  timeoutMs: number,
  description: string,
): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await fs.readFile(filePath, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    await delay(20);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function waitForExit(
  child: ChildProcess,
  timeoutMs: number,
): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return { code: child.exitCode, signal: child.signalCode };
  }

  return await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Timed out waiting for pi to exit')),
      timeoutMs,
    );
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

function terminate(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(pid, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false;
    throw error;
  }
}

integrationTest(
  'SIGTERM aborts pi tool work and terminates its child process',
  async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pi-subagents-shutdown-'));
    const readyFile = path.join(tempDir, 'child-ready.json');
    const childExitedFile = path.join(tempDir, 'child-exited');
    const childFile = path.join(tempDir, 'sleeping-child.mjs');
    const extensionFile = path.join(tempDir, 'shutdown-probe.ts');
    const executorFile = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      '../extensions/subagent-executor.ts',
    );
    let piProcess: ChildProcess | undefined;
    let childPid: number | undefined;
    let stderr = '';

    try {
      await fs.writeFile(
        childFile,
        [
          "import { writeFileSync } from 'node:fs';",
          'writeFileSync(process.env.READY_FILE, JSON.stringify({ pid: process.pid }));',
          "process.on('SIGTERM', () => {",
          "  writeFileSync(process.env.CHILD_EXITED_FILE, 'terminated');",
          '  process.exit(0);',
          '});',
          'setInterval(() => {}, 1_000);',
        ].join('\n'),
      );
      await fs.writeFile(
        extensionFile,
        [
          `import { defaultRunner } from ${JSON.stringify(executorFile)};`,
          '',
          'export default function (pi) {',
          "  pi.on('agent_start', async (_event, ctx) => {",
          "    if (!ctx.signal) throw new Error('Expected an active agent signal');",
          '    await defaultRunner(',
          '      {',
          '        command: process.execPath,',
          `        args: [${JSON.stringify(childFile)}],`,
          '        cwd: process.cwd(),',
          '        env: {',
          '          ...process.env,',
          `          READY_FILE: ${JSON.stringify(readyFile)},`,
          `          CHILD_EXITED_FILE: ${JSON.stringify(childExitedFile)},`,
          '        },',
          '      },',
          '      { stdout() {}, stderr() {} },',
          '      ctx.signal,',
          '    );',
          '  });',
          '}',
        ].join('\n'),
      );

      const pi = resolvePiEntryPoint();
      piProcess = spawn(
        pi.command,
        [
          pi.entryPoint,
          '--mode',
          'json',
          '-p',
          '--no-session',
          '--no-context-files',
          '--no-skills',
          '--no-prompt-templates',
          '--no-builtin-tools',
          '--extension',
          extensionFile,
          '--model',
          'anthropic/claude-sonnet-4-6',
          '--api-key',
          'test-key',
          'Start the shutdown probe.',
        ],
        {
          cwd: tempDir,
          env: { ...process.env, PI_OFFLINE: '1', PI_SKIP_VERSION_CHECK: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      piProcess.stderr?.on('data', (chunk) => {
        stderr += String(chunk);
      });

      const ready = JSON.parse(
        await waitForFile(readyFile, 5_000, 'the child process readiness'),
      ) as {
        pid: number;
      };
      childPid = ready.pid;
      expect(processExists(childPid)).toBe(true);

      piProcess.kill('SIGTERM');
      const exit = await waitForExit(piProcess, 5_000);
      expect(exit.code === 143 || exit.signal === 'SIGTERM').toBe(true);
      await waitForFile(childExitedFile, 2_000, `child process ${childPid} termination`);
      expect(processExists(childPid)).toBe(false);
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}\npi stderr:\n${stderr}`,
      );
    } finally {
      terminate(piProcess?.pid);
      terminate(childPid);
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  },
  10_000,
);
