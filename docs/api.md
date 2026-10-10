# API v0.28

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
| GET /demo/scenarios | 无 | 本店已存在、初版可核对的虚构场景；合法修订后使用当前姓名，员工；snapshot_only=true，家长拒绝 |
| GET /audit | 无 | 最近100条当前门店 id/actor_id/action/entity_id/created_at；负责人 |

全部已登录写入使用 X-CSRF-Token；客户、周期、家长关联、到店登记与结束另需 Idempotency-Key（8–100 位字母数字下划线/连字符）。同一身份+动作+键的规范字段值相同，返回原响应；不同则409。浏览器在失败重试时保留键，成功后换键。写入+审计+防重复结果在同一事务。

出生日期有效且不晚于当天；未填写为 null；电话可重复。重复提示仅提示核对，不自动合并。档案删除、跨店、导出、正式专业检查和服务周期状态推进未提供；独立收款/退款、配镜参数和训练计划/课程接口见后续当前契约。

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

## V0.6 客户资料与家庭联系人

| 方法 / 路径 | 输入 | 输出 / 权限 |
| --- | --- | --- |
| GET /customers/:id/profile-history | 无 | 最近100个不可变档案版本，含来源、依据、时间与操作人；本店员工，家长拒绝 |
| POST /customers/:id/profile | name、birth_date、contact_name、phone、source、revision_reason、expected_version | customer(员工含revision)、duplicate_candidates；负责人/前台；四个基本字段必须齐全，未知可null |
| GET /customers/:id/contacts | 无 | 最近100位联系人，包含已停用，items/limit；本店员工，家长拒绝 |
| POST /customers/:id/contacts | name、relationship、phone?、source、note?、reason | contact、duplicate_candidates；负责人/前台，初始revision=1、active=1 |
| POST /contacts/:id | name、relationship、phone、source、note、active(boolean)、reason、expected_revision | contact、duplicate_candidates；负责人/前台；编辑、停用和恢复都保留审计前后值 |

写入需要CSRF和Idempotency-Key；资料修改、不可变版本、审计及重放结果同事务。陈旧版本409 PROFILE_CONFLICT，无变化409 NO_CHANGES，缺失/无效字段422。资料来源必须明确选employee/external/guardian_report；依据300字符，姓名80、关系40、电话32、备注300。禁止修改客户编号、门店、创建者及联系人所属客户。

主要联系人与家庭联系人分别维护，不自动同步；登记或停用联系人不产生/撤销家长查看授权。电话可重复，只返回候选核对。员工检索增加有效家庭联系人姓名/电话匹配，家长仍只按授权客户姓名搜索。联系人当前资料可修订，历史前后值保存在不可变审计中；客户基本资料另有不可变快照和历史页面。

迁移005将存量当前档案保存为V1，source=legacy、created_by=null、时间为升级时间，明确此前修改未追溯；迁移后新建客户自动保存source=initial的V1。不是监护身份核验、跨店转移或客户合并接口。

## V0.7 客户总览与历史时间轴

GET /customers/:id/overview：本店员工，家长403、跨店404。返回customer_id、profile_version、cycle_drafts、visits_registered/visits_closed、contacts_active、documents、attachments_active及last_visit(id/purpose/created_at/status或null)。数量按完整客户范围计算，不受现有列表100条上限影响；最近到店按登记时间，不将结束到店视为结束周期。

GET /customers/:id/timeline?kind=all&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=20&cursor=...：同范围/动作限制，只读。kind为all或profile/cycle/visit/contact/document/attachment/authorization；日期为UTC、首尾日期均包含，可省略；limit为1–50。响应items、next_cursor(null代表末页)、limit、timezone=UTC、order=newest_first。每项event_id、at、kind、entity_id、actor_id/name、details；details仅包含该类记录允许的摘要字段，不返回任意审计JSON或账号/密码/登录事件。

倒序按时间及稳定事件编号排序；同刻独立事件只保证稳定顺序，不表示完整因果排序。分页标识绑定客户、类别和日期，使用上一页末项位置；后来新增的更新记录不插入已加载分页，刷新后再显示。无效/不同筛选标识422 INVALID_CURSOR，错误类别/日期/区间/数量422；写入405。

档案/资料读取不可变版本，联系人读取建立/修改的审计快照；早期联系人无建立快照时仅展示“初版未留存”，不套用当前姓名。到店结束无审计时操作人为null、依据明确未登记；初始监护关联没有时间依据时不补造授权事件。只筛选本店本客户且动作明确的联系人/查看授权审计，不提供全量审计阅读权限。所有读取仍受有效会话及强制改密门禁限制。

