# 数据字典草案

标识符是独立文本主键；客户/周期由服务端生成 UUID。时间戳为 UTC ISO 8601，生日为日期，未知留 null。手机号不唯一；不以家长电话代替客户编号。

| 表 / 实体 | 关键字段 | 关联 / 权限 / 版本边界 |
| --- | --- | --- |
| stores | id PK、name 必填 | 一个门店对应多用户和客户 |
| users | id PK、username 唯一、display_name、password_hash、role 枚举、store_id FK、active | 员工本轮单店；家长可无门店。哈希从不返回 API |
| sessions | token_hash PK、user_id FK、csrf、expires_at 毫秒 | 会话令牌不明文存储；到期、退出、停用拒绝访问 |
| customers | id PK、store_id FK、name 必填(80)、birth_date nullable、contact_name nullable(80)、phone nullable(32)、created_at、created_by FK | contact_name/phone为主要联系人字段；多联系人单独登记，完整家庭成员/付款关系尚未实现。查询限授权门店/有效监护 |
| guardian_links | user_id + customer_id 复合主键、active、relationship、updated_at、updated_by | 一个监护用户可关联多个客户；撤销即时生效；来源证明待确认 |
| service_cycles | id PK、customer_id FK、type=followup/training/retail、goal 必填(300)、status=draft、created_at、created_by FK | 客户 1:N 周期，草稿只登记目标；计划、订单、专业确认尚未建立 |
| audit_events | id PK、store_id、actor_id、action、entity_id、before_json/after_json、created_at | 新增动作 before=null；前后值留存于库，查询仅授权门店元信息，禁止修改删除 |
| idempotency | actor_id + operation + request_key 主键、request_hash、response_json | 同动作/身份/标识重放；内容不同 409；周期动作包含客户编号 |
| schema_migrations | name PK、applied_at | 工程版本与业务规则版本分开 |

字段、外键、枚举及空值以 migrations/001_foundation.sql 和 002_family_visits.sql 为实现依据。V0.1 存量迁移保留既有客户、周期和授权；未登记关系保持 null。

新增 visits：id、customer_id、store_id、purpose、status(registered/closed)、created_at、closed_at、created_by；客户与门店复合外键确保一致。visit_cycles 是到店与周期的 M:N 关联，复合外键限定属于同一客户。结束到店只更新 visits，不改变 service_cycles。

## 保留的后续实体关系（尚未实现）

家庭与客户通过成员关联，监护、联系、付款身份独立。到店与服务周期的 M:N 关联及独立结束已实现，后续增加到店任务。计划 1:N 不可变版本，当次执行引用当时版本。订单与周期 M:N，处方快照与订单相连；退款不自动终止计划。权益账与购买/规则版本/实际执行关联，资金账与原付款/退款独立关联。检查 1:N 版本、版本 1:N 单眼测量；未做、无法测、待补、不适用的原因和值分开。报告发布引用固定确认版本与授权范围，撤回后限制新访问。采购、验收、批次、库存变化和交付流向关联。

专业单位、眼别与条件、唯一业务键、来源、保留期限、跨店关系和删除策略仍待真实表单/规则确认，不能将本草案视为 T00.02 全量验收。

## V0.3 资料与附件（003_documents_attachments.sql）

- attachment_blobs：sha256 PK、bytes BLOB、size；限制1 MB，禁止修改/删除字节。按内容去重，具体客户的访问元信息独立。
- attachments：id、customer_id、filename、content_type、blob_sha256、size、created_at/by、revoked_at/by、revocation_reason。撤销访问不删除历史文件。
- document_records：id、customer_id、created_at/by，只作为稳定资料身份。
- document_versions：id、record_id、customer_id、version、title、content、source、revision_reason、created_at/by；record_id+version唯一，禁止更新/删除。当前实现的是通用内部资料记录，不是已确认专业检查或报告。
- version_attachments：version_id、attachment_id、customer_id；复合外键限定同一客户，禁止更新/删除原关联。应用仅在创建新版本时插入引用，没有给旧版本追加引用的接口。

