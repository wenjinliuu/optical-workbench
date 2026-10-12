# 视光工作台持续开发与续接

用户2026-10-12已授权按既定流程持续逐步开发，无需每一步等待通知；代码推送与网页/仓库进度同步是每个完成切片的必要部分。只沿 wenjinliuu/optical-workbench 的 codex/phase-one-foundation 推进，同一草稿 PR #1，不合并 main、不上线正式业务系统。

每轮先读取最新远程 AGENTS.md、docs/progress.json、docs/handover.md 末尾、docs/capability-map.md 和 docs/remaining-work.md；核对既有 CI 与 docs/progress-sync.json。未完成的发布/CI/回执优先续接，不凭旧聊天或文档标题推断当前完成。若另一个运行正在推进相同分支或 CI 尚未结束，先核对其状态，不能重复创建同一步。

使用 Node 24 和项目现有本地架构，只用虚构资料。选择原计划中下一项可独立完成的切片；保留原50任务/287需求、共享客户/周期/到店身份、不可变版本、服务器权限和恢复校验。真实扣次、退款/财务口径、专业实表/资质、监护/项目核验和正式部署没有依据时记录阻塞，继续可独立的工作；不得发明规则或把部分实现标为整体验收。

每步完成必要语法/专项/电脑手机及全量检查；共享数据/权限变更必须 npm run check 和 npm test，可采用最终精确提交的 GitHub Actions 实际全量结果，读取原日志，不把中止/失败/pending标通过。保留原断言，避免写死开发迭代数。每轮保存具体提交/验证/边界/下一入口。

推送原业务分支后更新唯一 docs/progress.json 交付勾选、相关任务/需求说明、验证、capability-map、handover 和剩余范围；执行 scripts/sync-design-progress.mjs --site-root <既有设计Site检出目录>，使用原Site生成器生成快照/三份下载，验证原18模块/7流程/50任务/287要求仍完整。Site固定 appgprj_6ac5e84d0d68819182f1afe0cc54c6ba、https://optical-workbench-blueprint.wenjinuu.chatgpt.site，保留现有访问范围，不建替代站点。用 Sites 已推送源码/静态产物发布；发布 succeeded 后运行 npm run progress:verify -- --receipt docs/progress-sync.json，并核对线上电脑手机。将实际版本/提交/部署ID和核验回执推回原业务分支，才把一步视为双处完成和进入下一步。

源代码写入可使用已连接 GitHub 的 Git blob/tree/commit 和 expected_sha 条件分支更新；无需把凭据写入文件或提示。检出可读取公开仓库；写权限/执行环境不可用时如实记录具体缺失，不声称推送/发布已完成。保持 Git 更新为非强制、以最新分支父提交建立，发现远程变化先读取并保留它。Sites 源凭据只在内存/隐藏stdin中使用，保持既有 project_id。

每次主动续接至少完成一个可验证切片，或补完先前缺失的同步；不能为文档维护增加假业务交付。仅在真正完成里程碑或发现实际阻塞时简要通知用户。若全部剩余工作必须等待真实规则/业务验收，记录决定人/依据/恢复入口，暂停继续开发的自动任务并报告阻塞；不得无限重复空更新。
