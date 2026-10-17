# 已注册处理器与诊断模板差集审计

V0.94 / T01.04 / N07 逐项枚举 `src/server.mjs` 当前注册的 62 个业务处理器入口，并用固定样例核对运行诊断分类。静态契约会在处理器注册集合改变而审计样例未同步时失败，避免后来新增接口静默落入未知分类。

本轮复现两项真实差集：原申请反向通知与授权核对 `/api/family-request-notifications/family|staff/:request[/authorization]` 未进入既有“申请通知追溯”；全店退款只读根入口 `/api/refunds` 未进入退款记录分类。两者现均使用固定标签，申请、查询、客户、通知、退款记录及来源值不进入日志；合法 handler 之外的额外片段仍为 `/api/unknown`。

本修复只改变开发运行面板的脱敏故障归类，不改变 handler 分派、服务器权限、原资金事实、退款状态机、不可变版本、业务写入或恢复格式。没有新增退款、财务、扣次、临床或正式监控规则；schema60 无表或迁移。

验证入口：`test/runtime-handler-coverage.test.mjs` 锁定全部当前注册处理器与非未知诊断样例；`test/runtime-routes.test.mjs` 检查固定标签、恶意查询脱敏及畸形扩展；`test/foundation.test.mjs` 经真实服务器触发两类失败并证明零业务写；`npm run test:operations-browser` 核对电脑和手机的明确名称、故障编号、无敏感值、无横向溢出与退出后迟到清空。

