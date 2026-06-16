# pi-subagents

Sub-agents extension for [pi](https://github.com/badlogic/pi-mono) coding agent.

Delegates tasks to isolated pi child processes — each running with its own model, system prompt, and tool set. Sub-agents inherit zero conversation context; all necessary context must be provided in the task description.

## Install

```bash
pi install npm:@johnnywu/pi-subagents
```

## Quick start

### 1. Define an agent

Create a `.pi/agents/code-reviewer.md` file in your project:

```markdown
---
name: code-reviewer
description: Reviews code changes for correctness and style
tools: read, grep, find, ls, bash
model: anthropic/claude-sonnet-4-6
thinking: low
---

You are a code reviewer. When given a diff or file list, read the relevant
files and provide a concise review covering:

- Logic errors and edge cases
- Style and consistency issues
- Performance concerns
- Test coverage gaps
```

### 2. Use it

The `subagent` tool is automatically registered. In a pi session:

```
Review the changes in src/auth.ts using the code-reviewer agent
```

Or instruct pi to delegate:

```
Run the code-reviewer agent on the last three commits
```

### Available subagents in the prompt

The extension exposes discovered sub-agents to the model when the active tool set includes `subagent`:

- The `subagent` tool keeps a one-line prompt guideline:
  `Available subagents: code-reviewer, refactor, test-writer`
- At agent-start time, the system prompt gets an independent block:

```text
Available subagents:
- code-reviewer
- refactor
- test-writer
```

The prompt file passed to the child process contains only the agent prompt plus skills. Runtime prompt assembly then depends on `systemPrompt` mode.

### What goes into the sub-agent system prompt

| Component | `append` | `replace` | `replace-all` |
|------|----------|-----------|---------------|
| pi default system prompt | ✅ kept | ❌ replaced | ❌ replaced |
| Project context files (AGENTS.md/CLAUDE.md, etc.) | ✅ included | ✅ included | ❌ skipped |
| Agent body (.md file body) | ✅ appended | ✅ becomes the prompt | ✅ becomes the prompt |
| Skills XML block | ✅ appended | ✅ appended | ✅ appended |
| Available tools / Guidelines block | from default prompt | re-injected by `before_agent_start` hook | re-injected by `before_agent_start` hook |
| Available subagents block | injected at agent start | injected at agent start | injected at agent start |

`append` keeps pi's full default prompt (with project context) and adds the agent body at the end.
`replace` swaps out pi's default prompt for the agent body while keeping pi context files.
`replace-all` is the fully isolated mode: it swaps out pi's default prompt and skips pi context files, then the runtime hook re-injects tool and guideline blocks to preserve tool visibility.

Breaking change: the old `replace` behavior is now `replace-all`. Existing agents that need to keep skipping AGENTS.md/CLAUDE.md should change `systemPrompt: replace` to `systemPrompt: replace-all`.

The `Available subagents` block is injected by the child process at agent-start time, after `PI_SUBAGENT_ALLOWED` and recursion depth filtering are applied.

### Debug a sub-agent prompt

Set `debug: true` in an agent's frontmatter to export that sub-agent's effective runtime system prompt on each run:

```markdown
---
name: scout
debug: true
---
```

The child process writes `debug-system-prompt.md` in the project cwd. The file contains the prompt visible during `before_agent_start`, including `systemPrompt` append/replace/replace-all behavior, tools/guidelines, skills, project context files in append and replace modes, and pi-subagents' runtime `Available subagents` block when applicable.

## Agent configuration

Agents are Markdown files with YAML frontmatter.

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `name` | **yes** | — | Unique agent identifier |
| `description` | no | — | Human-readable summary |
| `tools` | no | _none_ | Comma-separated tool whitelist (`read, write, bash, grep`, etc.) |
| `model` | no | parent's model | Provider/model-id (`anthropic/claude-sonnet-4-6`) |
| `thinking` | no | `off` | Reasoning level: `off`, `minimal`, `low`, `medium`, `high`, `xhigh` |
| `systemPrompt` | no | `append` | How the body is applied: `append` (append to pi default system prompt and project context), `replace` (replace pi default prompt while keeping project context), or `replace-all` (replace pi default prompt and skip project context) |
| `skills` | no | _none_ | Comma-separated skill names or simple wildcard patterns (`*`, `obsidian-*`) to load (resolved from project `.agents/skills/`, `.pi/skills/`, global `~/.pi/agent/skills/`, or npm packages) |
| `allowedAgents` | no | _all_ | Comma-separated list of sub-agents this agent may spawn |
| `maxDepth` | no | `10` | Maximum recursion depth (`0` = no sub-agents, `1` = one level, etc.) |
| `debug` | no | `false` | When `true`, export the effective runtime system prompt to `debug-system-prompt.md` |

The Markdown body after the frontmatter is the agent's system prompt.

`skills` entries match the skill frontmatter `name`. Use `skills: *` to load all available skills, or prefix-style patterns such as `skills: obsidian-*` to load matching skills. Only `*` is supported as a wildcard; glob features like `?` or `{a,b}` are not supported.

### Example with all fields

```markdown
---
name: orchestrator
description: High-level planner that delegates to specialists
tools: subagent, read, grep, find
model: anthropic/claude-sonnet-4-6
thinking: high
systemPrompt: append
skills: tdd, obsidian-*
allowedAgents: code-reviewer, refactor, test-writer
maxDepth: 2
debug: false
---

You are an orchestrator. Break complex tasks into sub-tasks and delegate
them to specialist agents. Combine their results and report a summary.
```

## Agent discovery

Agents are discovered from two locations (project overrides global):

| Scope | Path |
|-------|------|
| Global | `~/.pi/agent/agents/*.md` |
| Project | `.pi/agents/*.md` |

Only `.md` files are scanned. Files are parsed at extension load time; parse errors produce warnings but don't block other agents.

## Recursion control

Sub-agents can spawn their own sub-agents (if the `subagent` tool is in their whitelist). Two mechanisms prevent unbounded recursion:

**`maxDepth`** — Hard limit counting from the originating agent. `maxDepth: 0` means the agent cannot spawn sub-agents. `maxDepth: 1` allows one level, etc. Defaults to `10` when the agent has `subagent` in tools.

**`allowedAgents`** — Whitelist enforced by the parent before spawning. A child process never sees agent names outside its parent's whitelist.

The available-subagents prompt entries respect the same filtering: parent sessions use the currently visible agents, and child sessions only list agents allowed by their parent.

These are passed via environment variables (`PI_SUBAGENT_DEPTH`, `PI_SUBAGENT_MAX_DEPTH`, `PI_SUBAGENT_ALLOWED`). Child processes also receive `PI_SUBAGENT_NAME` and `PI_SUBAGENT_SYSTEM_PROMPT_MODE` so runtime hooks can distinguish append vs. replace behavior.

## Session storage

Sub-agent sessions are saved as `.jsonl` files for post-hoc debugging:

```
~/.pi/agent/sessions/--{safe-project-path}--/subagents/
  ├── 2026-05-31T03-47-16-502Z_019e7c24-a395-707a-a262-ec5b1664ffa7.jsonl
  └── ...
```

Each file contains one JSON object per line — session headers, messages, tool calls, and usage data. Parent pi sessions live in the same project directory (no `subagents/` subdirectory).

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Type-check
bun run typecheck

# Format
bun run format

# Release (requires GH_TOKEN and NPM_TOKEN)
bun run release
```

This project uses [semantic-release](https://semantic-release.gitbook.io) with [conventional commits](https://www.conventionalcommits.org/).

## License

MIT
