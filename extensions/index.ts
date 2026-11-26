import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import {
  applyAgentProfile,
  delegationScopeEvent,
  parseDelegationScope,
  type AgentProfile,
  type DelegationScope,
} from '@johnnywu/pi-agent-profiles';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadAgentDefinitions } from './agent-loader.ts';
import { registerSubagentTool } from './subagent-tool.ts';

export default async function (pi: ExtensionAPI) {
  const result = await loadAgentDefinitions({ cwd: process.cwd() });

  // 工厂函数运行在 TUI 启动之前，直接写终端会被全屏界面覆盖，所以等到 session_start 再提示。
  const warnings = result.warnings.map(
    (warning) => `[pi-subagents] skipped ${warning.filePath}: ${warning.message}`,
  );
  pi.on('session_start', (_event, ctx) => {
    for (const message of warnings.splice(0)) {
      if (ctx.hasUI) ctx.ui.notify(message, 'warning');
      else console.warn(message);
    }
  });

  const registerScopedSubagentTool = (scope: DelegationScope = {}) => {
    registerSubagentTool(pi, { agents: result.agents, ...scope });
  };

  const profilePath = process.env.PI_SUBAGENT_PROFILE;
  if (profilePath) {
    const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8')) as AgentProfile;
    pi.on('before_agent_start', (event) => {
      applyAgentProfile(profile, event.systemPromptOptions);
    });
  }

  // `pi --agent`（pi-config 的 custom-agent）用这个事件声明当前会话代理的委派范围。
  pi.events.on(delegationScopeEvent, (configuration: unknown) => {
    registerScopedSubagentTool(parseDelegationScope(configuration));
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
