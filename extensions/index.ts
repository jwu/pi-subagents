import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { loadAgentDefinitions } from './agent-loader.ts';
import { registerSubagentTool } from './subagent-tool.ts';

export default async function (pi: ExtensionAPI) {
  const result = await loadAgentDefinitions({ cwd: process.cwd() });

  for (const warning of result.warnings) {
    console.warn(`[pi-subagents] skipped ${warning.filePath}: ${warning.message}`);
  }

  registerSubagentTool(pi, { agents: result.agents });
}