## V0.8 周期需求版本与到店引用

GET /cycles/:id：本店员工，返回cycle（包含version/source）和最近100份versions（来源/需求/依据/时间/操作人）；家长403、其他门店404。POST /cycles/:id/versions：本店负责人/前台/专业人员，goal(300)、source(employee/external/guardian_report)、revision_reason(300)、expected_version正整数；需要CSRF和Idempotency-Key。成功201，版本陈旧409 CYCLE_CONFLICT，无变更409 NO_CHANGES；禁止更改身份、客户、类型、状态和创建元信息。原周期编号/关联保持，当前goal与新版本、审计及重试结果同事务。

客户详情cycles增加version/source；visits增加cycle_refs（cycle_id/version/basis/type/goal/source）。新登记引用cycle_versions的固定版本；以后需求修订不改变旧引用。POST /customers/:id/visits可另传cycle_versions:[{cycle_id,version}]，必须与cycle_ids完整对应，服务端在保存事务内检查最新版本，陈旧409；未传则记录保存时最新版本。浏览器始终传所见版本。关联、快照、审计及幂等结果同事务，重试返回初次固定引用。

basis=captured代表已经保存的引用；legacy_unknown代表迁移前没有保存需求版本，version/goal/source为null（类型为周期原类型）。不把升级时当前需求补成旧到店实际需求。周期仍为draft，需求修订不是专业计划确认或业务状态推进；结束到店不修改周期。

时间轴cycle条目按需求版本呈现；存量周期另外保留原创建时间的早期条目，初始需求明确未留存。到店登记条目的cycle_refs也使用固定版本。修改后原客户总览数量、资料/附件和查看授权保持各自状态。

## V0.9 通用任务分派、接收与交接

| 方法 / 路径 | 输入 | 输出 / 权限 |
| --- | --- | --- |
| GET /tasks/assignees | 无 | 本店有效、已完成初始改密的员工id/display_name/role；员工，家长拒绝 |
| GET /tasks?scope=mine&assignment=all | scope=mine/store，assignment=all/awaiting/accepted | 当前店最近100条匹配任务，items/limit/truncated；员工 |
| GET /customers/:id/tasks | 客户编号 | 最近100条客户任务，items/limit/truncated；员工客户范围 |
| POST /customers/:id/tasks | title(120)、instructions(1000)、assignee_id、reason(300)，cycle_id/cycle_version/visit_id可选 | task，负责人/前台；初版revision=1、awaiting、execution_status=pending |
| GET /tasks/:id | 任务编号 | task及最近100次不可变events，limit=100；员工本店 |
| POST /tasks/:id/accept | expected_revision、reason | task；仅当前接收人，awaiting→accepted，执行仍pending |
| POST /tasks/:id/transfer | expected_revision、assignee_id、reason | task；当前接收人或负责人，改接收人且回到awaiting |

所有写入需要CSRF及幂等键，任务/交接事件/审计/重试结果同事务。陈旧修订号409 TASK_CONFLICT；非本人接收403 NOT_ASSIGNEE；非本人/负责人转交403 NOT_OWNER。同键重试返回原响应，不重复交接；没有操作依据422。人员停用/重置密码后任务保留，接收人不可用，负责人可以显式转给另一有效员工；不自动选代理。

任务上下文创建后不可覆盖：客户与门店由原档案确定，关联到店/周期必须属于同一客户。仅关联周期时必须提交当前需求版本，陈旧409 CONTEXT_CONFLICT。关联到店和周期时必须使用到店已有的固定引用，允许历史V1，即使当前周期已V3；版本不一致409。legacy_unknown或未关联周期422 UNKNOWN_CONTEXT，不能补造当时需求；可另建仅客户/到店任务或独立当前周期任务。关联已关闭到店可用于后续资料交接，任务不改变到店/周期状态。

assignment_status与execution_status分别存储；V0.9时执行仅pending（V0.10扩展见下），当时不提供开始/暂停/退回/完成接口、专业完成条件或自动下游任务。所有员工可以读取本店通用协作队列，不授予专业确认职责。姓名为当前账号/客户显示名，需求内容为固定版本；截止日、优先级、岗位候选队列、工作日历和通知仍待后续实现。客户时间轴新增task类别，总览API新增tasks_awaiting/tasks_accepted完整数量。

