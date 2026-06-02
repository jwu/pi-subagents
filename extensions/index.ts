import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadAgentDefinitions } from './agent-loader.ts';
import { allowedAgentNames, isPastMaxDepth } from './env-utils.ts';
import { appendAvailableSubagentsBlock } from './subagent-prompt.ts';
import { registerSubagentTool } from './subagent-tool.ts';

export default async function (pi: ExtensionAPI) {
  const result = await loadAgentDefinitions({ cwd: process.cwd() });

  for (const warning of result.warnings) {
    console.warn(`[pi-subagents] skipped ${warning.filePath}: ${warning.message}`);
  }

  const allowed = allowedAgentNames(process.env);
  const agents = allowed
    ? result.agents.filter((candidate) => allowed.has(candidate.name))
    : result.agents;
  const agentNames = agents.map((agent) => agent.name);

  if (!isPastMaxDepth(process.env) && agentNames.length > 0) {
    pi.on('before_agent_start', (event) => {
      if (!event.systemPromptOptions.selectedTools?.includes('subagent')) return;
      return {
        systemPrompt: appendAvailableSubagentsBlock(event.systemPrompt, agentNames),
      };
    });
  }

  if (process.env.PI_SUBAGENT_DEBUG === 'true') {
    pi.on('before_agent_start', (_event, ctx) => {
      const prompt = ctx.getSystemPrompt();
      const outputPath = path.join(ctx.cwd, 'debug-system-prompt.md');
      fs.writeFileSync(outputPath, prompt, 'utf-8');
    });
  }

  registerSubagentTool(pi, { agents: result.agents });
}
