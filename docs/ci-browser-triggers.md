# PR 与 push 浏览器回归触发 · V0.92

`Foundation checks` 同时接收 `push` 与 `pull_request`。V0.91 前，两组浏览器任务都只读取 `github.event.head_commit.message`；该对象只在 push 事件存在，所以草稿 PR #1 的实际运行会把浏览器任务标为 skipped，即使分支包含需要浏览器验证的变更。

V0.92 采用明确事件策略：

- 所有 pull request 都运行 `browser-v079` 和 `browser-operations`，保证 PR 合并前有真实电脑/手机回归结果；
- push 继续按提交信息中的 `[browser-v079]` 或 `[browser-operations]` 标记按需运行，避免每次文档回执提交重复安装浏览器；
- `verify` 在 push 和 pull request 中仍始终执行 `npm ci`、语法检查和全量测试。

`test/workflow-triggers.test.mjs` 固定这三个契约，防止后续又退化为只依赖 push 字段。真实验证必须读取同一精确提交的 push/PR Actions：PR 两个浏览器任务都应为 success，push 在没有标记时应为 skipped；不能只凭静态测试声称触发修复完成。

本切片只修改 CI 事件策略，不改变运行系统、权限、业务写入、不可变版本、数据库或恢复格式，也不构成正式部署或业务验收。