## V0.10 岗位认领和任务执行

POST /customers/:id/tasks和POST /tasks/:id/transfer扩展candidate_role（manager/reception/professional），与assignee_id必须恰选一个。分给岗位时assignee_id=null、assignment_status=queued；不自动指定员工，暂无有效员工时保留队列并返回candidate_count=0。原员工分派请求保持兼容，V0.9既有幂等响应升级后仍返回原结果。

| 方法 / 路径 | 输入 | 输出 / 条件 |
| --- | --- | --- |
| POST /tasks/:id/claim | expected_revision、reason | 本店同候选岗位员工本人认领；queued→awaiting，尚未接收；两人同时认领仅一人成功 |
| POST /tasks/:id/start | expected_revision、reason | 当前本人且accepted，pending→running |
| POST /tasks/:id/pause | expected_revision、reason | 当前本人且accepted，running→paused |
| POST /tasks/:id/resume | expected_revision、reason | 当前本人且accepted，paused→running |
| POST /tasks/:id/return | expected_revision、reason、candidate_role | 当前本人明确退回岗位；负责人清空，queued；运行中先变paused，已暂停保留paused，未开始保留pending |

原accept仍是awaiting→accepted，不改变执行状态。transfer可给另一有效员工或岗位；执行中转交会paused，已暂停保持，接收/认领/接收均不自动恢复。恢复要求新负责人主动提交resume。门店负责人可以转交任意本店任务，但不能代替员工接收/开始/暂停/恢复/退回；岗位不匹配认领403 NOT_CANDIDATE，已认领409 ALREADY_CLAIMED；所认领岗位后来变化409 ROLE_CHANGED，需要负责人重新交接。错误状态409 NOT_ACCEPTED/INVALID_TASK_STATE，陈旧修订409 TASK_CONFLICT。所有操作明确reason、CSRF与幂等键，任务状态/事件/审计/防重复同事务。

GET /tasks的scope增加role（本人岗位尚未认领任务），assignment增加queued，execution=all/pending/running/paused，role=all/manager/reception/professional。所有筛选仍限定本店；默认个人队列、显示最近100条，counts.total/queued/running/paused统计完整匹配范围，不受列表上限影响。role筛选使用当前任务candidate_role，直接指定员工且没有岗位队列时为null。客户总览API增加tasks_queued/tasks_running/tasks_paused；时间轴和历史包括全部执行与退回事件，接收人与候选岗位可为空/有值，旧版本明确保留null岗位，不补造旧角色。

任务关联客户/周期/到店/需求版本及原说明保持不可变。认领/开始/暂停/恢复时间取对应不可变事件的UTC时间，没有开始事件就不推测开始时间。候选使用当前本地岗位，不代表专业资质授权；本轮不提供complete、专业确认、自动下游任务、资金/权益变化、截止日/工作日历/提醒或自动代理。

## V0.11 通用任务异常

| 方法 / 路径 | 输入 | 权限 / 状态结果 |
| --- | --- | --- |
| POST /tasks/:id/block | expected_revision、reason（最多300字，必填） | 当前有效负责人或本店manager；active→blocked，running先paused |
| POST /tasks/:id/unblock | 同上 | 当前有效负责人或本店manager；blocked→active，保留pending/paused，需要明确再执行 |
| POST /tasks/:id/cancel | 同上 | 当前有效负责人或本店manager；保存取消前状态/原因，再变cancelled，running先paused |
| POST /tasks/:id/restore | 同上 | 当前有效负责人或本店manager；cancelled→原active/blocked及原原因，永不自动running |

queued无人负责由manager处理异常；manager不代替员工接收/执行。阻塞期间claim/accept/transfer/return仍按原权限执行并保留阻塞；start/pause/resume拒绝409 TASK_BLOCKED。取消期间原七种交接/执行动作拒绝409 TASK_CANCELLED；异常动作状态不符409 INVALID_TASK_STATE。非当前负责人/manager 403 NOT_OWNER，陈旧409 TASK_CONFLICT，原会话/门店、CSRF、幂等及事务保护仍适用；不修改客户、需求、到店、专业资料或资金权益状态。

读取task及events增加lifecycle_status(active/blocked/cancelled)、exception_reason、restore_status(active/blocked/null)、restore_reason。取消前已有阻塞时保存原原因，恢复后依然blocked，必须另行unblock且给出解决依据。每次事件同时保存独立异常快照及reason操作依据，旧历史默认active，不推测早期异常。

