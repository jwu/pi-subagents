import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { applyAgentProfile, type AgentProfile } from '@johnnywu/pi-agent-profiles';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadAgentDefinitions } from './agent-loader.ts';
import { registerSubagentTool } from './subagent-tool.ts';

export default async function (pi: ExtensionAPI) {
  const result = await loadAgentDefinitions({ cwd: process.cwd() });

  for (const warning of result.warnings) {
    console.warn(`[pi-subagents] skipped ${warning.filePath}: ${warning.message}`);
  }

  const registerScopedSubagentTool = (allowedAgents?: readonly string[]) => {
    registerSubagentTool(pi, { agents: result.agents, allowedAgents });
  };

  const profilePath = process.env.PI_SUBAGENT_PROFILE;
  if (profilePath) {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as AgentProfile;
    pi.on('before_agent_start', (event) => {
      applyAgentProfile(profile, event.systemPromptOptions);
    });
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
