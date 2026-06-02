# pi-subagents

一个 pi 扩展，提供子代理能力——主代理可以将任务委派给在隔离上下文中运行的子 pi 进程。

## 术语表

**子代理（Sub-agent）**：
由主代理启动的隔离子 pi 进程，用于完成委派任务。不继承任何对话上下文——所有必要上下文必须在任务描述中提供。
_避免使用_：Child process、worker process（"worker" 是特定的代理名称，而非子代理的同义词）

**代理（Agent）**：
一个命名配置，定义子代理的行为：拥有哪些工具、使用哪个模型以及其系统提示词。代理以含 YAML frontmatter 的 `.md` 文件形式定义，存放在 `agents/` 目录中。
_避免使用_：Agent config、agent profile

**任务（Task）**：
从父代理传递给子代理的自然语言指令，包含完成任务所需的所有上下文。子代理启动时没有任何其他上下文。
_避免使用_：Prompt、job、command

**允许的代理（`allowedAgents`）**：
可选的 frontmatter 字段，限制某个代理可以派发哪些子代理。由父进程在子进程启动前强制执行——子进程永远不会看到其父代理允许列表之外的代理名称。
_避免使用_：subagent_agents、agent allowlist、spawn restriction

**工具（`tools`）**：
代理可用的工具名称严格白名单。frontmatter 中使用逗号分隔的字符串。pi 内置工具（read、write、edit、bash、grep、find、ls）及扩展发现的工具均自动解析——无需手动维护路径映射。
_避免使用_：tool list、tool set、tool configuration

**系统提示词模式（`systemPrompt`）**：
控制代理的 Markdown 正文如何应用于子 pi 进程。`replace`（默认）通过 `--system-prompt` 传入正文，替换默认系统提示词。`append` 通过 `--append-system-prompt` 传入，追加到默认提示词之后。取值为 `replace` 或 `append`。
_避免使用_：system prompt strategy、prompt injection mode

**可用子代理提示（Available subagents prompt）**：
向模型暴露当前可派发的代理名称。工具提示中保留一行 `Available subagents: scout, worker`；系统提示词中使用独立块 `Available subagents:\n- scout\n- worker`。该列表受递归深度和 `allowedAgents`/`PI_SUBAGENT_ALLOWED` 过滤约束，子进程不会看到父代理允许列表之外的代理名称。
_避免使用_：agent list prompt、subagent guideline only

**模型（`model`）**：
LLM 服务商和模型 ID，格式为 `provider/model-id`（例如 `anthropic/claude-sonnet-4-6`）。可选；默认使用父代理会话的活动模型。
_避免使用_：llm、model config

**推理等级（`thinking`）**：
代理的推理/思考等级：`off`、`low`、`medium`、`high`。默认为 `off`。控制传递给子 pi 进程的 `--thinking` 标志。
_避免使用_：reasoning level、think mode

**代理目录（`agents/`）**：
存放代理 `.md` 定义文件的目录。全局：`~/.pi/agent/agents/`。按项目：`.pi/agents/`。通过扫描这些目录发现代理；不捆绑内置代理。
_避免使用_：agent folder、agent config directory

**最大深度（`maxDepth`）**：
从本代理向下允许的最大递归深度。从本代理自身层级开始计数：`maxDepth: 0` 表示不允许派发子代理，`maxDepth: 1` 允许派发一层子代理，以此类推。若代理拥有 `subagent` 工具但未声明显式值，默认为 10。通过传递给子进程的 `PI_SUBAGENT_DEPTH` 和 `PI_SUBAGENT_MAX_DEPTH` 环境变量强制执行。
_避免使用_：recursion limit、depth limit、nesting limit

**子代理会话（Session for sub-agents）**：
子代理会话存储在 `~/.pi/agent/sessions/{project}/subagents/` 下，使用 pi 的正常会话管理（不使用 `--no-session`）。这使得事后可以调试子代理的运行记录。
_避免使用_：ephemeral session、sub-agent session directory