GET /tasks增加lifecycle=all（默认）/active/blocked/cancelled；返回counts.blocked/cancelled及lanes对象。lanes使用异常优先（blocked/cancelled），否则queued/awaiting，已接收才按pending/running/paused分列；每个匹配任务恰一列，完整列计数不受100条列表截断影响。counts其余字段仍按各维度统计，可能与异常重叠；counts和lanes均限定当前同一组合筛选。客户总览增加tasks_blocked/tasks_cancelled，时间轴task.details新增全部异常字段。

浏览器列表/看板/状态流程使用同一items和lanes，切换不另取数据；刷新/操作成功再读取。状态流程表达当前责任、接收、执行和异常，不代表跨任务依赖或专业完成。本轮仍无complete接口，完成依据与条件校验方案见task-completion.md（草案）。

## V0.12 通用核对条件与依据

| 方法 / 路径 | 输入 | 输出 / 权限 |
| --- | --- | --- |
| GET /tasks/:id/completion | 无 | task、condition/draft（无记录为null）、conditions/evidence最近100版本及截断标记、validation；本店员工 |
| GET /tasks/:id/completion/references | 无 | 本任务客户资料版本/附件，documents/attachments最多200条及截断标记；本店员工 |
| POST /tasks/:id/completion/conditions | expected_task_revision、expected_condition_version（初次0）、description<=300、require_document/require_attachment布尔、reason<=300 | condition新版本，201；负责人/前台，任务未取消 |
| POST /tasks/:id/completion/evidence | expected_task_revision、expected_evidence_version（初次0）、condition_version、notes<=3000可空、source、document_version_ids/attachment_ids数组每类<=10、reason<=300必填 | draft新版本及validation，201；当前本人且岗位可用/已接收/未取消 |
| POST /tasks/:id/completion/check | 上行相同，去掉reason | validation及persisted=false，200；员工只读检查，CSRF必需，不写幂等/审计或版本 |

条件固定通用scope=generic_record_review；说明必填，资料/附件是否必需由负责人/前台显式设置，不推测专业条件。条件/草稿版本均独立于任务revision，保存不改变执行；当当前任务/条件/草稿版本不符分别409 TASK_CONFLICT/CONDITION_CONFLICT/EVIDENCE_CONFLICT。首次存草稿没有条件409 CONDITIONS_REQUIRED。非当前本人403 NOT_ASSIGNEE，未接收409 NOT_ACCEPTED，岗位不符409 ROLE_CHANGED，取消409 TASK_CANCELLED。条件及草稿写入同库事务、幂等与审计；旧版本不可覆盖。

source=employee/external/guardian_report代表内部录入来源，不是专业确认。草稿notes可空、必需资料可缺，允许pending/paused/blocked时补充；所选引用必须存在且属于当前任务客户，重复/超限/不存在/跨客户422。撤销附件不能再保存422 ATTACHMENT_UNAVAILABLE，但历史保留关联，并返回当前revoked_at。document_version_id使用资料版本id而非记录id；旧V1可以明确引用，后来V2不替换旧引用。读取draft/history返回原版本标题/来源、record_id/version，附件filename及当前撤销标记。

validation包含record_ready、completion_enabled=false、checks(code/label/passed)。检查当前查看人是否本人/岗位匹配、本人接收、running、active、条件已设/当前条件版本、依据所见任务修订、说明、必需资料/附件及访问是否撤销。POST check核对未保存输入，版本冲突拒绝，不会保存草稿；等待body时重新检查有效会话。通用项目齐备不代表专业条件已授权，也不完成或生成任务。界面重读保留填写和选择，已选引用即使超过200条新选择范围仍可查看。

task时间轴新增conditions/evidence动作，含条件/依据版本、task_revision、原因/说明、固定引用id清单；责任/执行取当时不可变task_events快照。完整方案见task-completion.md。本轮仍没有complete接口。

## V0.13 明确提交与通用完成

POST /tasks/:id/completion/submit：expected_task_revision、condition_version、evidence_version为当前已保存版本，output_summary必填<=1000、reason必填<=300。不接受未保存notes/引用或专业确认字段。当前有效岗位的本人且已接收、running、active、尚未完成，当前条件/草稿/任务修订一致、说明及必需引用齐备、所有附件仍可访问，才能201返回completion及completion_status=completed。写入task_completions、task.complete审计与幂等同事务；不更新执行事件或推进其他业务。

