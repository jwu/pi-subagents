import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadAgentDefinitions } from './agent-loader.ts';
import { isSubagentReplaceSystemPrompt } from './env-utils.ts';
import { injectRuntimeToolsBlock } from './subagent-prompt.ts';
import { registerSubagentTool } from './subagent-tool.ts';

export default async function (pi: ExtensionAPI) {
  const result = await loadAgentDefinitions({ cwd: process.cwd() });

  for (const warning of result.warnings) {
    console.warn(`[pi-subagents] skipped ${warning.filePath}: ${warning.message}`);
  }

  const registerScopedSubagentTool = (allowedAgents?: readonly string[]) => {
    registerSubagentTool(pi, { agents: result.agents, allowedAgents });
  };

  if (isSubagentReplaceSystemPrompt(process.env)) {
    pi.on('before_agent_start', (event) => ({
      systemPrompt: injectRuntimeToolsBlock(event.systemPrompt, event.systemPromptOptions),
    }));
  }

  pi.events.on('pi-subagents:configure', (configuration: unknown) => {
    const allowedAgents =
      configuration &&
      typeof configuration === 'object' &&
      Array.isArray((configuration as { allowedAgents?: unknown }).allowedAgents)
        ? (configuration as { allowedAgents: unknown[] }).allowedAgents.filter(
            (name): name is string => typeof name === 'string',
          )
        : undefined;
    registerScopedSubagentTool(allowedAgents);
  });

  if (process.env.PI_SUBAGENT_DEBUG === 'true') {
    pi.on('before_agent_start', (_event, ctx) => {
      const prompt = ctx.getSystemPrompt();
      const outputPath = path.join(ctx.cwd, 'debug-system-prompt.md');
      fs.writeFileSync(outputPath, prompt, 'utf-8');
    });
  }

  registerScopedSubagentTool();
}