JSON请求的版本编号用于乐观并发校验；未知来源不能自动归类为实测，记录业务确认状态将在专业模块单独建立。迁移与历史记录保持原有身份和授权。

## V0.4 账号安全（004_account_security.sql）

user_security：user_id PK/FK、revision正整数默认1、must_change_password 0/1。已有用户迁移建立版本1、无需强制改密；新建员工使用版本1且待改密。账号编辑、密码重置、会话撤销、本人改密均递增修订号；安全状态随一致性备份保留。测试/开发直接插入无元信息的账号按版本1、无需改密读取。

sessions新增user_id索引用于即时撤销与有效会话计数。人员资料不删除，停用保留客户/资料/审计外键；密码仅哈希。API的用户名仅向本店负责人返回，不返回password_hash、token_hash或其他会话csrf。

## V0.5 运维文件与临时记录

不新增业务表或迁移。备份清单为同快照旁的JSON，含版本、创建时间、大小、文件/结构指纹、迁移和各基础表数量，不含逐条资料或凭据。恢复回执保存在新目录，补充恢复时间、指纹和撤销会话数；恢复时仅清除sessions，其他记录保持快照。

运行故障窗口为每店200条内存请求元信息，负责人只读20条故障；request_id不作为客户或业务主键，也不改变审计和幂等表身份。字段和恢复边界见api.md / recovery.md。

## V0.6 档案历史与联系人（005_customer_profiles.sql）

customer_profile_versions：customer_id+version复合主键、name、birth_date、contact_name、phone、source、revision_reason、created_at/by；禁止更新/删除。source还包括initial（迁移后新建初版）及legacy（升级时存量基线，创建者未知null）。customers保留当前基本字段，必须与最新版本一致；备份校验同步核对，拒绝无历史匹配的当前档案。

family_contacts：id、customer_id FK、name、relationship、phone nullable、source、note nullable、active、revision、created_at/by、updated_at/by；联系人1:N属于独立客户，共用电话不唯一。编辑不允许更换客户身份，停用保留资料及审计；当前资料和前后审计同事务。记录关系是录入描述，不自动赋予查看权限，也不构成监护证明核验。guardian_links继续单独控制家长账号访问。

## V0.7 总览与事件投影

没有新增业务表或迁移（schema仍为5）。src/timeline.mjs从客户范围内的档案/资料版本、周期、到店、附件和明确的联系人/查看授权审计读取事件。事件编号由原主键及动作/版本组成，是查询排序键，不是新业务身份；分页标识绑定同一客户和筛选。联系方式和安全事件不会直接展开为任意审计JSON。actor_name是操作人账号的当前显示名，actor_id保留原身份；未登记操作人不推断。

总览数量与状态按现存数据计算；周期仍为draft，不宣称专业计划已确认。恢复后由原记录重新查询，无单独需恢复的时间轴缓存或事件副本。原有未知关系、依据与历史仍保持未知。

## V0.8 周期需求与到店快照（006_cycle_versions.sql）

cycle_versions：cycle_id+version复合主键，customer_id、type、goal、source、revision_reason、created_at/by；复合外键限定原周期客户，禁止更新/删除。存量V1为legacy、升级时间、未知操作人null；新周期通过触发器建立initial V1，后续需求修订使用明确来源。service_cycles保留当前goal，恢复校验要求与最新版本type/goal一致。

visit_cycle_versions：visit_id+cycle_id主键，customer_id、version(nullable)、basis(captured/legacy_unknown)；复合外键同时限定原到店关联与需求版本的客户。新visit_cycles关联由触发器捕获最新版本，引用禁止更新/删除；迁移前已有关联建立legacy_unknown记录，不推测当时版本。每个到店关联必须有引用记录，恢复工具核对新表、外键和完整性。