陈旧分别409 TASK_CONFLICT/CONDITION_CONFLICT/EVIDENCE_CONFLICT；不足409 COMPLETION_NOT_READY，非本人403 NOT_ASSIGNEE；取消409 TASK_CANCELLED，完成409 TASK_COMPLETED。提交后的所有交接/执行/异常/条件/依据写入拒绝。不同键竞争仅一个产出，同键原响应重放，改变内容409 IDEMPOTENCY_CONFLICT；等待请求体的会话撤销仍401。

GET completion增加completion及task.completion_status/effective_execution_status；完成记录含scope、固定条件/依据/任务修订、output_summary/reason、snapshot_json/snapshot_sha256、completed_at/completed_by、当前author_name及解析snapshot。snapshot为原任务/条件/依据、资料版本元信息、附件稳定元信息/内容哈希和提交时通过的检查，不含事后可变撤销标记。draft仍返回当前revoked_at用于区分访问状态与原产出。

validation新增OPEN检查。GET已保存依据和保存结果只有全部通过时completion_enabled=true；POST check始终false，persisted=false，即使当前输入record_ready=true也不能直接完成。浏览器有未保存说明/来源/引用时禁用提交，独立产出表单冲突重读保留内容。

GET /tasks新增completion=all（默认）/open/completed，items增加completion_status、effective_execution_status、completed_at；counts.completed及lanes.completed使用完整匹配数量。执行pending/running/paused筛选及running/paused计数排除已完成任务，完成筛选应选择execution=all。完成状态优先于异常/分派/执行分列。GET /tasks/:id增加completion，events仍为完成前的不可变执行历史。客户overview增加tasks_completed并排除完成的运行/暂停计数；timeline新增task/complete真实产出事件。

## V0.14 追加说明更正与显式后续分派

POST /tasks/:id/completion/corrections：expected_correction_version（原说明为0）、completion_sha256（所见原完成指纹）、output_summary必填<=1000、reason必填<=300；仅当前本店原提交人或负责人，201返回correction新版本。仅说明可更正，不接受条件/资料/附件/专业字段；同内容409 NO_CHANGE，非原提交人/负责人403 NOT_COMPLETION_AUTHOR，未完成409 COMPLETION_REQUIRED，原指纹不符409 COMPLETION_CONFLICT，所见更正陈旧409 CORRECTION_CONFLICT。更正、审计与幂等同事务；原完成/执行历史不变。

POST /tasks/:id/followups：expected_correction_version、completion_sha256、title<=120、instructions<=1000、assignee_id或candidate_role（两者择一）、reason<=300均明确；负责人/前台，201返回task和origin。原客户/门店/周期版本/到店/context_basis由服务端继承，不允许输入替换；所见产出及更正事务复核。新任务awaiting或queued、pending、revision1，需本人认领/接收/开始；不复制条件/依据、不自动完成。新任务/分派事件/来源/两类审计/幂等同事务；任何失败全部回滚。无效/跨店/未改初始密码接收人422，原版本冲突与更正接口一致。

GET /tasks/:id/followups：items最近100、limit、truncated、total完整量，含task_id/customer_id/parent_task_id、source_correction_version（原产出null）、source_completion_sha256、source_output_summary、reason/created_at/created_by及当前子任务title/接收/执行/异常/完成状态；本店员工读取，家长/跨店拒绝。

completionRecord增加correction_version、effective_output_summary、corrections最近100及corrections_truncated/history_limit、followups清单。原output_summary/snapshot_json/snapshot_sha256保持；更正history包含author_name（当前账号名），操作人id固定。任务items/task增加origin（非后续为null），包含不可变分派时来源及原任务标题。GET task增加followups。旧幂等原响应重放不更新为当前查询投影。

时间轴新增task/correct（更正version/说明/原因/原指纹）和task/followup（子任务、原任务、来源版本/说明/固定需求版本/原因），overview增加tasks_followups。界面更正/分派遇冲突重读保留填写，子任务“查看来源产出”读取当前原任务历史，卡片另明确显示分派时的旧版说明。完成仍锁定，当前关联不自动充当正式流程规则。

## V0.15 只读关联任务链

GET /api/tasks/:id/chain 需要tasks:read及本店客户范围；家长拒绝、跨店/不存在404，其他方法405。从所选任务追溯起始任务，读取该起始的整个保存来源组件，逐跳限定同一customer/store；独立任务返回一个节点，数据异常循环409 TASK_CHAIN_INVALID。

