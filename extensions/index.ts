import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { loadAgentDefinitions } from './agent-loader.ts';
import { allowedAgentNames, isPastMaxDepth } from './env-utils.ts';
import { registerDebugSubagentPromptCommand } from './debug-subagent-prompt-command.ts';
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
    pi.on('before_agent_start', (event) => ({
      systemPrompt: appendAvailableSubagentsBlock(event.systemPrompt, agentNames),
    }));
  }

  registerSubagentTool(pi, { agents: result.agents });
  registerDebugSubagentPromptCommand(pi, { agents: result.agents });
}
