# API v0.5

同源 /api；JSON。统一错误 `{ "error": { "code": "FORBIDDEN", "message": "…" } }`。401 未登录、403 越动作/CSRF、404 不存在或不在授权范围、409 幂等内容冲突、422 字段校验、429 登录限速。健康检查无需登录，其余接口需会话（登录除外）。

| 方法 / 路径 | 输入 | 输出 / 权限 |
| --- | --- | --- |
| GET /health | 无 | status、mode、schema；查询真实数据库 |
| POST /auth/login | username、password | 设置会话 cookie；账号有效、密码匹配，单来源每分钟最多 10 次 |
| GET /me | cookie | id、name、role、store、permissions、csrf、must_change_password，不返回密码 |
| POST /auth/logout | CSRF | 撤销该会话并清 cookie，追加审计 |
| GET /customers?q= | 联合搜索字符串(100) | items、limit=100；门店/有效家庭筛选；家长只按姓名搜索 |
| POST /customers | name、birth_date?、contact_name?、phone? | customer、duplicate_candidates(最多20)；负责人/前台；门店由会话决定 |
| GET /customers/:id | 独立客户编号 | customer、cycles、visits、guardians；家长只看授权基本信息，后三者空数组 |
| POST /customers/:id/cycles | type、goal | cycle；负责人/前台/专业人员；只创建草稿，不确认计划、不扣次 |
| GET /organization | 无 | 本店人员与已关联本店的家长账号，负责人；包含登录账号、revision、待改密状态、有效会话数与manageable标志；不返回密码/会话凭据 |
| POST /customers/:id/guardians | user_id、relationship、active(boolean)、reason | 基础授权/撤销，负责人；校验客户与已有家长账号均在本店范围 |
| POST /customers/:id/visits | purpose、cycle_ids(string[]，最多20，可空) | 登记到店，负责人/前台；周期只能属于同一客户 |
| POST /visits/:id/close | reason | 结束当前到店，负责人/前台；不改变周期状态 |
| GET /demo/scenarios | 无 | 本店已存在且名称匹配的虚构场景，员工；snapshot_only=true，家长拒绝 |
| GET /audit | 无 | 最近100条当前门店 id/actor_id/action/entity_id/created_at；负责人 |

全部已登录写入使用 X-CSRF-Token；客户、周期、家长关联、到店登记与结束另需 Idempotency-Key（8–100 位字母数字下划线/连字符）。同一身份+动作+键的规范字段值相同，返回原响应；不同则409。浏览器在失败重试时保留键，成功后换键。写入+审计+防重复结果在同一事务。

出生日期有效且不晚于当天；未填写为 null；电话可重复。重复提示仅提示核对，不自动合并。暂未提供档案更新/删除、跨店、导出、专业检查、收款或服务周期状态推进接口。

家长关联需要已有本店家长身份（账号归属本店，或有本店客户的历史关联）。新增授权要求账号有效；已停用账号仍可撤销关系。变更保留前后值及操作依据，不将开发版记录视为正式监护证明核验。撤销后立即停止后续访问。

到店 registered → closed 必须有结束说明；重复同键返回原响应，另一个键再次关闭返回409。数据库复合外键阻止跨客户周期关联。到店登记可以不关联周期，以支持先接待后定服务类型。

## 资料版本与附件

| 方法 / 路径 | 输入 | 输出 / 权限 |
| --- | --- | --- |
| GET /customers/:id/attachments | 无 | 前100条本客户附件元信息；员工，家长拒绝 |
| POST /customers/:id/attachments | 二进制请求体、Content-Type、X-File-Name(encodeURIComponent编码)、CSRF、防重复键 | attachment；员工；1 MB限额，类型/文件头/UTF-8校验 |
| GET /attachments/:id/download | 会话 | 实际字节，强制attachment、sandbox、no-store；员工门店授权；撤销返回410，每次下载追加审计 |
| POST /attachments/:id/revoke | reason | 撤销访问；上传员工本人或本店负责人；原字节保留 |
| GET /customers/:id/documents | 无 | 前100份资料最新版本，含当时附件引用；员工 |
| POST /customers/:id/documents | title、content、source、attachment_ids? | 新记录V1；员工，手工资料，不产生专业确认 |
| GET /documents/:id | 无 | record及最近100个历史版本；员工客户范围 |
| POST /documents/:id/versions | 上述资料字段、expected_version、revision_reason | 新版本；旧版不可覆盖；版本冲突409 |