role=all/manager/reception/professional按当前接收人岗位筛选，无接收人时按候选岗位；lane=all/queued/awaiting/pending/running/paused/blocked/cancelled/completed。完成优先，再异常，再接收和执行；scope与旧队列一致，既有终态前running不当作执行中。limit默认50、范围1–100；浏览器每页30。cursor为有界base64url JSON，绑定根任务、客户、筛选、limit及链状态指纹，按(depth,created_at,id)升序续读；错误游标422 INVALID_CURSOR，分页间责任/显示名/有效性/状态/节点变化409 CHAIN_CHANGED并要求重新读取。游标不提供额外读取权限。

返回root_task、始终保留的selected{task,depth,lane,responsibility_role}、items同结构、limit/next_cursor/has_more、matching_total、filters、read_at，以及summary{total,links,max_depth,completed,open,lanes八状态完整量,roles完整岗位量}。总量不受页数/100条旧列表影响；无匹配时仍提供起始/所选任务上下文。task投影复用原visible，包括固定需求、不可变origin及实时接收人可用性。仅投影已保存来源，读取不创建任务/审计/版本或幂等数据，不定义自动业务流转。


## V0.16 配镜商品与订单

详情与字段限制见[配镜订单说明](retail-orders.md)。

| 方法 / 路径（/api前缀） | 输入 | 输出 / 权限 |
| --- | --- | --- |
| GET /retail/products | q、category、status、limit=1–100默认50、offset | 本店最新商品版本、完整total/next_offset；员工三岗 |
| POST /retail/products | sku、商品版本字段 | product；负责人，新建商品与V1 |
| GET /retail/products/:id 或 /versions | 商品编号 | 当前product与最近100版history及truncated；本店员工 |
| POST /retail/products/:id/versions | expected_version、商品版本字段 | product新版本；负责人 |
| GET /retail/customers/:id/options | 客户编号 | 配镜周期/到店各最近100、资料/有效附件各200，截断标志；本店员工 |
| GET /retail/orders | q、status=all/draft/cancelled、limit/offset | 最新订单摘要、筛选完整counts/total/next_offset；员工 |
| GET /customers/:id/retail-orders | 同上 | 限定客户订单；员工 |
| POST /customers/:id/retail-orders | title、notes?、items、document_version_ids?、attachment_ids?、reason、cycle_id/version?、visit_id? | order完整V1；负责人/前台 |
| GET /retail/orders/:id | 订单编号 | 当前完整order与最近100版history；员工 |
| GET /retail/orders/:id/versions/:n | 订单编号/版本 | 指定完整order与历史；员工 |
| POST /retail/orders/:id/versions | expected_version、完整订单字段（不含来源身份） | order新草稿版本；负责人/前台 |
| POST /retail/orders/:id/cancel | expected_version、reason | order取消新版本，内容复制原单；负责人/前台 |

写入均需CSRF/Idempotency-Key，实时会话/动作/门店事务复核。金额API为整数分；目录list_price_cents与订单unit_price_cents独立。新商品引用须当前启用版本，已保存的原单商品版本允许保留。409冲突类型PRODUCT_CONFLICT/PRODUCT_CHANGED/ORDER_CONFLICT/CONTEXT_CONFLICT/ORDER_CANCELLED/NO_CHANGE/IDEMPOTENCY_CONFLICT/SKU_EXISTS；越店404，未知字段422。订单不接受优惠/收款/退款/库存/专业确认状态。时间轴新增kind=retail；总览增加订单草稿与已取消完整数量。


## V0.17 库存与预留

接口完整契约见[inventory.md](inventory.md)。新增GET inventory/products、GET inventory/products/:id（limit/offset历史）、POST inventory/products/:id/events（负责人，receive/isolate/unquarantine、expected_sequence/expected_product_version、quantity/reason）；订单新增GET retail/orders/:id/inventory及POST /inventory/reserve、/inventory/release（负责人/前台、expected_order_version/expected_revision/reason，reserve另带完整stock_versions）。员工读，家长拒绝；实时会话与门店、CSRF、幂等沿用。