需求、专业计划、订单、权益和任务保留独立身份与状态；本轮只实施需求和到店衔接。后续共用能力及待确认条件见capability-map.md。

## V0.9 通用协作任务（迁移007）

| 表 | 字段与约束 | 衔接 |
| --- | --- | --- |
| work_tasks | id/customer_id/store_id，title/instructions，cycle_id+cycle_version，visit_id，context_basis，assignee_id，assignment_status(awaiting/accepted)，execution_status(pending)，revision>=1，created/updated时间、创建人 | 客户/门店、需求版本/客户、到店/客户、到店周期关联均复合外键；上下文及原说明不可覆盖，任务不可删除 |
| task_events | task_id+revision PK，customer_id，action(assign/accept/transfer)，from_assignee_id、assignee_id，独立分派/执行状态、reason、created_at、actor_id | 每次分派、本人接收或转交保存不可变记录；同库审计、时间轴、恢复；账号姓名为当前显示名 |

context_basis为customer/cycle/visit/visit_cycle，与所选关联一致。周期编号和版本同时存在或同时为空；visit_cycle需要已有到店关联，服务端核对captured固定版本。创建后不追随新需求，不复制独立客户或周期。转交仅改变当前接收人和接收状态，修订号递增；新接收人必须再确认。人员停用保留旧任务及历史，负责人明确安排接收人。未落地字段包括执行完成条件、时限/优先级/岗位队列/代理职责及专业资质。

## V0.10 岗位候选与执行（迁移008）

迁移在同一事务重建work_tasks/task_events，复制原身份、状态、说明、版本引用、修订号、事件、时间及幂等记录；新candidate_role为空，不根据当前用户岗位补造旧角色。复合外键和原历史保护重建，升级后foreign_key_check通过。

两表新增candidate_role（manager/reception/professional，可空），assignee_id可空；assignment_status扩展queued/awaiting/accepted，execution_status扩展pending/running/paused。queued要求接收人为空且候选岗位非空；awaiting/accepted要求接收人非空；running只能配accepted。task_events.action扩展claim/start/pause/resume/return，保存每次结果的候选岗位、责任人及执行状态。

claim从岗位队列给本人，仍需accept；start仅未开始、pause仅运行中、resume仅已暂停。运行中return或transfer先暂停；后续接收不会替代主动恢复。return明确退回岗位及原因，不恢复原用户或自动派代理。历史事件时间作为认领/开始/暂停/恢复时间的依据，不添加未知旧时间；姓名显示当前账号名称，旧candidate_role=null保留。新索引tasks_role_queue支持门店/岗位/接收状态查询。

## V0.11 任务异常快照（迁移009）

work_tasks及task_events增加四个同名字段：lifecycle_status非空默认active（active/blocked/cancelled），exception_reason可空，restore_status可空（active/blocked），restore_reason可空。active时其余三字段必须空；blocked有原因、无恢复字段；cancelled有取消原因及取消前状态，取消前blocked必须保存其原阻塞原因，取消前active的恢复原因为空。blocked/cancelled不允许running。表约束及任务插入/修改触发器确保这些组合，事件只能插入且保留独立快照。

block将active变blocked；unblock明确解决后变active。cancel保存取消前active/blocked及原因再变cancelled；restore回到保存的状态与原因并清空恢复字段。原接收和执行维度不被替代，running先paused，pending/paused原样保留。阻塞仍可更换责任人，取消必须先恢复。当前状态、四个异常字段、连续revision、事件数量和updated_at与最后不可变事件一致，由恢复工具核对。

009增加work_tasks列、重建task_events而不重写旧事件业务字段；旧事件和任务默认active，旧原因仍为对应操作依据，不推测历史阻塞。tasks_lifecycle支持本店异常筛选；新看板lanes由当前状态计算，不额外存储任务副本或不存在的依赖。
