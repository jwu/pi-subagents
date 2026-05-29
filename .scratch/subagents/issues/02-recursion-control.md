Status: ready-for-agent

## 父工单

[PRD：pi 编码代理的子代理扩展](../PRD.md)

## 要构建什么

实现子代理的递归控制机制，防止无限嵌套。

1. **`allowedAgents` 白名单**：当代理声明了 `allowedAgents` 且其 `tools` 包含 `subagent` 时，父进程通过 `PI_SUBAGENT_ALLOWED` 环境变量将白名单传递给子进程。子进程在加载代理定义后过滤注册表，只保留白名单内的代理。若未声明 `allowedAgents` 但有 `subagent` 工具，所有代理均可用。

2. **`maxDepth` 深度控制**：父进程启动子进程时，通过 `PI_SUBAGENT_DEPTH`（当前深度，首次为 1）和 `PI_SUBAGENT_MAX_DEPTH`（本代理允许的最大深度）环境变量传递递归限制。子进程中若 `PI_SUBAGENT_DEPTH > PI_SUBAGENT_MAX_DEPTH`，则 `subagent` 工具不可用（不注册或注册为报错）。深度在每次派发时自动递增。`maxDepth` 未声明时默认为 10。

环境变量传递链：
```
父进程派发 scout（depth=1, maxDepth=1）
  → scout 子进程: PI_SUBAGENT_DEPTH=1, PI_SUBAGENT_MAX_DEPTH=1
    → depth(1) <= maxDepth(1)，但 scout 的 tools 不含 subagent，无法派发 ✓

父进程派发 worker（depth=1, maxDepth=2，allowedAgents=scout,researcher）
  → worker 子进程: PI_SUBAGENT_DEPTH=1, PI_SUBAGENT_MAX_DEPTH=2, PI_SUBAGENT_ALLOWED=scout,researcher
    → worker 派发 scout（depth=2, maxDepth=1）
      → scout 子进程: PI_SUBAGENT_DEPTH=2, PI_SUBAGENT_MAX_DEPTH=1
        → depth(2) > maxDepth(1)，subagent 工具不可用，停止递归 ✓
```

## 验收条件

- [ ] 代理声明 `allowedAgents: scout, researcher` 后，只能派发这两个代理，不能派发其他代理
- [ ] 代理未声明 `allowedAgents` 但有 `subagent` 工具时，可以派发所有已注册代理
- [ ] 代理声明 `maxDepth: 1` 后，其子代理无法再派发子子代理
- [ ] 代理声明 `maxDepth: 0` 后，`subagent` 工具不可用
- [ ] `maxDepth` 未声明时默认为 10
- [ ] 在允许范围内的递归调用正常工作（如 depth=2, maxDepth=3 时仍可派发）

## 覆盖的用户故事

- #7：allowedAgents 控制可派发代理
- #8：maxDepth 控制递归深度

## 阻塞

- [01-核心端到端流程](01-core-end-to-end.md) — 需要核心 subagent 工具和代理定义解析就绪后才能构建递归控制