当前订单需求由原明细计算，服务排除、重复SKU聚合；新预留要求启用商品/匹配单位及足够可用，全部原行一事务写入，释放原明细后才能修订/取消。错误包括STOCK_CONFLICT、INSUFFICIENT_STOCK、RESERVATION_CONFLICT、STOCK_PRODUCT_CHANGED、ALREADY_RESERVED/NOT_RESERVED、NO_STOCK_ITEMS/SERVICE_NOT_STOCKED；原订单写入ORDER_RESERVED，目录单位/品类更改STOCK_UNIT_LOCKED。客户时间轴新增kind=inventory。


## V0.18 基础收款API

负责人/前台GET /api/payments（q/action/limit/offset）及GET /api/retail/orders/:id/payments（limit/offset）；POST /payments/receive字段expected_order_version/expected_revision/amount_cents/method/reference/received_at/reason。负责人POST /payments/void字段expected_order_version/expected_revision/source_id/reason。路径前缀同原单。权限、CSRF、实时会话、版本与幂等共同事务；响应event/payments。专业人员/家长资金读取403，跨店原单404；PAYMENT_CONFLICT、ORDER_HAS_RECEIPTS、DUPLICATE_REFERENCE、RECEIPT_VOIDED等409。固定原单、时间轴角色范围、分页及金额意义见payments.md。

## V0.19 订货与加工接口

完整字段/角色见[processing.md](processing.md)。GET /api/processing/jobs提供q、state、mine与有界分页/完整匹配统计；GET /api/processing/assignees列出本店有效责任人；GET/POST /api/retail/orders/:id/processing读取/建立固定原单工单；GET /api/processing/jobs/:id支持revision及历史分页；POST /api/processing/jobs/:id/events保存逐行plan/receive/start/complete/delay/clear_delay或负责人cancel。

建立需expected_order_version/expected_job_count、原实物行position及六个安排字段、reason；后续需expected_revision/action/reason及对应position/quantity/plan/due_date。创建和动作严格字段、门店/岗位/实时会话/改密/CSRF/幂等/审计同事务。PROCESSING_CONFLICT需重读核对，活动工单令原单修订/取消返回ORDER_IN_PROCESSING；stock备料未预留返回PROCESSING_STOCK_REQUIRED，备料后释放返回STOCK_IN_PROCESSING。只读工单包含固定原商品版本/单位、选定与当前revision、分项进度/交期和历史，不改变财务或专业状态。

## V0.20 质检交付推进记录

完整契约见[fulfillment.md](fulfillment.md)。GET /api/fulfillment/jobs搜索/状态及有界分页/完整量；GET /api/processing/jobs/:id/fulfillment读取逐行七类数量、可处理固定批次及历史分页；POST同路径/events保存check_pass/check_fail/rework_assign/rework_start/rework_complete/deliver。写入需expected_revision/expected_processing_revision、原position/quantity/source_id/reason及对应项目/安排/签收字段，实时权限/会话/改密/CSRF/幂等/审计同事务；陈旧返回FULFILLMENT_CONFLICT，来源或容量错误FULFILLMENT_STATE。不合格不可签收，返工只限固定责任人/负责人；家长拒绝、跨店404。签收不自动库存出库或款项结算。

## V0.21 出库与售后补充

迁移018新增实际出库、固定原签收的售后案例及连续处理/退回隔离事件，原分配库存历史保持；当前实物以独立出库投影，库存与出库版本共同核对，售后退回保管量独立于正常库存。完整接口/数量/来源/岗位及恢复契约见[出库与售后](dispatch-aftercare.md)。正式维修重做/批准处置、采购批号、索赔召回及退款规则仍待落实。

## V0.25 退款记录

schema22新增refund_events不可变申请/审核/实际退款流水，固定原有效收款和原订单版本、人工金额/决定依据、可选对应案例；payment_refund_refs固定每次原收款所见退款序列。同毫秒跨资金顺序可回放，历史关联按当时原订单版本核对，取消旧安排并独立修订新单仍保留旧退款来源。原款占用/已退上限、资金权限/时间轴、实际唯一凭据及接口见[退款契约](refunds.md)。

## V0.26 参数交接