source枚举employee / external / guardian_report，对应员工记录 / 外部资料转录 / 家长自报转录；内容最多6000字符，JSON请求最多64 KB。附件关联最多20个，必须是同一客户且当前未撤销的附件。旧版内容/来源/修订依据/附件引用不改写；撤销附件访问只影响当前下载许可。

所有新增和撤销使用幂等键；文件字节、元信息、版本、引用、幂等结果和审计同库事务。默认文件读取权限不给家长，正式报告发布与专业确认尚未实现。本地类型校验不是生产文件扫描或完整PDF/图片解析。

## V0.4 人员与账号安全

| 方法 / 路径 | 输入 | 输出 / 权限 |
| --- | --- | --- |
| POST /organization/staff | username、display_name、role、initial_password、reason | staff；本店负责人；岗位manager/reception/professional，门店由会话决定，初始版本1、必须改密 |
| POST /organization/staff/:id | display_name、role、active(boolean)、expected_revision、reason | staff、revoked_sessions；本店负责人；撤销目标全部登录，revision递增 |
| POST /organization/staff/:id/reset-password | initial_password、expected_revision、reason | staff、revoked_sessions；负责人；撤销全部登录并标记必须改密 |
| POST /organization/staff/:id/revoke-sessions | expected_revision、reason | staff、revoked_sessions；负责人；撤销全部登录，不改岗位/密码，revision递增 |
| POST /auth/password | current_password、new_password | ok、revoked_sessions；本人；验证旧密码，撤销其他会话并解除待改密状态 |

全部需要CSRF和Idempotency-Key。账号3–80位字母、数字、点、下划线或短横线；新/初始/重置密码12–128字符，首尾无空格。本人改密必须与当前密码不同，错误旧密码422。密码仅存scrypt哈希；审计记录安全元信息，幂等请求只存指纹与不含秘密的响应。

人员管理仅允许本店员工；其他门店及家长目标404，前台/专业人员/家长403。不可通过编辑更改登录账号或门店，也不可管理本人角色/状态或重置本人密码，返回409 SELF_MANAGEMENT；本人从账号安全修改密码。有效负责人保留约束防止移除最后一位负责人。expected_revision缺失/非法422，陈旧409 STALE_ACCOUNT；同键重试返回原结果。

需要改密的账号登录后可读取/me、退出或改密，其余API403 PASSWORD_CHANGE_REQUIRED。启用已停用账号不会复活旧会话。每个业务变更事务在保存前重新核对有效会话、当前岗位和门店；请求读取正文期间已被撤销，也不能继续写入。权限变更、账号状态、密码、会话撤销、版本、审计和幂等结果同事务。

## V0.5 运行诊断

GET /operations：负责人限定当前门店，返回database=ok（执行真实查询）、mode、schema、started_at、uptime_seconds、requests、client_errors（4xx，不含中断）、server_errors（5xx）、aborted（499）、window_size/window_limit=200、p95_ms、errors（该窗口最近20条）。仅统计当前门店的已登录请求，未登录/其他门店拒绝记录不分发；需要改密的账号仍被原门禁拒绝。

响应均带X-Request-Id，错误JSON在原error旁增加request_id。编号由服务端生成，忽略调用方同名头；幂等业务响应不加入动态编号，重试仍返回原结果。故障对象包含request_id、created_at、method、route模板、status、code、duration_ms，无请求体/查询/凭据/客户编号。500统一INTERNAL，不返回内部异常信息。中断只记一次499。

统计为本次服务启动后的内存观察值，P95基于本店最近200个已结束请求；成功/失败均计入，读取运行状态请求在结束后计数。原恢复工具通过本地CLI操作，不提供网页备份/恢复接口。工具步骤与边界见recovery.md。