GET /api/parameters?q=&status=all|draft|submitted|checked|returned&limit=&offset= 返回最新参数原单列表及完整总数。
GET/POST /api/retail/orders/:id/parameters 读取/另存交接版本；POST明确expected_order_version、expected_sequence、source、source_note、values[{position,label,value,unit,condition}]、document_version_ids、attachment_ids、note、reason。
GET /api/parameters/versions/:id 返回固定版本及有界历史；POST同路径/events 明确expected_revision、原单/流水版本、action=submit|check|return、note、reason。
GET/POST /api/processing/jobs/:id/parameter-reviews 读取/登记明确变更影响；POST包含原单/参数流水、expected_processing_revision、expected_fulfillment_revision、expected_review_revision、fixed_version_id（未知null）、current_version_id、outcome=continue_original|hold、note、reason。
受保护加工和全部质检交付POST增加expected_parameter_sequence及expected_parameter_review_revision。跨店404、越动作403、陈旧来源409、字段不合法422；核对角色是开发角色，正式资质待确认。见parameters.md。


## V0.27 训练业务

训练接口契约和角色/固定版本/实际记录形状见[训练说明](training.md)。GET /training/projects、/training/plans、/training/sessions：本店员工查询及匹配数量、分页；GET /training/customers/:id/options：有界来源候选；GET/POST /customers/:id/training-plans：客户计划。GET /training/projects/:id、/training/plans/:id（可指定version）、/training/sessions/:id：详情与历史。POST /training/projects 新模板，POST /training/projects/:id/versions 修订；POST /training/plans/:id/versions 调整计划，POST /training/plans/:id/events 明确状态动作；GET/POST /training/plans/:id/sessions 关联或创建当次课程，POST /training/sessions/:id/events 执行/实际记录/核对。统一CSRF/幂等及实时权限，拒绝陈旧模板版本、计划修订与课程序列。


## V0.28 套餐与权益

详见[权益契约](entitlements.md)。GET/POST /entitlements/packages及GET /entitlements/packages/:id（可指定version），POST /entitlements/packages/:id/versions管理本店目录版本。GET /entitlements/accounts与GET/POST /customers/:id/entitlements查询或创建固定原来源的权益账。GET /entitlements/customers/:id/options提供有界候选、account_count与customer_sequence；GET /entitlements/accounts/:id返回固定规则、购买/赠送余额及分页历史，POST /entitlements/accounts/:id/events仅grant或reverse；GET /entitlements/events/:id定位原来源。GET /customers/:id/entitlement-summary供本店员工读取无购买凭据/完整流水的数量摘要。统一CSRF/幂等及实时权限，严格字段、当前账revision与客户expected_customer_sequence并发核对；不提供自动扣次/效期或退款接口。


V0.29：/scheduling/options；GET/POST /scheduling/resources，GET /resources/:id及POST /resources/:id/versions；GET/POST /scheduling/slots，GET /slots/:id及POST /slots/:id/events；GET /scheduling/bookings及/bookings/:id，POST /bookings/:id/events；GET/POST /customers/:id/scheduling；GET /scheduling/customers/:id/options。写入均expected_sequence，修订另需expected_version/revision，预约接纳需expected_plan_revision及目标slot_revision。完整字段、权限与未知规则见scheduling.md。


V0.30：家庭练习/复评API及最小家长响应、expected_sequence/revision/本人提交数等完整字段见family-training.md。


V0.31：长期档案/实际资料/复查API、固定来源及expected_sequence/revision/case_revision等字段见longitudinal.md。


## V0.40 收货 API

V0.40贯通原采购分批收货、实际验收与原库存：固定实际订货原行/数量单位，匹配与超收分别留痕，未知批号效期仓位保留；明确检查项目/要求与合格不合格结果，负责人选择一次可用或隔离入库。资料更正保留旧验收/原库存，不自动放行或付款；schema37四表/145表恢复、四独立虚构收货阶段与电脑手机贯通。40项具体开发交付勾选，原50任务287要求/依赖及业务验收保留。下一V0.41实际退供与库存纠错/质量处理，继续接加工原来源。 完整契约见[purchase-receiving.md](purchase-receiving.md)。


## V0.41 原批质量 API

V0.41继续采购与库存质量主线：固定原收货/入库和人工实际在库身份数量，负责人实际隔离或占用原隔离，未知及原资料版本保留；逐项复检/实际要求与明确解除隔离分别记录。待检/失败数量受保护，普通库存页面和原生操作不能绕过；原收货更正须明确采用新版本再复检，旧质量/库存保留。schema38五表/150表恢复、五独立虚构复检阶段与电脑手机贯通；41项具体交付勾选，原50任务287要求/依赖及业务验收保留。下一V0.42实际退供安排、实物交接与收件结果，不推定库存/资金已退。 完整契约见[purchase-quality.md](purchase-quality.md)。
